#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
SQL_FILE="${ROOT_DIR}/packages/scraper/sql/import_csv.sql"

CSV_DIR="${ROOT_DIR}/packages/scraper/tmp/csv"
RESET="0"

for arg in "$@"; do
  case "$arg" in
    --csv-dir=*)
      CSV_DIR="${arg#*=}"
      ;;
    --reset)
      RESET="1"
      ;;
    *)
      echo "[import-csv] unknown option: ${arg}" >&2
      echo "usage: npm run import:csv --workspace @sakamichi48/scraper -- [--csv-dir=/abs/path] [--reset]" >&2
      exit 1
      ;;
  esac
done

if [[ "${CSV_DIR}" != /* ]]; then
  CSV_DIR="$(cd -- "${PWD}" && pwd)/${CSV_DIR}"
fi

RELEASES_CSV="${CSV_DIR}/releases.csv"
SONGS_CSV="${CSV_DIR}/songs.csv"
SONG_CREDITS_CSV="${CSV_DIR}/song_credits.csv"

for file in "${RELEASES_CSV}" "${SONGS_CSV}" "${SONG_CREDITS_CSV}"; do
  if [[ ! -f "${file}" ]]; then
    echo "[import-csv] missing required file: ${file}" >&2
    exit 1
  fi
done

if ! command -v psql >/dev/null 2>&1; then
  echo "[import-csv] psql command was not found. Install PostgreSQL client tools first." >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-postgresql://sakamichi:sakamichi@localhost:5432/sakamichi48}"

echo "[import-csv] loading CSV files from ${CSV_DIR}"
echo "[import-csv] reset mode: ${RESET}"

psql "${DATABASE_URL}" \
  -v ON_ERROR_STOP=1 \
  -v reset="${RESET}" \
  -v releases_csv="${RELEASES_CSV}" \
  -v songs_csv="${SONGS_CSV}" \
  -v song_credits_csv="${SONG_CREDITS_CSV}" \
  -f "${SQL_FILE}"

echo "[import-csv] done"
