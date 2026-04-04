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
  releaseYear: number | null;
  groupId: number;
  groupName: string;
  groupCategory: string;
  credits?: Array<{
    role: "lyricist" | "composer" | "arranger";
    creatorId: number;
    creatorName: string;
    creatorRomaji?: string | null;
  }>;
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
  releaseYear: number | null;
  credits: Array<{
    role: "lyricist" | "composer" | "arranger";
    creatorId: number;
    creatorName: string;
    creatorRomaji: string | null;
  }>;
  formation: Array<{
    memberName: string;
    memberRomaji: string | null;
    positionType: "center" | "fukujin" | "senbatsu" | "under";
    rowNumber: number | null;
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

export type RelativeTimelineRow = {
  elapsedMonths: number;
  elapsedLabel: string;
  akb48: string | null;
  nogizaka46: string | null;
  sakurazakaKeyaki46: string | null;
  hinatazaka46: string | null;
};
