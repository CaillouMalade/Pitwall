import { AlertTriangle, Check } from "lucide-react";
import { formatIsoDay, formatValue } from "../lib/format.ts";
import type { HistoryPeriod } from "../lib/history-source.ts";
import {
  MIN_DAYS,
  onDays,
  rankByRain,
  sharedDays,
  summarise,
  type TrackHistory,
} from "../lib/history.ts";
import { useFormat } from "../lib/settings.tsx";
import type { Track } from "../lib/types.ts";
import { useHistories } from "../lib/use-data.ts";
import {
  DailyBars,
  DailyLines,
  SERIES,
  type Datum,
  type Series,
} from "./HistoryCharts.tsx";
import { BUNDLED_NOTICE, HistoryCredit, PeriodSwitch } from "./HistoryPage.tsx";
import { Card, Empty, Loading, Notice, PageHeader } from "./ui.tsx";

export const MAX_COMPARED = 4;

/** Each chosen track keeps its colour slot while it stays chosen. */
export interface Choice {
  id: string;
  slot: number;
}

/** The track being looked at and the next one in the list, to start with. */
export function defaultChoices(
  tracks: readonly Track[],
  current: Track,
): Choice[] {
  const other = tracks.find((track) => track.id !== current.id);
  return [current, ...(other ? [other] : [])].map((track, slot) => ({
    id: track.id,
    slot,
  }));
}

interface Props {
  /** The same list as the sidebar: built-in tracks, then the user's. */
  tracks: readonly Track[];
  chosen: Choice[];
  onChosen: (chosen: Choice[]) => void;
  period: HistoryPeriod;
  onPeriod: (period: HistoryPeriod) => void;
}

export function ComparisonPage({
  tracks,
  chosen,
  onChosen,
  period,
  onPeriod,
}: Props) {
  const toggle = (track: Track) => {
    if (chosen.some((choice) => choice.id === track.id))
      onChosen(chosen.filter((choice) => choice.id !== track.id));
    else if (chosen.length < MAX_COMPARED) {
      const used = new Set(chosen.map((choice) => choice.slot));
      const slot = [0, 1, 2, 3].find((value) => !used.has(value))!;
      onChosen([...chosen, { id: track.id, slot }]);
    }
  };

  return (
    <>
      <PageHeader title="Track comparison" subtitle="Past weather, same days">
        <PeriodSwitch period={period} onPeriod={onPeriod} />
      </PageHeader>
      <div
        className="chips"
        role="group"
        aria-label={`Tracks to compare, 2 to ${MAX_COMPARED}`}
      >
        {tracks.map((track) => {
          const choice = chosen.find((item) => item.id === track.id);
          const full = !choice && chosen.length >= MAX_COMPARED;
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
        <ComparisonResults tracks={tracks} chosen={chosen} period={period} />
      )}
    </>
  );
}

function ComparisonResults({
  tracks,
  chosen,
  period,
}: {
  tracks: readonly Track[];
  chosen: Choice[];
  period: HistoryPeriod;
}) {
  const format = useFormat();
  const picked = chosen
    .map((choice) => tracks.find((track) => track.id === choice.id))
    .filter((track): track is Track => !!track);
  const results = useHistories(picked, period);

  if (picked.some((track) => results[track.id].state === "loading"))
    return <Loading label="Loading the history" rows={3} />;

  const name = (id: string) =>
    tracks.find((track) => track.id === id)?.name ?? id;
  const color = (id: string) =>
    SERIES[chosen.find((choice) => choice.id === id)!.slot];

  const histories: TrackHistory[] = [];
  const missing: string[] = [];
  for (const track of picked) {
    const result = results[track.id];
    if (result.state === "ready" && result.value.days.length >= MIN_DAYS)
      histories.push(result.value);
    else missing.push(track.name);
  }
  const without = missing.length > 0 && (
    <div className="warnings" role="status">
      <p className="warning">
        <AlertTriangle size={14} aria-hidden="true" />
        <span>No history for {missing.join(", ")}.</span>
      </p>
    </div>
  );

  if (histories.length < 2)
    return (
      <>
        {without}
        <Empty>
          Comparison needs history for at least two of the chosen tracks.
        </Empty>
      </>
    );

  // Only the days every track has, so they are compared fairly.
  const days = sharedDays(histories);
  if (days.length < MIN_DAYS)
    return (
      <>
        {without}
        <Empty>These tracks have no history over the same days.</Empty>
      </>
    );

  const bundled = histories.some((history) => history.origin === "bundled");
  const summaries = rankByRain(
    histories.map((history) =>
      summarise(history.trackId, name(history.trackId), onDays(history, days)),
    ),
  );
  const ids = summaries.map((summary) => summary.trackId);

  // One row per day, with each track's values under its own keys.
  const rows = new Map<string, Datum>(days.map((day) => [day, { day }]));
  for (const history of histories)
    for (const day of onDays(history, days)) {
      const row = rows.get(day.day)!;
      row[`${history.trackId}:rain`] = day.rain;
      row[`${history.trackId}:range`] =
        day.temperatureMin === null || day.temperatureMax === null
          ? null
          : [
              format.toTemperature(day.temperatureMin),
              format.toTemperature(day.temperatureMax),
            ];
      row[`${history.trackId}:swing`] =
        day.temperatureRange === null
          ? null
          : format.toTemperatureDifference(day.temperatureRange);
    }
  const data = [...rows.values()];
  const series = (suffix: string): Series[] =>
    ids.map((id) => ({
      key: `${id}:${suffix}`,
      label: name(id),
      color: color(id),
    }));
  const span = `${formatIsoDay(days[0])} – ${formatIsoDay(days.at(-1)!)}`;
  const names = ids.map(name).join(", ");

  return (
    <>
      {bundled && <Notice>{BUNDLED_NOTICE}</Notice>}
      {without}
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
                <dd>{format.temperature(summary.averageTemperature)}</dd>
              </div>
              <div>
                <dt>Days</dt>
                <dd>{summary.days}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
      <p className="muted period">{span}, wettest first</p>
      <Card title="Daily rain, mm">
        <DailyLines
          data={data}
          series={series("rain")}
          unit="mm"
          floorZero
          label={`Daily rain at ${names}, ${span}.`}
        />
      </Card>
      <Card
        title={`Daily lowest to highest temperature, ${format.temperatureUnit}`}
      >
        <DailyBars
          data={data}
          series={series("range")}
          unit={format.temperatureUnit}
          label={`Daily temperature range at ${names}, ${span}.`}
        />
      </Card>
      <Card title={`Daily swing, highest − lowest, ${format.temperatureUnit}`}>
        <DailyBars
          data={data}
          series={series("swing")}
          unit={format.temperatureUnit}
          label={`Daily temperature swing at ${names}, ${span}.`}
        />
      </Card>
      <HistoryCredit origin={bundled ? "bundled" : "archive"} />
    </>
  );
}
