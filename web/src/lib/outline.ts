// The shape of a circuit: its racing line as a loop, where its straights are,
// and what the wind does on each of them.

export type LatLon = readonly [number, number];

export interface Outline {
  /** The lap in driving order, starting on the pit straight. */
  loop: readonly LatLon[];
  /** Lap length in metres, measured on the map. */
  length: number;
  clockwise: boolean;
}

export interface XY {
  x: number;
  y: number;
}

/** Positions in metres, east and north of the loop's middle. */
export function toMetres(points: readonly LatLon[], origin?: LatLon): XY[] {
  const lat0 =
    origin?.[0] ?? points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lon0 =
    origin?.[1] ?? points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const scale = Math.cos((lat0 * Math.PI) / 180) * 111_320;
  return points.map(([lat, lon]) => ({
    x: (lon - lon0) * scale,
    y: (lat - lat0) * 110_570,
  }));
}

const distance = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

/** The loop as points a fixed distance apart, so curvature can be measured. */
export function resample(loop: readonly XY[], step = 10): XY[] {
  const closed = [...loop, loop[0]];
  const out: XY[] = [];
  // How far along the loop the next point goes.
  let next = 0;
  let walked = 0;
  for (let i = 1; i < closed.length; i++) {
    const a = closed[i - 1];
    const b = closed[i];
    const length = distance(a, b);
    if (length === 0) continue;
    for (; next < walked + length - 1e-9; next += step) {
      const share = (next - walked) / length;
      out.push({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share });
    }
    walked += length;
  }
  return out;
}

/** Compass bearing of travel from a to b: 0 = north, 90 = east. */
export function bearing(a: XY, b: XY): number {
  return ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
}

/** The turn from one bearing to another, between -180 and 180; right is positive. */
export function turn(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export interface Straight {
  from: XY;
  to: XY;
  middle: XY;
  /** In metres. */
  length: number;
  /** Compass bearing of travel. */
  bearing: number;
}

export interface Shape {
  /** The loop every `step` metres. */
  points: XY[];
  /** Longest first. */
  straights: Straight[];
}

const STEP = 10;
const STRAIGHT_MIN_M = 220;

/** Find the straights of a loop given in metres. */
export function shapeOf(loop: readonly XY[]): Shape {
  const points = resample(loop, STEP);
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  // The turn at each point, over 20 m on either side to smooth the map's kinks.
  const rate = points.map(
    (_, i) => turn(bearing(at(i - 2), at(i)), bearing(at(i), at(i + 2))) / 2,
  );

  // Straights: stretches where the track hardly turns.
  const straights: Straight[] = [];
  const calm = rate.map((value) => Math.abs(value) < 0.9);
  // Start the walk inside a turn, so a straight over the lap's start is whole.
  let offset = calm.findIndex((value) => !value);
  if (offset < 0) offset = 0;
  let from: number | null = null;
  for (let k = 0; k <= n; k++) {
    const i = (offset + k) % n;
    if (k < n && calm[i]) {
      from ??= k;
      continue;
    }
    if (from !== null) {
      const length = (k - from) * STEP;
      if (length >= STRAIGHT_MIN_M) {
        const a = at(offset + from);
        const b = at(offset + k - 1);
        straights.push({
          from: a,
          to: b,
          middle: at(offset + Math.floor((from + k - 1) / 2)),
          length,
          bearing: bearing(a, b),
        });
      }
      from = null;
    }
  }
  straights.sort((a, b) => b.length - a.length);
  return { points, straights };
}

export interface WindOnStraight {
  /** Positive is a headwind, negative a tailwind, in the wind's own unit. */
  head: number;
  /** Positive blows from the driver's right. */
  cross: number;
  kind: "headwind" | "tailwind" | "crosswind";
}

/**
 * What a wind does on a straight driven on a bearing. `from` is the direction
 * the wind comes from, as weather services give it.
 */
export function windOn(
  travelBearing: number,
  from: number,
  speed: number,
): WindOnStraight {
  const angle = (turn(travelBearing, from) * Math.PI) / 180;
  const head = speed * Math.cos(angle);
  const cross = speed * Math.sin(angle);
  const kind =
    Math.abs(head) >= Math.abs(cross)
      ? head >= 0
        ? "headwind"
        : "tailwind"
      : "crosswind";
  return { head, cross, kind };
}

export interface Fit {
  /** Metres to drawing units. */
  scale: number;
  point(p: XY): XY;
}

/** Fit points given in metres into a drawing, north up, with a margin. */
export function fit(
  points: readonly XY[],
  width: number,
  height: number,
  margin: number,
): Fit {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (width - 2 * margin) / Math.max(1, maxX - minX),
    (height - 2 * margin) / Math.max(1, maxY - minY),
  );
  const left = (width - (maxX - minX) * scale) / 2;
  const top = (height - (maxY - minY) * scale) / 2;
  return {
    scale,
    point: (p) => ({
      x: left + (p.x - minX) * scale,
      // North is up, and drawings count down.
      y: top + (maxY - p.y) * scale,
    }),
  };
}

/** "M1 2L3 4…Z" through points already in drawing units. */
export function pathOf(points: readonly XY[], close = true): string {
  return (
    points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join("") + (close ? "Z" : "")
  );
}
