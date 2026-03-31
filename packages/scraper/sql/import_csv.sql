BEGIN;

DO $$
BEGIN
  IF :'reset' = '1' THEN
    TRUNCATE TABLE song_credits, songs, releases, creators, groups RESTART IDENTITY CASCADE;
  END IF;
END $$;

CREATE TEMP TABLE stg_releases (
  release_id integer,
  group_name text,
  group_romaji text,
  group_category text,
  release_title text,
  release_type text,
  release_date text,
  source_url text
);

CREATE TEMP TABLE stg_songs (
  song_id integer,
  release_id integer,
  track_number text,
  song_title text
);

CREATE TEMP TABLE stg_song_credits (
  song_id integer,
  credit_role text,
  creator_name text
);

\copy stg_releases (release_id, group_name, group_romaji, group_category, release_title, release_type, release_date, source_url) FROM :'releases_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy stg_songs (song_id, release_id, track_number, song_title) FROM :'songs_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
\copy stg_song_credits (song_id, credit_role, creator_name) FROM :'song_credits_csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

INSERT INTO groups (name, name_romaji, category)
SELECT DISTINCT
  sr.group_name,
  NULLIF(sr.group_romaji, ''),
  sr.group_category::group_category
FROM stg_releases AS sr
LEFT JOIN groups AS g
  ON g.name = sr.group_name
WHERE g.id IS NULL;

INSERT INTO creators (name)
SELECT DISTINCT
  ssc.creator_name
FROM stg_song_credits AS ssc
LEFT JOIN creators AS c
  ON c.name = ssc.creator_name
WHERE c.id IS NULL;

INSERT INTO releases (group_id, title, release_type, release_number, release_date, wikipedia_url)
SELECT
  g.id,
  sr.release_title,
  sr.release_type::release_type,
  NULL,
  NULLIF(sr.release_date, '')::date,
  NULLIF(sr.source_url, '')
FROM stg_releases AS sr
JOIN (
  SELECT name, MIN(id) AS id
  FROM groups
  GROUP BY name
) AS g
  ON g.name = sr.group_name
ON CONFLICT ON CONSTRAINT releases_group_title_unique
DO UPDATE
SET release_type = EXCLUDED.release_type,
    release_date = COALESCE(EXCLUDED.release_date, releases.release_date),
    wikipedia_url = COALESCE(EXCLUDED.wikipedia_url, releases.wikipedia_url);

INSERT INTO songs (release_id, title, track_number, song_category)
SELECT
  r.id,
  ss.song_title,
  NULLIF(ss.track_number, '')::integer,
  'other'::song_category
FROM stg_songs AS ss
JOIN stg_releases AS sr
  ON sr.release_id = ss.release_id
JOIN (
  SELECT name, MIN(id) AS id
  FROM groups
  GROUP BY name
) AS g
  ON g.name = sr.group_name
JOIN releases AS r
  ON r.group_id = g.id
 AND r.title = sr.release_title
ON CONFLICT ON CONSTRAINT songs_release_track_unique
DO NOTHING;

WITH mapped AS (
  SELECT DISTINCT
    s.id AS song_id,
    c.id AS creator_id,
    ssc.credit_role::credit_role AS role
  FROM stg_song_credits AS ssc
  JOIN stg_songs AS ss
    ON ss.song_id = ssc.song_id
  JOIN stg_releases AS sr
    ON sr.release_id = ss.release_id
  JOIN (
    SELECT name, MIN(id) AS id
    FROM groups
    GROUP BY name
  ) AS g
    ON g.name = sr.group_name
  JOIN releases AS r
    ON r.group_id = g.id
   AND r.title = sr.release_title
  JOIN songs AS s
    ON s.release_id = r.id
   AND s.title = ss.song_title
   AND (
     (s.track_number IS NULL AND NULLIF(ss.track_number, '') IS NULL)
     OR s.track_number = NULLIF(ss.track_number, '')::integer
   )
  JOIN (
    SELECT name, MIN(id) AS id
    FROM creators
    GROUP BY name
  ) AS c
    ON c.name = ssc.creator_name
)
INSERT INTO song_credits (song_id, creator_id, role)
SELECT
  mapped.song_id,
  mapped.creator_id,
  mapped.role
FROM mapped
ON CONFLICT ON CONSTRAINT song_credits_unique
DO NOTHING;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM groups) AS groups_count,
  (SELECT COUNT(*) FROM releases) AS releases_count,
  (SELECT COUNT(*) FROM songs) AS songs_count,
  (SELECT COUNT(*) FROM creators) AS creators_count,
  (SELECT COUNT(*) FROM song_credits) AS song_credits_count;
