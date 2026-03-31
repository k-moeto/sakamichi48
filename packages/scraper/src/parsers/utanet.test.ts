import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUtaNetAlbumIndexUrl,
  buildUtaNetArtistUrl,
  normalizeAlbumReleaseTitles,
  parseUtaNetAlbumIndexPage,
  parseUtaNetArtistPage
} from "./utanet.js";

test("buildUtaNetArtistUrl builds first and paged URLs", () => {
  assert.equal(buildUtaNetArtistUrl(6636), "https://www.uta-net.com/artist/6636/");
  assert.equal(buildUtaNetArtistUrl(6636, 2), "https://www.uta-net.com/artist/6636/0/2/");
});

test("buildUtaNetAlbumIndexUrl builds album index URL", () => {
  assert.equal(buildUtaNetAlbumIndexUrl(6636), "https://www.uta-net.com/user/search_index/artist.html?AID=6636");
});

test("parseUtaNetArtistPage parses credits and pagination", () => {
  const html = `
    <table class="table songlist-table">
      <tbody class="songlist-table-body">
        <tr class="border-bottom">
          <td>
            <a href="/song/117973/"><span class="songlist-title">アイスのくちづけ</span></a>
          </td>
          <td><a href="/artist/6636/">AKB48</a></td>
          <td><a href="/lyricist/1/">秋元康</a></td>
          <td><a href="/composer/1/">井上ヨシマサ/俊龍</a></td>
          <td><a href="/arranger/1/">野中“まさ”雄一</a></td>
          <td>歌い出し</td>
        </tr>
      </tbody>
    </table>
    <div class="songlist-paging">
      <a class="next btn btn-outline-dark btn-sm" href="https://www.uta-net.com/artist/6636/0/2/">次へ</a>
    </div>
  `;

  const parsed = parseUtaNetArtistPage(html, "https://www.uta-net.com/artist/6636/");

  assert.equal(parsed.songs.length, 1);
  assert.equal(parsed.songs[0]?.title, "アイスのくちづけ");
  assert.equal(parsed.songs[0]?.trackNumber, 117973);
  assert.deepEqual(
    parsed.songs[0]?.credits.map((c) => c.role),
    ["lyricist", "composer", "arranger"]
  );
  assert.deepEqual(parsed.songs[0]?.credits.find((c) => c.role === "composer")?.names, ["井上ヨシマサ", "俊龍"]);
  assert.equal(parsed.nextPageUrl, "https://www.uta-net.com/artist/6636/0/2/");
});

test("parseUtaNetAlbumIndexPage parses releases and tracks", () => {
  const html = `
    <table class="album_table">
      <tr>
        <td class="left_td clearfix">
          <div class="album_title">
            <p><a href="/album/KICS-3312/">0と1の間</a></p>
            <dl class="clearfix"><dt>発売日：</dt><dd>2015/11/18</dd></dl>
          </div>
        </td>
        <td class="right_td">
          <ul class="album_songs">
            <li><a href="/song/85647/">1 RIVER</a></li>
            <li><a href="/song/90497/">2 桜の栞</a></li>
          </ul>
        </td>
      </tr>
    </table>
  `;

  const parsed = parseUtaNetAlbumIndexPage(html);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.title, "0と1の間");
  assert.equal(parsed[0]?.releaseDate, "2015-11-18");
  assert.equal(parsed[0]?.productCode, "KICS-3312");
  assert.equal(parsed[0]?.tracks.length, 2);
  assert.equal(parsed[0]?.tracks[0]?.trackNumber, 1);
  assert.equal(parsed[0]?.tracks[0]?.songId, 85647);
});

test("normalizeAlbumReleaseTitles appends product code for duplicates", () => {
  const normalized = normalizeAlbumReleaseTitles([
    {
      title: "次の足跡",
      productCode: "KICS-3015",
      tracks: [{ songId: 1, title: "A", trackNumber: 1 }]
    },
    {
      title: "次の足跡",
      productCode: "KICS-3017",
      tracks: [{ songId: 2, title: "B", trackNumber: 1 }]
    }
  ]);

  assert.equal(normalized[0]?.normalizedTitle, "次の足跡 [KICS-3015]");
  assert.equal(normalized[1]?.normalizedTitle, "次の足跡 [KICS-3017]");
});
