import { useState } from "react";
import { Download } from "lucide-react";
import { csvName, dailyCsv, download, hourlyCsv } from "../lib/csv.ts";
import {
  formatIsoDate,
  formatIsoDay,
  formatIsoWeekday,
  formatNumber,
  formatValue,
} from "../lib/format.ts";
import {
  FIRST_DAY,
  HISTORY_PERIODS,
  MAX_RANGE_DAYS,
  type HistoryPeriod,
  type YearDays,
} from "../lib/history-source.ts";
import {
  climate,
  hoursToDays,
  MIN_DAYS,
  RAIN_DAY_MM,
  summarise,
  type DailyWeather,
  type HistoryOrigin,
} from "../lib/history.ts";
import { userMessage } from "../lib/http.ts";
import { parseDay, WEEKEND_DAYS } from "../lib/sessions.ts";
import { useFormat } from "../lib/settings.tsx";
import type { Track } from "../lib/types.ts";
import {
  loadHours,
  useHistory,
  useHours,
  useOnline,
  useSameDates,
} from "../lib/use-data.ts";
import { DAY } from "../lib/windows.ts";
import { addDays, localDay, trackZone, zonedTime } from "../lib/zone.ts";
import { ChartGroup } from "./ForecastCharts.tsx";
import { DailyCharts, HourlyCharts } from "./HistoryCharts.tsx";
import {
  Card,
  Empty,
  Field,
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
        ? "ERA5 and ECMWF IFS reanalysis from Open-Meteo: a model's reconstruction on a grid of a few kilometres, not a gauge at the track. Local showers can be missed. Days are the track's own calendar days."
        : "Weather logged at the track from 29 October to 13 November 2026. Weather data © OpenWeather."}
    </p>
  );
}

export const BUNDLED_NOTICE =
  "The weather archive cannot be reached. Showing the log that comes with Pitwall.";

/** A button that fetches what it needs, then saves a CSV file. */
export function ExportButton({
  label = "Export CSV",
  title,
  make,
}: {
  label?: string;
  title?: string;
  /** Returns the file's name and text. */
  make: () => Promise<{ name: string; text: string }>;
}) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const [message, setMessage] = useState("");
  return (
    <span className="export">
      <button
        type="button"
        className="button"
        disabled={state === "busy"}
        title={title}
        onClick={() => {
          setState("busy");
          make().then(
            ({ name, text }) => {
              download(name, text);
              setState("idle");
            },
            (error: unknown) => {
              setMessage(userMessage(error));
              setState("failed");
            },
          );
        }}
      >
        <Download size={14} aria-hidden="true" />
        {state === "busy" ? "Preparing…" : label}
      </button>
      {state === "failed" && (
        <span className="form-error" role="alert">
          {message}
        </span>
      )}
    </span>
  );
}

type View = "dates" | "recent" | "range";
const VIEWS = [
  { value: "dates", label: "These dates" },
  { value: "recent", label: "Recent" },
  { value: "range", label: "Pick dates" },
] as const;

/** How many earlier years "These dates" looks at. */
const YEARS = 20;
/** Days shown around the weekend: two before, the three days, two after. */
const AROUND = 2;

export function HistoryPage({
  track,
  period,
  onPeriod,
  weekendStart,
  now,
}: {
  track: Track;
  period: HistoryPeriod;
  onPeriod: (period: HistoryPeriod) => void;
  /** Midnight at the track of the weekend's first day. */
  weekendStart: number;
  now: number;
}) {
  const [view, setView] = useState<View>("dates");
  const zone = trackZone(track);
  const weekendDay = localDay(weekendStart, zone);
  return (
    <>
      <PageHeader
        eyebrow="History"
        title={track.name}
        subtitle="What the weather did here"
      >
        <Segmented<View>
          label="View"
          value={view}
          options={VIEWS}
          onChange={setView}
        />
      </PageHeader>
      <ChartGroup>
        {view === "dates" && (
          <SameDates key={track.id} track={track} weekendDay={weekendDay} />
        )}
        {view === "recent" && (
          <Recent track={track} period={period} onPeriod={onPeriod} now={now} />
        )}
        {view === "range" && (
          <Range
            key={track.id}
            track={track}
            weekendDay={weekendDay}
            today={localDay(now, zone)}
          />
        )}
      </ChartGroup>
    </>
  );
}

const share = (value: number | null) =>
  value === null ? "–" : `${Math.round(value * 100)}%`;

/** The colour of a day's rain, from nothing to a soaking. */
function rainShade(rain: number | null): React.CSSProperties {
  if (rain === null) return { background: "var(--hover)" };
  if (rain < 0.1) return { background: "var(--dry)" };
  // 0.1 mm is faint, 20 mm and more is full.
  const strength = Math.min(1, Math.log10(rain * 10) / Math.log10(200));
  return {
    background: `color-mix(in oklab, var(--rain) ${Math.round(18 + strength * 82)}%, transparent)`,
    color: strength > 0.5 ? "#fff" : undefined,
  };
}

/** The weekend's dates over the last 20 years: what is normal, and how much it varies. */
function SameDates({
  track,
  weekendDay,
}: {
  track: Track;
  weekendDay: string;
}) {
  const format = useFormat();
  const online = useOnline();
  const first = addDays(weekendDay, -AROUND);
  const length = WEEKEND_DAYS + 2 * AROUND;
  const year = Number(weekendDay.slice(0, 4));
  const years = Array.from({ length: YEARS }, (_, i) => year - YEARS + i);
  const result = useSameDates(track, first.slice(5), length, years);

  if (result.state === "loading")
    return <Loading label="Loading 20 years of these dates" rows={3} />;
  if (result.state === "failed")
    return (
      <Empty
        action={
          <button type="button" className="button" onClick={result.retry}>
            Try again
          </button>
        }
      >
        {online
          ? result.message
          : "Offline. These dates have not been loaded for this track yet."}
      </Empty>
    );

  // Each year's days in the same columns, with a gap where the archive has none.
  const found = [...result.value]
    .sort((a, b) => b.year - a.year)
    .map((item) => {
      const start = new Date(Date.parse(`${item.year}-01-01T00:00:00Z`));
      start.setUTCMonth(Number(first.slice(5, 7)) - 1, Number(first.slice(8)));
      const firstDay = start.toISOString().slice(0, 10);
      const byDay = new Map(item.days.map((day) => [day.day, day]));
      return {
        year: item.year,
        days: Array.from({ length }, (_, i) => byDay.get(addDays(firstDay, i))),
      };
    });
  const known = (days: (DailyWeather | undefined)[]) =>
    days.filter((day): day is DailyWeather => day !== undefined);
  // Only the weekend's own three days go into the summary.
  const weekendOnly: YearDays[] = found.map((item) => ({
    year: item.year,
    days: known(item.days.slice(AROUND, AROUND + WEEKEND_DAYS)),
  }));
  const normal = climate(weekendOnly);
  const columns = Array.from({ length }, (_, i) => addDays(first, i));
  const spread = (
    values: [number, number, number] | null,
    show: (value: number) => string,
  ) => (values ? `${show(values[0])} to ${show(values[2])}` : "–");
  const span = `${formatIsoDay(weekendDay)} to ${formatIsoDay(addDays(weekendDay, WEEKEND_DAYS - 1))}`;

  return (
    <>
      <Card
        title={`${span}, ${found.at(-1)!.year} to ${found[0].year}`}
        aside={
          <ExportButton
            title="One row per day and year"
            make={async () => ({
              name: csvName(
                track.name,
                `${found.at(-1)!.year}-${first.slice(5)}`,
                `${found[0].year}-${addDays(first, length - 1).slice(5)}`,
                "daily",
              ),
              text: dailyCsv(
                [
                  {
                    track: track.name,
                    days: [...found]
                      .reverse()
                      .flatMap((item) => known(item.days)),
                  },
                ],
                format,
              ),
            })}
          />
        }
      >
        <div className="stats">
          <Stat
            tone="rain"
            label="Days with rain"
            value={share(normal.rainShare)}
            detail={`${RAIN_DAY_MM} mm or more, over ${normal.days} days`}
          />
          <Stat
            tone="rain"
            label="Weekends with a rain day"
            value={share(normal.wetYearShare)}
            detail={`of ${normal.years} years`}
          />
          <Stat
            tone="temp"
            label="Usual high"
            value={
              normal.high
                ? `${format.temperatureNumber(normal.high[1])} ${format.temperatureUnit}`
                : "–"
            }
            detail={`Mostly ${spread(normal.high, format.temperatureNumber)} ${format.temperatureUnit}`}
          />
          <Stat
            tone="temp"
            label="Usual low"
            value={
              normal.low
                ? `${format.temperatureNumber(normal.low[1])} ${format.temperatureUnit}`
                : "–"
            }
            detail={`Mostly ${spread(normal.low, format.temperatureNumber)} ${format.temperatureUnit}`}
          />
          <Stat
            tone="wind"
            label="Usual strongest wind"
            value={
              normal.wind
                ? `${format.windNumber(normal.wind[1])} ${format.windUnit}`
                : "–"
            }
            detail={`Mostly ${spread(normal.wind, format.windNumber)} ${format.windUnit}`}
          />
        </div>
        <p className="card-foot muted">
          "Mostly" is the middle 80% of the days.
          {normal.wettest &&
            ` Wettest day: ${formatValue(normal.wettest.rain, "mm")} on ${formatIsoDate(normal.wettest.day)}.`}
        </p>
      </Card>

      <Card
        title="Year by year"
        aside={
          <span className="heat-key muted">
            Dry
            <i style={rainShade(0)} />
            <i style={rainShade(0.5)} />
            <i style={rainShade(3)} />
            <i style={rainShade(10)} />
            <i style={rainShade(30)} />
            Wet
          </span>
        }
      >
        <div className="table-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th scope="col">Year</th>
                {columns.map((day, i) => (
                  <th
                    key={day}
                    scope="col"
                    className={
                      i >= AROUND && i < AROUND + WEEKEND_DAYS ? "weekend" : ""
                    }
                  >
                    {formatIsoDay(day)}
                  </th>
                ))}
                <th scope="col" className="num">
                  High
                </th>
                <th scope="col" className="num">
                  Wind
                </th>
              </tr>
            </thead>
            <tbody>
              {found.map((item) => {
                const weekend = known(
                  item.days.slice(AROUND, AROUND + WEEKEND_DAYS),
                );
                const highs = weekend
                  .map((day) => day.temperatureMax)
                  .filter((value): value is number => value !== null);
                const winds = weekend
                  .map((day) => day.windMax)
                  .filter((value): value is number => value !== null);
                return (
                  <tr key={item.year}>
                    <th scope="row">{item.year}</th>
                    {columns.map((_, i) => {
                      const day = item.days[i];
                      return (
                        <td
                          key={i}
                          className={
                            i >= AROUND && i < AROUND + WEEKEND_DAYS
                              ? "weekend"
                              : ""
                          }
                        >
                          <span
                            className="heat-cell"
                            style={rainShade(day?.rain ?? null)}
                            title={
                              day
                                ? `${formatIsoDate(day.day)}: ${formatValue(day.rain, "mm")} of rain, ${format.temperature(day.temperatureMin)} to ${format.temperature(day.temperatureMax)}`
                                : "No value"
                            }
                          >
                            {day?.rain !== null && day?.rain !== undefined
                              ? day.rain < 0.1
                                ? ""
                                : formatNumber(day.rain, day.rain < 10 ? 1 : 0)
                              : "–"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="num">
                      {highs.length
                        ? format.temperature(Math.max(...highs))
                        : "–"}
                    </td>
                    <td className="num">
                      {winds.length ? format.wind(Math.max(...winds)) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="card-foot muted">
          Rain per day in mm; the three marked columns are the weekend. High and
          wind are the highest of those three days.
        </p>
      </Card>
      <HistoryCredit origin="archive" />
    </>
  );
}

function Recent({
  track,
  period,
  onPeriod,
  now,
}: {
  track: Track;
  period: HistoryPeriod;
  onPeriod: (period: HistoryPeriod) => void;
  now: number;
}) {
  const history = useHistory(track, period);
  const online = useOnline();
  const format = useFormat();
  const zone = trackZone(track);

  const controls = (
    <div className="toolbar">
      <PeriodSwitch period={period} onPeriod={onPeriod} />
      <span className="spacer" />
      {history.state === "ready" && history.value.origin === "archive" && (
        <ExportButton
          label="Export hourly CSV"
          title={`Every hour of the last ${period} days`}
          make={async () => {
            const today = localDay(now, zone);
            const start = addDays(today, -period);
            const end = addDays(today, -1);
            return {
              name: csvName(track.name, start, end, "hourly"),
              text: hourlyCsv(
                [
                  {
                    track: track.name,
                    zone,
                    hours: await loadHours(track, start, end),
                  },
                ],
                format,
              ),
            };
          }}
        />
      )}
    </div>
  );

  if (history.state === "loading")
    return (
      <>
        {controls}
        <Loading label="Loading the history" rows={3} />
      </>
    );
  if (history.state === "failed")
    return (
      <>
        {controls}
        <Empty>
          {online
            ? history.message
            : "Offline. History needs a connection for this track."}
        </Empty>
      </>
    );
  const { days, origin } = history.value;
  if (days.length < MIN_DAYS)
    return (
      <>
        {controls}
        <Empty>There is not enough history for this track yet.</Empty>
      </>
    );
  const summary = summarise(track.id, track.name, days);
  return (
    <>
      {controls}
      {origin === "bundled" && <Notice>{BUNDLED_NOTICE}</Notice>}
      <Card
        title={`${formatIsoWeekday(days[0].day)} to ${formatIsoWeekday(days.at(-1)!.day)}`}
      >
        <div className="stats">
          <Stat
            tone="rain"
            label="Total rain"
            value={formatValue(summary.totalRain, "mm")}
            detail={`over ${summary.days} days`}
          />
          <Stat
            tone="rain"
            label="Rain days"
            value={`${summary.rainDays} of ${summary.days}`}
            detail={`${RAIN_DAY_MM} mm or more`}
          />
          <Stat
            tone="temp"
            label="Average temperature"
            value={format.temperature(summary.averageTemperature)}
          />
          <Stat
            tone="wind"
            label="Strongest wind"
            value={format.wind(summary.strongestWind)}
          />
        </div>
      </Card>
      <Card title="Day by day">
        <DailyCharts days={days} sync="recent" />
      </Card>
      <HistoryCredit origin={origin} />
    </>
  );
}

/** Any dates since 1940, hour by hour: to line up with a past race weekend. */
function Range({
  track,
  weekendDay,
  today,
}: {
  track: Track;
  weekendDay: string;
  today: string;
}) {
  const format = useFormat();
  const online = useOnline();
  const zone = trackZone(track);
  const latest = addDays(today, -1);
  // To start with: the weekend's dates one year earlier.
  const [start, setStart] = useState(() => {
    const lastYear = `${Number(weekendDay.slice(0, 4)) - 1}${weekendDay.slice(4)}`;
    return parseDay(lastYear) === null ? addDays(weekendDay, -365) : lastYear;
  });
  const [end, setEnd] = useState(() => addDays(start, WEEKEND_DAYS - 1));

  const from = parseDay(start);
  const to = parseDay(end);
  let problem: string | null = null;
  if (from === null || to === null) problem = "Pick a first and a last day.";
  else if (to < from) problem = "The last day is before the first.";
  else if (start < FIRST_DAY) problem = "The archive starts on 1 January 1940.";
  else if (end > latest) problem = "The last day must be before today.";
  else if ((to - from) / DAY + 1 > MAX_RANGE_DAYS)
    problem = `Pick at most ${MAX_RANGE_DAYS} days at a time.`;

  const picked = problem === null;
  const result = useHours(picked ? [track] : [], start, end)[track.id];
  const length = picked ? (to! - from!) / DAY + 1 : 0;

  const controls = (
    <div className="toolbar range">
      <Field label="First day">
        <input
          type="date"
          value={start}
          min={FIRST_DAY}
          max={latest}
          onChange={(event) => setStart(event.target.value)}
        />
      </Field>
      <Field label="Last day">
        <input
          type="date"
          value={end}
          min={FIRST_DAY}
          max={latest}
          onChange={(event) => setEnd(event.target.value)}
        />
      </Field>
      <span className="spacer" />
      {picked && result?.state === "ready" && (
        <ExportButton
          label="Export hourly CSV"
          make={async () => ({
            name: csvName(track.name, start, end, "hourly"),
            text: hourlyCsv(
              [{ track: track.name, zone, hours: result.value }],
              format,
            ),
          })}
        />
      )}
    </div>
  );

  if (!picked)
    return (
      <>
        {controls}
        <Empty>{problem}</Empty>
      </>
    );
  if (!result || result.state === "loading")
    return (
      <>
        {controls}
        <Loading label="Loading these days" rows={3} />
      </>
    );
  if (result.state === "failed")
    return (
      <>
        {controls}
        <Empty>
          {online
            ? result.message
            : "Offline. Past weather needs a connection."}
        </Empty>
      </>
    );
  const hours = result.value;
  if (hours.length === 0)
    return (
      <>
        {controls}
        <Empty>The archive has nothing for these days.</Empty>
      </>
    );
  const days = hoursToDays(hours, (time) => localDay(time, zone));
  const summary = summarise(track.id, track.name, days);
  return (
    <>
      {controls}
      <Card title={`${formatIsoDate(start)} to ${formatIsoDate(end)}`}>
        <div className="stats">
          <Stat
            tone="rain"
            label="Total rain"
            value={formatValue(summary.totalRain, "mm")}
            detail={`${summary.rainDays} of ${summary.days} days with ${RAIN_DAY_MM} mm or more`}
          />
          <Stat
            tone="temp"
            label="Average temperature"
            value={format.temperature(summary.averageTemperature)}
          />
          <Stat
            tone="wind"
            label="Strongest wind"
            value={format.wind(summary.strongestWind)}
          />
        </div>
      </Card>
      {length <= 10 ? (
        <Card title="Hour by hour">
          <HourlyCharts
            hours={hours}
            from={zonedTime(start, 0, zone)}
            to={zonedTime(addDays(end, 1), 0, zone)}
            zone={zone}
            sync="range"
          />
        </Card>
      ) : (
        <Card
          title="Day by day"
          aside={
            <span className="muted">
              Ranges of 10 days or less show every hour; the CSV always has them
            </span>
          }
        >
          <DailyCharts days={days} sync="range" />
        </Card>
      )}
      <HistoryCredit origin="archive" />
    </>
  );
}
