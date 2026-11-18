import { useMemo } from "react";
import { formatClock } from "../lib/format.ts";
import { shapeOf, windOn, type Straight, type XY } from "../lib/outline.ts";
import { useFormat } from "../lib/settings.tsx";
import type { CentreValue, CombinedWindow } from "../lib/stats.ts";
import type { Track } from "../lib/types.ts";
import { useTrackShape } from "../lib/use-outline.ts";
import { COMPASS_SECTORS, meanDirection, voteText } from "../lib/wind.ts";
import { NorthMark, shapeMetres, TrackMap } from "./TrackMap.tsx";
import { Card, Empty } from "./ui.tsx";

const WIDTH = 520;
const HEIGHT = 380;
const KIND_LABEL = {
  headwind: "Headwind",
  tailwind: "Tailwind",
  crosswind: "Crosswind",
} as const;

/** Faint lines that drift the way the wind blows, faster in a stronger wind. */
function Streaks({ to, speed }: { to: number; speed: number }) {
  const lines = useMemo(() => {
    const items: { x: number; y: number; length: number; delay: number }[] = [];
    // The same scatter every time: a fixed sequence, not Math.random.
    let seed = 7;
    const next = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 26; i++)
      items.push({
        x: next() * 900 - 190,
        y: next() * 900 - 260,
        length: 26 + next() * 38,
        delay: -next() * 6,
      });
    return items;
  }, []);
  // 2 m/s drifts slowly, 12 m/s and more quickly.
  const duration = Math.max(1.6, 7 - speed * 0.45);
  return (
    <g
      className="wind-streaks"
      transform={`rotate(${to} ${WIDTH / 2} ${HEIGHT / 2})`}
      aria-hidden="true"
    >
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x}
          y1={line.y}
          x2={line.x}
          y2={line.y - line.length}
          style={{
            animationDuration: `${duration}s`,
            animationDelay: `${line.delay}s`,
          }}
        />
      ))}
    </g>
  );
}

/** A compass with one thin arrow per forecasting centre and a bold one for all. */
function Compass({
  centres,
  from,
  x,
  y,
}: {
  centres: readonly CentreValue[];
  from: number | null;
  x: number;
  y: number;
}) {
  const radius = 44;
  const arrow = (degrees: number, length: number) => {
    // Arrows point where the wind blows to: the opposite of where it comes from.
    const angle = ((degrees + 180) * Math.PI) / 180;
    return {
      x1: -Math.sin(angle) * length * 0.55,
      y1: Math.cos(angle) * length * 0.55,
      x2: Math.sin(angle) * length,
      y2: -Math.cos(angle) * length,
    };
  };
  return (
    <g
      className="compass"
      transform={`translate(${x} ${y})`}
      aria-hidden="true"
    >
      <circle r={radius} />
      {["N", "E", "S", "W"].map((letter, i) => (
        <text
          key={letter}
          x={Math.sin((i * Math.PI) / 2) * (radius - 9)}
          y={-Math.cos((i * Math.PI) / 2) * (radius - 9) + 3.5}
          textAnchor="middle"
        >
          {letter}
        </text>
      ))}
      {centres.map((centre) =>
        centre.windDeg === null ? null : (
          <line
            key={centre.centre}
            className="compass-centre"
            {...arrow(centre.windDeg, radius - 16)}
            markerEnd="url(#compass-head-thin)"
          />
        ),
      )}
      {from !== null && (
        <line
          className="compass-all"
          {...arrow(from, radius - 13)}
          markerEnd="url(#compass-head)"
        />
      )}
    </g>
  );
}

/**
 * The wind over the circuit for one hour: which way it blows, and what that
 * means on each straight. A model's wind is the same over the whole circuit, so
 * there is one direction, not a field of different arrows.
 */
export function WindMap({
  track,
  window,
  centres,
  hour,
  zone,
}: {
  track: Track;
  /** The combined answer of the hour shown. */
  window: CombinedWindow | null;
  centres: readonly CentreValue[];
  hour: number;
  zone: string;
}) {
  const format = useFormat();
  const shape = useTrackShape(track);
  const from = useMemo(() => {
    const directions = centres
      .map((centre) => centre.windDeg)
      .filter((value): value is number => value !== null);
    return (
      meanDirection(directions) ??
      (window?.direction
        ? COMPASS_SECTORS.indexOf(window.direction.sector) * 45
        : null)
    );
  }, [centres, window]);
  const speed = window?.wind.value ?? null;
  const straights = useMemo(() => {
    if (!shape?.outline) return [];
    const { loop } = shapeMetres(shape);
    return loop ? shapeOf(loop).straights.slice(0, 5) : [];
  }, [shape]);

  const title = "Wind on the circuit";
  if (from === null || speed === null)
    return (
      <Card title={title} className="map-card">
        <Empty>No wind forecast for this hour.</Empty>
      </Card>
    );

  const effects = straights.map((straight) => ({
    straight,
    effect: windOn(straight.bearing, from, format.toWind(speed)),
  }));
  // Up to three labels, and never two on straights that lie close together.
  const labelled: Straight[] = [];
  for (const { straight } of effects) {
    if (labelled.length === 3) break;
    const apart = labelled.every(
      (other) =>
        Math.hypot(
          other.middle.x - straight.middle.x,
          other.middle.y - straight.middle.y,
        ) > 450,
    );
    if (apart) labelled.push(straight);
  }
  const describe = (item: (typeof effects)[number]) => {
    const { effect } = item;
    const amount =
      effect.kind === "crosswind"
        ? Math.abs(effect.cross)
        : Math.abs(effect.head);
    return `${KIND_LABEL[effect.kind]} ${amount.toFixed(format.windDigits)}`;
  };

  return (
    <Card
      title={title}
      className="map-card wind-card"
      aside={<span className="muted">{formatClock(hour, zone)}</span>}
    >
      <div className="wind-map">
        <svg
          className="wind-back"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="compass-head"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10z" className="compass-head" />
            </marker>
            <marker
              id="compass-head-thin"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10z" className="compass-head thin" />
            </marker>
          </defs>
          <Streaks to={(from + 180) % 360} speed={speed} />
        </svg>
        {shape ? (
          <TrackMap
            shape={shape}
            label={`Wind over ${track.name}: ${format.wind(speed)} from ${window?.direction?.sector ?? "an unknown direction"}`}
            width={WIDTH}
            height={HEIGHT}
            margin={62}
          >
            {({ fit, width }) => (
              <>
                {effects.map(({ straight, effect }, i) => (
                  <StraightMark
                    key={i}
                    straight={straight}
                    kind={effect.kind}
                    point={fit.point}
                    label={
                      labelled.includes(straight) ? describe(effects[i]) : null
                    }
                  />
                ))}
                <NorthMark x={width - 22} y={26} />
                <Compass centres={centres} from={from} x={62} y={HEIGHT - 62} />
              </>
            )}
          </TrackMap>
        ) : (
          <svg
            className="track-map"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`Wind at ${track.name}: ${format.wind(speed)}`}
          >
            <NorthMark x={WIDTH - 22} y={26} />
            <Compass
              centres={centres}
              from={from}
              x={WIDTH / 2}
              y={HEIGHT / 2}
            />
          </svg>
        )}
      </div>
      <div className="map-foot">
        <p className="wind-summary">
          <strong>
            {format.wind(speed)} from {window?.direction?.sector ?? "?"}
          </strong>
          {window?.direction && (
            <span className="muted">{voteText(window.direction)}</span>
          )}
          {straights.length > 0 && (
            <span className="wind-key">
              <span className="headwind">
                <i aria-hidden="true" /> Headwind
              </span>
              <span className="tailwind">
                <i aria-hidden="true" /> Tailwind
              </span>
              <span className="crosswind">
                <i aria-hidden="true" /> Crosswind
              </span>
            </span>
          )}
        </p>
        <p className="muted">
          {straights.length > 0
            ? `Straights of 220 m and more, with the wind along or across them in ${format.windUnit}. `
            : ""}
          The bold arrow is all forecasts together, each thin one a forecasting
          centre. A forecast has one wind for the whole circuit; buildings and
          trees change it locally.
        </p>
      </div>
    </Card>
  );
}

function StraightMark({
  straight,
  kind,
  point,
  label,
}: {
  straight: Straight;
  kind: "headwind" | "tailwind" | "crosswind";
  point: (p: XY) => XY;
  label: string | null;
}) {
  const a = point(straight.from);
  const b = point(straight.to);
  const m = point(straight.middle);
  // The label sits beside the straight, on the side away from the drawing's middle.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  let nx = -dy / length;
  let ny = dx / length;
  if ((m.x - WIDTH / 2) * nx + (m.y - HEIGHT / 2) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return (
    <g className={`straight ${kind}`}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {label && (
        <text
          x={m.x + nx * 16}
          y={m.y + ny * 16 + 4}
          textAnchor={nx > 0.35 ? "start" : nx < -0.35 ? "end" : "middle"}
        >
          {label}
        </text>
      )}
    </g>
  );
}
