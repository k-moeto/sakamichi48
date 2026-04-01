export type GroupKey =
  | "nogizaka46"
  | "keyakizaka46"
  | "sakurazaka46"
  | "hinatazaka46"
  | "akb48"
  | "ske48"
  | "nmb48"
  | "hkt48"
  | "stu48"
  | "ngt48";

export type CreditRole = "lyricist" | "composer" | "arranger";

export type ScrapedCredit = {
  role: CreditRole;
  names: string[];
};

export type MemberPosition = {
  name: string;
  isCenter: boolean;
  row?: number;
};

export type FormationType = "senbatsu" | "undergirls" | "unit" | "all" | "unknown";

export type SongFormation = {
  formationType: FormationType;
  unitName?: string;
  members: MemberPosition[];
  centerNames: string[];
};

export type ScrapedSong = {
  title: string;
  trackNumber: number;
  credits: ScrapedCredit[];
  formation?: SongFormation;
};

export type ScrapedRelease = {
  groupName: string;
  groupRomaji: string;
  groupCategory: "sakamichi" | "48";
  title: string;
  releaseType: "single" | "album" | "other";
  releaseNumber?: number;
  releaseDate?: string;
  wikipediaUrl: string;
  songs: ScrapedSong[];
};

export type GroupSeed = {
  key: GroupKey;
  name: string;
  nameRomaji: string;
  category: "sakamichi" | "48";
  utaNetArtistId: number;
};
