import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";

import { fetchCreators, fetchSongDetail, fetchSongs } from "./lib/api";
import type { Creator, SongDetail, SongListItem } from "./types/api";

type TabMode = "songs" | "creators";

function buildFallbackDetail(song: SongListItem): SongDetail {
  return {
    songId: song.songId,
    title: song.songTitle,
    duration: song.duration,
    trackNumber: song.trackNumber,
    editionType: song.editionType,
    songCategory: song.songCategory,
    lyricsText: null,
    releaseTitle: song.releaseTitle,
    groupName: song.groupName,
    releaseDate: song.releaseDate,
    releaseYear: song.releaseYear,
    credits: [],
    formation: []
  };
}

export default function App(): JSX.Element {
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [tab, setTab] = useState<TabMode>("songs");
  const [selectedSong, setSelectedSong] = useState<SongDetail | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [composerSongs, setComposerSongs] = useState<SongListItem[]>([]);
  const [songLoading, setSongLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    Promise.all([fetchSongs(), fetchCreators()])
      .then(([songRows, creatorRows]) => {
        if (!mounted) {
          return;
        }

        setSongs(songRows);
        setCreators(creatorRows);
        const firstYear = songRows
          .map((song) => song.releaseYear)
          .filter((year): year is number => year !== null)
          .sort((a, b) => a - b)[0];
        setSelectedYear(firstYear ?? null);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCreator) {
      setComposerSongs([]);
      return;
    }

    fetchSongs("", undefined, selectedCreator.id)
      .then((rows) => setComposerSongs(rows))
      .catch(() => setComposerSongs([]));
  }, [selectedCreator]);

  const years = useMemo(
    () => [...new Set(songs.map((song) => song.releaseYear).filter((year): year is number => year !== null))].sort((a, b) => a - b),
    [songs]
  );

  const fuseSongs = useMemo(
    () =>
      new Fuse(songs, {
        keys: ["songTitle", "groupName", "releaseTitle"],
        threshold: 0.34,
        ignoreLocation: true
      }),
    [songs]
  );

  const fuseCreators = useMemo(
    () =>
      new Fuse(creators, {
        keys: ["name", "nameRomaji"],
        threshold: 0.3,
        ignoreLocation: true
      }),
    [creators]
  );

  const filteredSongs = useMemo(() => {
    const searched = searchText.trim() ? fuseSongs.search(searchText).map((row) => row.item) : songs;
    if (!selectedYear) {
      return searched;
    }

    return searched.filter((song) => song.releaseYear === selectedYear);
  }, [fuseSongs, searchText, selectedYear, songs]);

  const filteredCreators = useMemo(
    () => (searchText.trim() ? fuseCreators.search(searchText).map((row) => row.item) : creators),
    [creators, fuseCreators, searchText]
  );

  const yearCounts = useMemo(() => {
    const counts = new Map<number, number>();
    songs.forEach((song) => {
      if (!song.releaseYear) {
        return;
      }
      counts.set(song.releaseYear, (counts.get(song.releaseYear) ?? 0) + 1);
    });
    return counts;
  }, [songs]);

  async function handleSongSelect(song: SongListItem): Promise<void> {
    setSongLoading(true);
    try {
      const detail = await fetchSongDetail(song.songId);
      setSelectedSong(detail);
    } catch {
      setSelectedSong(buildFallbackDetail(song));
    } finally {
      setSongLoading(false);
    }
  }

  return (
    <main className="simple-shell">
      <header className="simple-header">
        <input
          className="simple-search"
          placeholder="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </header>

      <section className="tab-switch" aria-label="view switch">
        <button type="button" className={tab === "songs" ? "is-active" : ""} onClick={() => setTab("songs")}>
          songs
        </button>
        <button type="button" className={tab === "creators" ? "is-active" : ""} onClick={() => setTab("creators")}>
          composers
        </button>
      </section>

      {tab === "songs" ? (
        <>
          <section className="year-list" aria-label="release years">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`year-item ${selectedYear === year ? "is-active" : ""}`}
              >
                <span>{year}</span>
                <span className="year-count">{yearCounts.get(year) ?? 0}</span>
              </button>
            ))}
          </section>

          <section className="song-list" aria-label="songs">
            {loading ? <p className="muted">loading...</p> : null}
            {!loading && filteredSongs.length === 0 ? <p className="muted">no songs</p> : null}
            {filteredSongs.map((song) => (
              <button key={song.songId} type="button" className="song-item" onClick={() => handleSongSelect(song).catch(console.error)}>
                <span>{song.songTitle}</span>
                <span className="muted">{song.groupName}</span>
              </button>
            ))}
          </section>
        </>
      ) : (
        <section className="composer-layout" aria-label="composers">
          <div className="composer-list">
            {filteredCreators.map((creator) => (
              <button
                key={creator.id}
                type="button"
                className={`song-item ${selectedCreator?.id === creator.id ? "is-selected" : ""}`}
                onClick={() => setSelectedCreator(creator)}
              >
                <span>{creator.name}</span>
                <span className="muted">{creator.songCount}</span>
              </button>
            ))}
          </div>
          <div className="song-list">
            <p className="muted">{selectedCreator ? `${selectedCreator.name} の作曲曲` : "作曲家を選択してください"}</p>
            {composerSongs.map((song) => (
              <button key={song.songId} type="button" className="song-item" onClick={() => handleSongSelect(song).catch(console.error)}>
                <span>{song.songTitle}</span>
                <span className="muted">{song.releaseYear ?? "-"}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {songLoading ? <p className="muted">song detail loading...</p> : null}
      {selectedSong ? (
        <aside className="song-detail" aria-label="song detail">
          <p>{selectedSong.title}</p>
          <p className="muted">
            {selectedSong.groupName} / {selectedSong.releaseTitle} / {selectedSong.releaseYear ?? "-"}
          </p>
          {selectedSong.credits.length > 0 ? (
            <p className="muted">{selectedSong.credits.map((credit) => `${credit.role}:${credit.creatorName}`).join(" / ")}</p>
          ) : (
            <p className="muted">クレジット詳細は未取得</p>
          )}
        </aside>
      ) : null}
    </main>
  );
}
