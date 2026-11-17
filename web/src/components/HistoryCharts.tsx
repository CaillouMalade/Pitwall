import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIsoDay, formatValue } from "../lib/format.ts";

export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
];

export interface Series {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

const axis = {
  stroke: "var(--text-3)",
  tick: { fill: "var(--text-3)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;
const margin = { top: 8, right: 12, bottom: 0, left: 0 };

export type Datum = { day: string } & Record<string, unknown>;

function DayTooltip({
  active,
  payload,
  label,
  unit,
  digits,
}: {
  active?: boolean;
  payload?: { name: string; value: unknown; color?: string; payload: Datum }[];
  label?: string;
  unit: string;
  digits: number;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{formatIsoDay(label)}</div>
      {payload.map((item) => {
        const value = item.value;
        const text = Array.isArray(value)
          ? `${formatValue(value[0] as number, "", digits).trim()} to ${formatValue(value[1] as number, unit, digits)}`
          : formatValue(typeof value === "number" ? value : null, unit, digits);
        return (
          <div className="tooltip-row" key={item.name}>
            <span className="tooltip-key">
              <i style={{ background: item.color }} aria-hidden="true" />
              {item.name}
            </span>
            <span className="tooltip-value">{text}</span>
          </div>
        );
      })}
    </div>
  );
}

const legend = (series: Series[]) =>
  series.length > 1 ? (
    <Legend
      verticalAlign="top"
      align="left"
      height={28}
      iconType="plainline"
      // Keep the series order (wettest first on the comparison page), not A to Z.
      itemSorter={null}
      wrapperStyle={{ fontSize: 12, color: "var(--text-2)" }}
    />
  ) : null;

interface ChartProps {
  data: Datum[];
  series: Series[];
  unit: string;
  digits?: number;
  /** Said to screen readers in place of the drawing. */
  label: string;
}

export function DailyLines({
  data,
  series,
  unit,
  digits = 1,
  floorZero,
  label,
}: ChartProps & { floorZero?: boolean }) {
  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={margin}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatIsoDay}
            minTickGap={16}
            {...axis}
          />
          <YAxis
            width={36}
            domain={floorZero ? [0, "auto"] : ["auto", "auto"]}
            {...axis}
          />
          {legend(series)}
          {series.map((item) => (
            <Line
              key={item.key}
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              strokeDasharray={item.dashed ? "4 3" : undefined}
              dot={
                data.length > 45
                  ? false
                  : { r: 2.5, strokeWidth: 0, fill: item.color }
              }
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          <Tooltip
            content={<DayTooltip unit={unit} digits={digits} />}
            cursor={{ stroke: "var(--border-strong)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bars per day; a value given as [low, high] is drawn as a floating bar. */
export function DailyBars({
  data,
  series,
  unit,
  digits = 1,
  label,
}: ChartProps) {
  const floating = series.some((item) =>
    data.some((row) => Array.isArray(row[item.key])),
  );
  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={margin} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatIsoDay}
            minTickGap={16}
            {...axis}
          />
          <YAxis
            width={36}
            domain={floating ? ["auto", "auto"] : [0, "auto"]}
            {...axis}
          />
          {legend(series)}
          {series.map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              fill={item.color}
              radius={data.length > 45 ? 1 : 3}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ))}
          <Tooltip
            content={<DayTooltip unit={unit} digits={digits} />}
            cursor={{ fill: "var(--hover)" }}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
