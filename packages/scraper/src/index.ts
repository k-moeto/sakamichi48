import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { GROUPS } from "./config/groups.js";
import { WIKIPEDIA_URLS } from "./config/wikipedia-urls.js";
import { ingestReleases } from "./db/ingest.js";
import { fetchHtml } from "./lib/fetcher.js";
import { matchFormations } from "./lib/song-matcher.js";
import {
  buildUtaNetAlbumIndexUrl,
  buildUtaNetArtistUrl,
  normalizeAlbumReleaseTitles,
  parseUtaNetAlbumIndexPage,
  parseUtaNetArtistPage
} from "./parsers/utanet.js";
import { extractSingleUrlsFromDiscography, findWikipediaUrl, buildTitleToUrlMap } from "./parsers/wikipedia-discography.js";
import { parseFormationsFromDiscographySection, parseFormationsFromReleasePage } from "./parsers/wikipedia-formation.js";
import type { GroupKey, GroupSeed, ScrapedRelease, ScrapedSong, SongFormation } from "./types/models.js";

function parseArgs(): { dryRun: boolean; group?: string; limit: number; out?: string; input?: string; withFormation: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const withFormation = args.includes("--with-formation");
  const groupArg = args.find((a) => a.startsWith("--group="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const outArg = args.find((a) => a.startsWith("--out="));
  const inputArg = args.find((a) => a.startsWith("--input="));

  return {
    dryRun,
    withFormation,
    group: groupArg?.split("=")[1],
    limit: Number(limitArg?.split("=")[1] ?? 12),
    out: outArg?.split("=")[1],
    input: inputArg?.split("=")[1]
  };
}

function pickGroups(group?: string): GroupSeed[] {
  if (!group) {
    return GROUPS;
  }
  return GROUPS.filter((g) => g.key === group);
}

async function scrapeGroup(group: GroupSeed, limit: number): Promise<ScrapedRelease[]> {
  const pageLimit = Math.max(1, limit);
  const firstPageUrl = buildUtaNetArtistUrl(group.utaNetArtistId, 1);
  const albumIndexUrl = buildUtaNetAlbumIndexUrl(group.utaNetArtistId);
  const visited = new Set<string>();
  const songsBySongId = new Map<number, ScrapedSong>();

  let currentUrl: string | undefined = firstPageUrl;
  let page = 1;

  while (currentUrl && page <= pageLimit && !visited.has(currentUrl)) {
    visited.add(currentUrl);
    try {
      console.log(`[scraper] fetch: group=${group.name} page=${page} url=${currentUrl}`);
      const html = await fetchHtml(currentUrl);
      const parsed = parseUtaNetArtistPage(html, currentUrl);
      parsed.songs.forEach((song) => {
        songsBySongId.set(song.trackNumber, song);
      });
      currentUrl = parsed.nextPageUrl;
      page += 1;
    } catch (error) {
      console.error(`[scraper] failed ${currentUrl}`, error);
      break;
    }
  }

  if (songsBySongId.size === 0) {
    console.warn(`[scraper] no songs parsed: group=${group.name}`);
    return [];
  }

  const releases: ScrapedRelease[] = [];
  const coveredSongIds = new Set<number>();
  try {
    const albumHtml = await fetchHtml(albumIndexUrl);
    const albumReleases = normalizeAlbumReleaseTitles(parseUtaNetAlbumIndexPage(albumHtml)).sort((a, b) => {
      const da = a.releaseDate ?? "9999-12-31";
      const db = b.releaseDate ?? "9999-12-31";
      if (da === db) {
        return a.normalizedTitle.localeCompare(b.normalizedTitle, "ja");
      }
      return da.localeCompare(db);
    });

    albumReleases.forEach((release) => {
      const songs = release.tracks
        .map((track) => {
          if (coveredSongIds.has(track.songId)) {
            return null;
          }
          const song = songsBySongId.get(track.songId);
          if (!song) {
            return null;
          }
          coveredSongIds.add(track.songId);
          return {
            ...song,
            title: track.title || song.title,
            trackNumber: track.trackNumber
          };
        })
        .filter((song): song is ScrapedSong => song !== null);

      if (songs.length === 0) {
        return;
      }

      releases.push({
        groupName: group.name,
        groupRomaji: group.nameRomaji,
        groupCategory: group.category,
        title: release.normalizedTitle,
        releaseType: release.releaseType,
        releaseDate: release.releaseDate,
        wikipediaUrl: release.releaseUrl ?? albumIndexUrl,
        songs
      });
    });
  } catch (error) {
    console.error(`[scraper] album index parse failed: ${group.name} url=${albumIndexUrl}`, error);
  }

  const unmatchedSongs = [...songsBySongId.entries()]
    .filter(([songId]) => !coveredSongIds.has(songId))
    .map(([, song]) => song)
    .sort((a, b) => a.trackNumber - b.trackNumber);

  if (unmatchedSongs.length > 0) {
    releases.push({
      groupName: group.name,
      groupRomaji: group.nameRomaji,
      groupCategory: group.category,
      title: `${group.name} Uta-Net Other Songs`,
      releaseType: "other",
      wikipediaUrl: firstPageUrl,
      songs: unmatchedSongs
    });
  }

  console.log(
    `[scraper] done: group=${group.name} songs=${songsBySongId.size} releases=${releases.length} pagesFetched=${visited.size} pageLimit=${pageLimit}`
  );

  return releases;
}

async function scrapeFormationsForGroup(
  groupKey: GroupKey,
  releases: ScrapedRelease[]
): Promise<void> {
  const wikiConfig = WIKIPEDIA_URLS[groupKey];
  if (!wikiConfig) {
    console.warn(`[scraper] no wikipedia config for group=${groupKey}`);
    return;
  }

  try {
    console.log(`[scraper] fetching wikipedia discography: group=${groupKey} url=${wikiConfig.discographyUrl}`);
    const discoHtml = await fetchHtml(wikiConfig.discographyUrl);
    const entries = extractSingleUrlsFromDiscography(discoHtml);
    console.log(`[scraper] found ${entries.length} single/album URLs for group=${groupKey}`);

    // Build a flat map of songTitle -> SongFormation from all Wikipedia single pages
    const allFormations = new Map<string, SongFormation>();

    for (const entry of entries) {
      try {
        console.log(`[scraper] fetching wikipedia page: ${entry.title} -> ${entry.url}`);
        const releaseHtml = await fetchHtml(entry.url);
        const formations = parseFormationsFromReleasePage(releaseHtml, entry.title);
        const normalizedFormations =
          formations.size > 0 ? formations : parseFormationsFromDiscographySection(releaseHtml);

        for (const [title, formation] of normalizedFormations) {
          allFormations.set(title, formation);
        }
      } catch (error) {
        console.error(`[scraper] failed to parse formation: ${entry.url}`, error);
      }
    }

    console.log(`[scraper] total formations extracted: ${allFormations.size}`);

    // Match formations to songs across all releases
    let totalMatched = 0;
    let totalSongs = 0;

    for (const release of releases) {
      const songTitles = release.songs.map((s) => s.title);
      const matches = matchFormations(songTitles, allFormations);

      for (const song of release.songs) {
        totalSongs++;
        const match = matches.get(song.title);
        if (match) {
          song.formation = match.formation;
          totalMatched++;
        }
      }
    }

    console.log(
      `[scraper] formation scrape done: group=${groupKey} matched=${totalMatched}/${totalSongs} (${((totalMatched / Math.max(totalSongs, 1)) * 100).toFixed(1)}%)`
    );
  } catch (error) {
    console.error(`[scraper] failed to fetch wikipedia discography: group=${groupKey}`, error);
  }
}

function printSummary(releases: ScrapedRelease[]): void {
  const byGroup = new Map<string, { releases: number; songs: number; credits: number }>();

  for (const release of releases) {
    const current = byGroup.get(release.groupName) ?? { releases: 0, songs: 0, credits: 0 };
    current.releases += 1;
    current.songs += release.songs.length;
    current.credits += release.songs.reduce((sum, song) => sum + song.credits.length, 0);
    byGroup.set(release.groupName, current);
  }

  console.log("[scraper] summary begin");
  [...byGroup.entries()].forEach(([groupName, value]) => {
    console.log(
      `[scraper] summary group=${groupName} releases=${value.releases} songs=${value.songs} credits=${value.credits}`
    );
  });
  console.log(`[scraper] summary total releases=${releases.length}`);
}

async function main(): Promise<void> {
  const { dryRun, group, limit, out, input, withFormation } = parseArgs();
  let allReleases: ScrapedRelease[] = [];

  if (input) {
    const inputPath = path.resolve(process.cwd(), input);
    const raw = await readFile(inputPath, "utf8");
    allReleases = JSON.parse(raw) as ScrapedRelease[];
    console.log(`[scraper] loaded input ${inputPath} releases=${allReleases.length}`);
  } else {
    const targets = pickGroups(group);
    if (targets.length === 0) {
      throw new Error(`unknown group key: ${group}`);
    }
    for (const target of targets) {
      const releases = await scrapeGroup(target, limit);

      if (withFormation) {
        await scrapeFormationsForGroup(target.key, releases);
      }

      allReleases.push(...releases);
    }
  }

  printSummary(allReleases);

  if (out) {
    const outputPath = path.resolve(process.cwd(), out);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(allReleases, null, 2), "utf8");
    console.log(`[scraper] wrote output ${outputPath}`);
  }

  if (dryRun) {
    if (!out) {
      console.log(JSON.stringify(allReleases, null, 2));
    }
    return;
  }

  await ingestReleases(allReleases);
  console.log(`[scraper] ingest completed releases=${allReleases.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
