# Sakamichi48

作曲家を中心に、坂道シリーズと主要48グループの楽曲ネットワークを可視化するモノレポです。

## Monorepo

```txt
sakamichi48/
  packages/
    scraper/  # Playwright + Cheerio スクレイピングとDB投入
    api/      # Fastify + Drizzle API
    web/      # React + Tailwind + D3 フロント
  docker-compose.yml
```

## Quick Start

1. `.env` を作成

```bash
cp .env.example .env
```

2. DB 起動

```bash
docker compose up -d db
```

3. 依存インストール

```bash
npm install
```

4. スキーマ反映（MVP中は push 優先）

```bash
npm run db:push --workspace @sakamichi48/api
```

5. MVPシード（任意）

```bash
npm run db:seed --workspace @sakamichi48/api
```

6. API + Web 起動

```bash
npm run dev
```

- API: `http://localhost:4000`
- Web: `http://localhost:5173`

## 運用方針（現行）

- 本番Webは **閲覧専用**（Vercelで静的配信）
- 更新は **定期バッチ**（スクレイピング -> DB更新 -> 静的スナップショット再生成）
- DBは正本、`packages/web/public/data/*.json` は配信用スナップショット

## Scraper

### 実行例

```bash
# 全8グループを譜ネット(Uta-Net)から取り込み
npm run scrape --workspace @sakamichi48/scraper

# ドライラン（DBには投入しない / 乃木坂のみ最大2ページ）
npm run scrape --workspace @sakamichi48/scraper -- --dry-run --group=nogizaka46 --limit=2

# パーサーテスト
npm run test:scraper

# 保存済みJSONをそのままDB投入（再スクレイプ不要）
npm run scrape --workspace @sakamichi48/scraper -- --input=tmp/utanet-enriched.json

# JSONをCSVへ変換（tmp/csv に4ファイル出力）
npm run scrape:csv

# CSVからDBへ一括投入（既存データは保持）
npm run db:import:csv

# CSVからDBを作り直し（既存データをTRUNCATEして再投入）
npm run db:import:csv:reset
```

### 実装方針（MVP）

- 譜ネット(Uta-Net)のアーティストページをページネーション巡回
  - `table.songlist-table` から曲名/作詞/作曲/編曲を抽出
  - `songlist-paging` の `next` リンクで次ページを取得
- 譜ネット(Uta-Net)のアルバム歌詞特集を追加利用
  - `https://www.uta-net.com/user/search_index/artist.html?AID=<artistId>`
  - リリース名/発売日/曲順/収録曲（song id）を抽出して `releases` を構成
  - 重複収録曲は最古リリースを優先して1曲1リリースに正規化
- 礼儀正しいスクレイピング
  - 既定で約2.2秒ディレイ
  - `.cache/utanet` にHTMLを保存して再取得を抑制
- 作曲家名正規化
  - NFKC正規化
  - 空白統一
  - `packages/scraper/src/data/creator-aliases.json` でエイリアス吸収

### CSV Import (PostgreSQL `COPY`)

- `packages/scraper/sql/import_csv.sql`
  - `releases.csv / songs.csv / song_credits.csv` を一時テーブルへ `\copy`
  - `groups -> releases -> songs -> creators -> song_credits` の順で投入
  - `--reset` 指定時は `TRUNCATE ... RESTART IDENTITY` してから投入
- 実行ラッパー: `packages/scraper/scripts/import-csv-to-db.sh`
  - 既定CSVディレクトリ: `packages/scraper/tmp/csv`
  - 既定DB接続先: `postgresql://sakamichi:sakamichi@localhost:5432/sakamichi48`
  - 変更したい場合は `DATABASE_URL` を環境変数で上書き

## Static Snapshot

```bash
# DBから静的JSONを再生成（packages/web/public/data）
npm run data:snapshot

# 生成データの品質チェック
npm run data:check

# まとめて実行
npm run data:refresh

# 定期バッチ相当（スクレイプ -> DB更新 -> snapshot+check）
npm run batch:refresh
```

- 生成スクリプト: `packages/api/src/scripts/build-static-data.ts`
- チェックスクリプト: `packages/api/src/scripts/validate-static-data.ts`
- 出力ファイル:
  - `groups.json`
  - `creators.json`
  - `songs.json`
  - `songs-detail.json`
  - `meta.json`

## API Endpoints (MVP)

- `GET /health`
- `GET /api/groups`
- `GET /api/creators?q=&limit=`
- `GET /api/songs?q=&groupId=&composerId=&limit=&offset=`
- `GET /api/songs/:id`
- `GET /api/graph/composer/:id?excludeAkimoto=true`
- `GET /api/graph/group/:id?limit=120&excludeAkimoto=true`

## Web (MVP)

- 日本語ファジー検索（Fuse.js）
- 楽曲一覧 / 楽曲詳細
- 作曲家一覧
- 作曲家サブグラフ（D3 force-directed）
- グループサブグラフ（作曲家/作詞家/編曲家 × 楽曲）
- 秋元康フィルター

## Deploy (GitHub + Vercel)

1. GitHub に push
2. Vercel でこのリポジトリを Import（root そのままでOK）
3. `packages/web/public/data/*.json` をそのまま配信（API常駐不要）
4. データ更新は GitHub Actions の `Weekly Data Refresh` がPR作成

補足:
- `vercel.json` は monorepo で `packages/web` をビルドする設定済み
- SPA直リンク用に `index.html` への rewrite を設定済み
- 定期更新ワークフロー: `.github/workflows/weekly-data-refresh.yml`

## Phase Notes

- 現状は **Phase 1 の動く土台** です。
- Uta-Net側のHTML変更に備えて、セレクタ保守は継続的に必要です。
- Phase 2 以降で `/api/graph/*` のクエリ最適化と Canvas 切替を追加します。
