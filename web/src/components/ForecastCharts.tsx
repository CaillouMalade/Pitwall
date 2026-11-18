import { createContext, useContext, useId, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
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
import type { Session } from "../lib/sessions.ts";
import { useFormat } from "../lib/settings.tsx";
import type { CombinedWindow, Estimate } from "../lib/stats.ts";
import { COMPASS_SECTORS, voteText } from "../lib/wind.ts";
import { HOUR, WINDOW } from "../lib/windows.ts";
import { localMidnight } from "../lib/zone.ts";

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
  /** Where the direction arrows sit: the bottom of the wind chart. */
  arrow: number | null;
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
    arrow: null,
  }));
  // Rain is a total over the hour, drawn as a step from its start to its end,
  // so the last hour needs a closing point.
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
export const yAxis = (ticks: number[]) => ({
  ticks,
  domain: [ticks[0], ticks.at(-1)!] as [number, number],
  interval: 0 as const,
});

export const axisProps = {
  stroke: "var(--text-3)",
  tick: { fill: "var(--text-3)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Where the time axis puts its marks: midnights for days, hours for a session. */
export function timeTicks(
  from: number,
  to: number,
  zone: string,
): { ticks: number[]; days: boolean } {
  const hours = (to - from) / HOUR;
  if (hours > 30) {
    const ticks: number[] = [];
    // Local midnights; 25 hours on, then back to midnight, survives clock changes.
    for (
      let time = localMidnight(from, zone);
      time <= to;
      time = localMidnight(time + 25 * HOUR, zone)
    )
      if (time >= from) ticks.push(time);
    return { ticks, days: true };
  }
  const step = hours > 14 ? 3 : hours > 7 ? 2 : 1;
  const ticks: number[] = [];
  for (let time = Math.ceil(from / HOUR) * HOUR; time <= to; time += HOUR)
    if (Number(formatClock(time, zone).slice(0, 2)) % step === 0)
      ticks.push(time);
  return { ticks, days: false };
}

function TimeAxis({
  from,
  to,
  zone,
  hide,
}: {
  from: number;
  to: number;
  zone: string;
  hide?: boolean;
}) {
  const { ticks, days } = timeTicks(from, to, zone);
  return (
    <XAxis
      dataKey="time"
      type="number"
      scale="time"
      domain={[from, to]}
      ticks={ticks}
      tickFormatter={(value: number) =>
        days ? formatDay(value, zone) : formatClock(value, zone)
      }
      allowDataOverflow
      hide={hide}
      {...axisProps}
    />
  );
}

/** Each session as a soft band over its length, with its name at the top. */
function sessionMarks(
  sessions: Session[],
  labels: boolean,
  focus: Session | undefined,
) {
  return sessions.flatMap((session) => {
    const focused = focus?.name === session.name;
    return [
      <ReferenceArea
        key={`${session.name}-area`}
        x1={session.start}
        x2={session.end}
        fill="var(--mood)"
        fillOpacity={focused ? 0.16 : focus ? 0.05 : 0.09}
        stroke="none"
        ifOverflow="hidden"
      />,
      <ReferenceLine
        key={`${session.name}-line`}
        x={session.start}
        stroke="var(--mood)"
        strokeOpacity={focused || !focus ? 0.7 : 0.3}
        strokeWidth={1}
        ifOverflow="hidden"
        label={
          labels
            ? {
                value: session.name === "Qualifying" ? "Q" : session.name,
                position: "insideTopLeft",
                fill: "var(--text-2)",
                fontSize: 11,
                fontWeight: 600,
              }
            : undefined
        }
      />,
    ];
  });
}

// Only the chart under the pointer shows its tooltip; the others keep the
// vertical line, so the same moment can be read across them.
const HoverContext = createContext<{
  hovered: string | null;
  setHovered: (id: string | null) => void;
}>({ hovered: null, setHovered: () => undefined });

/** Wrap the charts that share a time axis. */
export function ChartGroup({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const value = useMemo(() => ({ hovered, setHovered }), [hovered]);
  return (
    <HoverContext.Provider value={value}>{children}</HoverContext.Provider>
  );
}

export function useHover() {
  const id = useId();
  const { hovered, setHovered } = useContext(HoverContext);
  return {
    active: hovered === id,
    handlers: {
      onPointerEnter: () => setHovered(id),
      onPointerMove: () => hovered !== id && setHovered(id),
      onPointerLeave: () => setHovered(null),
      onFocus: () => setHovered(id),
    },
  };
}

type Kind = "temperature" | "rain" | "wind";

function ForecastTooltip({
  active,
  payload,
  kind,
  format,
  zone,
  shown,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  kind: Kind;
  format: UnitFormat;
  zone: string;
  shown: boolean;
}) {
  const window = payload?.[0]?.payload.window;
  if (!active || !shown || !window) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-title">
        {formatDayTime(window.time, zone)}–
        {formatClock(window.time + WINDOW, zone)}
      </div>
      {kind === "temperature" && (
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
      )}
      {kind === "rain" && (
        <TooltipRow
          color="var(--rain)"
          label="Rain"
          value={formatValue(window.rain.value, "mm")}
          detail={
            <>
              {rangeText(window.rain, "mm", (value) => formatNumber(value))}
              <br />
              {rainText(window)}
            </>
          }
        />
      )}
      {kind === "wind" && (
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

export function TooltipRow({
  color,
  label,
  value,
  detail,
}: {
  color?: string;
  label: string;
  value: string;
  detail?: React.ReactNode;
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

export const margin = { top: 8, right: 12, bottom: 6, left: 0 };
export const cursor = {
  stroke: "var(--text-3)",
  strokeWidth: 1,
  strokeDasharray: "3 3",
};
export const activeDot = {
  r: 4,
  strokeWidth: 2,
  stroke: "var(--surface-solid)",
};

export interface ChartProps {
  windows: CombinedWindow[];
  sessions: Session[];
  /** The ends of the time axis. */
  from: number;
  to: number;
  zone: string;
  /** The session the page is about, drawn stronger than the others. */
  focus?: Session;
  /** A name that keeps the charts of one page in step. */
  sync: string;
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
  return `${what}: from ${show(Math.min(...present))} to ${show(Math.max(...present))} ${unit}.`;
}

export function Legend({
  color,
  children,
  band: bandClass,
  note,
}: {
  color: string;
  children: React.ReactNode;
  band?: string;
  note?: string;
}) {
  return (
    <div className="chart-label">
      <i style={{ background: color }} aria-hidden="true" /> {children}
      {bandClass !== undefined && (
        <>
          <span className={`legend-band ${bandClass}`} aria-hidden="true" />
          Range between forecasts
        </>
      )}
      {note && <span className="chart-note">{note}</span>}
    </div>
  );
}

export function TemperatureChart(props: ChartProps & { height?: number }) {
  const {
    windows,
    sessions,
    from,
    to,
    zone,
    focus,
    sync,
    height = 190,
  } = props;
  const format = useFormat();
  const hover = useHover();
  const data = useMemo(() => rows(windows, format), [windows, format]);
  return (
    <div className="chart-panel" {...hover.handlers}>
      <Legend color="var(--temp)" band="">
        Temperature, {format.temperatureUnit}
      </Legend>
      <div
        role="img"
        aria-label={summary(
          "Temperature",
          windows.map((window) => window.temperature.value),
          format.temperatureNumber,
          format.temperatureUnit,
        )}
      >
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={data}
            syncId={sync}
            syncMethod="value"
            margin={margin}
          >
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <TimeAxis from={from} to={to} zone={zone} hide />
            <YAxis
              width={38}
              {...yAxis(ticksFor(data, "temperature", 6))}
              allowDataOverflow
              {...axisProps}
            />
            {sessionMarks(sessions, true, focus)}
            <Area
              dataKey="temperatureBand"
              stroke="none"
              fill="var(--temp)"
              fillOpacity={0.18}
              animationDuration={600}
              activeDot={false}
              connectNulls={false}
              type="monotone"
            />
            <Line
              dataKey="temperature"
              stroke="var(--temp)"
              strokeWidth={2.2}
              dot={false}
              activeDot={activeDot}
              animationDuration={700}
              type="monotone"
            />
            <Tooltip
              content={
                <ForecastTooltip
                  kind="temperature"
                  format={format}
                  zone={zone}
                  shown={hover.active}
                />
              }
              cursor={cursor}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RainChart(props: ChartProps & { height?: number }) {
  const {
    windows,
    sessions,
    from,
    to,
    zone,
    focus,
    sync,
    height = 140,
  } = props;
  const format = useFormat();
  const hover = useHover();
  const data = useMemo(() => rows(windows, format), [windows, format]);
  const rainTicks = niceTicks(
    0,
    Math.max(
      1,
      ...data.map((row) => Math.max(row.rainBand?.[1] ?? 0, row.rain ?? 0)),
    ),
    3,
  );
  return (
    <div className="chart-panel" {...hover.handlers}>
      <Legend color="var(--rain)" band="rain">
        Rain, mm per hour
      </Legend>
      <div
        role="img"
        aria-label={summary(
          "Rain per hour",
          windows.map((window) => window.rain.value),
          (value) => formatNumber(value),
          "mm",
        )}
      >
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={data}
            syncId={sync}
            syncMethod="value"
            margin={margin}
          >
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <TimeAxis from={from} to={to} zone={zone} />
            <YAxis
              width={38}
              {...yAxis(rainTicks)}
              allowDataOverflow
              {...axisProps}
            />
            {sessionMarks(sessions, false, focus)}
            <Area
              dataKey="rainBand"
              type="stepAfter"
              stroke="none"
              fill="var(--rain)"
              fillOpacity={0.16}
              animationDuration={600}
              activeDot={false}
              connectNulls={false}
            />
            <Area
              dataKey="rain"
              type="stepAfter"
              stroke="var(--rain)"
              strokeWidth={1.8}
              fill="var(--rain)"
              fillOpacity={0.4}
              animationDuration={700}
              activeDot={false}
            />
            <Tooltip
              content={
                <ForecastTooltip
                  kind="rain"
                  format={format}
                  zone={zone}
                  shown={hover.active}
                />
              }
              cursor={cursor}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** An arrow that points where the wind blows to, under the wind line. */
function DirectionDot(props: {
  cx?: number;
  cy?: number;
  payload?: Row;
  index?: number;
  every: number;
}) {
  const { cx, cy, payload, index = 0, every } = props;
  const vote = payload?.window?.direction;
  if (cx === undefined || cy === undefined || !vote || index % every !== 0)
    return null;
  const angle = COMPASS_SECTORS.indexOf(vote.sector) * 45 + 180;
  return (
    <path
      d="M0 -6L4 4L0 2L-4 4Z"
      fill="var(--wind)"
      opacity={0.35 + 0.65 * (vote.agreeing / vote.of)}
      transform={`translate(${cx} ${cy - 9}) rotate(${angle})`}
    />
  );
}

export function WindChart(props: ChartProps & { height?: number }) {
  const {
    windows,
    sessions,
    from,
    to,
    zone,
    focus,
    sync,
    height = 210,
  } = props;
  const format = useFormat();
  const hover = useHover();
  const data = useMemo(() => {
    const base = rows(windows, format);
    const ticks = ticksFor(base, "wind", format.toWind(3), 0);
    return {
      ticks,
      rows: base.map((row) => ({
        ...row,
        arrow: row.window ? ticks[0] : null,
      })),
    };
  }, [windows, format]);
  // About 24 arrows across the chart, whatever its length.
  const every = Math.max(1, Math.round((to - from) / HOUR / 24));
  return (
    <div className="chart-panel" {...hover.handlers}>
      <Legend
        color="var(--wind)"
        band="wind"
        note="Arrows: where the wind blows to; fainter when fewer agree"
      >
        Wind, {format.windUnit}
      </Legend>
      <div
        role="img"
        aria-label={summary(
          "Wind",
          windows.map((window) => window.wind.value),
          format.windNumber,
          format.windUnit,
        )}
      >
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={data.rows}
            syncId={sync}
            syncMethod="value"
            margin={margin}
          >
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <TimeAxis from={from} to={to} zone={zone} />
            <YAxis
              width={38}
              {...yAxis(data.ticks)}
              allowDataOverflow
              {...axisProps}
            />
            {sessionMarks(sessions, true, focus)}
            <Area
              dataKey="windBand"
              stroke="none"
              fill="var(--wind)"
              fillOpacity={0.18}
              animationDuration={600}
              activeDot={false}
              type="monotone"
            />
            <Line
              dataKey="wind"
              stroke="var(--wind)"
              strokeWidth={2.2}
              dot={false}
              activeDot={activeDot}
              animationDuration={700}
              type="monotone"
            />
            <Line
              dataKey="arrow"
              stroke="none"
              isAnimationActive={false}
              activeDot={false}
              dot={<DirectionDot every={every} />}
              legendType="none"
            />
            <Tooltip
              content={
                <ForecastTooltip
                  kind="wind"
                  format={format}
                  zone={zone}
                  shown={hover.active}
                />
              }
              cursor={cursor}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Rain at the track in 15-minute steps, from the one model that gives them. */
export function QuarterRainChart({
  points,
  sessions,
  from,
  to,
  zone,
  focus,
  sync,
}: Omit<ChartProps, "windows"> & {
  points: { time: number; rain: number | null }[];
}) {
  const hover = useHover();
  // Drawn at the middle of each step, so a bar sits over its 15 minutes.
  const data = points.map((point) => ({
    time: point.time + 7.5 * 60_000,
    start: point.time,
    rain: point.rain,
  }));
  const ticks = niceTicks(
    0,
    Math.max(0.5, ...points.map((point) => point.rain ?? 0)),
    2,
  );
  const total = points.reduce((sum, point) => sum + (point.rain ?? 0), 0);
  return (
    <div className="chart-panel" {...hover.handlers}>
      <Legend
        color="var(--rain-2)"
        note="One model (Open-Meteo best match), so no range"
      >
        Rain, mm per 15 minutes
      </Legend>
      <div
        role="img"
        aria-label={`Rain in 15-minute steps: ${formatNumber(total)} mm in total.`}
      >
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart
            data={data}
            syncId={sync}
            syncMethod="value"
            margin={margin}
          >
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <TimeAxis from={from} to={to} zone={zone} />
            <YAxis
              width={38}
              {...yAxis(ticks)}
              allowDataOverflow
              {...axisProps}
            />
            {sessionMarks(sessions, false, focus)}
            <Bar
              dataKey="rain"
              fill="var(--rain-2)"
              radius={[2, 2, 0, 0]}
              animationDuration={500}
              maxBarSize={14}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as
                  { start: number; rain: number | null } | undefined;
                if (!active || !hover.active || !row) return null;
                return (
                  <div className="tooltip">
                    <div className="tooltip-title">
                      {formatClock(row.start, zone)}–
                      {formatClock(row.start + 15 * 60_000, zone)}
                    </div>
                    <TooltipRow
                      color="var(--rain-2)"
                      label="Rain"
                      value={formatValue(row.rain, "mm", 2)}
                    />
                  </div>
                );
              }}
              cursor={{ fill: "var(--hover)" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
