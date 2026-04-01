import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current);
  return fields;
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

type LyricsData = {
  openingLyrics: string;
  fullLyrics: string;
  songUrl: string;
};

async function loadOldCsv(filePath: string): Promise<Map<string, LyricsData>> {
  const map = new Map<string, LyricsData>();
  try {
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");
    // skip header: song_id,title,lyricist,composer,arranger,opening_lyrics,full_lyrics,song_url
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const fields = parseCsvLine(line);
      const songId = fields[0] ?? "";
      if (!songId) continue;
      map.set(songId, {
        openingLyrics: fields[5] ?? "",
        fullLyrics: fields[6] ?? "",
        songUrl: fields[7] ?? ""
      });
    }
  } catch {
    // File does not exist, return empty map
  }
  return map;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const newCsvArg = args.find((a) => a.startsWith("--new="));
  const oldCsvArg = args.find((a) => a.startsWith("--old="));
  const outArg = args.find((a) => a.startsWith("--out="));

  if (!newCsvArg || !oldCsvArg) {
    console.error("Usage: tsx merge-lyrics.ts --new=<new.csv> --old=<old.csv> [--out=<out.csv>]");
    process.exit(1);
  }

  const newCsvPath = path.resolve(process.cwd(), newCsvArg.split("=")[1]!);
  const oldCsvPath = path.resolve(process.cwd(), oldCsvArg.split("=")[1]!);
  const outPath = outArg ? path.resolve(process.cwd(), outArg.split("=")[1]!) : newCsvPath;

  const oldData = await loadOldCsv(oldCsvPath);
  const newContent = await readFile(newCsvPath, "utf8");
  const lines = newContent.split("\n");

  const header = lines[0];
  const outputLines = [header];
  let merged = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;

    const fields = parseCsvLine(line);
    const songId = fields[0] ?? "";

    const lyrics = oldData.get(songId);
    if (lyrics) {
      // Columns: song_id(0), title(1), lyricist(2), composer(3), arranger(4),
      // release_year(5), release_title(6), release_type(7), members(8), center(9),
      // formation_rows(10), opening_lyrics(11), full_lyrics(12), song_url(13)
      while (fields.length < 14) fields.push("");
      fields[11] = lyrics.openingLyrics;
      fields[12] = lyrics.fullLyrics;
      fields[13] = lyrics.songUrl;
      merged++;
    }

    outputLines.push(fields.map(csvEscape).join(","));
  }

  await writeFile(outPath, outputLines.join("\n") + "\n", "utf8");
  console.log(`[merge-lyrics] merged ${merged} songs with lyrics data, wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
