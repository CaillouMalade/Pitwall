import {
  compareTrackHistory,
  daysLogged,
  MIN_DAYS_LOGGED,
  trackRainHistory,
} from "../lib/history.ts";
import { formatIsoDay, formatValue } from "../lib/format.ts";
import type { Track } from "../lib/types.ts";
import { useObservations } from "../lib/use-data.ts";
import { DailyBars, DailyLines } from "./HistoryCharts.tsx";
import { Card, Empty, Loading, PageHeader, Stat } from "./ui.tsx";

export function HistoryPage({ track }: { track: Track }) {
  const history = useObservations();

  let body;
  if (history.state === "loading")
    body = <Loading label="Loading the logged history" />;
  else if (history.state === "failed") body = <Empty>{history.message}</Empty>;
  else if (history.value.length === 0)
    body = <Empty>No logged history yet.</Empty>;
  // Tracks are matched on their id, so a renamed track keeps its history.
  else if (daysLogged(history.value, track.id) < MIN_DAYS_LOGGED)
    body = (
      <Empty>
        Not enough logged history for this track yet. Pick another track.
      </Empty>
    );
  else {
    const daily = trackRainHistory(history.value, track.id);
    const [summary] = compareTrackHistory(history.value, [track.id]);
    const data = daily.map((day) => ({
      day: day.day,
      rain: day.rain,
      low: day.temperatureMin,
      high: day.temperatureMax,
      swing: day.temperatureRange,
    }));
    body = (
      <>
        <Card
          title="Logged period"
          aside={
            <span className="muted">
              {formatIsoDay(daily[0].day)} – {formatIsoDay(daily.at(-1)!.day)}
            </span>
          }
        >
          <div className="stats">
            <Stat
              label="Average temperature"
              value={formatValue(summary.averageTemperature, "°C")}
            />
            <Stat label="Rain days" value={String(summary.rainDays)} />
            <Stat
              label="Total rain"
              value={formatValue(summary.totalRain, "mm")}
            />
            <Stat label="Days logged" value={String(summary.daysLogged)} />
          </div>
        </Card>
        <Card title="Daily rain, mm">
          <DailyBars
            data={data}
            series={[{ key: "rain", label: "Rain", color: "var(--rain)" }]}
            unit="mm"
          />
        </Card>
        <Card title="Daily temperature, °C">
          <DailyLines
            data={data}
            unit="°C"
            series={[
              { key: "high", label: "Highest", color: "var(--temp)" },
              { key: "low", label: "Lowest", color: "var(--rain)" },
            ]}
          />
        </Card>
        <Card title="Daily swing, highest − lowest, °C">
          <DailyBars
            data={data}
            series={[{ key: "swing", label: "Swing", color: "var(--swing)" }]}
            unit="°C"
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={track.name} subtitle="Logged weather" />
      {body}
    </>
  );
}
