import { useEffect, useMemo, useState } from "react";
import { AboutDialog } from "./components/AboutDialog.tsx";
import {
  ComparisonPage,
  defaultChoices,
  type Choice,
} from "./components/ComparisonPage.tsx";
import { HistoryPage } from "./components/HistoryPage.tsx";
import { SessionDashboard } from "./components/SessionDashboard.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TrackDialog } from "./components/TrackDialog.tsx";
import { WeekendDialog } from "./components/WeekendDialog.tsx";
import { WeekendOverview } from "./components/WeekendOverview.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { GRADE1_TRACKS } from "./data/grade1-tracks.ts";
import type { HistoryPeriod } from "./lib/history-source.ts";
import {
  DEFAULT_PLAN,
  sessionTimes,
  weekendStart,
  type WeekendPlan,
} from "./lib/sessions.ts";
import {
  loadPlans,
  loadUserTracks,
  readText,
  savePlan,
  saveUserTracks,
  SELECTED_TRACK_KEY,
  WELCOMED_KEY,
  writeText,
} from "./lib/storage.ts";
import type { Track } from "./lib/types.ts";

export const PAGES = [
  { id: "overview", label: "Weekend overview" },
  { id: "session", label: "Session dashboard" },
  { id: "history", label: "History" },
  { id: "comparison", label: "Track comparison" },
] as const;
export type PageId = (typeof PAGES)[number]["id"];

type DialogId = "add-track" | "edit-track" | "weekend" | "settings" | "about";

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
  const [plans, setPlans] = useState<Record<string, WeekendPlan>>(() =>
    loadPlans(),
  );
  const plan = plans[track.id] ?? DEFAULT_PLAN;
  const [page, setPage] = useState<PageId>("overview");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [period, setPeriod] = useState<HistoryPeriod>(30);
  const [compared, setCompared] = useState<Choice[] | null>(null);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [welcomed, setWelcomed] = useState(
    () => readText(WELCOMED_KEY) !== null,
  );
  const now = useNow();
  const day = Math.floor(now / 86_400_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sessions = useMemo(() => sessionTimes(now, plan), [day, plan]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const start = useMemo(() => weekendStart(now, plan), [day, plan]);
  const session = Math.min(sessionIndex, sessions.length - 1);
  // Tracks that were deleted since drop out of the comparison.
  const chosen = (compared ?? defaultChoices(tracks, track)).filter((choice) =>
    tracks.some((item) => item.id === choice.id),
  );

  const selectTrack = (id: string) => {
    setSelectedId(id);
    writeText(SELECTED_TRACK_KEY, id);
  };
  const close = () => setDialog(null);

  const saveTrack = (saved: Track) => {
    const exists = userTracks.some((item) => item.id === saved.id);
    setUserTracks(
      saveUserTracks(
        exists
          ? userTracks.map((item) => (item.id === saved.id ? saved : item))
          : [...userTracks, saved],
      ),
    );
    selectTrack(saved.id);
    close();
  };

  const deleteTrack = (removed: Track) => {
    setUserTracks(
      saveUserTracks(userTracks.filter((item) => item.id !== removed.id)),
    );
    if (plans[removed.id]) setPlans(savePlan(removed.id, null));
    selectTrack(GRADE1_TRACKS[0].id);
    close();
  };

  return (
    <div className="app">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Sidebar
        tracks={tracks}
        userTracks={userTracks}
        track={track}
        sessions={sessions}
        currentSession={page === "session" ? session : null}
        onSelect={selectTrack}
        onSession={(index) => {
          setSessionIndex(index);
          setPage("session");
        }}
        onAddTrack={() => setDialog("add-track")}
        onEditTrack={() => setDialog("edit-track")}
        onEditWeekend={() => setDialog("weekend")}
        onSettings={() => setDialog("settings")}
        onAbout={() => setDialog("about")}
      />
      <main className="main" id="content">
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
            <WeekendOverview
              track={track}
              sessions={sessions}
              start={start}
              now={now}
            />
          )}
          {page === "session" && (
            <SessionDashboard
              track={track}
              sessions={sessions}
              index={session}
              onIndex={setSessionIndex}
              now={now}
            />
          )}
          {page === "history" && (
            <HistoryPage track={track} period={period} onPeriod={setPeriod} />
          )}
          {page === "comparison" && (
            <ComparisonPage
              tracks={tracks}
              chosen={chosen}
              onChosen={setCompared}
              period={period}
              onPeriod={setPeriod}
            />
          )}
        </div>
      </main>

      {!welcomed && (
        <Welcome
          tracks={tracks}
          track={track}
          onDone={(id) => {
            selectTrack(id);
            writeText(WELCOMED_KEY, "1");
            setWelcomed(true);
          }}
        />
      )}
      {dialog === "add-track" && (
        <TrackDialog tracks={tracks} onSave={saveTrack} onClose={close} />
      )}
      {dialog === "edit-track" && (
        <TrackDialog
          tracks={tracks}
          editing={track}
          onSave={saveTrack}
          onDelete={deleteTrack}
          onClose={close}
        />
      )}
      {dialog === "weekend" && (
        <WeekendDialog
          track={track}
          plan={plan}
          onSave={(next) => {
            setPlans(savePlan(track.id, next));
            setSessionIndex(0);
            close();
          }}
          onClose={close}
        />
      )}
      {dialog === "settings" && <SettingsDialog onClose={close} />}
      {dialog === "about" && <AboutDialog onClose={close} />}
    </div>
  );
}
