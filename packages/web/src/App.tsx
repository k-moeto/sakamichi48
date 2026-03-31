import * as Tabs from "@radix-ui/react-tabs";
import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";

import { GraphView } from "./components/GraphView";
import { fetchComposerGraph, fetchCreators, fetchGroupGraph, fetchGroups, fetchSongDetail, fetchSongs } from "./lib/api";
import type { ComposerGraph, Creator, Group, SongDetail, SongListItem } from "./types/api";

const FILTER_AKIMOTO = "秋元康";
type GraphMode = "composer" | "group";

export default function App(): JSX.Element {
  const [groups, setGroups] = useState<Group[]>([]);
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedSong, setSelectedSong] = useState<SongDetail | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  const [searchText, setSearchText] = useState("");
  const [hideAkimoto, setHideAkimoto] = useState(true);
  const [graphMode, setGraphMode] = useState<GraphMode>("composer");
  const [graph, setGraph] = useState<ComposerGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
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
      setSelectedGroupId((prev) => prev ?? groupRows[0]?.id);
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
  }, [hideAkimoto, bootstrapped]);

  useEffect(() => {
    if (hideAkimoto && selectedCreator?.name === FILTER_AKIMOTO) {
      setSelectedCreator(null);
    }
  }, [hideAkimoto, selectedCreator]);

  useEffect(() => {
    if (!bootstrapped) {
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
  }, [bootstrapped, graphMode, selectedCreator, selectedGroupId, hideAkimoto, groups]);

  const fuseSongs = useMemo(
    () =>
      new Fuse(songs, {
        keys: ["songTitle", "releaseTitle", "groupName"],
        threshold: 0.36,
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
    const searched = searchText.trim().length > 0 ? fuseSongs.search(searchText).map((x) => x.item) : songs;

    return searched.filter((song) => {
      const groupMatch = selectedGroupId ? song.groupId === selectedGroupId : true;
      return groupMatch;
    });
  }, [fuseSongs, searchText, songs, selectedGroupId]);

  const filteredCreators = useMemo(() => {
    const base = searchText.trim().length > 0 ? fuseCreators.search(searchText).map((x) => x.item) : creators;
    return hideAkimoto ? base.filter((creator) => creator.name !== FILTER_AKIMOTO) : base;
  }, [fuseCreators, searchText, creators, hideAkimoto]);

  async function handleSongSelect(songId: number): Promise<void> {
    const detail = await fetchSongDetail(songId);
    setSelectedSong(detail);
  }

  function handleCreatorSelect(creator: Creator): void {
    setSelectedCreator(creator);
    setGraphMode("composer");
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-8">
      <section className="rounded-3xl bg-white/80 p-6 shadow-glow backdrop-blur">
        <h1 className="text-3xl font-bold tracking-tight text-slate-800">Sakamichi48 Composer Network</h1>
        <p className="mt-2 text-sm text-slate-600">
          坂道シリーズ + 主要48グループの楽曲を、作曲家中心のネットワークとして探索するMVP。
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm outline-none ring-sky-200 transition focus:ring"
            placeholder="曲名 / 作曲家 / リリース名で検索"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />

          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
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

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <input type="checkbox" checked={hideAkimoto} onChange={(event) => setHideAkimoto(event.target.checked)} />
            秋元康を除外
          </label>
        </div>
      </section>

      <Tabs.Root defaultValue="songs" className="mt-6">
        <Tabs.List className="grid grid-cols-3 rounded-2xl bg-white/70 p-1 shadow">
          <Tabs.Trigger
            value="songs"
            className="rounded-xl px-3 py-2 text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white"
          >
            楽曲
          </Tabs.Trigger>
          <Tabs.Trigger
            value="creators"
            className="rounded-xl px-3 py-2 text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white"
          >
            作曲家
          </Tabs.Trigger>
          <Tabs.Trigger
            value="graph"
            className="rounded-xl px-3 py-2 text-sm data-[state=active]:bg-slate-900 data-[state=active]:text-white"
          >
            ネットワーク
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="songs" className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-2xl bg-white/80 p-4 shadow">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">楽曲一覧 ({filteredSongs.length})</h2>
            <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredSongs.map((song) => (
                <li key={song.songId}>
                  <button
                    type="button"
                    onClick={() => {
                      handleSongSelect(song.songId).catch(console.error);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-sky-300"
                  >
                    <p className="text-sm font-medium text-slate-800">{song.songTitle}</p>
                    <p className="text-xs text-slate-500">
                      {song.groupName} / {song.releaseTitle}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-white/80 p-4 shadow">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">楽曲詳細</h2>
            {selectedSong ? (
              <article className="space-y-3 text-sm text-slate-700">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{selectedSong.title}</p>
                  <p className="text-xs text-slate-500">
                    {selectedSong.groupName} / {selectedSong.releaseTitle} / {selectedSong.releaseDate ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Credits</p>
                  <ul className="mt-1 space-y-1">
                    {selectedSong.credits.map((credit) => (
                      <li key={`${credit.role}-${credit.creatorId}`} className="rounded-lg bg-slate-50 px-3 py-2">
                        <span className="mr-2 inline-block min-w-14 text-xs font-bold uppercase text-slate-500">
                          {credit.role}
                        </span>
                        {credit.creatorName}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ) : (
              <p className="text-sm text-slate-500">左の一覧から楽曲を選択してください。</p>
            )}
          </section>
        </Tabs.Content>

        <Tabs.Content value="creators" className="mt-4 rounded-2xl bg-white/80 p-4 shadow">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">作曲家一覧 ({filteredCreators.length})</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCreators.map((creator) => (
              <li key={creator.id}>
                <button
                  type="button"
                  onClick={() => handleCreatorSelect(creator)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    selectedCreator?.id === creator.id
                      ? "border-sky-500 bg-sky-50"
                      : "border-slate-200 bg-white hover:border-sky-300"
                  }`}
                >
                  <p className="font-medium text-slate-900">{creator.name}</p>
                  <p className="text-xs text-slate-500">{creator.songCount} credits</p>
                </button>
              </li>
            ))}
          </ul>
        </Tabs.Content>

        <Tabs.Content value="graph" className="mt-4 space-y-3">
          <section className="rounded-2xl bg-white/80 p-4 shadow">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">ネットワークビュー</h2>
                <p className="mt-1 text-xs text-slate-500">
                  実線: 作曲 / 破線: 編曲 / 点線: 作詞。作曲家ビューとグループビューを切り替えて探索できます。
                </p>
              </div>

              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 ${graphMode === "composer" ? "bg-slate-900 text-white" : "text-slate-700"}`}
                  onClick={() => setGraphMode("composer")}
                >
                  作曲家
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 ${graphMode === "group" ? "bg-slate-900 text-white" : "text-slate-700"}`}
                  onClick={() => setGraphMode("group")}
                >
                  グループ
                </button>
              </div>
            </div>

            {graphMode === "composer" ? (
              <p className="mt-2 text-xs text-slate-500">
                対象作曲家: {selectedCreator?.name ?? "未選択（作曲家タブから選択してください）"}
              </p>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <span>対象グループ:</span>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1"
                  value={selectedGroupId ?? ""}
                  onChange={(event) => setSelectedGroupId(event.target.value ? Number(event.target.value) : undefined)}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </section>

          {graphLoading ? <p className="text-sm text-slate-500">グラフを読み込み中...</p> : null}
          <GraphView graph={graph} />
        </Tabs.Content>
      </Tabs.Root>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading...</p> : null}
    </main>
  );
}
