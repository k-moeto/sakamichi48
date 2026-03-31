import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { GROUPS } from "./config/groups.js";
import { ingestReleases } from "./db/ingest.js";
import { fetchHtml } from "./lib/fetcher.js";
import {
  buildUtaNetAlbumIndexUrl,
  buildUtaNetArtistUrl,
  normalizeAlbumReleaseTitles,
  parseUtaNetAlbumIndexPage,
  parseUtaNetArtistPage
} from "./parsers/utanet.js";
import { parseFormationsFromDiscographySection, parseFormationsFromReleasePage } from "./parsers/wikipedia-formation.js";
import type { GroupSeed, ScrapedRelease, ScrapedSong, SongFormation } from "./types/models.js";

function parseArgs(): { dryRun: boolean; group?: string; limit: number; out?: string; input?: string } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const groupArg = args.find((a) => a.startsWith("--group="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const outArg = args.find((a) => a.startsWith("--out="));
  const inputArg = args.find((a) => a.startsWith("--input="));

  return {
    dryRun,
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

function normalizeSongTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/[「」『』""〝〟]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function enrichReleasesWithFormations(releases: ScrapedRelease[]): Promise<void> {
  for (const release of releases) {
    if (!release.wikipediaUrl.includes("wikipedia.org/wiki/")) {
      continue;
    }

    try {
      const html = await fetchHtml(release.wikipediaUrl);
      const formations = parseFormationsFromReleasePage(html, release.songs[0]?.title);
      const normalizedFormations =
        formations.size > 0 ? formations : parseFormationsFromDiscographySection(html);
      if (normalizedFormations.size === 0) {
        continue;
      }

      const formationByTitle = new Map<string, SongFormation>();
      for (const [title, formation] of normalizedFormations.entries()) {
        formationByTitle.set(normalizeSongTitle(title), formation);
      }

      let matched = 0;
      for (const song of release.songs) {
        const formation = formationByTitle.get(normalizeSongTitle(song.title));
        if (!formation) {
          continue;
        }
        song.formation = formation;
        matched += 1;
      }

      if (matched > 0) {
        console.log(
          `[scraper] formations matched: group=${release.groupName} release=${release.title} songs=${matched}/${release.songs.length}`
        );
      }
    } catch (error) {
      console.warn(`[scraper] formation parse failed: group=${release.groupName} url=${release.wikipediaUrl}`, error);
    }
  }
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
  const { dryRun, group, limit, out, input } = parseArgs();
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
      await enrichReleasesWithFormations(releases);
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
