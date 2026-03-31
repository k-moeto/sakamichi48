CREATE TYPE "public"."credit_role" AS ENUM('lyricist', 'composer', 'arranger');--> statement-breakpoint
CREATE TYPE "public"."group_category" AS ENUM('sakamichi', '48');--> statement-breakpoint
CREATE TYPE "public"."position_type" AS ENUM('center', 'fukujin', 'senbatsu', 'under');--> statement-breakpoint
CREATE TYPE "public"."release_type" AS ENUM('single', 'album', 'other');--> statement-breakpoint
CREATE TYPE "public"."song_category" AS ENUM('title', 'coupling', 'album', 'unit', 'other');--> statement-breakpoint
CREATE TABLE "creators" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"name_romaji" varchar(220)
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"name_romaji" varchar(160),
	"category" "group_category" NOT NULL,
	"formed_date" date
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"name_romaji" varchar(220),
	"group_id" integer NOT NULL,
	"generation" varchar(40),
	CONSTRAINT "members_group_name_unique" UNIQUE("group_id","name")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"release_type" "release_type" NOT NULL,
	"release_number" integer,
	"release_date" date,
	"wikipedia_url" text,
	CONSTRAINT "releases_group_title_unique" UNIQUE("group_id","title")
);
--> statement-breakpoint
CREATE TABLE "song_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"role" "credit_role" NOT NULL,
	CONSTRAINT "song_credits_unique" UNIQUE("song_id","creator_id","role")
);
--> statement-breakpoint
CREATE TABLE "song_formations" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"position_type" "position_type" NOT NULL,
	"row_number" integer,
	CONSTRAINT "song_formation_unique" UNIQUE("song_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"release_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"duration" varchar(30),
	"track_number" integer,
	"edition_type" varchar(80),
	"song_category" "song_category" DEFAULT 'other' NOT NULL,
	"lyrics_text" text,
	CONSTRAINT "songs_release_track_unique" UNIQUE("release_id","track_number","title")
);
--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_credits" ADD CONSTRAINT "song_credits_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_credits" ADD CONSTRAINT "song_credits_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_formations" ADD CONSTRAINT "song_formations_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_formations" ADD CONSTRAINT "song_formations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;