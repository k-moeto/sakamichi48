# Cross-Group Composer Network Plan

## Goal

Make cross-group composer relationships easier to discover:

- "This song in Group A and that song in Group B are by the same composer."
- "Which composers are strong bridges between Sakamichi and 48 groups?"

## Strategy

1. Improve identity precision (name normalization and alias merge) so one person is one node.
2. Make the composer graph composer-first (reduce unrelated lyricist noise).
3. Add UI pathways that surface cross-group composers quickly.

## Implemented in this patch

1. Data precision improvements in `scripts/build-data.ts`
- Unified creator normalization (NFKC + space normalization + alias map).
- Expanded creator splitting delimiters (`/`, `／`, `,`, `、`, `・`, `&`, `＆`, `;`, `；`).
- Deduplicated duplicate credits per song/role.
- Changed creator song count to unique song count per creator.

2. Alias enrichment
- Added `"前迫 潤哉": "前迫潤哉"` to `packages/scraper/src/data/creator-aliases.json`.

3. Composer-first graph behavior
- Updated `fetchComposerGraph` to prioritize songs where the selected creator is credited as `composer`.
- In composer-focused mode, graph edges are composer credits only.
- Falls back to all-role behavior only when the selected person has no composer credits.

4. UI discovery improvements (`packages/web/src/App.tsx`)
- Added creator focus modes:
  - `越境作曲家` (default)
  - `作曲あり`
  - `全関係者`
- Added `グループ横断ハイライト（作曲）` list (top bridge composers).
- Added selected creator cross-group composer summary:
  - composed songs count
  - composed groups count
  - group list
- Updated graph window title to `作曲相関ネットワーク`.

## Next iterations

1. Introduce manual review workflow for suspicious near-duplicate names.
2. Add "bridge score" formula (groups crossed + songs + recency).
3. Add pairwise composer similarity panel (shared arranger/lyricist/song themes).
