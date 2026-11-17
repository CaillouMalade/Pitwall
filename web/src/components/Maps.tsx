import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatClock } from "../lib/format.ts";
import type { RadarFrame, Track } from "../lib/types.ts";
import type { Loadable } from "../lib/use-data.ts";
import { Card, Empty, Loading } from "./ui.tsx";

const SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREETS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

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
  const [element] = useMap(track, 14, (map) => {
    L.tileLayer(SATELLITE, {
      maxZoom: 18,
      attribution: '<a href="https://www.esri.com/">Esri</a> World Imagery',
    }).addTo(map);
  });
  return (
    <Card title="Circuit" className="map-card">
      <div
        ref={element}
        className="map"
        aria-label={`Satellite view of ${track.name}`}
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
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
      attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
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
        {radar.state === "loading" && <Loading label="Loading the radar" />}
        {radar.state === "failed" && (
          <Empty>No rain radar right now: {radar.message}</Empty>
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
