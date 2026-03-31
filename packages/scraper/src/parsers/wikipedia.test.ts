import assert from "node:assert/strict";
import test from "node:test";

import { extractReleaseUrlsFromDiscography, parseReleasePage } from "./wikipedia.js";
import type { GroupSeed } from "../types/models.js";

const baseGroup: GroupSeed = {
  key: "nogizaka46",
  name: "乃木坂46",
  nameRomaji: "Nogizaka46",
  category: "sakamichi",
  utaNetArtistId: 12550
};

test("extractReleaseUrlsFromDiscography picks wiki release links", () => {
  const html = `
    <div class="mw-parser-output">
      <table class="wikitable">
        <tr><td><a href="/wiki/%E3%81%90%E3%82%8B%E3%81%90%E3%82%8B%E3%82%AB%E3%83%BC%E3%83%86%E3%83%B3">ぐるぐるカーテン</a></td></tr>
        <tr><td><a href="/wiki/Category:Test">Category</a></td></tr>
      </table>
      <ul>
        <li><a href="/wiki/%E6%81%8B%E3%81%99%E3%82%8B%E3%83%95%E3%82%A9%E3%83%BC%E3%83%81%E3%83%A5%E3%83%B3%E3%82%AF%E3%83%83%E3%82%AD%E3%83%BC">恋するフォーチュンクッキー</a></li>
        <li><a href="/wiki/%E3%83%A1%E3%82%A4%E3%83%B3#history">履歴</a></li>
      </ul>
    </div>
  `;

  const urls = extractReleaseUrlsFromDiscography(html);

  assert.equal(urls.length, 2);
  assert.ok(urls.includes("https://ja.wikipedia.org/wiki/%E3%81%90%E3%82%8B%E3%81%90%E3%82%8B%E3%82%AB%E3%83%BC%E3%83%86%E3%83%B3"));
  assert.ok(urls.includes("https://ja.wikipedia.org/wiki/%E6%81%8B%E3%81%99%E3%82%8B%E3%83%95%E3%82%A9%E3%83%BC%E3%83%81%E3%83%A5%E3%83%B3%E3%82%AF%E3%83%83%E3%82%AD%E3%83%BC"));
});

test("parseReleasePage parses credit table rows", () => {
  const html = `
    <h1 id="firstHeading">ぐるぐるカーテン</h1>
    <table class="infobox"><tr><th>発売日</th><td>2012年2月22日</td></tr><tr><th>ジャンル</th><td>シングル</td></tr></table>
    <table class="wikitable">
      <tr><th>No.</th><th>曲名</th><th>作詞</th><th>作曲</th><th>編曲</th></tr>
      <tr><td>1</td><td>ぐるぐるカーテン</td><td>秋元康</td><td>杉山勝彦</td><td>若田部誠</td></tr>
      <tr><td>2</td><td>会いたかったかもしれない</td><td>秋元康</td><td>俊龍</td><td>野中"まさ"雄一</td></tr>
    </table>
  `;

  const parsed = parseReleasePage(baseGroup, "https://example.com/release", html);

  assert.equal(parsed.title, "ぐるぐるカーテン");
  assert.equal(parsed.releaseType, "single");
  assert.equal(parsed.releaseDate, "2012-02-22");
  assert.equal(parsed.songs.length, 2);
  assert.equal(parsed.songs[0]?.title, "ぐるぐるカーテン");
  assert.equal(parsed.songs[0]?.credits.find((c) => c.role === "composer")?.names[0], "杉山勝彦");
});

test("parseReleasePage parses list format fallback", () => {
  const html = `
    <h1 id="firstHeading">テストシングル</h1>
    <table class="infobox"><tr><th>発売日</th><td>2013年8月21日</td></tr><tr><th>種別</th><td>シングル</td></tr></table>
    <ol>
      <li>1. 「恋するフォーチュンクッキー」 作詞: 秋元康 作曲: 伊藤心太郎 編曲: 武藤星児</li>
      <li>2. 「愛の意味を考えてみた」 作詞: 秋元康 作曲: 杉山勝彦 編曲: 野中"まさ"雄一</li>
    </ol>
  `;

  const parsed = parseReleasePage(
    {
      ...baseGroup,
      key: "akb48",
      name: "AKB48",
      nameRomaji: "AKB48",
      category: "48"
    },
    "https://example.com/release2",
    html
  );

  assert.equal(parsed.songs.length, 2);
  assert.equal(parsed.songs[0]?.title, "恋するフォーチュンクッキー");
  assert.equal(parsed.songs[0]?.credits.find((c) => c.role === "composer")?.names[0], "伊藤心太郎");
  assert.equal(parsed.songs[1]?.trackNumber, 2);
});
