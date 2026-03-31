import assert from "node:assert/strict";
import test from "node:test";

import { parseFormationsFromDiscographySection, parseFormationsFromReleasePage } from "./wikipedia-formation.js";

test("parseFormationsFromReleasePage extracts per-song rows and centers", () => {
  const html = `
    <div class="mw-parser-output">
      <h2>選抜メンバー</h2>
      <p>「制服のマネキン」</p>
      <p>3列目: 伊藤, 生田</p>
      <p>2列目: 白石, 橋本</p>
      <p>1列目: 西野</p>
      <p>センター: 西野</p>
    </div>
  `;

  const formations = parseFormationsFromReleasePage(html);
  const seifuku = formations.get("制服のマネキン");

  assert.ok(seifuku);
  assert.equal(seifuku?.formationType, "senbatsu");
  assert.equal(seifuku?.members.length, 5);
  assert.deepEqual(seifuku?.centerNames, ["西野"]);
  assert.equal(seifuku?.members.find((m) => m.name === "西野")?.isCenter, true);
  assert.equal(seifuku?.members.find((m) => m.name === "白石")?.row, 2);
});

test("parseFormationsFromDiscographySection extracts fallback h3 blocks", () => {
  const html = `
    <div class="mw-parser-output">
      <h3>「ガールズルール」</h3>
      <p>センター: 白石麻衣</p>
      <p>参加メンバー: 白石麻衣、生駒里奈、橋本奈々未</p>
    </div>
  `;

  const formations = parseFormationsFromDiscographySection(html);
  const girlsRule = formations.get("ガールズルール");

  assert.ok(girlsRule);
  assert.equal(girlsRule?.members.length, 2);
  assert.deepEqual(girlsRule?.centerNames, ["白石麻衣"]);
  assert.equal(girlsRule?.members.find((m) => m.name === "生駒里奈")?.isCenter, false);
});
