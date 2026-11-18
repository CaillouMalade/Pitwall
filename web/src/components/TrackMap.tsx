import { useId, useMemo, type ReactNode } from "react";
import {
  bearing,
  fit,
  pathOf,
  resample,
  toMetres,
  type Fit,
  type LatLon,
  type XY,
} from "../lib/outline.ts";
import type { TrackShape } from "../lib/use-outline.ts";

export interface Drawn {
  fit: Fit;
  /** The lap in metres; null for a track that only has loose lines. */
  loop: XY[] | null;
  width: number;
  height: number;
}

/** Every line of a shape in metres, around the same middle. */
export function shapeMetres(shape: TrackShape): {
  lines: XY[][];
  loop: XY[] | null;
} {
  const all = shape.lines.flat() as LatLon[];
  const origin: LatLon = [
    all.reduce((sum, p) => sum + p[0], 0) / all.length,
    all.reduce((sum, p) => sum + p[1], 0) / all.length,
  ];
  return {
    lines: shape.lines.map((line) => toMetres(line, origin)),
    loop: shape.outline ? toMetres(shape.outline.loop, origin) : null,
  };
}

/**
 * A circuit drawn from its outline, north up. `detail` adds the pit straight,
 * the driving direction and a moving dot; `children` draws on top of it.
 */
export function TrackMap({
  shape,
  label,
  width = 520,
  height = 340,
  margin = 34,
  detail = false,
  className,
  children,
}: {
  shape: TrackShape;
  label: string;
  width?: number;
  height?: number;
  margin?: number;
  detail?: boolean;
  className?: string;
  children?: (drawn: Drawn) => ReactNode;
}) {
  const id = useId();
  const drawn = useMemo(() => {
    const { lines, loop } = shapeMetres(shape);
    const fitted = fit(lines.flat(), width, height, margin);
    const paths = lines.map((line) => pathOf(line.map(fitted.point), false));
    let marks: { arrows: { at: XY; angle: number }[]; pit: XY[] } | null = null;
    if (loop) {
      const points = resample(loop, 10);
      const at = (i: number) =>
        points[((i % points.length) + points.length) % points.length];
      // The pit straight: a short line across the track where the lap starts.
      const heading = (bearing(at(0), at(2)) * Math.PI) / 180;
      const across = { x: Math.cos(heading), y: -Math.sin(heading) };
      const half = 9 / fitted.scale;
      const pit = [
        { x: at(0).x - across.x * half, y: at(0).y - across.y * half },
        { x: at(0).x + across.x * half, y: at(0).y + across.y * half },
      ].map(fitted.point);
      // Arrowheads at four places round the lap.
      const arrows = [0.12, 0.37, 0.62, 0.87].map((share) => {
        const i = Math.floor(points.length * share);
        const a = fitted.point(at(i - 1));
        const b = fitted.point(at(i + 1));
        return {
          at: fitted.point(at(i)),
          angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        };
      });
      marks = { arrows, pit };
    }
    return {
      fit: fitted,
      loop,
      paths,
      loopPath: loop ? pathOf(loop.map(fitted.point)) : null,
      marks,
    };
  }, [shape, width, height, margin]);

  return (
    <svg
      className={`track-map ${className ?? ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <g className="track-glow" aria-hidden="true">
        {drawn.paths.map((path, i) => (
          <path key={i} d={path} />
        ))}
      </g>
      <g className="track-line">
        {drawn.paths.map((path, i) => (
          <path key={i} d={path} />
        ))}
      </g>
      {detail && drawn.marks && drawn.loopPath && (
        <g aria-hidden="true">
          {drawn.marks.arrows.map((arrow, i) => (
            <path
              key={i}
              className="track-arrow"
              d="M-5 -5L3 0L-5 5"
              transform={`translate(${arrow.at.x.toFixed(1)} ${arrow.at.y.toFixed(1)}) rotate(${arrow.angle.toFixed(0)})`}
            />
          ))}
          <path className="track-pit" d={pathOf(drawn.marks.pit, false)} />
          <path id={id} d={drawn.loopPath} fill="none" stroke="none" />
          <circle className="track-car" r="4.5">
            <animateMotion dur="14s" repeatCount="indefinite">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        </g>
      )}
      {children?.({ fit: drawn.fit, loop: drawn.loop, width, height })}
    </svg>
  );
}

/** A small arrow that points north, for the corner of a map. */
export function NorthMark({ x, y }: { x: number; y: number }) {
  return (
    <g className="north" transform={`translate(${x} ${y})`} aria-hidden="true">
      <path d="M0 -13L5 3L0 0L-5 3Z" />
      <text y="16" textAnchor="middle">
        N
      </text>
    </g>
  );
}
