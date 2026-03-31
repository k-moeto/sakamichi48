import {
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  unique,
  varchar
} from "drizzle-orm/pg-core";

export const groupCategoryEnum = pgEnum("group_category", ["sakamichi", "48"]);
export const releaseTypeEnum = pgEnum("release_type", ["single", "album", "other"]);
export const songCategoryEnum = pgEnum("song_category", ["title", "coupling", "album", "unit", "other"]);
export const creditRoleEnum = pgEnum("credit_role", ["lyricist", "composer", "arranger"]);
export const positionTypeEnum = pgEnum("position_type", ["center", "fukujin", "senbatsu", "under"]);

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  nameRomaji: varchar("name_romaji", { length: 160 }),
  category: groupCategoryEnum("category").notNull(),
  formedDate: date("formed_date")
});

export const releases = pgTable(
  "releases",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    releaseType: releaseTypeEnum("release_type").notNull(),
    releaseNumber: integer("release_number"),
    releaseDate: date("release_date"),
    wikipediaUrl: text("wikipedia_url")
  },
  (table) => ({
    groupTitleUnique: unique("releases_group_title_unique").on(table.groupId, table.title)
  })
);

export const songs = pgTable(
  "songs",
  {
    id: serial("id").primaryKey(),
    releaseId: integer("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    duration: varchar("duration", { length: 30 }),
    trackNumber: integer("track_number"),
    editionType: varchar("edition_type", { length: 80 }),
    songCategory: songCategoryEnum("song_category").notNull().default("other"),
    lyricsText: text("lyrics_text")
  },
  (table) => ({
    releaseTrackUnique: unique("songs_release_track_unique").on(table.releaseId, table.trackNumber, table.title)
  })
);

export const creators = pgTable("creators", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  nameRomaji: varchar("name_romaji", { length: 220 })
});

export const songCredits = pgTable(
  "song_credits",
  {
    id: serial("id").primaryKey(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    creatorId: integer("creator_id")
      .notNull()
      .references(() => creators.id, { onDelete: "cascade" }),
    role: creditRoleEnum("role").notNull()
  },
  (table) => ({
    songCreatorRoleUnique: unique("song_credits_unique").on(table.songId, table.creatorId, table.role)
  })
);

export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    nameRomaji: varchar("name_romaji", { length: 220 }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    generation: varchar("generation", { length: 40 })
  },
  (table) => ({
    groupMemberUnique: unique("members_group_name_unique").on(table.groupId, table.name)
  })
);

export const songFormations = pgTable(
  "song_formations",
  {
    id: serial("id").primaryKey(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    positionType: positionTypeEnum("position_type").notNull(),
    rowNumber: integer("row_number")
  },
  (table) => ({
    formationUnique: unique("song_formation_unique").on(table.songId, table.memberId)
  })
);
