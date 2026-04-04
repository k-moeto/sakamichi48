import Fuse from "fuse.js";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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
type CenterTab = "songs" | "timeline";
type CreatorFocusMode = "all" | "composer" | "crossGroupComposer";

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
  if (!title) return true;
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

    if (yearA === null && yearB !== null) return 1;
    if (yearA !== null && yearB === null) return -1;
    if (yearA !== yearB) {
      return order === "asc" ? (yearA ?? 0) - (yearB ?? 0) : (yearB ?? 0) - (yearA ?? 0);
    }

    const dateA = a.releaseDate;
    const dateB = b.releaseDate;
    if (!dateA && dateB) return 1;
    if (dateA && !dateB) return -1;
    if (dateA && dateB && dateA !== dateB) {
      return order === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    }

    return a.songTitle.localeCompare(b.songTitle, "ja");
  });
}

type CardProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

function Card({ title, subtitle, action, children, className = "" }: CardProps): JSX.Element {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.04)] ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-zinc-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function App(): JSX.Element {
  const [groups, setGroups] = useState<Group[]>([]);
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [timelineRows, setTimelineRows] = useState<RelativeTimelineRow[]>([]);

  const [selectedSong, setSelectedSong] = useState<SongDetail | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);

  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  const [songSearchText, setSongSearchText] = useState("");
  const [creatorSearchText, setCreatorSearchText] = useState("");
  const [songSortOrder, setSongSortOrder] = useState<SongSortOrder>("asc");
  const [creatorFocusMode, setCreatorFocusMode] = useState<CreatorFocusMode>("crossGroupComposer");
  const [centerTab, setCenterTab] = useState<CenterTab>("songs");
  const [hideAkimoto, setHideAkimoto] = useState(true);

  const [graphMode, setGraphMode] = useState<GraphMode>("composer");
  const [graph, setGraph] = useState<ComposerGraph | null>(null);

  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function bootstrap(): Promise<void> {
      setLoading(true);
      const [groupRows, creatorRows, songRows, timeline] = await Promise.all([
        fetchGroups(),
        fetchCreators(),
        fetchSongs(),
        fetchRelativeTimeline()
      ]);

      if (!mounted) {
        return;
      }

      setGroups(groupRows);
      setCreators(creatorRows);
      setSongs(songRows);
      setTimelineRows(timeline);
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
    let cancelled = false;

    async function loadGraph(): Promise<void> {
      setGraphLoading(true);
      try {
        if (graphMode === "composer") {
          if (!selectedCreator) {
            setGraph(null);
            return;
          }
          const result = await fetchComposerGraph(selectedCreator.id, hideAkimoto);
          if (!cancelled) {
            setGraph(result);
          }
          return;
        }

        const groupId = selectedGroupId ?? groups[0]?.id;
        if (!groupId) {
          setGraph(null);
          return;
        }

        const result = await fetchGroupGraph(groupId, hideAkimoto, 120);
        if (!cancelled) {
          setGraph(result);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setGraph(null);
        }
      } finally {
        if (!cancelled) {
          setGraphLoading(false);
        }
      }
    }

    loadGraph().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [graphMode, selectedCreator, selectedGroupId, hideAkimoto, groups]);

  const fuseSongs = useMemo(
    () =>
      new Fuse(songs, {
        keys: ["songTitle", "releaseTitle", "groupName"],
        threshold: 0.33,
        ignoreLocation: true
      }),
    [songs]
  );

  const fuseCreators = useMemo(
    () =>
      new Fuse(creators, {
        keys: ["name", "nameRomaji"],
        threshold: 0.32,
        ignoreLocation: true
      }),
    [creators]
  );

  const filteredSongs = useMemo(() => {
    const searched = songSearchText.trim().length > 0 ? fuseSongs.search(songSearchText).map((x) => x.item) : songs;
    const groupScoped = selectedGroupId ? searched.filter((song) => song.groupId === selectedGroupId) : searched;
    return sortSongsByRelease(groupScoped, songSortOrder);
  }, [songSearchText, songs, selectedGroupId, songSortOrder, fuseSongs]);

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
      if (groupDiff !== 0) return groupDiff;
      const songDiff = (statB?.composedSongs ?? 0) - (statA?.composedSongs ?? 0);
      if (songDiff !== 0) return songDiff;
      return a.name.localeCompare(b.name, "ja");
    });
  }, [creatorSearchText, creators, hideAkimoto, creatorFocusMode, composerCrossStats, fuseCreators]);

  const topCrossGroupComposers = useMemo(() => {
    return creators
      .filter((creator) => (hideAkimoto ? creator.name !== FILTER_AKIMOTO : true))
      .map((creator) => ({ creator, stat: composerCrossStats.get(creator.id) }))
      .filter(
        (
          row
        ): row is { creator: Creator; stat: { composedSongs: number; composedGroups: number; groupNames: string[] } } =>
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
      .slice(0, 8);
  }, [creators, hideAkimoto, composerCrossStats]);

  const selectedCreatorSongs = useMemo(() => {
    if (!selectedCreator) {
      return [];
    }

    const rows = songs.filter((song) => {
      const groupMatch = selectedGroupId ? song.groupId === selectedGroupId : true;
      return groupMatch && (song.credits ?? []).some((credit) => credit.creatorId === selectedCreator.id);
    });

    return sortSongsByRelease(rows, songSortOrder);
  }, [songs, selectedCreator, selectedGroupId, songSortOrder]);

  const selectedCreatorComposerStat = useMemo(() => {
    return selectedCreator ? composerCrossStats.get(selectedCreator.id) ?? null : null;
  }, [selectedCreator, composerCrossStats]);

  async function handleSongSelect(songId: number): Promise<void> {
    const detail = await fetchSongDetail(songId);
    setSelectedSong(detail);
  }

  function openCreatorFromCredit(credit: SongDetail["credits"][number]): void {
    const found = creators.find((creator) => creator.id === credit.creatorId);
    const fallback: Creator = {
      id: credit.creatorId,
      name: credit.creatorName,
      nameRomaji: credit.creatorRomaji ?? null,
      songCount: creatorRoleStats.get(credit.creatorId)?.involvedSongs ?? 0
    };
    setSelectedCreator(found ?? fallback);
    setGraphMode("composer");
  }

  const dashboardStats = useMemo(() => {
    const songCount = songs.length;
    const creatorCount = creators.length;
    const crossComposerCount = [...composerCrossStats.values()].filter((stat) => stat.composedGroups >= 2).length;
    const withFormationCount = selectedSong?.formation.length ?? 0;
    return { songCount, creatorCount, crossComposerCount, withFormationCount };
  }, [songs, creators, composerCrossStats, selectedSong]);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1560px] space-y-5">
        <header className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Sakamichi48 Dashboard</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-wide text-zinc-900">楽曲ネットワーク検索</h1>
              <p className="mt-1 text-xs text-zinc-500">グループ横断で作曲家・楽曲・フォーメーションを素早く追えます。</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg bg-zinc-100 px-3 py-2 text-zinc-700">楽曲 {dashboardStats.songCount}</div>
              <div className="rounded-lg bg-zinc-100 px-3 py-2 text-zinc-700">作家 {dashboardStats.creatorCount}</div>
              <div className="rounded-lg bg-zinc-100 px-3 py-2 text-zinc-700">越境作曲家 {dashboardStats.crossComposerCount}</div>
              <div className="rounded-lg bg-zinc-100 px-3 py-2 text-zinc-700">選択曲フォーメーション {dashboardStats.withFormationCount}</div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
          <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card title="検索と絞り込み" subtitle="楽曲を起点に探索">
              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-[11px] tracking-wide text-zinc-500">楽曲検索</span>
                  <input
                    value={songSearchText}
                    onChange={(event) => setSongSearchText(event.target.value)}
                    placeholder="曲名 / リリース / グループ"
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] tracking-wide text-zinc-500">グループ</span>
                  <select
                    value={selectedGroupId ?? ""}
                    onChange={(event) => setSelectedGroupId(event.target.value ? Number(event.target.value) : undefined)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-700"
                  >
                    <option value="">全グループ</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSongSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                    className="rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-700"
                  >
                    年順 {songSortOrder === "asc" ? "昇順" : "降順"}
                  </button>
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-700">
                    <input
                      type="checkbox"
                      checked={hideAkimoto}
                      onChange={(event) => setHideAkimoto(event.target.checked)}
                      className="accent-zinc-800"
                    />
                    秋元康除外
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCenterTab("songs")}
                    className={`rounded-lg px-3 py-2 text-xs ${
                      centerTab === "songs" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700"
                    }`}
                  >
                    楽曲一覧
                  </button>
                  <button
                    type="button"
                    onClick={() => setCenterTab("timeline")}
                    className={`rounded-lg px-3 py-2 text-xs ${
                      centerTab === "timeline" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-700"
                    }`}
                  >
                    相対年表
                  </button>
                </div>
              </div>
            </Card>

            <Card
              title="作曲家ナビ"
              subtitle="越境作曲家から探索"
              action={
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setCreatorFocusMode("crossGroupComposer")}
                    className={`rounded px-2 py-1 ${
                      creatorFocusMode === "crossGroupComposer" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600"
                    }`}
                  >
                    越境
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatorFocusMode("composer")}
                    className={`rounded px-2 py-1 ${
                      creatorFocusMode === "composer" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600"
                    }`}
                  >
                    作曲
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatorFocusMode("all")}
                    className={`rounded px-2 py-1 ${
                      creatorFocusMode === "all" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600"
                    }`}
                  >
                    全
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                <input
                  value={creatorSearchText}
                  onChange={(event) => setCreatorSearchText(event.target.value)}
                  placeholder="作曲家名で検索"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-700"
                />

                <div className="rounded-lg bg-zinc-50 p-2">
                  <p className="mb-1 text-[11px] text-zinc-500">越境ハイライト</p>
                  <div className="flex flex-wrap gap-1">
                    {topCrossGroupComposers.map(({ creator, stat }) => (
                      <button
                        key={`cross-${creator.id}`}
                        type="button"
                        onClick={() => {
                          setSelectedCreator(creator);
                          setGraphMode("composer");
                        }}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:border-zinc-700"
                        title={`${stat.composedGroups}グループ / 作曲${stat.composedSongs}曲`}
                      >
                        {creator.name}
                      </button>
                    ))}
                  </div>
                </div>

                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {filteredCreators.map((creator) => {
                    const roleStat = creatorRoleStats.get(creator.id) ?? {
                      lyricist: 0,
                      composer: 0,
                      arranger: 0,
                      involvedSongs: 0
                    };
                    const cross = composerCrossStats.get(creator.id);
                    return (
                      <li key={creator.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCreator(creator);
                            setGraphMode("composer");
                          }}
                          className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition ${
                            selectedCreator?.id === creator.id
                              ? "border-zinc-800 bg-zinc-100 text-zinc-900"
                              : "border-zinc-200 text-zinc-700 hover:border-zinc-500"
                          }`}
                        >
                          <p className="font-medium">{creator.name}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            関与{roleStat.involvedSongs} / 作曲{roleStat.composer}
                            {cross ? ` / 越境${cross.composedGroups}` : ""}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card
              title={centerTab === "songs" ? "楽曲一覧" : "相対年表（1st=Month 0）"}
              subtitle={centerTab === "songs" ? `検索結果 ${filteredSongs.length}曲` : "経過月数 = 満了した月数"}
            >
              {centerTab === "songs" ? (
                <div className="max-h-[72vh] overflow-auto">
                  <table className="min-w-[900px] border-collapse text-xs">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-zinc-200 text-zinc-500">
                        <th className="px-2 py-2 text-left font-normal">曲名</th>
                        <th className="px-2 py-2 text-left font-normal">グループ</th>
                        <th className="px-2 py-2 text-left font-normal">リリース</th>
                        <th className="px-2 py-2 text-left font-normal">作曲</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSongs.map((song) => {
                        const composerNames = (song.credits ?? [])
                          .filter((credit) => credit.role === "composer")
                          .filter((credit) => !(hideAkimoto && credit.creatorName === FILTER_AKIMOTO))
                          .map((credit) => credit.creatorName);

                        return (
                          <tr key={song.songId} className="border-b border-zinc-100 align-top">
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSongSelect(song.songId).catch(console.error);
                                }}
                                className="text-left text-zinc-900 hover:text-zinc-600"
                              >
                                {song.songTitle}
                              </button>
                            </td>
                            <td className="px-2 py-2 text-zinc-600">{song.groupName}</td>
                            <td className="px-2 py-2 text-zinc-500">{formatSongMetaLine(song.groupName, song.releaseTitle, song.releaseYear)}</td>
                            <td className="px-2 py-2 text-zinc-600">{composerNames.join(" / ") || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="max-h-[72vh] overflow-auto">
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
              )}
            </Card>
          </div>

          <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card title="楽曲詳細" subtitle={selectedSong ? selectedSong.title : "左の一覧から曲を選択"}>
              {!selectedSong ? <p className="text-xs text-zinc-500">楽曲を選ぶと、歌詞・クレジット・フォーメーションを表示します。</p> : null}

              {selectedSong ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <p className="mb-1 text-[11px] tracking-wide text-zinc-500">メタ情報</p>
                    <p className="text-zinc-700">{formatSongMetaLine(selectedSong.groupName, selectedSong.releaseTitle, selectedSong.releaseYear)}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] tracking-wide text-zinc-500">クレジット</p>
                    <ul className="space-y-1">
                      {selectedSong.credits.map((credit) => (
                        <li key={`${credit.role}-${credit.creatorId}`}>
                          <button
                            type="button"
                            onClick={() => openCreatorFromCredit(credit)}
                            className="rounded-md border border-zinc-200 px-2 py-1 text-left text-zinc-700 hover:border-zinc-600"
                          >
                            <span className="mr-2 text-zinc-500">{CREDIT_ROLE_LABEL[credit.role]}</span>
                            {credit.creatorName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] tracking-wide text-zinc-500">フォーメーション</p>
                    {selectedSong.formation.length > 0 ? (
                      <ul className="max-h-32 space-y-1 overflow-y-auto">
                        {selectedSong.formation.map((member, idx) => (
                          <li key={`${member.memberName}-${idx}`} className="text-zinc-700">
                            {member.memberName}（{POSITION_LABEL[member.positionType]}
                            {member.rowNumber ? ` / ${member.rowNumber}列目` : ""}）
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-zinc-500">未取得</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-[11px] tracking-wide text-zinc-500">歌詞</p>
                    {selectedSong.lyricsText ? (
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-700">
                        {selectedSong.lyricsText}
                      </pre>
                    ) : (
                      <p className="text-zinc-500">歌詞データ未取得</p>
                    )}
                  </div>
                </div>
              ) : null}
            </Card>

            <Card
              title="作曲相関ネットワーク"
              subtitle={
                graphMode === "composer"
                  ? selectedCreator
                    ? `${selectedCreator.name}${
                        selectedCreatorComposerStat
                          ? ` / 作曲${selectedCreatorComposerStat.composedSongs}曲・${selectedCreatorComposerStat.composedGroups}グループ`
                          : ""
                      }`
                    : "作曲家未選択"
                  : "グループ内ネットワーク"
              }
              action={
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setGraphMode("composer")}
                    className={`rounded px-2 py-1 ${
                      graphMode === "composer" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600"
                    }`}
                  >
                    作曲家
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraphMode("group")}
                    className={`rounded px-2 py-1 ${
                      graphMode === "group" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600"
                    }`}
                  >
                    グループ
                  </button>
                </div>
              }
            >
              <div className="mb-2 flex items-center gap-2 text-xs">
                {graphMode === "group" ? (
                  <select
                    value={selectedGroupId ?? groups[0]?.id ?? ""}
                    onChange={(event) => setSelectedGroupId(event.target.value ? Number(event.target.value) : undefined)}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {graphLoading ? <span className="text-zinc-500">読み込み中...</span> : null}
              </div>
              <GraphView
                graph={graph}
                onNodeSongNavigate={(songId) => {
                  handleSongSelect(songId).catch(console.error);
                }}
              />
            </Card>

            {selectedCreator ? (
              <Card title="選択作曲家の楽曲" subtitle={`${selectedCreatorSongs.length}曲`}>
                <div className="mb-2 text-[11px] text-zinc-500">
                  {selectedCreatorComposerStat
                    ? `${selectedCreatorComposerStat.groupNames.join("・")}`
                    : "作曲クレジット未確認"}
                </div>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {selectedCreatorSongs.map((song) => (
                    <li key={`creator-song-${song.songId}`}>
                      <button
                        type="button"
                        onClick={() => {
                          handleSongSelect(song.songId).catch(console.error);
                        }}
                        className="w-full rounded-md border border-zinc-200 px-2 py-1 text-left text-zinc-700 hover:border-zinc-500"
                      >
                        {song.songTitle}
                        <span className="ml-1 text-zinc-500">{song.groupName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </div>

        {loading ? <p className="text-sm text-zinc-500">Loading...</p> : null}
      </div>
    </main>
  );
}
