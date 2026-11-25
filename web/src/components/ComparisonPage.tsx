import { AlertTriangle, Check } from "lucide-react";
import { csvName, hourlyCsv } from "../lib/csv.ts";
import { formatIsoWeekday } from "../lib/format.ts";
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
import { loadHours, useHistories } from "../lib/use-data.ts";
import { addDays, localDay, trackZone } from "../lib/zone.ts";
import { ChartGroup } from "./ForecastCharts.tsx";
import { DailyCharts, RankBars, SERIES } from "./HistoryCharts.tsx";
import {
  BUNDLED_NOTICE,
  ExportButton,
  HistoryCredit,
  PeriodSwitch,
} from "./HistoryPage.tsx";
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
  now: number;
}

export function ComparisonPage({
  tracks,
  chosen,
  onChosen,
  period,
  onPeriod,
  now,
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
      <PageHeader
        eyebrow="Track comparison"
        title="Past weather, same days"
        subtitle={`Pick 2 to ${MAX_COMPARED} tracks`}
      >
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
        <ComparisonResults
          tracks={tracks}
          chosen={chosen}
          period={period}
          now={now}
        />
      )}
    </>
  );
}

function ComparisonResults({
  tracks,
  chosen,
  period,
  now,
}: {
  tracks: readonly Track[];
  chosen: Choice[];
  period: HistoryPeriod;
  now: number;
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
  const perTrack = summaries.map((summary) => ({
    summary,
    color: color(summary.trackId),
    days: onDays(
      histories.find((history) => history.trackId === summary.trackId)!,
      days,
    ),
  }));
  // One rain scale for every track, so the bars can be compared by eye.
  const rainMax = Math.max(
    2,
    ...perTrack.flatMap((item) => item.days.map((day) => day.rain ?? 0)),
  );
  const temperatures = perTrack.flatMap((item) =>
    item.days.flatMap((day) =>
      [day.temperatureMin, day.temperatureMax].filter(
        (value): value is number => value !== null,
      ),
    ),
  );
  const bars = (value: (item: (typeof perTrack)[number]) => number | null) =>
    perTrack.map((item) => ({
      name: item.summary.track,
      color: item.color,
      value: value(item),
    }));
  const span = `${formatIsoWeekday(days[0])} to ${formatIsoWeekday(days.at(-1)!)}`;

  return (
    <>
      {bundled && <Notice>{BUNDLED_NOTICE}</Notice>}
      {without}
      <Card
        title={span}
        aside={
          !bundled && (
            <ExportButton
              label="Export hourly CSV"
              title="Every hour of these days, for each track"
              make={async () => {
                const kept = picked.filter((track) =>
                  histories.some((history) => history.trackId === track.id),
                );
                const all = await Promise.all(
                  kept.map(async (track) => {
                    const zone = trackZone(track);
                    const today = localDay(now, zone);
                    return {
                      track: track.name,
                      zone,
                      hours: await loadHours(
                        track,
                        addDays(today, -period),
                        addDays(today, -1),
                      ),
                    };
                  }),
                );
                return {
                  name: csvName(
                    kept.map((track) => track.name).join(" "),
                    days[0],
                    days.at(-1)!,
                    "hourly",
                  ),
                  text: hourlyCsv(all, format),
                };
              }}
            />
          )
        }
      >
        <div className="rank-grid">
          <RankBars
            title="Total rain"
            unit="mm"
            items={bars((item) => item.summary.totalRain)}
          />
          <RankBars
            title="Rain days"
            unit="days"
            digits={0}
            items={bars((item) => item.summary.rainDays)}
          />
          <RankBars
            title="Average temperature"
            unit={format.temperatureUnit}
            items={bars((item) =>
              item.summary.averageTemperature === null
                ? null
                : format.toTemperature(item.summary.averageTemperature),
            )}
          />
          <RankBars
            title="Strongest wind"
            unit={format.windUnit}
            digits={format.windDigits}
            items={bars((item) =>
              item.summary.strongestWind === null
                ? null
                : format.toWind(item.summary.strongestWind),
            )}
          />
        </div>
      </Card>
      <ChartGroup>
        <Card title="Day by day">
          <div className="multiples">
            {perTrack.map((item) => (
              <section key={item.summary.trackId} className="multiple">
                <h3>
                  <i style={{ background: item.color }} aria-hidden="true" />
                  {item.summary.track}
                </h3>
                <DailyCharts
                  days={item.days}
                  sync="comparison"
                  rainMax={rainMax}
                  temperatures={temperatures}
                  color={item.color}
                  compact
                />
              </section>
            ))}
          </div>
        </Card>
      </ChartGroup>
      <HistoryCredit origin={bundled ? "bundled" : "archive"} />
    </>
  );
}
