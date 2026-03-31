import * as path from "path";
import { GROUPS } from "./types.js";
import { scrapeGroup, writeCsv } from "./utanet.js";

const DATA_DIR = path.resolve("..", "data");

function parseArgs(): { groups: string[]; skipLyrics: boolean } {
  const args = process.argv.slice(2);
  let groups: string[] = [];
  let skipLyrics = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--group" && args[i + 1]) {
      groups.push(args[i + 1]);
      i++;
    } else if (args[i] === "--skip-lyrics") {
      skipLyrics = true;
    }
  }

  if (groups.length === 0) {
    groups = GROUPS.map((g) => g.id);
  }

  return { groups, skipLyrics };
}

async function main(): Promise<void> {
  const { groups, skipLyrics } = parseArgs();

  console.log(`Target groups: ${groups.join(", ")}`);
  if (skipLyrics) console.log("Skipping lyrics fetch (credits only)");

  for (const groupId of groups) {
    const group = GROUPS.find((g) => g.id === groupId);
    if (!group) {
      console.error(`Unknown group: ${groupId}`);
      console.error(`Available: ${GROUPS.map((g) => g.id).join(", ")}`);
      process.exit(1);
    }

    const songs = await scrapeGroup(group, { skipLyrics });
    const csvPath = path.join(DATA_DIR, `${group.id}.csv`);
    writeCsv(songs, csvPath);
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
