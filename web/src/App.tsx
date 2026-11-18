import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Gauge, GitCompareArrows, History } from "lucide-react";
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
import { fetchZone } from "./lib/rain-map.ts";
import {
  planFromType,
  sessionTimes,
  STANDARD_TYPE,
  weekendEnd,
  weekendStart,
  type WeekendPlan,
} from "./lib/sessions.ts";
import { centreOf } from "./lib/sources.ts";
import { combinePeriod } from "./lib/stats.ts";
import {
  loadPlans,
  loadUserTracks,
  loadWeekendTypes,
  readText,
  savePlan,
  saveUserTracks,
  saveWeekendTypes,
  SELECTED_TRACK_KEY,
  WELCOMED_KEY,
  writeText,
  type WeekendTypes,
} from "./lib/storage.ts";
import type { Track } from "./lib/types.ts";
import { useForecast, useOnline } from "./lib/use-data.ts";
import { isZone, trackZone } from "./lib/zone.ts";

export const PAGES = [
  { id: "overview", label: "Weekend overview", icon: CalendarRange },
  { id: "session", label: "Session dashboard", icon: Gauge },
  { id: "history", label: "History", icon: History },
  { id: "comparison", label: "Track comparison", icon: GitCompareArrows },
] as const;
export type PageId = (typeof PAGES)[number]["id"];

type DialogId = "add-track" | "edit-track" | "weekend" | "settings" | "about";

/** The colour of the app follows the weekend: dry, mixed or wet. */
type Mood = "calm" | "dry" | "mixed" | "wet";

function useNow(): number {
  // The weekend moves at the track's midnight; checking every minute is plenty.
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
  const [weekendTypes, setWeekendTypes] = useState<WeekendTypes>(() =>
    loadWeekendTypes(),
  );
  const defaultType =
    weekendTypes.types.find((type) => type.id === weekendTypes.defaultId) ??
    STANDARD_TYPE;
  // A track without a weekend of its own follows the default type.
  const plan = useMemo(
    () => plans[track.id] ?? planFromType(defaultType),
    [plans, track.id, defaultType],
  );
  const zone = trackZone(track);
  const [page, setPage] = useState<PageId>("overview");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [period, setPeriod] = useState<HistoryPeriod>(30);
  const [compared, setCompared] = useState<Choice[] | null>(null);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [welcomed, setWelcomed] = useState(
    () => readText(WELCOMED_KEY) !== null,
  );
  const now = useNow();
  const start = weekendStart(now, plan, zone);
  const end = weekendEnd(now, plan, zone);
  // The sessions only move when the weekend's first day does: `start` stands
  // in for the current time here, which changes every minute.
  const sessions = useMemo(
    () => sessionTimes(start - 43_200_000, plan, zone),
    [start, plan, zone],
  );
  const session = Math.min(sessionIndex, sessions.length - 1);

  // A track the user added gets its time zone looked up once, when online.
  const online = useOnline();
  useEffect(() => {
    if (!online || isZone(track.timezone)) return;
    if (!userTracks.some((item) => item.id === track.id)) return;
    let active = true;
    fetchZone(track).then(
      (timezone) => {
        if (!active || !isZone(timezone)) return;
        setUserTracks((current) => {
          const next = current.map((item) =>
            item.id === track.id ? { ...item, timezone } : item,
          );
          try {
            return saveUserTracks(next);
          } catch {
            return next;
          }
        });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
    // The track's id and place are the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id, track.latitude, track.longitude, track.timezone, online]);

  const forecast = useForecast(track);
  const mood = useMemo((): Mood => {
    if (forecast.data.state !== "ready") return "calm";
    const { points } = forecast.data.value;
    let wet = 0;
    let known = 0;
    for (const item of sessions) {
      const combined = combinePeriod(points, item.start, item.end, (source) =>
        centreOf(source, track),
      );
      if (combined.rainVoters === 0) continue;
      known++;
      if (combined.rainVotes * 2 >= combined.rainVoters) wet++;
    }
    if (known === 0) return "calm";
    return wet === 0 ? "dry" : wet * 2 >= known ? "wet" : "mixed";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast.data, sessions]);
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
    <div className="app" data-mood={mood}>
      <div className="ambient" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Sidebar
        tracks={tracks}
        userTracks={userTracks}
        track={track}
        sessions={sessions}
        now={now}
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
              aria-label={item.label}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={15} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="page" key={`${page}-${track.id}`}>
          {page === "overview" && (
            <WeekendOverview
              track={track}
              sessions={sessions}
              start={start}
              end={end}
              now={now}
              onSession={(index) => {
                setSessionIndex(index);
                setPage("session");
              }}
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
            <HistoryPage
              track={track}
              period={period}
              onPeriod={setPeriod}
              weekendStart={start}
              now={now}
            />
          )}
          {page === "comparison" && (
            <ComparisonPage
              tracks={tracks}
              chosen={chosen}
              onChosen={setCompared}
              period={period}
              onPeriod={setPeriod}
              now={now}
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
          types={weekendTypes}
          onTypes={(next) => setWeekendTypes(saveWeekendTypes(next))}
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
