import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  directionVotes,
  voteText,
  type DirectionVote,
} from "../lib/dashboard.ts";
import {
  formatDay,
  formatDayTime,
  formatClock,
  formatValue,
} from "../lib/format.ts";
import type { Session } from "../lib/sessions.ts";
import type { CombinedWindow, Estimate } from "../lib/stats.ts";
import type { ForecastPoint } from "../lib/types.ts";
import { DAY, WINDOW } from "../lib/windows.ts";

interface Row {
  time: number;
  temperature: number | null;
  temperatureBand: [number, number] | null;
  temperatureEstimate: Estimate | null;
  rain: number | null;
  rainEstimate: Estimate | null;
  wind: number | null;
  windBand: [number, number] | null;
  windEstimate: Estimate | null;
  providers: number;
  rainProviders: number;
  vote: DirectionVote | null;
}

const band = (value: Estimate): [number, number] | null =>
  value.low === null || value.high === null ? null : [value.low, value.high];

function rows(windows: CombinedWindow[], points: ForecastPoint[]): Row[] {
  const data: Row[] = windows.map((window) => ({
    time: window.time,
    temperature: window.temperature.mean,
    temperatureBand: band(window.temperature),
    temperatureEstimate: window.temperature,
    rain: window.rain.mean,
    rainEstimate: window.rain,
    wind: window.windKmh.mean,
    windBand: band(window.windKmh),
    windEstimate: window.windKmh,
    providers: window.providers,
    rainProviders: window.rainProviders,
    vote: directionVotes(points.filter((point) => point.time === window.time)),
  }));
  // Rain is a total over the window, drawn as a step from its start to its end,
  // so the last window needs a closing point.
  const last = data.at(-1);
  if (last)
    data.push({
      ...last,
      time: last.time + WINDOW,
      temperature: null,
      temperatureBand: null,
      wind: null,
      windBand: null,
      temperatureEstimate: null,
      windEstimate: null,
      rainEstimate: null,
      vote: null,
    });
  return data;
}

/** A y-domain from the means only, so a wide interval is clipped instead of flattening the line. */
function domain(
  values: (number | null)[],
  minimumSpan: number,
  floor?: number,
): [number, number] {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return [floor ?? 0, (floor ?? 0) + minimumSpan];
  let low = Math.min(...present);
  let high = Math.max(...present);
  const pad = Math.max(minimumSpan - (high - low), 0) / 2 + (high - low) * 0.25;
  low -= pad;
  high += pad;
  if (floor !== undefined) low = Math.max(floor, low);
  return [Math.floor(low), Math.ceil(high)];
}

const axisProps = {
  stroke: "var(--text-3)",
  tick: { fill: "var(--text-3)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function TimeAxis({ start, hide }: { start: number; hide?: boolean }) {
  const ticks = [0, 1, 2, 3].map((day) => start + day * DAY);
  return (
    <XAxis
      dataKey="time"
      type="number"
      scale="time"
      domain={[start, start + 3 * DAY]}
      ticks={ticks}
      tickFormatter={(value: number) => formatDay(value)}
      allowDataOverflow
      hide={hide}
      {...axisProps}
    />
  );
}

function sessionLines(sessions: Session[], labels: boolean) {
  return sessions.map((session) => (
    <ReferenceLine
      key={session.name}
      x={session.start}
      stroke="var(--text-3)"
      strokeDasharray="3 4"
      strokeWidth={1}
      label={
        labels
          ? {
              value: session.name === "Qualifying" ? "Q" : session.name,
              position: "insideTopLeft",
              fill: "var(--text-2)",
              fontSize: 11,
            }
          : undefined
      }
    />
  ));
}

function windowLabel(time: number) {
  return `${formatDayTime(time)}–${formatClock(time + WINDOW)}`;
}

function interval(value: Estimate | null, unit: string) {
  if (!value || value.low === null || value.high === null) return null;
  return `${formatValue(value.low, "", 1).trim()}–${formatValue(value.high, unit, 1)}`;
}

function ForecastTooltip({
  active,
  payload,
  kind,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  kind: "weather" | "wind";
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row || row.temperatureEstimate === null) return null;
  const providers = `${row.providers} provider${row.providers === 1 ? "" : "s"}`;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{windowLabel(row.time)}</div>
      {kind === "weather" ? (
        <>
          <TooltipRow
            color="var(--temp)"
            label="Temperature"
            value={formatValue(row.temperature, "°C")}
            detail={interval(row.temperatureEstimate, "°C")}
          />
          <TooltipRow
            color="var(--rain)"
            label="Rain"
            value={formatValue(row.rain, "mm")}
            detail={`${row.rainProviders} of ${row.providers} predict rain`}
          />
        </>
      ) : (
        <>
          <TooltipRow
            color="var(--wind)"
            label="Wind"
            value={formatValue(row.wind, "km/h", 0)}
            detail={interval(row.windEstimate, "km/h")}
          />
          <TooltipRow
            label="From"
            value={row.vote ? row.vote.sector : "Unknown"}
            detail={row.vote ? voteText(row.vote) : null}
          />
        </>
      )}
      <div className="tooltip-foot">{providers}</div>
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
  detail,
}: {
  color?: string;
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="tooltip-row">
      <span className="tooltip-key">
        {color && <i style={{ background: color }} aria-hidden="true" />}
        {label}
      </span>
      <span className="tooltip-value">{value}</span>
      {detail && <span className="tooltip-detail">{detail}</span>}
    </div>
  );
}

const margin = { top: 8, right: 12, bottom: 0, left: 0 };
const cursor = { stroke: "var(--border-strong)", strokeWidth: 1 };

interface ChartProps {
  windows: CombinedWindow[];
  points: ForecastPoint[];
  sessions: Session[];
  start: number;
}

/** Temperature and rain as two panels on one time axis, never on two y-axes. */
export function RainTemperatureChart({
  windows,
  points,
  sessions,
  start,
}: ChartProps) {
  const data = rows(windows, points);
  const rainTop = Math.max(
    0.5,
    Math.max(0, ...data.map((row) => row.rain ?? 0)) * 1.2,
  );
  return (
    <div className="chart-stack">
      <div className="chart-label">
        <i style={{ background: "var(--temp)" }} aria-hidden="true" />{" "}
        Temperature, °C
        <span className="legend-band" aria-hidden="true" /> 95% interval
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} syncId="weekend" margin={margin}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <TimeAxis start={start} hide />
          <YAxis
            width={36}
            domain={domain(
              data.map((row) => row.temperature),
              6,
            )}
            allowDataOverflow
            {...axisProps}
          />
          {sessionLines(sessions, true)}
          <Area
            dataKey="temperatureBand"
            stroke="none"
            fill="var(--temp)"
            fillOpacity={0.1}
            isAnimationActive={false}
            activeDot={false}
            connectNulls={false}
          />
          <Line
            dataKey="temperature"
            stroke="var(--temp)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
            type="monotone"
          />
          <Tooltip
            content={<ForecastTooltip kind="weather" />}
            cursor={cursor}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-label">
        <i style={{ background: "var(--rain)" }} aria-hidden="true" /> Rain, mm
        per 3 hours
      </div>
      <ResponsiveContainer width="100%" height={130}>
        <ComposedChart data={data} syncId="weekend" margin={margin}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <TimeAxis start={start} />
          <YAxis
            width={36}
            domain={[0, Number(rainTop.toFixed(1))]}
            allowDataOverflow
            {...axisProps}
            tickFormatter={(value: number) => String(Number(value.toFixed(1)))}
          />
          {sessionLines(sessions, false)}
          <Area
            dataKey="rain"
            type="stepAfter"
            stroke="var(--rain)"
            strokeWidth={1.5}
            fill="var(--rain)"
            fillOpacity={0.28}
            isAnimationActive={false}
            activeDot={false}
          />
          <Tooltip
            content={<ForecastTooltip kind="weather" />}
            cursor={cursor}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WindChart({ windows, points, sessions, start }: ChartProps) {
  const data = rows(windows, points);
  return (
    <div className="chart-stack">
      <div className="chart-label">
        <i style={{ background: "var(--wind)" }} aria-hidden="true" /> Wind,
        km/h
        <span className="legend-band wind" aria-hidden="true" /> 95% interval
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} syncId="weekend" margin={margin}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <TimeAxis start={start} />
          <YAxis
            width={36}
            domain={domain(
              data.map((row) => row.wind),
              10,
              0,
            )}
            allowDataOverflow
            {...axisProps}
          />
          {sessionLines(sessions, true)}
          <Area
            dataKey="windBand"
            stroke="none"
            fill="var(--wind)"
            fillOpacity={0.1}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="wind"
            stroke="var(--wind)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
            type="monotone"
          />
          <Tooltip
            content={<ForecastTooltip kind="wind" />}
            cursor={cursor}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
