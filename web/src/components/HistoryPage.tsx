import { formatIsoDay, formatValue } from "../lib/format.ts";
import { HISTORY_PERIODS, type HistoryPeriod } from "../lib/history-source.ts";
import { MIN_DAYS, summarise, type HistoryOrigin } from "../lib/history.ts";
import { useFormat } from "../lib/settings.tsx";
import type { Track } from "../lib/types.ts";
import { useHistory, useOnline } from "../lib/use-data.ts";
import { DailyBars, DailyLines } from "./HistoryCharts.tsx";
import {
  Card,
  Empty,
  Loading,
  Notice,
  PageHeader,
  Segmented,
  Stat,
} from "./ui.tsx";

const PERIOD_OPTIONS = HISTORY_PERIODS.map((days) => ({
  value: days,
  label: `${days} days`,
}));

export function PeriodSwitch({
  period,
  onPeriod,
}: {
  period: HistoryPeriod;
  onPeriod: (period: HistoryPeriod) => void;
}) {
  return (
    <Segmented
      label="Period"
      value={period}
      options={PERIOD_OPTIONS}
      onChange={onPeriod}
    />
  );
}

/** Where the days come from, said once under the page. */
export function HistoryCredit({ origin }: { origin: HistoryOrigin }) {
  return (
    <p className="muted credit">
      {origin === "archive"
        ? "ERA5 and ECMWF IFS reanalysis from Open-Meteo: a model's reconstruction on a grid of a few kilometres, not a gauge at the track."
        : "Weather logged at the track from 29 October to 13 November 2026. Weather data © OpenWeather."}
    </p>
  );
}

export const BUNDLED_NOTICE =
  "The weather archive cannot be reached. Showing the log that comes with Pitwall.";

export function HistoryPage({
  track,
  period,
  onPeriod,
}: {
  track: Track;
  period: HistoryPeriod;
  onPeriod: (period: HistoryPeriod) => void;
}) {
  const history = useHistory(track, period);
  const online = useOnline();
  const format = useFormat();

  let body;
  if (history.state === "loading")
    body = <Loading label="Loading the history" rows={3} />;
  else if (history.state === "failed")
    body = (
      <Empty>
        {online
          ? history.message
          : "Offline. History needs a connection for this track."}
      </Empty>
    );
  else if (history.value.days.length < MIN_DAYS)
    body = <Empty>No history for this track yet.</Empty>;
  else {
    const { days, origin } = history.value;
    const summary = summarise(track.id, track.name, days);
    const convert = (value: number | null, to: (value: number) => number) =>
      value === null ? null : to(value);
    const data = days.map((day) => ({
      day: day.day,
      rain: day.rain,
      low: convert(day.temperatureMin, format.toTemperature),
      high: convert(day.temperatureMax, format.toTemperature),
      swing: convert(day.temperatureRange, format.toTemperatureDifference),
      wind: convert(day.windMax, format.toWind),
    }));
    const span = `${formatIsoDay(days[0].day)} – ${formatIsoDay(days.at(-1)!.day)}`;
    body = (
      <>
        {origin === "bundled" && <Notice>{BUNDLED_NOTICE}</Notice>}
        <Card title="Summary" aside={<span className="muted">{span}</span>}>
          <div className="stats">
            <Stat
              label="Average temperature"
              value={format.temperature(summary.averageTemperature)}
            />
            <Stat label="Rain days" value={String(summary.rainDays)} />
            <Stat
              label="Total rain"
              value={formatValue(summary.totalRain, "mm")}
            />
            {summary.strongestWind === null ? (
              <Stat label="Days" value={String(summary.days)} />
            ) : (
              <Stat
                label="Strongest wind"
                value={format.wind(summary.strongestWind)}
              />
            )}
          </div>
        </Card>
        <Card title="Daily rain, mm">
          <DailyBars
            data={data}
            series={[{ key: "rain", label: "Rain", color: "var(--rain)" }]}
            unit="mm"
            label={`Daily rain at ${track.name}, ${span}: ${formatValue(summary.totalRain, "mm")} in total.`}
          />
        </Card>
        <Card title={`Daily temperature, ${format.temperatureUnit}`}>
          <DailyLines
            data={data}
            unit={format.temperatureUnit}
            series={[
              { key: "high", label: "Highest", color: "var(--temp)" },
              { key: "low", label: "Lowest", color: "var(--rain)" },
            ]}
            label={`Daily highest and lowest temperature at ${track.name}, ${span}.`}
          />
        </Card>
        <Card
          title={`Daily swing, highest − lowest, ${format.temperatureUnit}`}
        >
          <DailyBars
            data={data}
            series={[{ key: "swing", label: "Swing", color: "var(--swing)" }]}
            unit={format.temperatureUnit}
            label={`Daily temperature swing at ${track.name}, ${span}.`}
          />
        </Card>
        {summary.strongestWind !== null && (
          <Card title={`Strongest wind of the day, ${format.windUnit}`}>
            <DailyBars
              data={data}
              series={[{ key: "wind", label: "Wind", color: "var(--wind)" }]}
              unit={format.windUnit}
              digits={format.windDigits}
              label={`Strongest wind of each day at ${track.name}, ${span}.`}
            />
          </Card>
        )}
        <HistoryCredit origin={origin} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={track.name} subtitle="Past weather">
        <PeriodSwitch period={period} onPeriod={onPeriod} />
      </PageHeader>
      {body}
    </>
  );
}
