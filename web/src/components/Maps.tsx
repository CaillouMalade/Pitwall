import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatClock } from "../lib/format.ts";
import {
  frameAt,
  interpolateFrame,
  RAIN_SCALE,
  rainColour,
  type RainGrid,
} from "../lib/rain-map.ts";
import { readText, writeText } from "../lib/storage.ts";
import type { RadarFrame, Track } from "../lib/types.ts";
import type { Loadable } from "../lib/use-data.ts";
import { useTrackShape, type TrackShape } from "../lib/use-outline.ts";
import { Card, Segmented } from "./ui.tsx";

// Sentinel-2 cloudless by EOX: 10 m imagery, free for non-commercial use.
const SATELLITE =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg";
const SATELLITE_CREDIT =
  '<a href="https://s2maps.eu/">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024)';
const STREETS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const STREETS_CREDIT =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const MAP_VIEW_KEY = "pitwall-map";
type View = "satellite" | "map";
const VIEWS = [
  { value: "satellite", label: "Satellite" },
  { value: "map", label: "Map" },
] as const;

/** A Leaflet map that lives as long as its element, re-centred on every track. */
function useMap(
  track: Track,
  zoom: number,
  setup: (map: L.Map) => void,
  shape: TrackShape | null,
  marker = true,
  highlight = false,
): [React.RefObject<HTMLDivElement | null>, L.Map | null] {
  const element = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const setupRef = useRef(setup);

  useEffect(() => {
    if (!element.current) return;
    const created = L.map(element.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });
    created.attributionControl.setPrefix(false);
    setupRef.current(created);
    setMap(created);
    return () => {
      created.remove();
      setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    map.setView([track.latitude, track.longitude], zoom, { animate: false });
  }, [map, track.latitude, track.longitude, zoom]);

  // The circuit itself: its outline when there is one, a dot otherwise.
  useEffect(() => {
    if (!map) return;
    const layers: L.Layer[] = [];
    if (shape) {
      const lines = shape.lines.map((line) =>
        line.map(([lat, lon]) => [lat, lon] as [number, number]),
      );
      if (highlight) {
        // A ring around the circuit, so it is found at any zoom.
        const bounds = L.latLngBounds(lines.flat());
        const centre = bounds.getCenter();
        const radius =
          Math.max(...lines.flat().map((point) => centre.distanceTo(point))) +
          350;
        layers.push(
          L.circle(centre, {
            radius,
            color: "#ff3b5c",
            weight: 1.5,
            opacity: 0.9,
            dashArray: "5 6",
            fillColor: "#ff3b5c",
            fillOpacity: 0.07,
            interactive: false,
          }),
          L.polyline(lines, {
            color: "#ff3b5c",
            weight: 13,
            opacity: 0.28,
            interactive: false,
          }),
        );
      }
      layers.push(
        L.polyline(lines, {
          color: "#ffffff",
          weight: 5,
          opacity: 0.9,
          interactive: false,
        }),
        L.polyline(lines, {
          color: "#ff3b5c",
          weight: 2.5,
          opacity: 1,
          interactive: false,
        }),
      );
    } else if (marker)
      layers.push(
        L.circleMarker([track.latitude, track.longitude], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#ff3b5c",
          fillOpacity: 1,
        }).bindTooltip(track.name),
      );
    for (const layer of layers) layer.addTo(map);
    return () => {
      for (const layer of layers) layer.remove();
    };
  }, [
    map,
    shape,
    marker,
    highlight,
    track.latitude,
    track.longitude,
    track.name,
  ]);

  return [element, map];
}

export function CircuitMap({ track }: { track: Track }) {
  const [view, setView] = useState<View>(() =>
    readText(MAP_VIEW_KEY) === "map" ? "map" : "satellite",
  );
  // From above the track itself is what you look at: no line drawn over it.
  const [element, map] = useMap(
    track,
    14,
    (created) => {
      created.setMaxZoom(17).setMinZoom(8);
    },
    null,
  );

  useEffect(() => {
    if (!map) return;
    const layer =
      view === "satellite"
        ? L.tileLayer(SATELLITE, {
            // The imagery is 10 m a pixel; closer in it is enlarged.
            maxNativeZoom: 14,
            maxZoom: 17,
            attribution: SATELLITE_CREDIT,
          })
        : L.tileLayer(STREETS, {
            maxZoom: 17,
            className: "base-tiles",
            attribution: STREETS_CREDIT,
          });
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, view]);

  return (
    <Card
      title="From above"
      className="map-card"
      aside={
        <Segmented<View>
          label="Circuit view"
          value={view}
          options={VIEWS}
          onChange={(value) => {
            setView(value);
            writeText(MAP_VIEW_KEY, value);
          }}
        />
      }
    >
      <div
        ref={element}
        className="map"
        aria-label={`${view === "satellite" ? "Satellite view" : "Map"} of ${track.name}`}
        role="img"
      />
    </Card>
  );
}

const PIXELS = 96;

// Each frame is drawn once per forecast and kept with it.
const drawnFrames = new WeakMap<RainGrid, Map<number, string>>();

/** One frame of the rain forecast as a picture to lay over the map. */
function frameImage(grid: RainGrid, index: number): string {
  let drawn = drawnFrames.get(grid);
  if (!drawn) {
    drawn = new Map();
    drawnFrames.set(grid, drawn);
  }
  const kept = drawn.get(index);
  if (kept !== undefined) return kept;
  const image = drawFrame(grid, index);
  drawn.set(index, image);
  return image;
}

function drawFrame(grid: RainGrid, index: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PIXELS;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const rates = interpolateFrame(grid.frames[index], grid.size, PIXELS);
  const image = context.createImageData(PIXELS, PIXELS);
  for (let i = 0; i < rates.length; i++) {
    const [r, g, b, a] = rainColour(rates[i]);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a * 255;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export type RainMode = "forecast" | "radar";

const MODES = [
  { value: "forecast", label: "Forecast" },
  { value: "radar", label: "Past & current" },
] as const;

function RainLegend() {
  const stops = RAIN_SCALE.slice(1)
    .map(
      ([, r, g, b], i, all) =>
        `rgb(${r} ${g} ${b}) ${Math.round((i / (all.length - 1)) * 100)}%`,
    )
    .join(", ");
  return (
    <div
      className="rain-legend"
      aria-label="Rain colours, in millimetres per hour"
    >
      <span>Light</span>
      <i style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <span>Heavy</span>
      <span className="rain-legend-values">
        {RAIN_SCALE[1][0]} to {RAIN_SCALE.at(-1)![0]}+ mm/h
      </span>
    </div>
  );
}

/**
 * Rain around the circuit. "Forecast" is one model's rain for the session, moved
 * by the page's timeline; "Past & current" is the radar: what was measured in
 * the last two hours, with its own slider.
 */
export function RainMap({
  track,
  grid,
  radar,
  at,
  mode,
  onMode,
  zone,
}: {
  track: Track;
  grid: Loadable<RainGrid>;
  radar: Loadable<RadarFrame[]>;
  /** The moment the page's timeline is on. */
  at: number;
  mode: RainMode;
  onMode: (mode: RainMode) => void;
  zone: string;
}) {
  const shape = useTrackShape(track);
  const [element, map] = useMap(
    track,
    // Close enough to see the circuit; the forecast reaches 24 km around it.
    12,
    (created) => {
      L.tileLayer(STREETS, {
        maxZoom: 14,
        minZoom: 5,
        className: "base-tiles",
        attribution: STREETS_CREDIT,
      }).addTo(created);
      created.setMaxZoom(14).setMinZoom(5);
    },
    shape,
    true,
    true,
  );

  // Forecast: one picture per 15 minutes, drawn the first time it is shown.
  const ready = grid.state === "ready" ? grid.value : null;
  const index = ready ? frameAt(ready, at) : 0;
  const overlay = useRef<L.ImageOverlay | null>(null);
  useEffect(() => {
    if (!map || !ready || mode !== "forecast") return;
    const layer = L.imageOverlay(
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      [
        [ready.south, ready.west],
        [ready.north, ready.east],
      ],
      {
        interactive: false,
        className: "rain-overlay",
        attribution:
          'Rain forecast by <a href="https://open-meteo.com/">Open-Meteo</a>',
      },
    ).addTo(map);
    overlay.current = layer;
    return () => {
      layer.remove();
      overlay.current = null;
    };
  }, [map, ready, mode]);
  useEffect(() => {
    if (!ready || mode !== "forecast" || !overlay.current) return;
    const image = frameImage(ready, index);
    if (image) overlay.current.setUrl(image);
  }, [ready, index, mode, map]);

  // Radar: the measured frames, newest unless the slider was moved.
  const frames = radar.state === "ready" ? radar.value : [];
  const [chosen, setChosen] = useState<number | null>(null);
  const measured = frames.filter((frame) => !frame.forecast).length;
  const radarIndex =
    chosen === null || chosen >= frames.length
      ? Math.max(0, measured - 1)
      : chosen;
  const frame = frames[radarIndex];
  useEffect(() => {
    if (!map || !frame || mode !== "radar") return;
    // RainViewer's free images stop at zoom 7; closer in they are enlarged.
    const layer = L.tileLayer(frame.url, {
      opacity: 0.75,
      maxNativeZoom: 7,
      attribution:
        'Radar by <a href="https://www.rainviewer.com/">RainViewer</a>',
    }).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, frame, mode]);

  const loading = mode === "forecast" ? grid : radar;
  const dry =
    mode === "forecast" &&
    ready !== null &&
    ready.frames[index].every((value) => (value ?? 0) * 4 < RAIN_SCALE[0][0]);

  return (
    <Card
      title="Rain around the circuit"
      className="map-card"
      aside={
        <Segmented<RainMode>
          label="Rain map"
          value={mode}
          options={MODES}
          onChange={onMode}
        />
      }
    >
      <div className="map-wrap">
        <div
          ref={element}
          className="map"
          aria-label={
            mode === "forecast"
              ? `Forecast rain around ${track.name}`
              : `Rain radar around ${track.name}`
          }
          role="img"
        />
        <p className={`map-tag ${mode}`}>
          {mode === "forecast"
            ? `Forecast · ${ready ? formatClock(ready.times[index], zone) : "…"}`
            : frame
              ? `${frame.forecast ? "Radar forecast" : "Measured"} · ${formatClock(frame.time, zone)}`
              : "Radar"}
        </p>
        {loading.state === "loading" && (
          <p className="map-note" role="status">
            {mode === "forecast"
              ? "Loading the rain forecast"
              : "Loading the radar"}
          </p>
        )}
        {loading.state === "failed" && (
          <p className="map-note" role="status">
            {mode === "forecast"
              ? `No rain forecast map: ${loading.message}`
              : `No rain radar right now: ${loading.message}`}
          </p>
        )}
        {dry && (
          <p className="map-note quiet" role="status">
            No rain in this forecast at this time
          </p>
        )}
      </div>
      {mode === "radar" && frames.length > 1 && frame && (
        <div className="radar-slider">
          <span className="muted">{formatClock(frames[0].time, zone)}</span>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={radarIndex}
            aria-label="Radar time"
            aria-valuetext={`${formatClock(frame.time, zone)}${frame.forecast ? ", forecast" : ""}`}
            onChange={(event) => setChosen(Number(event.target.value))}
          />
          <span className="muted">
            {formatClock(frames.at(-1)!.time, zone)}
          </span>
          <output className="radar-now">{formatClock(frame.time, zone)}</output>
        </div>
      )}
      <div className="map-foot">
        <RainLegend />
        <p className="muted">
          {mode === "forecast"
            ? "One model's forecast (Open-Meteo best match) on a grid of 8 km, not the combination of all sources. Follows the timeline above."
            : "Measured by rain radar over the last two hours. It cannot show a session that has not started."}
        </p>
      </div>
    </Card>
  );
}
