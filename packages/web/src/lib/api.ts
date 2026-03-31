import type { ComposerGraph, Creator, GraphEdge, GraphNode, Group, SongDetail, SongListItem } from "../types/api";

type SongWithCredits = SongListItem & {
  credits: Array<{
    role: "lyricist" | "composer" | "arranger";
    creatorId: number;
    creatorName: string;
    creatorRomaji?: string | null;
  }>;
};

let groupsCache: Group[] | null = null;
let songsWithCreditsCache: SongWithCredits[] | null = null;
let creatorsCache: Creator[] | null = null;
let songsDetailCache: Record<string, SongDetail> | null = null;

async function loadJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function loadSongsWithCredits(): Promise<SongWithCredits[]> {
  if (!songsWithCreditsCache) {
    songsWithCreditsCache = await loadJson<SongWithCredits[]>("/data/songs.json");
  }
  return songsWithCreditsCache;
}

export async function fetchGroups(): Promise<Group[]> {
  if (!groupsCache) {
    groupsCache = await loadJson<Group[]>("/data/groups.json");
  }
  return groupsCache;
}

export async function fetchCreators(_query = "", excludeAkimoto = false): Promise<Creator[]> {
  if (!creatorsCache) {
    creatorsCache = await loadJson<Creator[]>("/data/creators.json");
  }
  const query = _query.trim().toLowerCase();
  let result = creatorsCache.filter((creator) => {
    if (query.length === 0) {
      return true;
    }
    return creator.name.toLowerCase().includes(query) || (creator.nameRomaji ?? "").toLowerCase().includes(query);
  });
  if (excludeAkimoto) {
    result = result.filter((c) => c.name !== "秋元康");
  }
  return result;
}

export async function fetchSongs(query = "", groupId?: number, composerId?: number): Promise<SongListItem[]> {
  const songs = await loadSongsWithCredits();
  const normalizedQuery = query.trim().toLowerCase();

  return songs.filter((song) => {
    const matchesGroup = groupId ? song.groupId === groupId : true;
    const matchesComposer = composerId
      ? song.credits.some((credit) => credit.role === "composer" && credit.creatorId === composerId)
      : true;
    const matchesQuery =
      normalizedQuery.length === 0
        ? true
        : song.songTitle.toLowerCase().includes(normalizedQuery) ||
          song.groupName.toLowerCase().includes(normalizedQuery) ||
          (song.releaseTitle ?? "").toLowerCase().includes(normalizedQuery);

    return matchesGroup && matchesComposer && matchesQuery;
  });
}

export async function fetchSongDetail(songId: number): Promise<SongDetail> {
  if (!songsDetailCache) {
    songsDetailCache = await loadJson<Record<string, SongDetail>>("/data/songs-detail.json");
  }
  const detail = songsDetailCache[String(songId)];
  if (!detail) throw new Error(`Song ${songId} not found`);
  return detail;
}

export async function fetchComposerGraph(creatorId: number, excludeAkimoto = false): Promise<ComposerGraph> {
  const songs = await loadSongsWithCredits();

  // Find all songs this creator is credited on
  const creatorSongs = songs.filter((s) =>
    s.credits.some((c) => c.creatorId === creatorId)
  );

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();

  for (const song of creatorSongs) {
    const songNodeId = `song-${song.songId}`;
    if (!seenNodes.has(songNodeId)) {
      seenNodes.add(songNodeId);
      nodes.push({
        id: songNodeId,
        type: "song",
        label: song.songTitle,
        groupId: song.groupId,
        groupName: song.groupName,
      });
    }

    for (const credit of song.credits) {
      if (excludeAkimoto && credit.creatorName === "秋元康") continue;

      const creatorNodeId = `creator-${credit.creatorId}`;
      if (!seenNodes.has(creatorNodeId)) {
        seenNodes.add(creatorNodeId);
        nodes.push({
          id: creatorNodeId,
          type: "creator",
          label: credit.creatorName,
        });
      }

      edges.push({
        source: creatorNodeId,
        target: songNodeId,
        role: credit.role,
      });
    }
  }

  return { nodes, edges };
}

export async function fetchGroupGraph(groupId: number, excludeAkimoto = false, limit = 120): Promise<ComposerGraph> {
  const allSongs = await loadSongsWithCredits();
  const groupSongs = allSongs.filter((s) => s.groupId === groupId);

  // Count credits per creator in this group
  const creatorCounts = new Map<number, { name: string; count: number }>();
  for (const song of groupSongs) {
    for (const credit of song.credits) {
      if (excludeAkimoto && credit.creatorName === "秋元康") continue;
      const entry = creatorCounts.get(credit.creatorId) ?? { name: credit.creatorName, count: 0 };
      entry.count++;
      creatorCounts.set(credit.creatorId, entry);
    }
  }

  // Take top N creators by credit count
  const topCreators = [...creatorCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);
  const topCreatorIds = new Set(topCreators.map(([id]) => id));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();

  // Add creator nodes
  for (const [id, info] of topCreators) {
    const nodeId = `creator-${id}`;
    seenNodes.add(nodeId);
    nodes.push({ id: nodeId, type: "creator", label: info.name });
  }

  // Add song nodes and edges for songs connected to top creators
  for (const song of groupSongs) {
    const relevantCredits = song.credits.filter((c) => {
      if (excludeAkimoto && c.creatorName === "秋元康") return false;
      return topCreatorIds.has(c.creatorId);
    });

    if (relevantCredits.length === 0) continue;

    const songNodeId = `song-${song.songId}`;
    if (!seenNodes.has(songNodeId)) {
      seenNodes.add(songNodeId);
      nodes.push({
        id: songNodeId,
        type: "song",
        label: song.songTitle,
        groupId: song.groupId,
        groupName: song.groupName,
      });
    }

    for (const credit of relevantCredits) {
      edges.push({
        source: `creator-${credit.creatorId}`,
        target: songNodeId,
        role: credit.role,
      });
    }
  }

  return { nodes, edges };
}
