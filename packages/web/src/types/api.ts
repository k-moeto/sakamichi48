export type Group = {
  id: number;
  name: string;
  nameRomaji: string | null;
  category: "sakamichi" | "48";
  formedDate: string | null;
};

export type Creator = {
  id: number;
  name: string;
  nameRomaji: string | null;
  songCount: number;
};

export type SongListItem = {
  songId: number;
  songTitle: string;
  duration: string | null;
  trackNumber: number | null;
  editionType: string | null;
  songCategory: string;
  releaseId: number;
  releaseTitle: string;
  releaseType: string;
  releaseNumber: number | null;
  releaseDate: string | null;
  groupId: number;
  groupName: string;
  groupCategory: string;
};

export type SongDetail = {
  songId: number;
  title: string;
  duration: string | null;
  trackNumber: number | null;
  editionType: string | null;
  songCategory: string;
  lyricsText: string | null;
  releaseTitle: string;
  groupName: string;
  releaseDate: string | null;
  credits: Array<{
    role: "lyricist" | "composer" | "arranger";
    creatorId: number;
    creatorName: string;
    creatorRomaji: string | null;
  }>;
};

export type GraphNode = {
  id: string;
  type: "creator" | "song";
  label: string;
  groupId?: number;
  groupName?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  role: "lyricist" | "composer" | "arranger";
};

export type ComposerGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
