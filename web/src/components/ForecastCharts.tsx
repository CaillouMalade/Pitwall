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
import { rainText, rangeText, sourcesText } from "../lib/dashboard.ts";
import {
  formatClock,
  formatDay,
  formatDayTime,
  formatNumber,
  formatValue,
  niceTicks,
  type UnitFormat,
} from "../lib/format.ts";
import { WEEKEND_DAYS, type Session } from "../lib/sessions.ts";
import { useFormat } from "../lib/settings.tsx";
import type { CombinedWindow, Estimate } from "../lib/stats.ts";
import { voteText } from "../lib/wind.ts";
import { DAY, WINDOW } from "../lib/windows.ts";

interface Row {
  time: number;
  /** Null on the closing point that only ends the last rain step. */
  window: CombinedWindow | null;
  temperature: number | null;
  temperatureBand: [number, number] | null;
  rain: number | null;
  rainBand: [number, number] | null;
  wind: number | null;
  windBand: [number, number] | null;
}

function band(
  value: Estimate,
  convert: (value: number) => number = (value) => value,
): [number, number] | null {
  return value.low === null || value.high === null
    ? null
    : [convert(value.low), convert(value.high)];
}

const converted = (value: number | null, convert: (value: number) => number) =>
  value === null ? null : convert(value);

function rows(windows: CombinedWindow[], format: UnitFormat): Row[] {
  const data: Row[] = windows.map((window) => ({
    time: window.time,
    window,
    temperature: converted(window.temperature.value, format.toTemperature),
    temperatureBand: band(window.temperature, format.toTemperature),
    rain: window.rain.value,
    rainBand: band(window.rain),
    wind: converted(window.wind.value, format.toWind),
    windBand: band(window.wind, format.toWind),
  }));
  // Rain is a total over the window, drawn as a step from its start to its end,
  // so the last window needs a closing point.
  const last = data.at(-1);
  if (last)
    data.push({
      ...last,
      time: last.time + WINDOW,
      window: null,
      temperature: null,
      temperatureBand: null,
      wind: null,
      windBand: null,
    });
  return data;
}

/** Even y-axis ticks that hold the line and its range, with some air around them. */
function ticksFor(
  data: Row[],
  line: "temperature" | "wind",
  minimumSpan: number,
  floor?: number,
): number[] {
  const values = data.flatMap((row) => [
    row[line],
    ...(row[`${line}Band`] ?? []),
  ]);
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return niceTicks(floor ?? 0, (floor ?? 0) + minimumSpan);
  let low = Math.min(...present);
  let high = Math.max(...present);
  const pad = Math.max(minimumSpan - (high - low), 0) / 2 + (high - low) * 0.12;
  low -= pad;
  high += pad;
  if (floor !== undefined) low = Math.max(floor, low);
  return niceTicks(low, high);
}

/** The axis settings for a list of ticks: they are also the ends of the axis. */
const yAxis = (ticks: number[]) => ({
  ticks,
  domain: [ticks[0], ticks.at(-1)!] as [number, number],
  interval: 0 as const,
});

const axisProps = {
  stroke: "var(--text-3)",
  tick: { fill: "var(--text-3)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function TimeAxis({ start, hide }: { start: number; hide?: boolean }) {
  const ticks = Array.from(
    { length: WEEKEND_DAYS + 1 },
    (_, day) => start + day * DAY,
  );
  return (
    <XAxis
      dataKey="time"
      type="number"
      scale="time"
      domain={[start, start + WEEKEND_DAYS * DAY]}
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

function ForecastTooltip({
  active,
  payload,
  kind,
  format,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  kind: "weather" | "wind";
  format: UnitFormat;
}) {
  const window = payload?.[0]?.payload.window;
  if (!active || !window) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{windowLabel(window.time)}</div>
      {kind === "weather" ? (
        <>
          <TooltipRow
            color="var(--temp)"
            label="Temperature"
            value={format.temperature(window.temperature.value)}
            detail={rangeText(
              window.temperature,
              format.temperatureUnit,
              format.temperatureNumber,
            )}
          />
          <TooltipRow
            color="var(--rain)"
            label="Rain"
            value={formatValue(window.rain.value, "mm")}
            detail={rainText(window)}
          />
        </>
      ) : (
        <>
          <TooltipRow
            color="var(--wind)"
            label="Wind"
            value={format.wind(window.wind.value)}
            detail={rangeText(window.wind, format.windUnit, format.windNumber)}
          />
          <TooltipRow
            label="From"
            value={window.direction ? window.direction.sector : "Unknown"}
            detail={window.direction ? voteText(window.direction) : null}
          />
        </>
      )}
      <div className="tooltip-foot">{sourcesText(window)}</div>
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

const margin = { top: 8, right: 12, bottom: 6, left: 0 };
const cursor = { stroke: "var(--border-strong)", strokeWidth: 1 };

interface ChartProps {
  windows: CombinedWindow[];
  sessions: Session[];
  start: number;
}

/** A sentence for screen readers, since the drawing itself says nothing to them. */
function summary(
  what: string,
  values: (number | null)[],
  show: (value: number) => string,
  unit: string,
): string {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return `${what}: no values.`;
  return `${what} over the weekend: from ${show(Math.min(...present))} to ${show(Math.max(...present))} ${unit}.`;
}

/** Temperature and rain as two panels on one time axis, never on two y-axes. */
export function RainTemperatureChart({ windows, sessions, start }: ChartProps) {
  const format = useFormat();
  const data = rows(windows, format);
  const rainTicks = niceTicks(
    0,
    Math.max(
      1,
      ...data.map((row) => Math.max(row.rainBand?.[1] ?? 0, row.rain ?? 0)),
    ),
    3,
  );
  return (
    <div className="chart-stack">
      <div className="chart-label">
        <i style={{ background: "var(--temp)" }} aria-hidden="true" />{" "}
        Temperature, {format.temperatureUnit}
        <span className="legend-band" aria-hidden="true" /> 80% range
      </div>
      <div
        role="img"
        aria-label={summary(
          "Temperature",
          windows.map((window) => window.temperature.value),
          format.temperatureNumber,
          format.temperatureUnit,
        )}
      >
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={data} syncId="weekend" margin={margin}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <TimeAxis start={start} hide />
            <YAxis
              width={36}
              {...yAxis(ticksFor(data, "temperature", 6))}
              allowDataOverflow
              {...axisProps}
            />
            {sessionLines(sessions, true)}
            <Area
              dataKey="temperatureBand"
              stroke="none"
              fill="var(--temp)"
              fillOpacity={0.16}
              isAnimationActive={false}
              activeDot={false}
              connectNulls={false}
              type="monotone"
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
              content={<ForecastTooltip kind="weather" format={format} />}
              cursor={cursor}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-label">
        <i style={{ background: "var(--rain)" }} aria-hidden="true" /> Rain, mm
        per 3 hours
        <span className="legend-band rain" aria-hidden="true" /> 80% range
      </div>
      <div
        role="img"
        aria-label={summary(
          "Rain per 3 hours",
          windows.map((window) => window.rain.value),
          (value) => formatNumber(value),
          "mm",
        )}
      >
        <ResponsiveContainer width="100%" height={130}>
          <ComposedChart data={data} syncId="weekend" margin={margin}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <TimeAxis start={start} />
            <YAxis
              width={36}
              {...yAxis(rainTicks)}
              allowDataOverflow
              {...axisProps}
            />
            {sessionLines(sessions, false)}
            <Area
              dataKey="rainBand"
              type="stepAfter"
              stroke="none"
              fill="var(--rain)"
              fillOpacity={0.14}
              isAnimationActive={false}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              dataKey="rain"
              type="stepAfter"
              stroke="var(--rain)"
              strokeWidth={1.5}
              fill="var(--rain)"
              fillOpacity={0.32}
              isAnimationActive={false}
              activeDot={false}
            />
            <Tooltip
              content={<ForecastTooltip kind="weather" format={format} />}
              cursor={cursor}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function WindChart({ windows, sessions, start }: ChartProps) {
  const format = useFormat();
  const data = rows(windows, format);
  return (
    <div className="chart-stack">
      <div className="chart-label">
        <i style={{ background: "var(--wind)" }} aria-hidden="true" /> Wind,{" "}
        {format.windUnit}
        <span className="legend-band wind" aria-hidden="true" /> 80% range
      </div>
      <div
        role="img"
        aria-label={summary(
          "Wind",
          windows.map((window) => window.wind.value),
          format.windNumber,
          format.windUnit,
        )}
      >
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} syncId="weekend" margin={margin}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <TimeAxis start={start} />
            <YAxis
              width={36}
              {...yAxis(ticksFor(data, "wind", format.toWind(3), 0))}
              allowDataOverflow
              {...axisProps}
            />
            {sessionLines(sessions, true)}
            <Area
              dataKey="windBand"
              stroke="none"
              fill="var(--wind)"
              fillOpacity={0.16}
              isAnimationActive={false}
              activeDot={false}
              type="monotone"
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
              content={<ForecastTooltip kind="wind" format={format} />}
              cursor={cursor}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
