export interface GroupConfig {
  id: string;
  name: string;
  nameJa: string;
  utanetArtistId: number;
}

export interface SongListEntry {
  songId: string;
  title: string;
  lyricist: string;
  composer: string;
  openingLyrics: string;
  songUrl: string;
}

export interface SongDetail {
  songId: string;
  title: string;
  lyricist: string;
  composer: string;
  arranger: string;
  openingLyrics: string;
  fullLyrics: string;
  songUrl: string;
}

export const GROUPS: GroupConfig[] = [
  { id: "nogizaka46", name: "Nogizaka46", nameJa: "乃木坂46", utanetArtistId: 12550 },
  { id: "keyakizaka46", name: "Keyakizaka46", nameJa: "欅坂46", utanetArtistId: 19868 },
  { id: "sakurazaka46", name: "Sakurazaka46", nameJa: "櫻坂46", utanetArtistId: 29512 },
  { id: "hinatazaka46", name: "Hinatazaka46", nameJa: "日向坂46", utanetArtistId: 22163 },
  { id: "akb48", name: "AKB48", nameJa: "AKB48", utanetArtistId: 6636 },
  { id: "ske48", name: "SKE48", nameJa: "SKE48", utanetArtistId: 8921 },
  { id: "nmb48", name: "NMB48", nameJa: "NMB48", utanetArtistId: 10997 },
  { id: "hkt48", name: "HKT48", nameJa: "HKT48", utanetArtistId: 14548 },
  { id: "stu48", name: "STU48", nameJa: "STU48", utanetArtistId: 23533 },
];
