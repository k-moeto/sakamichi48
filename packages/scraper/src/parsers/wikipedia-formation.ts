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
      const raw = (match[1] ?? "")
        .split(/(?:参加メンバー|選抜メンバー|歌唱メンバー|メンバー|フォーメーション)\s*[：:]?/)[0]
        ?.trim() ?? "";
      const names = raw
        .split(/[、,・]/)
        .map((n) => normalizeSpace(n))
        .filter((n) => n.length > 0 && n.length < 20 && !/[：:]/.test(n));
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
      .filter((n) => n.length > 0 && n.length < 20);

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
    .replace(/センター\s*[：:]\s*[^、,\n]+/g, "")
    .replace(/(?:参加|選抜|歌唱)?メンバー\s*[：:]/g, "")
    .replace(/[（(][^）)]*[）)]/g, "");

  const names = cleaned
    .split(/[、,]/)
    .map((n) => normalizeSpace(n))
    .filter((n) =>
      n.length > 1 &&
      n.length < 20 &&
      !/列目|センター|ポジション|編集|脚注|出典|参考/.test(n) &&
      !/^\d+$/.test(n)
    );

  if (names.length === 0) return [];

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

function parseFormationFromText(text: string): SongFormation {
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
    formationType: detectFormationType(text),
    members,
    centerNames: centers.length > 0 ? centers : members.filter((m) => m.isCenter).map((m) => m.name)
  };
}

type SectionBlock = {
  songTitle: string;
  text: string;
};

function extractMemberSections($: CheerioAPI): SectionBlock[] {
  const blocks: SectionBlock[] = [];

  let inMemberSection = false;
  let currentSongTitle = "";
  let currentText = "";

  const flushBlock = () => {
    if (currentSongTitle && currentText.trim()) {
      blocks.push({ songTitle: currentSongTitle, text: currentText });
    }
    currentText = "";
  };

  // Use find() to traverse all descendant elements, not just direct children
  // Wikipedia wraps content in <section> tags, so direct children won't see headings
  $("h2, h3, h4, p, ul, ol, dl").each((_, el) => {
    const tagName = (el as any).tagName ?? "";
    const $el = $(el);
    const elText = normalizeSpace($el.text());

    // h2 headings: detect member section start/end
    if (tagName === "h2") {
      if (/歌唱メンバー|選抜メンバー|参加メンバー|フォーメーション/.test(elText)) {
        inMemberSection = true;
        currentSongTitle = "";
        currentText = "";
      } else if (inMemberSection) {
        flushBlock();
        inMemberSection = false;
      }
      return;
    }

    if (!inMemberSection) return;

    // h3/h4 headings: song titles within the member section
    if (tagName === "h3" || tagName === "h4") {
      flushBlock();
      const headlineSpan = $el.find(".mw-headline").first();
      const headingContent = normalizeSpace(headlineSpan.length ? headlineSpan.text() : elText);

      const titleMatch = headingContent.match(/「([^」]+)」/);
      currentSongTitle = titleMatch ? normalizeTitle(titleMatch[1] ?? "") : normalizeTitle(headingContent);
      return;
    }

    // Content elements: accumulate text
    if (currentSongTitle) {
      currentText += " " + elText;
    } else {
      // Text before any song sub-heading (could be title track info)
      currentText += " " + elText;
    }
  });

  flushBlock();

  if (blocks.length === 0 && currentText.trim()) {
    blocks.push({ songTitle: "__title_track__", text: currentText });
  }

  return blocks;
}

export function parseFormationsFromReleasePage(html: string, titleTrackName?: string): Map<string, SongFormation> {
  const $ = load(html);
  const result = new Map<string, SongFormation>();
  const sections = extractMemberSections($);

  for (const section of sections) {
    const formation = parseFormationFromText(section.text);
    if (formation.members.length === 0) continue;

    if (section.songTitle === "__title_track__" && titleTrackName) {
      result.set(normalizeTitle(titleTrackName), formation);
    } else if (section.songTitle !== "__title_track__") {
      result.set(section.songTitle, formation);
    }
  }

  return result;
}

export function parseFormationsFromDiscographySection(html: string): Map<string, SongFormation> {
  const $ = load(html);
  const result = new Map<string, SongFormation>();

  let currentSong = "";
  let currentText = "";

  $("h3, h4, p, ul, ol, dl").each((_, el) => {
    const tagName = (el as any).tagName ?? "";
    const $el = $(el);
    const text = normalizeSpace($el.text());

    if (tagName === "h3" || tagName === "h4") {
      if (currentSong && currentText) {
        const formation = parseFormationFromText(currentText);
        if (formation.members.length > 0) {
          result.set(normalizeTitle(currentSong), formation);
        }
      }

      const titleMatch = text.match(/「([^」]+)」/);
      if (titleMatch) {
        currentSong = titleMatch[1] ?? "";
        currentText = "";
      } else {
        currentSong = "";
        currentText = "";
      }
    } else if (currentSong) {
      currentText += " " + text;
    }
  });

  if (currentSong && currentText) {
    const formation = parseFormationFromText(currentText);
    if (formation.members.length > 0) {
      result.set(normalizeTitle(currentSong), formation);
    }
  }

  return result;
}
