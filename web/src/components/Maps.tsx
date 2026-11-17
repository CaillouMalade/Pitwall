import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatClock } from "../lib/format.ts";
import { readText, writeText } from "../lib/storage.ts";
import type { RadarFrame, Track } from "../lib/types.ts";
import type { Loadable } from "../lib/use-data.ts";
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
    const marker = L.circleMarker([track.latitude, track.longitude], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#e34948",
      fillOpacity: 1,
    })
      .bindTooltip(track.name)
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, track, zoom]);

  return [element, map];
}

export function CircuitMap({ track }: { track: Track }) {
  const [view, setView] = useState<View>(() =>
    readText(MAP_VIEW_KEY) === "map" ? "map" : "satellite",
  );
  const [element, map] = useMap(track, 14, (created) => {
    created.setMaxZoom(17).setMinZoom(8);
  });

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
      title="Circuit"
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

export function RadarMap({
  track,
  radar,
}: {
  track: Track;
  radar: Loadable<RadarFrame[]>;
}) {
  const [element, map] = useMap(track, 6, (created) => {
    L.tileLayer(STREETS, {
      maxZoom: 10,
      minZoom: 3,
      className: "base-tiles",
      attribution: STREETS_CREDIT,
    }).addTo(created);
    created.setMaxZoom(10).setMinZoom(3);
  });
  const frames = radar.state === "ready" ? radar.value : [];
  const [chosen, setChosen] = useState<number | null>(null);
  // The newest image unless the slider was moved.
  const index =
    chosen === null || chosen >= frames.length ? frames.length - 1 : chosen;
  const frame = frames[index];

  useEffect(() => {
    if (!map || !frame) return;
    // RainViewer's free images stop at zoom 7; closer in they are enlarged.
    const layer = L.tileLayer(frame.url, {
      opacity: 0.75,
      maxNativeZoom: 7,
      attribution:
        'Weather data by <a href="https://www.rainviewer.com/">RainViewer</a>',
    }).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, frame]);

  return (
    <Card
      title="Rain radar"
      className="map-card"
      aside={
        frame ? (
          <span className="muted">{formatClock(frame.time)} UTC</span>
        ) : undefined
      }
    >
      <div className="map-wrap">
        <div
          ref={element}
          className="map"
          aria-label={`Rain radar around ${track.name}`}
          role="img"
        />
        {radar.state === "loading" && (
          <p className="map-note" role="status">
            Loading the radar
          </p>
        )}
        {radar.state === "failed" && (
          <p className="map-note" role="status">
            No rain radar right now: {radar.message}
          </p>
        )}
      </div>
      {frames.length > 1 && (
        <div className="radar-slider">
          <span className="muted">{formatClock(frames[0].time)}</span>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={index}
            aria-label="Radar time"
            aria-valuetext={`${formatClock(frame.time)} UTC`}
            onChange={(event) => setChosen(Number(event.target.value))}
          />
          <span className="muted">{formatClock(frames.at(-1)!.time)}</span>
        </div>
      )}
    </Card>
  );
}
