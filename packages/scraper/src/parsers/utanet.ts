import { load } from "cheerio";

import { splitNames } from "../lib/normalizer.js";
import type { CreditRole, ScrapedCredit, ScrapedSong } from "../types/models.js";

const UTANET_BASE = "https://www.uta-net.com";

function normalizeSpace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  return new URL(href, UTANET_BASE).toString();
}

function parseYmd(input: string): string | undefined {
  const m = normalizeSpace(input).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) {
    return undefined;
  }
  const year = m[1];
  const month = String(Number(m[2])).padStart(2, "0");
  const day = String(Number(m[3])).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildCredit(role: CreditRole, text: string): ScrapedCredit | null {
  const names = splitNames(text);
  if (names.length === 0) {
    return null;
  }
  return { role, names };
}

function mergeSong(base: ScrapedSong, incoming: ScrapedSong): ScrapedSong {
  const merged = new Map<CreditRole, Set<string>>();

  for (const credit of base.credits) {
    merged.set(credit.role, new Set(credit.names));
  }

  for (const credit of incoming.credits) {
    const existing = merged.get(credit.role) ?? new Set<string>();
    credit.names.forEach((name) => existing.add(name));
    merged.set(credit.role, existing);
  }

  const order: CreditRole[] = ["lyricist", "composer", "arranger"];
  return {
    ...base,
    credits: order
      .filter((role) => merged.has(role))
      .map((role) => ({ role, names: [...(merged.get(role) ?? new Set<string>())] }))
  };
}

export function buildUtaNetArtistUrl(artistId: number, page = 1): string {
  if (page <= 1) {
    return `${UTANET_BASE}/artist/${artistId}/`;
  }
  return `${UTANET_BASE}/artist/${artistId}/0/${page}/`;
}

export function buildUtaNetAlbumIndexUrl(artistId: number): string {
  return `${UTANET_BASE}/user/search_index/artist.html?AID=${artistId}`;
}

export function parseUtaNetArtistPage(
  html: string,
  currentUrl: string
): { songs: ScrapedSong[]; nextPageUrl?: string } {
  const $ = load(html);
  const songById = new Map<number, ScrapedSong>();

  $("table.songlist-table tbody.songlist-table-body tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 5) {
      return;
    }

    const titleCell = $(cells[0]);
    const songLink = titleCell.find("a[href*='/song/']").first();
    const href = songLink.attr("href") ?? "";
    const songId = Number(href.match(/\/song\/(\d+)\//)?.[1] ?? "0");
    const title = normalizeSpace(songLink.find(".songlist-title").first().text()) || normalizeSpace(songLink.text());

    if (!title || !Number.isFinite(songId) || songId <= 0) {
      return;
    }

    const lyricist = buildCredit("lyricist", normalizeSpace($(cells[2]).text()));
    const composer = buildCredit("composer", normalizeSpace($(cells[3]).text()));
    const arranger = buildCredit("arranger", normalizeSpace($(cells[4]).text()));
    const credits = [lyricist, composer, arranger].filter((credit): credit is ScrapedCredit => credit !== null);

    if (credits.length === 0) {
      return;
    }

    const song: ScrapedSong = {
      title,
      trackNumber: songId,
      credits
    };

    const existing = songById.get(songId);
    if (!existing) {
      songById.set(songId, song);
      return;
    }
    songById.set(songId, mergeSong(existing, song));
  });

  const nextCandidates = $(".songlist-paging a.next")
    .toArray()
    .filter((anchor) => !($(anchor).attr("class") ?? "").includes("disabled"))
    .map((anchor) => $(anchor).attr("href"))
    .filter((href): href is string => Boolean(href))
    .map((href) => toAbsoluteUrl(href));

  const nextPageUrl = nextCandidates.find((url) => url !== currentUrl);

  return {
    songs: [...songById.values()].sort((a, b) => a.trackNumber - b.trackNumber),
    nextPageUrl
  };
}

export type UtaNetAlbumTrack = {
  songId: number;
  title: string;
  trackNumber: number;
};

export type UtaNetAlbumRelease = {
  title: string;
  releaseDate?: string;
  releaseUrl?: string;
  productCode?: string;
  tracks: UtaNetAlbumTrack[];
};

function parseTrackNumber(text: string, fallback: number): number {
  const m = normalizeSpace(text).match(/^(\d+)\b/);
  if (!m) {
    return fallback;
  }
  return Number(m[1]);
}

function releaseTypeFromTitle(title: string): "single" | "album" | "other" {
  const t = normalizeSpace(title);
  if (/シングル|Single|single/.test(t)) {
    return "single";
  }
  if (/アルバム|Album|album|collection|Collection/.test(t)) {
    return "album";
  }
  return "other";
}

export function parseUtaNetAlbumIndexPage(html: string): UtaNetAlbumRelease[] {
  const $ = load(html);
  const releases: UtaNetAlbumRelease[] = [];

  $("table.album_table").each((_, table) => {
    const titleAnchor = $(table).find(".album_title p a").first();
    const title = normalizeSpace(titleAnchor.text());
    const href = titleAnchor.attr("href");
    const releaseUrl = href ? toAbsoluteUrl(href) : undefined;
    const productCode = href?.match(/\/album\/([^/]+)\//)?.[1];

    const dateLabel = $(table)
      .find(".album_title dl dt")
      .toArray()
      .find((dt) => normalizeSpace($(dt).text()).includes("発売日"));
    const rawDate = dateLabel ? normalizeSpace($(dateLabel).next("dd").text()) : "";
    const releaseDate = parseYmd(rawDate);

    const tracks: UtaNetAlbumTrack[] = [];
    $(table)
      .find("ul.album_songs li")
      .each((index, li) => {
        const songAnchor = $(li).find("a[href*='/song/']").first();
        const songHref = songAnchor.attr("href") ?? "";
        const songId = Number(songHref.match(/\/song\/(\d+)\//)?.[1] ?? "0");
        const titleText = normalizeSpace(songAnchor.text());
        if (!songId || !titleText) {
          return;
        }
        tracks.push({
          songId,
          title: titleText.replace(/^\d+\s+/, ""),
          trackNumber: parseTrackNumber(normalizeSpace($(li).text()), index + 1)
        });
      });

    if (!title || tracks.length === 0) {
      return;
    }

    releases.push({
      title,
      releaseDate,
      releaseUrl,
      productCode: productCode ? decodeURIComponent(productCode) : undefined,
      tracks
    });
  });

  return releases;
}

export function normalizeAlbumReleaseTitles(
  releases: UtaNetAlbumRelease[]
): Array<UtaNetAlbumRelease & { normalizedTitle: string; releaseType: "single" | "album" | "other" }> {
  const byTitle = new Map<string, number>();
  releases.forEach((release) => {
    byTitle.set(release.title, (byTitle.get(release.title) ?? 0) + 1);
  });

  return releases.map((release) => {
    const duplicateCount = byTitle.get(release.title) ?? 0;
    const withEdition =
      duplicateCount > 1 && release.productCode
        ? `${release.title} [${release.productCode}]`
        : release.title;

    return {
      ...release,
      normalizedTitle: withEdition,
      releaseType: releaseTypeFromTitle(withEdition)
    };
  });
}
