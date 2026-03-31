import * as Tabs from "@radix-ui/react-tabs";
import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";

import { GraphView } from "./components/GraphView";
import { fetchComposerGraph, fetchCreators, fetchGroupGraph, fetchGroups, fetchSongDetail, fetchSongs } from "./lib/api";
import type { ComposerGraph, Creator, Group, SongDetail, SongListItem } from "./types/api";

const FILTER_AKIMOTO = "秋元康";
type GraphMode = "composer" | "group";
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
    <main className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6">
      <section className="border border-black bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-black">Sakamichi48 Composer Network</h1>
        <p className="mt-2 text-sm text-zinc-700">
          坂道シリーズ + 主要48グループの楽曲を、作曲家中心のネットワークとして探索するMVP。
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className="w-full border border-black bg-white px-4 py-2 text-sm outline-none"
            placeholder="曲名 / 作曲家 / リリース名で検索"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />

          <select
            className="border border-black bg-white px-3 py-2 text-sm"
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

          <label className="flex items-center gap-2 border border-black bg-white px-3 py-2 text-sm">
            <input type="checkbox" checked={hideAkimoto} onChange={(event) => setHideAkimoto(event.target.checked)} />
            秋元康を除外
          </label>
        </div>
      </section>

      <Tabs.Root defaultValue="songs" className="mt-6">
        <Tabs.List className="grid grid-cols-3 border border-black bg-white p-1">
          <Tabs.Trigger
            value="songs"
            className="px-3 py-2 text-sm data-[state=active]:bg-black data-[state=active]:text-white"
          >
            楽曲
          </Tabs.Trigger>
          <Tabs.Trigger
            value="creators"
            className="px-3 py-2 text-sm data-[state=active]:bg-black data-[state=active]:text-white"
          >
            作曲家
          </Tabs.Trigger>
          <Tabs.Trigger
            value="graph"
            className="px-3 py-2 text-sm data-[state=active]:bg-black data-[state=active]:text-white"
          >
            ネットワーク
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="songs" className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section className="border border-black bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">楽曲一覧 ({filteredSongs.length})</h2>
            <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredSongs.map((song) => (
                <li key={song.songId}>
                  <button
                    type="button"
                    onClick={() => {
                      handleSongSelect(song.songId).catch(console.error);
                    }}
                    className="w-full border border-zinc-300 bg-white px-3 py-2 text-left hover:border-black"
                  >
                    <p className="text-sm font-medium text-black">{song.songTitle}</p>
                    <p className="text-xs text-zinc-500">
                      {song.groupName} / {song.releaseTitle} / {song.releaseYear ?? "-"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="border border-black bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">楽曲詳細</h2>
            {selectedSong ? (
              <article className="space-y-3 text-sm text-zinc-700">
                <div>
                  <p className="text-lg font-semibold text-black">{selectedSong.title}</p>
                  <p className="text-xs text-zinc-500">
                    {selectedSong.groupName} / {selectedSong.releaseTitle} / {selectedSong.releaseYear ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-zinc-500">クレジット</p>
                  <ul className="mt-1 space-y-1">
                    {selectedSong.credits.map((credit) => (
                      <li key={`${credit.role}-${credit.creatorId}`} className="border border-zinc-200 bg-zinc-50 px-3 py-2">
                        <span className="mr-2 inline-block min-w-14 text-xs font-bold text-zinc-500">
                          {CREDIT_ROLE_LABEL[credit.role]}
                        </span>
                        {credit.creatorName}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-zinc-500">フォーメーション</p>
                  {selectedSong.formation.length > 0 ? (
                    <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                      {selectedSong.formation.map((member, idx) => (
                        <li key={`${member.memberName}-${idx}`} className="border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs">
                          {member.memberName}（{POSITION_LABEL[member.positionType]}
                          {member.rowNumber ? ` / ${member.rowNumber}列目` : ""}）
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">未取得（ファンサイト由来データを収集中）</p>
                  )}
                </div>
              </article>
            ) : (
              <p className="text-sm text-zinc-500">左の一覧から楽曲を選択してください。</p>
            )}
          </section>
        </Tabs.Content>

        <Tabs.Content value="creators" className="mt-4 border border-black bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800">作曲家一覧 ({filteredCreators.length})</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCreators.map((creator) => (
              <li key={creator.id}>
                <button
                  type="button"
                  onClick={() => handleCreatorSelect(creator)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    selectedCreator?.id === creator.id
                      ? "border-black bg-zinc-100"
                      : "border-zinc-300 bg-white hover:border-black"
                  }`}
                >
                  <p className="font-medium text-black">{creator.name}</p>
                  <p className="text-xs text-zinc-500">{creator.songCount} credits</p>
                </button>
              </li>
            ))}
          </ul>
        </Tabs.Content>

        <Tabs.Content value="graph" className="mt-4 space-y-3">
          <section className="border border-black bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-800">ネットワークビュー</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  実線: 作曲 / 破線: 編曲 / 点線: 作詞。作曲家ビューとグループビューを切り替えて探索できます。
                </p>
              </div>

              <div className="inline-flex border border-black bg-white p-1 text-xs">
                <button
                  type="button"
                  className={`px-3 py-1.5 ${graphMode === "composer" ? "bg-black text-white" : "text-zinc-700"}`}
                  onClick={() => setGraphMode("composer")}
                >
                  作曲家
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 ${graphMode === "group" ? "bg-black text-white" : "text-zinc-700"}`}
                  onClick={() => setGraphMode("group")}
                >
                  グループ
                </button>
              </div>
            </div>

            {graphMode === "composer" ? (
              <p className="mt-2 text-xs text-zinc-500">
                対象作曲家: {selectedCreator?.name ?? "未選択（作曲家タブから選択してください）"}
              </p>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                <span>対象グループ:</span>
                <select
                  className="border border-black bg-white px-2 py-1"
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

          {graphLoading ? <p className="text-sm text-zinc-500">グラフを読み込み中...</p> : null}
          <GraphView graph={graph} />
        </Tabs.Content>
      </Tabs.Root>

      {loading ? <p className="mt-4 text-sm text-zinc-500">Loading...</p> : null}
    </main>
  );
}
