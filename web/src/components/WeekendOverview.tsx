import { formatDayTime } from "../lib/format.ts";
import { combineForecasts } from "../lib/stats.ts";
import { centreOf } from "../lib/sources.ts";
import { WEEKEND_DAYS, type Session } from "../lib/sessions.ts";
import { formatCoordinates } from "../lib/tracks.ts";
import type { Track } from "../lib/types.ts";
import { useForecast, useRadar } from "../lib/use-data.ts";
import { DAY } from "../lib/windows.ts";
import { RainTemperatureChart, WindChart } from "./ForecastCharts.tsx";
import { CircuitMap, RadarMap } from "./Maps.tsx";
import { SourcesCard } from "./SourcesCard.tsx";
import {
  Card,
  Empty,
  Loading,
  Notice,
  PageHeader,
  RefreshButton,
  Warnings,
} from "./ui.tsx";

export function trackSubtitle(track: Track): string {
  return track.country || formatCoordinates(track);
}

export function WeekendOverview({
  track,
  sessions,
  start,
  now,
}: {
  track: Track;
  sessions: Session[];
  /** Midnight (UTC) of the weekend's first day. */
  start: number;
  now: number;
}) {
  const { data, refresh, online } = useForecast(track);
  const radar = useRadar();
  const end = start + WEEKEND_DAYS * DAY;
  const retry = (
    <button type="button" className="button" onClick={refresh}>
      Try again
    </button>
  );

  let body;
  if (data.state === "loading")
    body = <Loading label="Fetching the forecasts" rows={2} />;
  else if (data.state === "failed")
    body = <Empty action={retry}>{data.message}</Empty>;
  else {
    const { points, failures, statuses, saved, fetchedAt } = data.value;
    // Only the 3 race days, so the charts match the sessions.
    const weekend = points.filter(
      (point) => point.time >= start && point.time < end,
    );
    const windows = combineForecasts(weekend, (source) =>
      centreOf(source, track),
    );
    body = (
      <>
        {saved ? (
          <Notice>
            {online ? "The weather services cannot be reached." : "Offline."}{" "}
            Showing the forecast from {formatDayTime(fetchedAt)} UTC.
          </Notice>
        ) : (
          <Warnings messages={failures} />
        )}
        {points.length === 0 ? (
          <Empty action={retry}>
            {online
              ? "No forecast could be loaded."
              : "Offline. No forecast is saved for this track yet."}
          </Empty>
        ) : windows.length === 0 ? (
          <Empty>
            {end <= now
              ? "This weekend is over."
              : "No forecast reaches this weekend yet."}
          </Empty>
        ) : (
          <>
            <Card title="Rain and temperature">
              <RainTemperatureChart
                windows={windows}
                sessions={sessions}
                start={start}
              />
            </Card>
            <Card title="Wind">
              <WindChart windows={windows} sessions={sessions} start={start} />
            </Card>
          </>
        )}
        {!saved && statuses.length > 0 && <SourcesCard statuses={statuses} />}
      </>
    );
  }

  return (
    <>
      <PageHeader title={track.name} subtitle={trackSubtitle(track)}>
        <RefreshButton
          fetchedAt={data.state === "ready" ? data.value.fetchedAt : undefined}
          onRefresh={refresh}
          busy={data.state === "loading"}
        />
      </PageHeader>
      {body}
      <div className="map-grid">
        <CircuitMap track={track} />
        <RadarMap track={track} radar={radar} />
      </div>
    </>
  );
}
