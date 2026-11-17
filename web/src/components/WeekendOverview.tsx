import { combineForecasts } from "../lib/stats.ts";
import { WEEKEND_DAYS, type Session } from "../lib/sessions.ts";
import type { Track } from "../lib/types.ts";
import { useForecast, useRadar } from "../lib/use-data.ts";
import { DAY } from "../lib/windows.ts";
import { RainTemperatureChart, WindChart } from "./ForecastCharts.tsx";
import { CircuitMap, RadarMap } from "./Maps.tsx";
import {
  Card,
  Empty,
  Loading,
  PageHeader,
  RefreshButton,
  Warnings,
} from "./ui.tsx";

export function WeekendOverview({
  track,
  sessions,
}: {
  track: Track;
  sessions: Session[];
}) {
  const { data, refresh } = useForecast(track);
  const radar = useRadar();
  // The day of the first session: the weekend starts at its midnight (UTC).
  const start = Math.floor(sessions[0].start / DAY) * DAY;
  const end = start + WEEKEND_DAYS * DAY;

  let body;
  if (data.state === "loading")
    body = <Loading label="Fetching the forecasts" />;
  else if (data.state === "failed") body = <Empty>{data.message}</Empty>;
  else {
    const { points, failures } = data.value;
    // Only the 3 race days, so the charts match the sessions.
    const weekend = points.filter(
      (point) => point.time >= start && point.time < end,
    );
    const windows = combineForecasts(weekend);
    body = (
      <>
        <Warnings messages={failures} />
        {points.length === 0 ? (
          <Empty>
            No forecast could be loaded. Try again in a few minutes.
          </Empty>
        ) : windows.length === 0 ? (
          <Empty>No forecast reaches the race weekend yet.</Empty>
        ) : (
          <>
            <Card title="Rain and temperature">
              <RainTemperatureChart
                windows={windows}
                points={weekend}
                sessions={sessions}
                start={start}
              />
            </Card>
            <Card title="Wind">
              <WindChart
                windows={windows}
                points={weekend}
                sessions={sessions}
                start={start}
              />
            </Card>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={track.name} subtitle={track.country}>
        <RefreshButton
          fetchedAt={data.state === "ready" ? data.value.fetchedAt : undefined}
          onRefresh={refresh}
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
