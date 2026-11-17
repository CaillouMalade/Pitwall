import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  compareTrackHistory,
  historyTracks,
  sharedPeriod,
  trackRainHistory,
  type HistoryTrack,
  type Observation,
} from "../lib/history.ts";
import { formatIsoDay, formatValue } from "../lib/format.ts";
import { useObservations } from "../lib/use-data.ts";
import {
  DailyBars,
  DailyLines,
  SERIES,
  type Series,
} from "./HistoryCharts.tsx";
import { Card, Empty, Loading, PageHeader } from "./ui.tsx";

const MAX_TRACKS = 4;

export function ComparisonPage() {
  const history = useObservations();
  return (
    <>
      <PageHeader
        title="Track comparison"
        subtitle="Logged weather over the same days"
      />
      {history.state === "loading" ? (
        <Loading label="Loading the logged history" />
      ) : history.state === "failed" ? (
        <Empty>{history.message}</Empty>
      ) : history.value.length === 0 ? (
        <Empty>No logged history yet.</Empty>
      ) : (
        <Comparison history={history.value} />
      )}
    </>
  );
}

/** Each chosen track keeps its colour slot while it stays chosen. */
type Choice = { id: string; slot: number };

function Comparison({ history }: { history: Observation[] }) {
  const tracks = useMemo(() => historyTracks(history), [history]);
  const [chosen, setChosen] = useState<Choice[]>(() =>
    tracks.slice(0, 2).map((track, slot) => ({ id: track.id, slot })),
  );
  if (tracks.length < 2)
    return (
      <Empty>Track comparison needs history for at least two tracks.</Empty>
    );

  const toggle = (track: HistoryTrack) => {
    if (chosen.some((choice) => choice.id === track.id))
      setChosen(chosen.filter((choice) => choice.id !== track.id));
    else if (chosen.length < MAX_TRACKS) {
      const used = new Set(chosen.map((choice) => choice.slot));
      const slot = [0, 1, 2, 3].find((value) => !used.has(value))!;
      setChosen([...chosen, { id: track.id, slot }]);
    }
  };

  return (
    <>
      <div
        className="chips"
        role="group"
        aria-label={`Tracks to compare, 2 to ${MAX_TRACKS}`}
      >
        {tracks.map((track) => {
          const choice = chosen.find((item) => item.id === track.id);
          const full = !choice && chosen.length >= MAX_TRACKS;
          return (
            <button
              key={track.id}
              type="button"
              className="chip"
              aria-pressed={!!choice}
              disabled={full}
              onClick={() => toggle(track)}
            >
              {choice ? (
                <span
                  className="chip-dot"
                  style={{ background: SERIES[choice.slot] }}
                  aria-hidden="true"
                >
                  <Check size={10} strokeWidth={3} />
                </span>
              ) : null}
              {track.name}
            </button>
          );
        })}
      </div>
      {chosen.length < 2 ? (
        <Empty>Pick at least two tracks to compare.</Empty>
      ) : (
        <ComparisonResults history={history} tracks={tracks} chosen={chosen} />
      )}
    </>
  );
}

function ComparisonResults({
  history,
  tracks,
  chosen,
}: {
  history: Observation[];
  tracks: HistoryTrack[];
  chosen: Choice[];
}) {
  const ids = chosen.map((choice) => choice.id);
  // Only the period every chosen track was logged, so they are compared fairly.
  const shared = sharedPeriod(history, ids);
  if (!shared)
    return (
      <Empty>These tracks do not have history over the same period.</Empty>
    );

  const summaries = compareTrackHistory(shared, ids);
  const name = (id: string) =>
    tracks.find((track) => track.id === id)?.name ?? id;
  const color = (id: string) =>
    SERIES[chosen.find((choice) => choice.id === id)!.slot];

  // One row per day, with each track's values under its own keys.
  const days = new Map<string, Record<string, unknown> & { day: string }>();
  for (const id of ids)
    for (const day of trackRainHistory(shared, id)) {
      const row = days.get(day.day) ?? { day: day.day };
      row[`${id}:rain`] = day.rain;
      row[`${id}:range`] =
        day.temperatureMin === null || day.temperatureMax === null
          ? null
          : [day.temperatureMin, day.temperatureMax];
      row[`${id}:swing`] = day.temperatureRange;
      days.set(day.day, row);
    }
  const data = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  const series = (suffix: string): Series[] =>
    ids.map((id) => ({
      key: `${id}:${suffix}`,
      label: name(id),
      color: color(id),
    }));

  return (
    <>
      <div className="summary-grid" aria-label="Wettest to driest">
        {summaries.map((summary, rank) => (
          <Card key={summary.trackId} className="summary-card">
            <div className="summary-head">
              <i
                style={{ background: color(summary.trackId) }}
                aria-hidden="true"
              />
              <h2>{summary.track}</h2>
              <span className="rank">{rank + 1}</span>
            </div>
            <dl className="summary-values">
              <div>
                <dt>Total rain</dt>
                <dd>{formatValue(summary.totalRain, "mm")}</dd>
              </div>
              <div>
                <dt>Rain days</dt>
                <dd>{summary.rainDays}</dd>
              </div>
              <div>
                <dt>Average temperature</dt>
                <dd>{formatValue(summary.averageTemperature, "°C")}</dd>
              </div>
              <div>
                <dt>Days logged</dt>
                <dd>{summary.daysLogged}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
      <p className="muted period">
        {formatIsoDay(data[0].day)} – {formatIsoDay(data.at(-1)!.day)}, wettest
        first
      </p>
      <Card title="Daily rain, mm">
        <DailyLines data={data} series={series("rain")} unit="mm" floorZero />
      </Card>
      <Card title="Daily lowest to highest temperature, °C">
        <DailyBars data={data} series={series("range")} unit="°C" />
      </Card>
      <Card title="Daily swing, highest − lowest, °C">
        <DailyBars data={data} series={series("swing")} unit="°C" />
      </Card>
    </>
  );
}
