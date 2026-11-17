import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar.tsx";
import { WeekendOverview } from "./components/WeekendOverview.tsx";
import { SessionDashboard } from "./components/SessionDashboard.tsx";
import { HistoryPage } from "./components/HistoryPage.tsx";
import { ComparisonPage } from "./components/ComparisonPage.tsx";
import { GRADE1_TRACKS } from "./data/grade1-tracks.ts";
import {
  loadUserTracks,
  readText,
  SELECTED_TRACK_KEY,
  writeText,
} from "./lib/storage.ts";
import { sessionTimes } from "./lib/sessions.ts";
import type { Track } from "./lib/types.ts";

export const PAGES = [
  { id: "overview", label: "Weekend overview" },
  { id: "session", label: "Session dashboard" },
  { id: "history", label: "History" },
  { id: "comparison", label: "Track comparison" },
] as const;
export type PageId = (typeof PAGES)[number]["id"];

function useNow(): number {
  // The weekend moves at midnight UTC; checking every minute is plenty.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function App() {
  const [userTracks, setUserTracks] = useState<Track[]>(() => loadUserTracks());
  const tracks = useMemo(() => [...GRADE1_TRACKS, ...userTracks], [userTracks]);
  const [selectedId, setSelectedId] = useState(
    () => readText(SELECTED_TRACK_KEY) ?? GRADE1_TRACKS[0].id,
  );
  const track = tracks.find((item) => item.id === selectedId) ?? tracks[0];
  const [page, setPage] = useState<PageId>("overview");
  const [sessionIndex, setSessionIndex] = useState(0);
  const now = useNow();
  const day = Math.floor(now / 86_400_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => sessionTimes(now), [day]);

  const selectTrack = (id: string) => {
    setSelectedId(id);
    writeText(SELECTED_TRACK_KEY, id);
  };

  return (
    <div className="app">
      <Sidebar
        tracks={tracks}
        userTracks={userTracks}
        track={track}
        sessions={sessions}
        onSelect={selectTrack}
        onAdded={(added, all) => {
          setUserTracks(all);
          selectTrack(added.id);
        }}
      />
      <main className="main">
        <nav className="tabs" aria-label="Pages">
          {PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="tab"
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="page">
          {page === "overview" && (
            <WeekendOverview track={track} sessions={sessions} />
          )}
          {page === "session" && (
            <SessionDashboard
              track={track}
              sessions={sessions}
              index={sessionIndex}
              onIndex={setSessionIndex}
              now={now}
            />
          )}
          {page === "history" && <HistoryPage track={track} />}
          {page === "comparison" && <ComparisonPage />}
        </div>
      </main>
    </div>
  );
}
