import { LANE_PX, swarm } from "../lib/swarm.ts";
import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  rainText,
  rangeText,
  sessionMessage,
  sourceRows,
  sourcesText,
} from "../lib/dashboard.ts";
import {
  formatClock,
  formatCountdown,
  formatDayTime,
  formatNumber,
  formatValue,
  formatWeekday,
} from "../lib/format.ts";
import { centreSeries, QUARTER } from "../lib/rain-map.ts";
import { formatLength, type Session } from "../lib/sessions.ts";
import { useFormat } from "../lib/settings.tsx";
import { centreOf } from "../lib/sources.ts";
import {
  byCentre,
  combineForecasts,
  combinePeriod,
  combineWindow,
  confidence,
  RAIN_THRESHOLD_MM,
  type CombinedPeriod,
  type Confidence,
  type Estimate,
} from "../lib/stats.ts";
import type { ForecastPoint, Track } from "../lib/types.ts";
import { useForecast, useRadar, useRainGrid } from "../lib/use-data.ts";
import { COMPASS_SECTORS, voteText } from "../lib/wind.ts";
import { HOUR, windowStart } from "../lib/windows.ts";
import { trackZone, zoneName } from "../lib/zone.ts";
import {
  ChartGroup,
  QuarterRainChart,
  RainChart,
  TemperatureChart,
  WindChart,
} from "./ForecastCharts.tsx";
import { RainMap, type RainMode } from "./Maps.tsx";
import {
  Card,
  ConfidenceBadge,
  Empty,
  Loading,
  Notice,
  PageHeader,
  RefreshButton,
  Stat,
  Warnings,
} from "./ui.tsx";
import { trackSubtitle } from "./WeekendOverview.tsx";
import { WindMap } from "./WindMap.tsx";

interface Props {
  track: Track;
  sessions: Session[];
  index: number;
  onIndex: (index: number) => void;
  now: number;
}

/** How long before and after the session the maps and the timeline reach. */
const BUFFER = HOUR;
/** How far the charts reach on either side. */
const CHART_BUFFER = 3 * HOUR;

export function SessionDashboard({
  track,
  sessions,
  index,
  onIndex,
  now,
}: Props) {
  const { data, refresh, online } = useForecast(track);
  const session = sessions[index];
  const zone = trackZone(track);

  return (
    <>
      <PageHeader
        eyebrow="Session dashboard"
        title={track.name}
        subtitle={`${trackSubtitle(track)} · times in ${zoneName(session.start, zone)}`}
      >
        <RefreshButton
          fetchedAt={data.state === "ready" ? data.value.fetchedAt : undefined}
          onRefresh={refresh}
          busy={data.state === "loading"}
          zone={zone}
        />
      </PageHeader>

      <div className="session-nav">
        <button
          type="button"
          className="icon-button large"
          onClick={() => onIndex(index - 1)}
          disabled={index === 0}
          aria-label="Previous session"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="session-picker" role="tablist" aria-label="Session">
          {sessions.map((item, i) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={i === index}
              className="session-pick"
              onClick={() => onIndex(i)}
            >
              <span className="pick-name">{item.name}</span>
              <span className="pick-time">
                {formatWeekday(item.start, zone)}{" "}
                {formatClock(item.start, zone)}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-button large"
          onClick={() => onIndex(index + 1)}
          disabled={index === sessions.length - 1}
          aria-label="Next session"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="session-title" aria-live="polite">
        <strong>{session.name}</strong> · {formatDayTime(session.start, zone)}–
        {formatClock(session.end, zone)} ·{" "}
        {formatLength((session.end - session.start) / 60_000)} ·{" "}
        {session.end <= now
          ? "over"
          : session.start <= now
            ? "under way"
            : formatCountdown(now, session.start)}
      </p>

      {data.state === "loading" ? (
        <Loading label="Fetching the forecasts" rows={3} />
      ) : data.state === "failed" ? (
        <Empty
          action={
            <button type="button" className="button" onClick={refresh}>
              Try again
            </button>
          }
        >
          {data.message}
        </Empty>
      ) : (
        <>
          {data.value.saved ? (
            <Notice>
              {online ? "The weather services cannot be reached." : "Offline."}{" "}
              Showing the forecast from{" "}
              {formatDayTime(data.value.fetchedAt, zone)}.
            </Notice>
          ) : (
            <Warnings messages={data.value.failures} />
          )}
          <SessionView
            // A new session starts with its own timeline.
            key={`${session.name}-${session.start}`}
            track={track}
            sessions={sessions}
            session={session}
            points={data.value.points}
            now={now}
            zone={zone}
          />
        </>
      )}
    </>
  );
}

function verdict(combined: CombinedPeriod): string {
  const { rainVotes: votes, rainVoters: of } = combined;
  if (of === 0) return "No forecast gives rain for this session yet.";
  if (votes === 0)
    return `Dry: none of the ${of} forecasting centres expects rain.`;
  if (votes === of) return `Wet: all ${of} forecasting centres expect rain.`;
  const share = votes / of;
  if (share >= 0.66)
    return `Rain is likely: ${votes} of ${of} centres expect it.`;
  if (share <= 0.34)
    return `Probably dry: ${votes} of ${of} centres expect${votes === 1 ? "s" : ""} rain.`;
  return `Could go either way: ${votes} of ${of} centres expect rain.`;
}

function SessionView({
  track,
  sessions,
  session,
  points,
  now,
  zone,
}: {
  track: Track;
  sessions: Session[];
  session: Session;
  points: readonly ForecastPoint[];
  now: number;
  zone: string;
}) {
  const format = useFormat();
  const centre = (source: string) => centreOf(source, track);
  const combined = useMemo(
    () => combinePeriod(points, session.start, session.end, centre),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, session.start, session.end, track.id],
  );
  const before = useMemo(
    () =>
      combinePeriod(points, session.start - 3 * HOUR, session.start, centre),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, session.start, track.id],
  );

  // The timeline: from an hour before to an hour after, in 15-minute steps.
  const first = Math.floor((session.start - BUFFER) / QUARTER) * QUARTER;
  const last = Math.ceil((session.end + BUFFER) / QUARTER) * QUARTER;
  const steps = (last - first) / QUARTER;
  const [step, setStep] = useState(() =>
    Math.round((session.start - first) / QUARTER),
  );
  const [playing, setPlaying] = useState(false);
  const at = first + step * QUARTER;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setStep((value) => (value >= steps ? 0 : value + 1)),
      700,
    );
    return () => clearInterval(timer);
  }, [playing, steps]);

  const over = session.end <= windowStart(now);
  const grid = useRainGrid(track, first, last, !over);
  const radar = useRadar();
  // Radar is the better picture once the session is close or under way.
  const [mode, setMode] = useState<RainMode>(() =>
    session.start - now <= 2 * HOUR && session.end > now ? "radar" : "forecast",
  );

  const message = sessionMessage(session.end, now, combined.rows);
  if (message) return <Empty>{message}</Empty>;

  const from = windowStart(session.start) - CHART_BUFFER;
  const to = Math.ceil(session.end / HOUR) * HOUR + CHART_BUFFER;
  const windows = combineForecasts(
    points.filter((point) => point.time >= from && point.time <= to),
    centre,
  );
  const chart = {
    windows,
    sessions,
    from,
    to,
    zone,
    focus: session,
    sync: "session",
  };

  // The hour the timeline is on, for the wind map.
  const hour = windowStart(at);
  const hourRows = points.filter((point) => point.time === hour);
  const hourWindow = hourRows.length
    ? combineWindow(hour, hourRows, centre)
    : null;
  const hourCentres = byCentre(hourRows, centre);

  const grades = confidence(combined);
  const centres = byCentre(combined.rows, centre);
  const groups = sourceRows(combined.rows, centre);
  const vote = combined.direction;
  const quarter =
    grid.state === "ready"
      ? centreSeries(grid.value).filter(
          (point) => point.time >= from && point.time < to,
        )
      : [];

  return (
    <>
      <Card className="verdict-card" label="Combined">
        <div className="verdict">
          <div>
            <p className="verdict-text">{verdict(combined)}</p>
            <p className="muted">
              {sourcesText(combined)} · values for the whole session (
              {combined.hours === 1 ? "1 hour" : `${combined.hours} hours`})
            </p>
          </div>
          <ConfidenceBadge level={grades.overall} />
        </div>
        <div className="stats">
          <Stat
            tone="rain"
            label="Rain"
            aside={<ConfidenceBadge level={grades.rain} short />}
            value={formatValue(combined.rain.value, "mm")}
            detail={
              <>
                {rainText(combined)}
                <br />
                {rangeText(combined.rain, "mm", (value) => formatNumber(value))}
              </>
            }
          />
          <Stat
            tone="temp"
            label="Temperature"
            aside={<ConfidenceBadge level={grades.temperature} short />}
            value={format.temperature(combined.temperature.value)}
            detail={rangeText(
              combined.temperature,
              format.temperatureUnit,
              format.temperatureNumber,
            )}
          />
          <Stat
            tone="wind"
            label="Wind"
            aside={<ConfidenceBadge level={grades.wind} short />}
            value={format.wind(combined.wind.value)}
            detail={rangeText(
              combined.wind,
              format.windUnit,
              format.windNumber,
            )}
          />
          <Stat
            tone="wind"
            label="Wind from"
            value={vote ? vote.sector : "Unknown"}
            detail={vote ? voteText(vote) : undefined}
          >
            {vote && (
              <ArrowUp
                className="wind-arrow"
                size={20}
                aria-hidden="true"
                // The arrow points where the wind blows to.
                style={{
                  transform: `rotate(${COMPASS_SECTORS.indexOf(vote.sector) * 45 + 180}deg)`,
                }}
              />
            )}
          </Stat>
          <Stat
            tone="rain"
            label="Rain in the 3 hours before"
            value={formatValue(before.rain.value, "mm")}
            detail={
              before.rainVoters
                ? `${rainText(before)}: ${before.rainVotes * 2 >= before.rainVoters ? "the track may still be damp" : "a dry track is likely"}`
                : "No value"
            }
          />
        </div>
      </Card>

      <div className="timeline" role="group" aria-label="Timeline of the maps">
        <button
          type="button"
          className="icon-button large play"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
        >
          {playing ? (
            <Pause size={16} aria-hidden="true" />
          ) : (
            <Play size={16} aria-hidden="true" />
          )}
        </button>
        <span className="timeline-end">{formatClock(first, zone)}</span>
        <div className="timeline-track">
          <span
            className="timeline-session"
            aria-hidden="true"
            style={{
              left: `${((session.start - first) / (last - first)) * 100}%`,
              width: `${((session.end - session.start) / (last - first)) * 100}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={steps}
            step={1}
            value={step}
            aria-label="Time shown on the maps"
            aria-valuetext={formatClock(at, zone)}
            onChange={(event) => {
              setPlaying(false);
              setStep(Number(event.target.value));
            }}
          />
        </div>
        <span className="timeline-end">{formatClock(last, zone)}</span>
        <output className="timeline-now">{formatClock(at, zone)}</output>
      </div>

      <div className="map-grid">
        <RainMap
          track={track}
          grid={
            over ? { state: "failed", message: "the session is over." } : grid
          }
          radar={radar}
          at={at}
          mode={mode}
          onMode={setMode}
          zone={zone}
        />
        <WindMap
          track={track}
          window={hourWindow}
          centres={hourCentres}
          hour={hour}
          zone={zone}
        />
      </div>

      <ChartGroup>
        <Card
          title="Rain and temperature around the session"
          aside={
            <span className="muted">
              Rain counts from {RAIN_THRESHOLD_MM} mm in an hour
            </span>
          }
        >
          <div className="chart-stack">
            <TemperatureChart {...chart} height={170} />
            <RainChart {...chart} />
            {quarter.length > 0 && (
              <QuarterRainChart {...chart} points={quarter} />
            )}
          </div>
        </Card>
        <Card title="Wind around the session">
          <WindChart {...chart} height={190} />
        </Card>
      </ChartGroup>

      <Card
        title="How far the forecasts are apart"
        aside={
          <span className="muted">
            One dot per forecasting centre, for the whole session
          </span>
        }
      >
        <div className="spreads">
          <Spread
            label="Rain"
            unit="mm"
            tone="rain"
            level={grades.rain}
            estimate={combined.rain}
            items={centres.map((item) => ({
              name: item.centre,
              value: item.rain,
            }))}
            show={(value) => formatNumber(value)}
            floor={0}
            minimumSpan={1}
          />
          <Spread
            label="Temperature"
            unit={format.temperatureUnit}
            tone="temp"
            level={grades.temperature}
            estimate={combined.temperature}
            items={centres.map((item) => ({
              name: item.centre,
              value:
                item.temperature === null
                  ? null
                  : format.toTemperature(item.temperature),
            }))}
            convert={format.toTemperature}
            show={(value) => formatNumber(value)}
            minimumSpan={format.toTemperatureDifference(4)}
          />
          <Spread
            label="Wind"
            unit={format.windUnit}
            tone="wind"
            level={grades.wind}
            estimate={combined.wind}
            items={centres.map((item) => ({
              name: item.centre,
              value:
                item.windSpeed === null ? null : format.toWind(item.windSpeed),
            }))}
            convert={format.toWind}
            show={(value) => formatNumber(value, format.windDigits)}
            floor={0}
            minimumSpan={format.toWind(4)}
          />
        </div>
      </Card>

      <Card
        title="By source"
        aside={
          <span className="muted">
            Mean over the session; rain is its total
          </span>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Centre</th>
                <th scope="col" className="num">
                  Temperature
                </th>
                <th scope="col" className="num">
                  Rain
                </th>
                <th scope="col" className="num">
                  Wind
                </th>
                <th scope="col">From</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) =>
                group.rows.map((row) => (
                  <tr key={row.source}>
                    <th scope="row">
                      {row.label}
                      {row.via && <span className="via">{row.via}</span>}
                    </th>
                    <td className="centre">{group.centre}</td>
                    <td className="num">
                      {format.temperature(row.temperature)}
                    </td>
                    <td
                      className={`num ${row.rain !== null && row.rain >= RAIN_THRESHOLD_MM ? "wet" : ""}`}
                    >
                      {formatValue(row.rain, "mm")}
                    </td>
                    <td className="num">{format.wind(row.windSpeed)}</td>
                    <td>{row.windFrom ?? "–"}</td>
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Combined</th>
                <td className="centre">
                  {combined.centres} centre{combined.centres === 1 ? "" : "s"}
                </td>
                <td className="num">
                  {format.temperature(combined.temperature.value)}
                </td>
                <td className="num">
                  {formatValue(combined.rain.value, "mm")}
                </td>
                <td className="num">{format.wind(combined.wind.value)}</td>
                <td>{vote ? vote.sector : "–"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

/** Every centre's value on one line: where they bunch, and who is apart. */
function Spread({
  label,
  unit,
  tone,
  level,
  estimate,
  items,
  convert = (value) => value,
  show,
  floor,
  minimumSpan,
}: {
  label: string;
  unit: string;
  tone: "rain" | "temp" | "wind";
  level: Confidence;
  estimate: Estimate;
  /** Already in the shown unit. */
  items: { name: string; value: number | null }[];
  /** Turns the estimate's values into the shown unit. */
  convert?: (value: number) => number;
  show: (value: number) => string;
  floor?: number;
  minimumSpan: number;
}) {
  const present = items.filter(
    (item): item is { name: string; value: number } => item.value !== null,
  );
  if (present.length === 0)
    return (
      <div className="spread">
        <div className="spread-head">
          <span className="spread-label">{label}</span>
          <span className="muted">No value</span>
        </div>
      </div>
    );
  const values = present.map((item) => item.value);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const pad = Math.max(minimumSpan - (high - low), 0) / 2 + (high - low) * 0.08;
  low -= pad;
  high += pad;
  if (floor !== undefined && low < floor) {
    high += floor - low;
    low = floor;
  }
  const x = (value: number) => ((value - low) / (high - low)) * 100;
  const middle = estimate.value === null ? null : convert(estimate.value);
  const sorted = [...present].sort((a, b) => a.value - b.value);
  const placed = swarm(sorted.map((item) => x(item.value)));
  return (
    <div className={`spread ${tone}`}>
      <div className="spread-head">
        <span className="spread-label">{label}</span>
        <ConfidenceBadge level={level} />
        <span className="spread-range muted">
          {show(sorted[0].value)} to {show(sorted.at(-1)!.value)} {unit}
        </span>
      </div>
      <div
        className="spread-line"
        role="img"
        aria-label={`${label} by centre: ${sorted.map((item) => `${item.name} ${show(item.value)} ${unit}`).join(", ")}`}
      >
        {estimate.low !== null && estimate.high !== null && (
          <span
            className="spread-band"
            style={{
              left: `${x(convert(estimate.low))}%`,
              width: `${Math.max(0.6, x(convert(estimate.high)) - x(convert(estimate.low)))}%`,
            }}
          />
        )}
        {middle !== null && (
          <span className="spread-median" style={{ left: `${x(middle)}%` }} />
        )}
        {sorted.map((item, i) => (
          <span
            key={item.name}
            className="spread-dot"
            style={{
              left: `${placed[i].x}%`,
              marginTop: `${placed[i].lane * LANE_PX - 4.5}px`,
            }}
            title={`${item.name}: ${show(item.value)} ${unit}`}
          />
        ))}
      </div>
      <div className="spread-ends muted">
        <span>
          {sorted[0].name} {show(sorted[0].value)}
        </span>
        {middle !== null && (
          <span className="spread-middle">
            Middle {show(middle)} {unit}
          </span>
        )}
        <span>
          {sorted.at(-1)!.name} {show(sorted.at(-1)!.value)}
        </span>
      </div>
    </div>
  );
}
