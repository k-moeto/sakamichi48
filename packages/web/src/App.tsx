import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { GraphView } from "./components/GraphView";
import {
  fetchComposerGraph,
  fetchCreators,
  fetchGroupGraph,
  fetchGroups,
  fetchRelativeTimeline,
  fetchSongDetail,
  fetchSongs
} from "./lib/api";
import type { ComposerGraph, Creator, Group, RelativeTimelineRow, SongDetail, SongListItem } from "./types/api";

const FILTER_AKIMOTO = "秋元康";
type GraphMode = "composer" | "group";
type SongSortOrder = "asc" | "desc";
type CreatorFocusMode = "all" | "composer" | "crossGroupComposer";
type WindowKey = "song" | "creator" | "graph" | "timeline";
type WindowPlacement = { x: number; y: number; z: number };

const CREDIT_ROLE_LABEL: Record<SongDetail["credits"][number]["role"], string> = {
  lyricist: "作詞",
  composer: "作曲",
  arranger: "編曲"
};

const POSITION_LABEL: Record<SongDetail["formation"][number]["positionType"], string> = {
  center: "センター",
  fukujin: "福神",
  senbatsu: "選抜",
  under: "アンダー"
};

function isUnknownReleaseTitle(title: string | null | undefined): boolean {
  if (!title) {
    return true;
  }
  return title.includes("Uta-Net Other Songs");
}

function formatSongMetaLine(groupName: string, releaseTitle: string | null | undefined, releaseYear: number | null): string {
  const parts = [groupName];
  if (!isUnknownReleaseTitle(releaseTitle)) {
    parts.push(releaseTitle as string);
  }
  if (releaseYear !== null) {
    parts.push(String(releaseYear));
  }
  return parts.join(" / ");
}

function sortSongsByRelease(rows: SongListItem[], order: SongSortOrder): SongListItem[] {
  return [...rows].sort((a, b) => {
    const yearA = a.releaseYear;
    const yearB = b.releaseYear;

    if (yearA === null && yearB !== null) {
      return 1;
    }
    if (yearA !== null && yearB === null) {
      return -1;
    }
    if (yearA !== yearB) {
      return order === "asc" ? (yearA ?? 0) - (yearB ?? 0) : (yearB ?? 0) - (yearA ?? 0);
    }

    const dateA = a.releaseDate;
    const dateB = b.releaseDate;
    if (!dateA && dateB) {
      return 1;
    }
    if (dateA && !dateB) {
      return -1;
    }
    if (dateA && dateB && dateA !== dateB) {
      return order === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }

    return a.songTitle.localeCompare(b.songTitle, "ja");
  });
}

type WindowProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  placement: WindowPlacement;
  onPlacementChange: (next: { x: number; y: number }) => void;
  onRequestFront: () => void;
  className?: string;
  children: ReactNode;
};

const WINDOW_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function FloatingWindow({
  title,
  subtitle,
  onClose,
  placement,
  onPlacementChange,
  onRequestFront,
  className = "",
  children
}: WindowProps): JSX.Element {
  const articleRef = useRef<HTMLElement | null>(null);

  function clampPosition(nextX: number, nextY: number): { x: number; y: number } {
    const rect = articleRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 560;
    const height = rect?.height ?? 420;
    const maxX = Math.max(WINDOW_MARGIN, window.innerWidth - width - WINDOW_MARGIN);
    const maxY = Math.max(WINDOW_MARGIN, window.innerHeight - height - WINDOW_MARGIN);
    return {
      x: clamp(nextX, WINDOW_MARGIN, maxX),
      y: clamp(nextY, WINDOW_MARGIN, maxY)
    };
  }

  function startDrag(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }

    onRequestFront();
    event.preventDefault();

    const rect = articleRef.current?.getBoundingClientRect();
    const originX = rect?.left ?? placement.x;
    const originY = rect?.top ?? placement.y;
    const offsetX = event.clientX - originX;
    const offsetY = event.clientY - originY;

    const onMouseMove = (moveEvent: MouseEvent): void => {
      const next = clampPosition(moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
      onPlacementChange(next);
    };

    const onMouseUp = (): void => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <article
      ref={articleRef}
      style={{ left: placement.x, top: placement.y, zIndex: placement.z }}
      onMouseDown={() => onRequestFront()}
      className={`pointer-events-auto fixed max-h-[calc(100vh-2rem)] overflow-y-auto bg-white/98 p-5 shadow-[0_24px_64px_rgba(0,0,0,0.11)] backdrop-blur ${className}`}
    >
      <div
        onMouseDown={startDrag}
        className="mb-4 flex cursor-move select-none items-start justify-between gap-3 border-b border-zinc-200 pb-3"
      >
        <div>
          <h2 className="text-lg font-medium tracking-wide text-zinc-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          onMouseDown={(event) => event.stopPropagation()}
          className="text-xs tracking-wide text-zinc-500 transition hover:text-zinc-900"
        >
          CLOSE
        </button>
      </div>
      {children}
    </article>
  );
}

export default function App(): JSX.Element {
  const [groups, setGroups] = useState<Group[]>([]);
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);

  const [selectedSong, setSelectedSong] = useState<SongDetail | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [timelineRows, setTimelineRows] = useState<RelativeTimelineRow[]>([]);

  const [creatorWindowOpen, setCreatorWindowOpen] = useState(false);
  const [graphWindowOpen, setGraphWindowOpen] = useState(false);
  const [timelineWindowOpen, setTimelineWindowOpen] = useState(false);
  const [windowPlacement, setWindowPlacement] = useState<Record<WindowKey, WindowPlacement>>(() => {
    const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
    return {
      song: { x: Math.max(16, viewportWidth - 640), y: 64, z: 40 },
      creator: { x: Math.max(32, viewportWidth - 700), y: 112, z: 30 },
      graph: { x: 48, y: 84, z: 20 },
      timeline: { x: 72, y: 36, z: 10 }
    };
  });
  const zCounterRef = useRef(60);

  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  const [songSearchText, setSongSearchText] = useState("");
  const [creatorSearchText, setCreatorSearchText] = useState("");
  const [creatorFocusMode, setCreatorFocusMode] = useState<CreatorFocusMode>("crossGroupComposer");
  const [songSortOrder, setSongSortOrder] = useState<SongSortOrder>("asc");
  const [hideAkimoto, setHideAkimoto] = useState(true);

  const [graphMode, setGraphMode] = useState<GraphMode>("composer");
  const [graph, setGraph] = useState<ComposerGraph | null>(null);

  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap(): Promise<void> {
      setLoading(true);
      const [groupRows, creatorRows, songRows] = await Promise.all([
        fetchGroups(),
        fetchCreators("", hideAkimoto),
        fetchSongs()
      ]);

      if (!mounted) {
        return;
      }

      setGroups(groupRows);
      setCreators(creatorRows);
      setSongs(songRows);
      setBootstrapped(true);
      setLoading(false);
    }

    bootstrap().catch((error) => {
      console.error(error);
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }

    fetchCreators("", hideAkimoto)
      .then((result) => {
        setCreators(result);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [bootstrapped, hideAkimoto]);

  useEffect(() => {
    if (hideAkimoto && selectedCreator?.name === FILTER_AKIMOTO) {
      setSelectedCreator(null);
    }
  }, [hideAkimoto, selectedCreator]);

  useEffect(() => {
    if (!bootstrapped || !graphWindowOpen) {
      return;
    }

    async function loadGraph(): Promise<void> {
      setGraphLoading(true);

      try {
        if (graphMode === "composer") {
          if (!selectedCreator) {
            setGraph(null);
            return;
          }

          const result = await fetchComposerGraph(selectedCreator.id, hideAkimoto);
          setGraph(result);
          return;
        }

        const groupId = selectedGroupId ?? groups[0]?.id;
        if (!groupId) {
          setGraph(null);
          return;
        }

        const result = await fetchGroupGraph(groupId, hideAkimoto, 120);
        setGraph(result);
      } catch (error) {
        console.error(error);
        setGraph(null);
      } finally {
        setGraphLoading(false);
      }
    }

    loadGraph().catch(console.error);
  }, [bootstrapped, graphWindowOpen, graphMode, selectedCreator, selectedGroupId, hideAkimoto, groups]);

  useEffect(() => {
    if (!timelineWindowOpen || timelineRows.length > 0) {
      return;
    }

    setTimelineLoading(true);
    fetchRelativeTimeline()
      .then((rows) => {
        setTimelineRows(rows);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setTimelineLoading(false);
      });
  }, [timelineWindowOpen, timelineRows.length]);

  const fuseSongs = useMemo(
    () =>
      new Fuse(songs, {
        keys: ["songTitle", "releaseTitle", "groupName"],
        threshold: 0.34,
        ignoreLocation: true
      }),
    [songs]
  );

  const fuseCreators = useMemo(
    () =>
      new Fuse(creators, {
        keys: ["name", "nameRomaji"],
        threshold: 0.34,
        ignoreLocation: true
      }),
    [creators]
  );

  const filteredSongs = useMemo(() => {
    const searched = songSearchText.trim().length > 0 ? fuseSongs.search(songSearchText).map((x) => x.item) : songs;
    const groupScoped = selectedGroupId ? searched.filter((song) => song.groupId === selectedGroupId) : searched;
    return sortSongsByRelease(groupScoped, songSortOrder);
  }, [fuseSongs, songSearchText, songs, selectedGroupId, songSortOrder]);

  const creatorRoleStats = useMemo(() => {
    const stats = new Map<number, { lyricist: number; composer: number; arranger: number; involvedSongs: number }>();
    const involvedSongSetByCreator = new Map<number, Set<number>>();
    const roleSongSetByCreator = new Map<number, { lyricist: Set<number>; composer: Set<number>; arranger: Set<number> }>();

    for (const song of songs) {
      for (const credit of song.credits ?? []) {
        if (!roleSongSetByCreator.has(credit.creatorId)) {
          roleSongSetByCreator.set(credit.creatorId, {
            lyricist: new Set<number>(),
            composer: new Set<number>(),
            arranger: new Set<number>()
          });
        }
        if (!involvedSongSetByCreator.has(credit.creatorId)) {
          involvedSongSetByCreator.set(credit.creatorId, new Set<number>());
        }

        roleSongSetByCreator.get(credit.creatorId)?.[credit.role].add(song.songId);
        involvedSongSetByCreator.get(credit.creatorId)?.add(song.songId);
      }
    }

    for (const [creatorId, roleSets] of roleSongSetByCreator) {
      stats.set(creatorId, {
        lyricist: roleSets.lyricist.size,
        composer: roleSets.composer.size,
        arranger: roleSets.arranger.size,
        involvedSongs: involvedSongSetByCreator.get(creatorId)?.size ?? 0
      });
    }

    return stats;
  }, [songs]);

  const composerCrossStats = useMemo(() => {
    const stats = new Map<number, { composedSongs: number; composedGroups: number; groupNames: string[] }>();
    const songSetByCreator = new Map<number, Set<number>>();
    const groupSetByCreator = new Map<number, Set<string>>();

    for (const song of songs) {
      for (const credit of song.credits ?? []) {
        if (credit.role !== "composer") {
          continue;
        }
        if (!songSetByCreator.has(credit.creatorId)) {
          songSetByCreator.set(credit.creatorId, new Set<number>());
        }
        if (!groupSetByCreator.has(credit.creatorId)) {
          groupSetByCreator.set(credit.creatorId, new Set<string>());
        }

        songSetByCreator.get(credit.creatorId)?.add(song.songId);
        groupSetByCreator.get(credit.creatorId)?.add(song.groupName);
      }
    }

    for (const [creatorId, songSet] of songSetByCreator) {
      const groupsByCreator = [...(groupSetByCreator.get(creatorId) ?? new Set<string>())];
      stats.set(creatorId, {
        composedSongs: songSet.size,
        composedGroups: groupsByCreator.length,
        groupNames: groupsByCreator.sort((a, b) => a.localeCompare(b, "ja"))
      });
    }

    return stats;
  }, [songs]);

  const filteredCreators = useMemo(() => {
    const base =
      creatorSearchText.trim().length > 0 ? fuseCreators.search(creatorSearchText).map((x) => x.item) : creators;
    const withoutAkimoto = hideAkimoto ? base.filter((creator) => creator.name !== FILTER_AKIMOTO) : base;

    if (creatorFocusMode === "all") {
      return withoutAkimoto;
    }

    const filtered = withoutAkimoto.filter((creator) => {
      const stat = composerCrossStats.get(creator.id);
      if (!stat) {
        return false;
      }
      if (creatorFocusMode === "composer") {
        return stat.composedSongs > 0;
      }
      return stat.composedGroups >= 2;
    });

    return filtered.sort((a, b) => {
      const statA = composerCrossStats.get(a.id);
      const statB = composerCrossStats.get(b.id);
      const groupDiff = (statB?.composedGroups ?? 0) - (statA?.composedGroups ?? 0);
      if (groupDiff !== 0) {
        return groupDiff;
      }
      const songDiff = (statB?.composedSongs ?? 0) - (statA?.composedSongs ?? 0);
      if (songDiff !== 0) {
        return songDiff;
      }
      return a.name.localeCompare(b.name, "ja");
    });
  }, [fuseCreators, creatorSearchText, creators, hideAkimoto, creatorFocusMode, composerCrossStats]);

  const topCrossGroupComposers = useMemo(() => {
    return creators
      .filter((creator) => (hideAkimoto ? creator.name !== FILTER_AKIMOTO : true))
      .map((creator) => ({ creator, stat: composerCrossStats.get(creator.id) }))
      .filter((row): row is { creator: Creator; stat: { composedSongs: number; composedGroups: number; groupNames: string[] } } =>
        Boolean(row.stat && row.stat.composedGroups >= 2)
      )
      .sort((a, b) => {
        if (b.stat.composedGroups !== a.stat.composedGroups) {
          return b.stat.composedGroups - a.stat.composedGroups;
        }
        if (b.stat.composedSongs !== a.stat.composedSongs) {
          return b.stat.composedSongs - a.stat.composedSongs;
        }
        return a.creator.name.localeCompare(b.creator.name, "ja");
      })
      .slice(0, 12);
  }, [creators, hideAkimoto, composerCrossStats]);

  const selectedCreatorComposerStat = useMemo(() => {
    return selectedCreator ? composerCrossStats.get(selectedCreator.id) ?? null : null;
  }, [selectedCreator, composerCrossStats]);

  const creatorSongs = useMemo(() => {
    if (!selectedCreator) {
      return [];
    }

    const rows = songs.filter((song) => {
      const groupMatch = selectedGroupId ? song.groupId === selectedGroupId : true;
      return groupMatch && (song.credits ?? []).some((credit) => credit.creatorId === selectedCreator.id);
    });

    return sortSongsByRelease(rows, songSortOrder);
  }, [songs, selectedCreator, selectedGroupId, songSortOrder]);

  async function handleSongSelect(songId: number): Promise<void> {
    const detail = await fetchSongDetail(songId);
    setSelectedSong(detail);
    bringWindowToFront("song");
  }

  function handleGraphNodeSongNavigate(songId: number): void {
    handleSongSelect(songId).catch(console.error);
  }

  function ensureCreatorWindow(): void {
    setCreatorWindowOpen(true);
    bringWindowToFront("creator");
  }

  function ensureTimelineWindow(): void {
    setTimelineWindowOpen(true);
    bringWindowToFront("timeline");
  }

  function handleCreatorSelect(creator: Creator): void {
    setSelectedCreator(creator);
    setCreatorWindowOpen(true);
    setGraphMode("composer");
    bringWindowToFront("creator");
  }

  function openCreatorFromCredit(credit: SongDetail["credits"][number]): void {
    const found = creators.find((creator) => creator.id === credit.creatorId);
    const fallback: Creator = {
      id: credit.creatorId,
      name: credit.creatorName,
      nameRomaji: credit.creatorRomaji ?? null,
      songCount: creatorRoleStats.get(credit.creatorId)?.involvedSongs ?? 0
    };
    handleCreatorSelect(found ?? fallback);
  }

  function moveWindow(windowKey: WindowKey, next: { x: number; y: number }): void {
    setWindowPlacement((prev) => ({
      ...prev,
      [windowKey]: {
        ...prev[windowKey],
        x: next.x,
        y: next.y
      }
    }));
  }

  function bringWindowToFront(windowKey: WindowKey): void {
    const nextZ = zCounterRef.current + 1;
    zCounterRef.current = nextZ;
    setWindowPlacement((prev) => ({
      ...prev,
      [windowKey]: {
        ...prev[windowKey],
        z: nextZ
      }
    }));
  }

  return (
    <main className="min-h-screen bg-white px-5 pb-16 pt-10 text-zinc-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="display-serif text-xs uppercase tracking-[0.26em] text-zinc-500">Sakamichi48</p>
          <h1 className="display-serif mt-3 text-4xl tracking-wide text-zinc-900">楽曲ネットワーク</h1>
          <p className="mt-2 text-sm text-zinc-500">
            まずは楽曲から。情報を辿ると、右側にウィンドウが重なって展開されます。
          </p>
        </header>

        <div className="flex flex-wrap items-end gap-4 border-b border-zinc-200 pb-4">
          <label className="min-w-56 flex-1">
            <span className="block text-[11px] tracking-wide text-zinc-500">楽曲検索</span>
            <input
              value={songSearchText}
              onChange={(event) => setSongSearchText(event.target.value)}
              placeholder="曲名 / リリース / グループ"
              className="mt-1 w-full border-0 border-b border-zinc-300 bg-transparent px-0 py-1.5 text-sm outline-none focus:border-zinc-900"
            />
          </label>

          <label>
            <span className="block text-[11px] tracking-wide text-zinc-500">グループ</span>
            <select
              className="mt-1 border-0 border-b border-zinc-300 bg-transparent px-0 py-1.5 text-sm outline-none focus:border-zinc-900"
              value={selectedGroupId ?? ""}
              onChange={(event) => setSelectedGroupId(event.target.value ? Number(event.target.value) : undefined)}
            >
              <option value="">全グループ</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => setSongSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            className="border-b border-zinc-300 px-0 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
          >
            年順: {songSortOrder === "asc" ? "昇順" : "降順"}
          </button>

          <label className="flex items-center gap-2 border-b border-zinc-300 py-1.5 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={hideAkimoto}
              onChange={(event) => setHideAkimoto(event.target.checked)}
              className="accent-zinc-800"
            />
            秋元康を除外
          </label>

          <button
            type="button"
            onClick={ensureCreatorWindow}
            className="border-b border-zinc-300 px-0 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
          >
            作曲家ウィンドウ
          </button>

          <button
            type="button"
            onClick={ensureTimelineWindow}
            className="border-b border-zinc-300 px-0 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
          >
            相対年表
          </button>
        </div>

        <div className="mt-5">
          <p className="mb-3 text-xs tracking-wide text-zinc-500">楽曲 {filteredSongs.length}</p>
          <ul className="divide-y divide-zinc-100">
            {filteredSongs.map((song) => (
              <li key={song.songId}>
                <button
                  type="button"
                  onClick={() => {
                    handleSongSelect(song.songId).catch(console.error);
                  }}
                  className="w-full py-3 text-left transition hover:bg-zinc-50/70"
                >
                  <p className="text-sm text-zinc-900">{song.songTitle}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatSongMetaLine(song.groupName, song.releaseTitle, song.releaseYear)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {loading ? <p className="mt-6 text-sm text-zinc-500">Loading...</p> : null}
      </div>

      {selectedSong ? (
        <FloatingWindow
          title={selectedSong.title}
          subtitle={formatSongMetaLine(selectedSong.groupName, selectedSong.releaseTitle, selectedSong.releaseYear)}
          onClose={() => setSelectedSong(null)}
          placement={windowPlacement.song}
          onPlacementChange={(next) => moveWindow("song", next)}
          onRequestFront={() => bringWindowToFront("song")}
          className="w-[min(38rem,calc(100vw-1.5rem))]"
        >
          <div className="space-y-5 text-sm text-zinc-700">
            <div>
              <p className="text-xs tracking-wide text-zinc-500">クレジット</p>
              <ul className="mt-2 space-y-1.5">
                {selectedSong.credits.map((credit) => (
                  <li key={`${credit.role}-${credit.creatorId}`}>
                    <button
                      type="button"
                      className="w-full text-left text-sm text-zinc-700 transition hover:text-zinc-950"
                      onClick={() => openCreatorFromCredit(credit)}
                    >
                      <span className="mr-2 text-xs text-zinc-500">{CREDIT_ROLE_LABEL[credit.role]}</span>
                      {credit.creatorName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs tracking-wide text-zinc-500">歌詞</p>
              {selectedSong.lyricsText ? (
                <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-700">
                  {selectedSong.lyricsText}
                </pre>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">歌詞データ未取得</p>
              )}
            </div>

            <div>
              <p className="text-xs tracking-wide text-zinc-500">フォーメーション</p>
              {selectedSong.formation.length > 0 ? (
                <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                  {selectedSong.formation.map((member, idx) => (
                    <li key={`${member.memberName}-${idx}`} className="text-xs text-zinc-700">
                      {member.memberName}（{POSITION_LABEL[member.positionType]}
                      {member.rowNumber ? ` / ${member.rowNumber}列目` : ""}）
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">未取得</p>
              )}
            </div>
          </div>
        </FloatingWindow>
      ) : null}

      {timelineWindowOpen ? (
        <FloatingWindow
          title="相対年表（1st=Month 0）"
          subtitle="経過月数 = 満了した月数"
          onClose={() => setTimelineWindowOpen(false)}
          placement={windowPlacement.timeline}
          onPlacementChange={(next) => moveWindow("timeline", next)}
          onRequestFront={() => bringWindowToFront("timeline")}
          className="w-[min(72rem,calc(100vw-1.5rem))]"
        >
          {timelineLoading ? <p className="text-xs text-zinc-500">年表を読み込み中...</p> : null}
          {!timelineLoading && timelineRows.length === 0 ? (
            <p className="text-xs text-zinc-500">年表データがありません。</p>
          ) : null}
          {timelineRows.length > 0 ? (
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-[980px] border-collapse text-xs text-zinc-700">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="px-2 py-2 text-right font-normal">経過月</th>
                    <th className="px-2 py-2 text-right font-normal">年+月</th>
                    <th className="px-2 py-2 text-left font-normal">AKB48</th>
                    <th className="px-2 py-2 text-left font-normal">乃木坂46</th>
                    <th className="px-2 py-2 text-left font-normal">櫻坂/欅坂46</th>
                    <th className="px-2 py-2 text-left font-normal">日向坂46</th>
                  </tr>
                </thead>
                <tbody>
                  {timelineRows.map((row, index) => (
                    <tr key={`timeline-${row.elapsedMonths}-${index}`} className="border-b border-zinc-100 align-top">
                      <td className="px-2 py-2 text-right text-zinc-500">{row.elapsedMonths}</td>
                      <td className="px-2 py-2 text-right text-zinc-500">{row.elapsedLabel}</td>
                      <td className="px-2 py-2">{row.akb48 ?? ""}</td>
                      <td className="px-2 py-2">{row.nogizaka46 ?? ""}</td>
                      <td className="px-2 py-2">{row.sakurazakaKeyaki46 ?? ""}</td>
                      <td className="px-2 py-2">{row.hinatazaka46 ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </FloatingWindow>
      ) : null}

      {creatorWindowOpen ? (
        <FloatingWindow
          title={selectedCreator?.name ?? "作曲家を選択"}
          subtitle={selectedCreator ? "関わった楽曲を横断表示" : "楽曲詳細のクレジットから選択できます"}
          onClose={() => setCreatorWindowOpen(false)}
          placement={windowPlacement.creator}
          onPlacementChange={(next) => moveWindow("creator", next)}
          onRequestFront={() => bringWindowToFront("creator")}
          className="w-[min(40rem,calc(100vw-1.5rem))]"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 border-b border-zinc-200 pb-3">
              <label className="min-w-48 flex-1">
                <span className="block text-[11px] tracking-wide text-zinc-500">作曲家検索</span>
                <input
                  value={creatorSearchText}
                  onChange={(event) => setCreatorSearchText(event.target.value)}
                  placeholder="作曲家名"
                  className="mt-1 w-full border-0 border-b border-zinc-300 bg-transparent px-0 py-1 text-sm outline-none focus:border-zinc-900"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setGraphMode("composer");
                  setGraphWindowOpen(true);
                  bringWindowToFront("graph");
                }}
                className="border-b border-zinc-300 px-0 py-1 text-xs text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900"
              >
                ネットワークを開く
              </button>
              <div className="ml-auto flex gap-2 text-[11px] text-zinc-500">
                <button
                  type="button"
                  onClick={() => setCreatorFocusMode("crossGroupComposer")}
                  className={`border-b px-0 py-1 transition ${
                    creatorFocusMode === "crossGroupComposer"
                      ? "border-zinc-900 text-zinc-900"
                      : "border-zinc-300 hover:border-zinc-900 hover:text-zinc-900"
                  }`}
                >
                  越境作曲家
                </button>
                <button
                  type="button"
                  onClick={() => setCreatorFocusMode("composer")}
                  className={`border-b px-0 py-1 transition ${
                    creatorFocusMode === "composer"
                      ? "border-zinc-900 text-zinc-900"
                      : "border-zinc-300 hover:border-zinc-900 hover:text-zinc-900"
                  }`}
                >
                  作曲あり
                </button>
                <button
                  type="button"
                  onClick={() => setCreatorFocusMode("all")}
                  className={`border-b px-0 py-1 transition ${
                    creatorFocusMode === "all"
                      ? "border-zinc-900 text-zinc-900"
                      : "border-zinc-300 hover:border-zinc-900 hover:text-zinc-900"
                  }`}
                >
                  全関係者
                </button>
              </div>
            </div>

            <div className="border-b border-zinc-200 pb-3">
              <p className="mb-2 text-[11px] tracking-wide text-zinc-500">グループ横断ハイライト（作曲）</p>
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {topCrossGroupComposers.map(({ creator, stat }) => (
                  <li key={`cross-${creator.id}`}>
                    <button
                      type="button"
                      onClick={() => handleCreatorSelect(creator)}
                      className="w-full text-left text-xs text-zinc-600 transition hover:text-zinc-900"
                    >
                      {creator.name}
                      <span className="ml-2 text-zinc-500">
                        {stat.composedGroups}グループ / 作曲{stat.composedSongs}曲
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <ul className="max-h-44 space-y-1 overflow-y-auto border-b border-zinc-200 pb-3">
              {filteredCreators.map((creator) => {
                const stat = creatorRoleStats.get(creator.id) ?? {
                  lyricist: 0,
                  composer: 0,
                  arranger: 0,
                  involvedSongs: 0
                };

                return (
                  <li key={creator.id}>
                    <button
                      type="button"
                      onClick={() => handleCreatorSelect(creator)}
                      className={`w-full py-1.5 text-left text-sm transition ${
                        selectedCreator?.id === creator.id ? "text-zinc-950" : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      <span>{creator.name}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        関与 {stat.involvedSongs} / 作詞 {stat.lyricist} / 作曲 {stat.composer} / 編曲 {stat.arranger}
                        {composerCrossStats.get(creator.id)
                          ? ` / 越境 ${composerCrossStats.get(creator.id)?.composedGroups ?? 0}`
                          : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selectedCreator ? (
              <div>
                <p className="mb-2 text-xs tracking-wide text-zinc-500">
                  楽曲 {creatorSongs.length}
                  {selectedGroupId ? "（選択グループ内）" : "（全グループ）"}
                </p>
                {selectedCreatorComposerStat ? (
                  <p className="mb-2 text-xs text-zinc-500">
                    作曲 {selectedCreatorComposerStat.composedSongs}曲 / {selectedCreatorComposerStat.composedGroups}グループ
                    {" / "}
                    {selectedCreatorComposerStat.groupNames.join("・")}
                  </p>
                ) : (
                  <p className="mb-2 text-xs text-zinc-500">この人物の作曲クレジットは未確認</p>
                )}
                <ul className="max-h-52 space-y-1 overflow-y-auto">
                  {creatorSongs.map((song) => (
                    <li key={`creator-song-${song.songId}`}>
                      <button
                        type="button"
                        onClick={() => {
                          handleSongSelect(song.songId).catch(console.error);
                        }}
                        className="w-full py-1 text-left text-sm text-zinc-700 transition hover:text-zinc-900"
                      >
                        {song.songTitle}
                        <span className="ml-2 text-xs text-zinc-500">
                          {formatSongMetaLine(song.groupName, song.releaseTitle, song.releaseYear)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">上の一覧から作曲家を選択してください。</p>
            )}
          </div>
        </FloatingWindow>
      ) : null}

      {graphWindowOpen ? (
        <FloatingWindow
          title={graphMode === "composer" ? "作曲相関ネットワーク" : "グループネットワーク"}
          subtitle={
            graphMode === "composer"
              ? selectedCreator
                ? `${selectedCreator.name}${
                    selectedCreatorComposerStat
                      ? ` / 作曲${selectedCreatorComposerStat.composedSongs}曲・${selectedCreatorComposerStat.composedGroups}グループ`
                      : ""
                  }`
                : "作曲家未選択"
              : "グループ全体"
          }
          onClose={() => setGraphWindowOpen(false)}
          placement={windowPlacement.graph}
          onPlacementChange={(next) => moveWindow("graph", next)}
          onRequestFront={() => bringWindowToFront("graph")}
          className="w-[min(52rem,calc(100vw-1.5rem))]"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGraphMode("composer")}
              className={`px-2 py-1 text-xs ${graphMode === "composer" ? "text-zinc-950" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              作曲家
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedGroupId((prev) => prev ?? groups[0]?.id);
                setGraphMode("group");
              }}
              className={`px-2 py-1 text-xs ${graphMode === "group" ? "text-zinc-950" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              グループ
            </button>

            {graphMode === "group" ? (
              <select
                className="ml-2 border-0 border-b border-zinc-300 bg-transparent px-0 py-1 text-xs outline-none focus:border-zinc-900"
                value={selectedGroupId ?? groups[0]?.id ?? ""}
                onChange={(event) => setSelectedGroupId(event.target.value ? Number(event.target.value) : undefined)}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {graphLoading ? <p className="mb-2 text-xs text-zinc-500">グラフを読み込み中...</p> : null}
          <GraphView graph={graph} onNodeSongNavigate={handleGraphNodeSongNavigate} />
        </FloatingWindow>
      ) : null}
    </main>
  );
}
