import { useMemo } from "react";
import {
  Area,
  Bar,
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
  formatDay,
  formatDayTime,
  formatIsoDay,
  formatIsoWeekday,
  formatNumber,
  formatValue,
  niceTicks,
} from "../lib/format.ts";
import {
  RAIN_DAY_MM,
  type DailyWeather,
  type HourlyWeather,
} from "../lib/history.ts";
import { useFormat } from "../lib/settings.tsx";
import { compassSector } from "../lib/wind.ts";
import {
  activeDot,
  axisProps,
  cursor,
  Legend,
  margin,
  timeTicks,
  TooltipRow,
  useHover,
  yAxis,
} from "./ForecastCharts.tsx";

/** The colour of each compared track, by its slot. */
export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
];

const present = (values: (number | null)[]) =>
  values.filter((value): value is number => value !== null);

/** Even ticks around some values, with a little air. */
function ticksAround(values: number[], minimumSpan: number, floor?: number) {
  if (!values.length) return niceTicks(floor ?? 0, (floor ?? 0) + minimumSpan);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const pad = Math.max(minimumSpan - (high - low), 0) / 2 + (high - low) * 0.1;
  low -= pad;
  high += pad;
  if (floor !== undefined) low = Math.max(floor, low);
  return niceTicks(low, high);
}

/** About eight day labels, whatever the number of days. */
function dayTicks(days: readonly { day: string }[]): string[] {
  const every = Math.max(1, Math.ceil(days.length / 8));
  return days.filter((_, i) => i % every === 0).map((day) => day.day);
}

const barCursor = { fill: "var(--hover)" };

/**
 * Days as three panels on one axis: the day's rain as bars, its temperature
 * from low to high with the mean, and its strongest wind. `rainMax` and
 * `sync` let several of these (one per track) share a scale and a pointer.
 */
export function DailyCharts({
  days,
  sync,
  rainMax,
  temperatures,
  color,
  compact,
}: {
  days: readonly DailyWeather[];
  sync: string;
  /** The top of the rain axis, to compare tracks on the same scale. */
  rainMax?: number;
  /** Every temperature (in °C) the axis must hold, to compare tracks on the same scale. */
  temperatures?: readonly number[];
  /** The colour of the bars and lines, for a compared track. */
  color?: string;
  /** Rain and temperature only, lower: for a row per track. */
  compact?: boolean;
}) {
  const format = useFormat();
  const rainHover = useHover();
  const tempHover = useHover();
  const windHover = useHover();
  const data = useMemo(
    () =>
      days.map((day) => ({
        day: day.day,
        rain: day.rain,
        range:
          day.temperatureMin === null || day.temperatureMax === null
            ? null
            : ([
                format.toTemperature(day.temperatureMin),
                format.toTemperature(day.temperatureMax),
              ] as [number, number]),
        mean:
          day.temperatureMean === null
            ? null
            : format.toTemperature(day.temperatureMean),
        wind: day.windMax === null ? null : format.toWind(day.windMax),
        gust: day.gustMax === null ? null : format.toWind(day.gustMax),
        from: day.windFrom,
      })),
    [days, format],
  );
  const ticks = dayTicks(days);
  const rainTicks = niceTicks(
    0,
    rainMax ??
      Math.max(RAIN_DAY_MM * 2, ...present(data.map((row) => row.rain))),
    3,
  );
  const tempTicks = ticksAround(
    temperatures
      ? temperatures.map(format.toTemperature)
      : data.flatMap((row) => [
          ...(row.range ?? []),
          ...(row.mean === null ? [] : [row.mean]),
        ]),
    format.toTemperatureDifference(6),
  );
  const windTicks = ticksAround(
    present(data.flatMap((row) => [row.wind, row.gust])),
    format.toWind(4),
    0,
  );
  const hasWind = data.some((row) => row.wind !== null);
  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="day"
      ticks={ticks}
      tickFormatter={formatIsoDay}
      interval={0}
      hide={hide}
      {...axisProps}
    />
  );
  const title = (label?: string) => (label ? formatIsoWeekday(label) : "");
  const rainColor = color ?? "var(--rain)";
  const tempColor = color ?? "var(--temp)";
  const windColor = color ?? "var(--wind)";

  return (
    <div className="chart-stack">
      <div className="chart-panel" {...rainHover.handlers}>
        {!compact && (
          <Legend
            color={rainColor}
            note={`A rain day has ${RAIN_DAY_MM} mm or more`}
          >
            Rain, mm per day
          </Legend>
        )}
        <div
          role="img"
          aria-label={`Rain per day: ${formatNumber(present(data.map((row) => row.rain)).reduce((sum, rain) => sum + rain, 0))} mm in total over ${days.length} days.`}
        >
          <ResponsiveContainer width="100%" height={compact ? 90 : 150}>
            <ComposedChart data={data} syncId={sync} margin={margin}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              {xAxis(true)}
              <YAxis
                width={38}
                {...yAxis(rainTicks)}
                allowDataOverflow
                {...axisProps}
              />
              <ReferenceLine
                y={RAIN_DAY_MM}
                stroke="var(--text-3)"
                strokeDasharray="2 4"
              />
              <Bar
                dataKey="rain"
                fill={rainColor}
                radius={[3, 3, 0, 0]}
                maxBarSize={22}
                animationDuration={500}
              />
              <Tooltip
                cursor={barCursor}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  const row = payload?.[0]?.payload as
                    (typeof data)[number] | undefined;
                  if (!active || !rainHover.active || !row) return null;
                  return (
                    <div className="tooltip">
                      <div className="tooltip-title">
                        {title(String(label))}
                      </div>
                      <TooltipRow
                        color={rainColor}
                        label="Rain"
                        value={formatValue(row.rain, "mm")}
                        detail={
                          row.rain !== null && row.rain >= RAIN_DAY_MM
                            ? "A rain day"
                            : null
                        }
                      />
                    </div>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-panel" {...tempHover.handlers}>
        {!compact && (
          <Legend color={tempColor} band="" note="Band: the day's low to high">
            Mean temperature, {format.temperatureUnit}
          </Legend>
        )}
        <div
          role="img"
          aria-label={`Temperature per day, in ${format.temperatureUnit}: the low, the mean and the high.`}
        >
          <ResponsiveContainer width="100%" height={compact ? 100 : 170}>
            <ComposedChart data={data} syncId={sync} margin={margin}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              {xAxis(!compact && hasWind)}
              <YAxis
                width={38}
                {...yAxis(tempTicks)}
                allowDataOverflow
                {...axisProps}
              />
              <Area
                dataKey="range"
                stroke="none"
                fill={tempColor}
                fillOpacity={0.18}
                type="monotone"
                activeDot={false}
                animationDuration={500}
              />
              <Line
                dataKey="mean"
                stroke={tempColor}
                strokeWidth={2}
                dot={false}
                activeDot={activeDot}
                type="monotone"
                animationDuration={600}
              />
              <Tooltip
                cursor={cursor}
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  const row = payload?.[0]?.payload as
                    (typeof data)[number] | undefined;
                  if (!active || !tempHover.active || !row) return null;
                  return (
                    <div className="tooltip">
                      <div className="tooltip-title">
                        {title(String(label))}
                      </div>
                      <TooltipRow
                        color={tempColor}
                        label="Mean"
                        value={formatValue(row.mean, format.temperatureUnit)}
                        detail={
                          row.range
                            ? `Low ${formatNumber(row.range[0])}, high ${formatNumber(row.range[1])} ${format.temperatureUnit}`
                            : null
                        }
                      />
                    </div>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!compact && hasWind && (
        <div className="chart-panel" {...windHover.handlers}>
          <Legend color={windColor} note="Dashed: the strongest gust">
            Strongest wind, {format.windUnit}
          </Legend>
          <div
            role="img"
            aria-label={`Strongest wind per day, in ${format.windUnit}.`}
          >
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={data} syncId={sync} margin={margin}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                {xAxis(false)}
                <YAxis
                  width={38}
                  {...yAxis(windTicks)}
                  allowDataOverflow
                  {...axisProps}
                />
                <Line
                  dataKey="gust"
                  stroke={windColor}
                  strokeWidth={1.2}
                  strokeDasharray="3 4"
                  dot={false}
                  activeDot={false}
                  type="monotone"
                  animationDuration={600}
                />
                <Line
                  dataKey="wind"
                  stroke={windColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={activeDot}
                  type="monotone"
                  animationDuration={600}
                />
                <Tooltip
                  cursor={cursor}
                  isAnimationActive={false}
                  content={({ active, payload, label }) => {
                    const row = payload?.[0]?.payload as
                      (typeof data)[number] | undefined;
                    if (!active || !windHover.active || !row) return null;
                    return (
                      <div className="tooltip">
                        <div className="tooltip-title">
                          {title(String(label))}
                        </div>
                        <TooltipRow
                          color={windColor}
                          label="Strongest wind"
                          value={formatValue(
                            row.wind,
                            format.windUnit,
                            format.windDigits,
                          )}
                          detail={
                            <>
                              {row.gust !== null &&
                                `Gusts to ${formatValue(row.gust, format.windUnit, format.windDigits)}`}
                              {row.gust !== null && row.from !== null && <br />}
                              {row.from !== null &&
                                `Mostly from ${compassSector(row.from)}`}
                            </>
                          }
                        />
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/** Hours as three panels on one time axis: temperature, rain and wind with gusts. */
export function HourlyCharts({
  hours,
  from,
  to,
  zone,
  sync,
}: {
  hours: readonly HourlyWeather[];
  from: number;
  to: number;
  zone: string;
  sync: string;
}) {
  const format = useFormat();
  const tempHover = useHover();
  const rainHover = useHover();
  const windHover = useHover();
  const data = useMemo(
    () =>
      hours.map((hour) => ({
        time: hour.time,
        // Rain is drawn in the middle of its hour, so the bar covers it.
        middle: hour.time + 1_800_000,
        temperature:
          hour.temperature === null
            ? null
            : format.toTemperature(hour.temperature),
        rain: hour.rain,
        wind: hour.windSpeed === null ? null : format.toWind(hour.windSpeed),
        gust: hour.gust === null ? null : format.toWind(hour.gust),
        from: hour.windDeg,
      })),
    [hours, format],
  );
  const { ticks, days } = timeTicks(from, to, zone);
  const time = (key: "time" | "middle", hide: boolean) => (
    <XAxis
      dataKey={key}
      type="number"
      scale="time"
      domain={[from, to]}
      ticks={ticks}
      tickFormatter={(value: number) =>
        days ? formatDay(value, zone) : formatDayTime(value, zone).slice(-5)
      }
      allowDataOverflow
      hide={hide}
      {...axisProps}
    />
  );
  type Row = (typeof data)[number];
  const tip =
    (shown: boolean, body: (row: Row) => React.ReactNode) =>
    ({
      active,
      payload,
    }: {
      active?: boolean;
      payload?: readonly { payload?: unknown }[];
    }) => {
      const row = payload?.[0]?.payload as Row | undefined;
      if (!active || !shown || !row) return null;
      return (
        <div className="tooltip">
          <div className="tooltip-title">{formatDayTime(row.time, zone)}</div>
          {body(row)}
        </div>
      );
    };
  return (
    <div className="chart-stack">
      <div className="chart-panel" {...tempHover.handlers}>
        <Legend color="var(--temp)">
          Temperature, {format.temperatureUnit}
        </Legend>
        <div
          role="img"
          aria-label={`Temperature per hour, in ${format.temperatureUnit}.`}
        >
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart
              data={data}
              syncId={sync}
              syncMethod="value"
              margin={margin}
            >
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              {time("time", true)}
              <YAxis
                width={38}
                {...yAxis(
                  ticksAround(
                    present(data.map((row) => row.temperature)),
                    format.toTemperatureDifference(6),
                  ),
                )}
                allowDataOverflow
                {...axisProps}
              />
              <Line
                dataKey="temperature"
                stroke="var(--temp)"
                strokeWidth={2}
                dot={false}
                activeDot={activeDot}
                type="monotone"
                animationDuration={600}
              />
              <Tooltip
                cursor={cursor}
                isAnimationActive={false}
                content={tip(tempHover.active, (row) => (
                  <TooltipRow
                    color="var(--temp)"
                    label="Temperature"
                    value={formatValue(row.temperature, format.temperatureUnit)}
                  />
                ))}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="chart-panel" {...rainHover.handlers}>
        <Legend color="var(--rain)">Rain, mm per hour</Legend>
        <div role="img" aria-label="Rain per hour, in millimetres.">
          <ResponsiveContainer width="100%" height={130}>
            <ComposedChart
              data={data}
              syncId={sync}
              syncMethod="value"
              margin={margin}
            >
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              {time("middle", true)}
              <YAxis
                width={38}
                {...yAxis(
                  niceTicks(
                    0,
                    Math.max(1, ...present(data.map((row) => row.rain))),
                    3,
                  ),
                )}
                allowDataOverflow
                {...axisProps}
              />
              <Bar
                dataKey="rain"
                fill="var(--rain)"
                radius={[2, 2, 0, 0]}
                maxBarSize={18}
                animationDuration={500}
              />
              <Tooltip
                cursor={barCursor}
                isAnimationActive={false}
                content={tip(rainHover.active, (row) => (
                  <TooltipRow
                    color="var(--rain)"
                    label="Rain"
                    value={formatValue(row.rain, "mm")}
                  />
                ))}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="chart-panel" {...windHover.handlers}>
        <Legend color="var(--wind)" note="Dashed: gusts">
          Wind, {format.windUnit}
        </Legend>
        <div
          role="img"
          aria-label={`Wind and gusts per hour, in ${format.windUnit}.`}
        >
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart
              data={data}
              syncId={sync}
              syncMethod="value"
              margin={margin}
            >
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              {time("time", false)}
              <YAxis
                width={38}
                {...yAxis(
                  ticksAround(
                    present(data.flatMap((row) => [row.wind, row.gust])),
                    format.toWind(4),
                    0,
                  ),
                )}
                allowDataOverflow
                {...axisProps}
              />
              <Line
                dataKey="gust"
                stroke="var(--wind)"
                strokeWidth={1.2}
                strokeDasharray="3 4"
                dot={false}
                activeDot={false}
                type="monotone"
                animationDuration={600}
              />
              <Line
                dataKey="wind"
                stroke="var(--wind)"
                strokeWidth={2}
                dot={false}
                activeDot={activeDot}
                type="monotone"
                animationDuration={600}
              />
              <Tooltip
                cursor={cursor}
                isAnimationActive={false}
                content={tip(windHover.active, (row) => (
                  <TooltipRow
                    color="var(--wind)"
                    label="Wind"
                    value={formatValue(
                      row.wind,
                      format.windUnit,
                      format.windDigits,
                    )}
                    detail={
                      <>
                        {row.gust !== null &&
                          `Gusts to ${formatValue(row.gust, format.windUnit, format.windDigits)}`}
                        {row.gust !== null && row.from !== null && <br />}
                        {row.from !== null && `From ${compassSector(row.from)}`}
                      </>
                    }
                  />
                ))}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/** One value per track as bars side by side, longest first: who is wettest, warmest, windiest. */
export function RankBars({
  title,
  unit,
  items,
  digits = 1,
}: {
  title: string;
  unit: string;
  items: { name: string; color: string; value: number | null }[];
  digits?: number;
}) {
  const max = Math.max(0, ...present(items.map((item) => item.value)));
  const min = Math.min(0, ...present(items.map((item) => item.value)));
  const sorted = [...items].sort(
    (a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity),
  );
  return (
    <div className="rank">
      <h3>{title}</h3>
      <ul>
        {sorted.map((item) => (
          <li key={item.name}>
            <span className="rank-name">{item.name}</span>
            <span className="rank-bar" aria-hidden="true">
              <i
                style={{
                  background: item.color,
                  width:
                    item.value === null || max === min
                      ? "0%"
                      : `${Math.max(1.5, ((item.value - min) / (max - min)) * 100)}%`,
                }}
              />
            </span>
            <span className="rank-value">
              {formatValue(item.value, unit, digits)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
