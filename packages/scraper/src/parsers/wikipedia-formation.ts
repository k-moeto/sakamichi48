import { load, type CheerioAPI } from "cheerio";

import type { FormationType, MemberPosition, SongFormation } from "../types/models.js";

function normalizeSpace(input: string): string {
  return input
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/[「」『』""〝〟]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCenter(text: string): string[] {
  const centers: string[] = [];

  const patterns = [
    /[（(]センター[：:]([^）)]+)[）)]/g,
    /センター[：:]\s*([^、,）)\n]+(?:[、,][^、,）)\n]+)*)/g,
    /センターポジション[はをが]\s*([^、,。\n）)]+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1] ?? "";
      const names = raw.split(/[、,・]/).map((n) => normalizeSpace(n)).filter(Boolean);
      centers.push(...names);
    }
  }

  return [...new Set(centers)];
}

function parseRowMembers(text: string): MemberPosition[] {
  const members: MemberPosition[] = [];
  const centers = parseCenter(text);
  const centerSet = new Set(centers);

  const rowPattern = /(\d)\s*列目[^：:]*[：:]\s*([^\n]+)/g;
  let match;

  while ((match = rowPattern.exec(text)) !== null) {
    const row = Number(match[1]);
    const namesRaw = match[2] ?? "";
    const names = namesRaw
      .replace(/[（(][^）)]*[）)]/g, "")
      .split(/[、,]/)
      .map((n) => normalizeSpace(n))
      .filter(Boolean);

    for (const name of names) {
      members.push({
        name,
        isCenter: centerSet.has(name),
        row
      });
    }
  }

  return members;
}

function parseFlatMemberList(text: string): MemberPosition[] {
  const centers = parseCenter(text);
  const centerSet = new Set(centers);

  const cleaned = text
    .replace(/[（(]センター[：:][^）)]*[）)]/g, "")
    .replace(/[（(][^）)]*[）)]/g, "");

  const names = cleaned
    .split(/[、,]/)
    .map((n) => normalizeSpace(n))
    .filter((n) => n.length > 0 && n.length < 20 && !/列目|センター|ポジション/.test(n));

  return names.map((name) => ({
    name,
    isCenter: centerSet.has(name)
  }));
}

function detectFormationType(text: string): FormationType {
  if (/選抜/.test(text)) return "senbatsu";
  if (/アンダー/.test(text)) return "undergirls";
  if (/ユニット/.test(text)) return "unit";
  if (/全員|全メンバー/.test(text)) return "all";
  return "unknown";
}

function detectUnitName(text: string): string | undefined {
  const match = text.match(/[（(]([^）)]*ユニット[^）)]*)[）)]/);
  if (match) return normalizeSpace(match[1] ?? "");

  const unitMatch = text.match(/ユニット[：:]\s*([^\n、]+)/);
  if (unitMatch) return normalizeSpace(unitMatch[1] ?? "");

  return undefined;
}

function extractSongFormationBlocks($: CheerioAPI): Map<string, { text: string; heading: string }> {
  const blocks = new Map<string, { text: string; heading: string }>();

  const memberSections: string[] = [];
  let inMemberSection = false;
  let currentHeading = "";

  const contentEl = $(".mw-parser-output").first();
  if (!contentEl.length) return blocks;

  contentEl.children().each((_, el) => {
    const tagName = (el as any).tagName ?? "";
    const $el = $(el);

    if (/^h[2-4]$/.test(tagName)) {
      const headingText = normalizeSpace($el.text());
      if (/選抜メンバー|参加メンバー|フォーメーション|メンバー/.test(headingText)) {
        inMemberSection = true;
        currentHeading = headingText;
      } else if (inMemberSection) {
        inMemberSection = false;
      }
    }

    if (inMemberSection && /^(?:p|ul|ol|dl|div)$/.test(tagName)) {
      memberSections.push(normalizeSpace($el.text()));
    }
  });

  const fullText = memberSections.join("\n");

  const songBlocks = fullText.split(/(?=「[^」]+」)/);
  for (const block of songBlocks) {
    const titleMatch = block.match(/「([^」]+)」/);
    if (titleMatch) {
      const songTitle = normalizeTitle(titleMatch[1] ?? "");
      blocks.set(songTitle, { text: block, heading: currentHeading });
    }
  }

  if (blocks.size === 0 && fullText.length > 0) {
    blocks.set("__title_track__", { text: fullText, heading: currentHeading });
  }

  return blocks;
}

function parseFormationFromText(text: string, heading: string): SongFormation {
  let members = parseRowMembers(text);

  if (members.length === 0) {
    members = parseFlatMemberList(text);
  }

  const centers = parseCenter(text);
  if (centers.length > 0) {
    const centerSet = new Set(centers);
    members = members.map((m) => ({
      ...m,
      isCenter: centerSet.has(m.name) || m.isCenter
    }));
  }

  return {
    formationType: detectFormationType(heading + " " + text),
    unitName: detectUnitName(text),
    members,
    centerNames: centers.length > 0 ? centers : members.filter((m) => m.isCenter).map((m) => m.name)
  };
}

export function parseFormationsFromReleasePage(html: string, titleTrackName?: string): Map<string, SongFormation> {
  const $ = load(html);
  const result = new Map<string, SongFormation>();
  const blocks = extractSongFormationBlocks($);

  for (const [songTitle, { text, heading }] of blocks) {
    const formation = parseFormationFromText(text, heading);
    if (formation.members.length === 0) continue;

    if (songTitle === "__title_track__" && titleTrackName) {
      result.set(normalizeTitle(titleTrackName), formation);
    } else if (songTitle !== "__title_track__") {
      result.set(songTitle, formation);
    }
  }

  return result;
}

export function parseFormationsFromDiscographySection(html: string): Map<string, SongFormation> {
  const $ = load(html);
  const result = new Map<string, SongFormation>();

  const contentEl = $(".mw-parser-output").first();
  if (!contentEl.length) return result;

  let currentSong = "";
  let currentText = "";

  contentEl.find("h3, h4, p, ul, ol, dl, div").each((_, el) => {
    const tagName = (el as any).tagName ?? "";
    const $el = $(el);
    const text = normalizeSpace($el.text());

    if (/^h[3-4]$/.test(tagName)) {
      if (currentSong && currentText) {
        const formation = parseFormationFromText(currentText, "");
        if (formation.members.length > 0) {
          result.set(normalizeTitle(currentSong), formation);
        }
      }

      const titleMatch = text.match(/「([^」]+)」/);
      if (titleMatch) {
        currentSong = titleMatch[1] ?? "";
        currentText = "";
      }
    } else if (currentSong) {
      currentText += " " + text;
    }
  });

  if (currentSong && currentText) {
    const formation = parseFormationFromText(currentText, "");
    if (formation.members.length > 0) {
      result.set(normalizeTitle(currentSong), formation);
    }
  }

  return result;
}
