import { CloudRain, Sun, Thermometer, Wind } from "lucide-react";
import {
  formatClock,
  formatDay,
  formatDayTime,
  formatNumber,
  formatWeekday,
} from "../lib/format.ts";
import { agreementText } from "../lib/dashboard.ts";
import { combineForecasts, combinePeriod, confidence } from "../lib/stats.ts";
import { centreOf } from "../lib/sources.ts";
import type { Session } from "../lib/sessions.ts";
import { useFormat } from "../lib/settings.tsx";
import { formatCoordinates } from "../lib/tracks.ts";
import type { ForecastPoint, Track } from "../lib/types.ts";
import { useForecast } from "../lib/use-data.ts";
import { useOutlineLookup, useTrackShape } from "../lib/use-outline.ts";
import { DAY } from "../lib/windows.ts";
import { trackZone, zoneName } from "../lib/zone.ts";
import {
  ChartGroup,
  RainChart,
  TemperatureChart,
  WindChart,
} from "./ForecastCharts.tsx";
import { CircuitMap } from "./Maps.tsx";
import { SourcesCard } from "./SourcesCard.tsx";
import { NorthMark, TrackMap } from "./TrackMap.tsx";
import {
  Card,
  ConfidenceBadge,
  Empty,
  Loading,
  Notice,
  PageHeader,
  RefreshButton,
  Warnings,
} from "./ui.tsx";

export function trackSubtitle(track: Track): string {
  return track.country || formatCoordinates(track);
}

/** The circuit's layout, with what helps to read it: start, direction, north, length. */
function TrackCard({ track }: { track: Track }) {
  const shape = useTrackShape(track);
  const lookup = useOutlineLookup(track);
  if (!shape)
    return (
      <Card className="track-card" title="Circuit">
        <div className="outline-ask">
          <p>
            {lookup.state === "empty"
              ? "OpenStreetMap has no racetrack at this place."
              : lookup.state === "failed"
                ? lookup.message
                : "There is no outline for this track yet."}
          </p>
          {(lookup.state === "none" || lookup.state === "failed") && (
            <button type="button" className="button" onClick={lookup.lookup}>
              Get the outline from OpenStreetMap
            </button>
          )}
          {lookup.state === "loading" && (
            <p className="muted" role="status">
              Asking OpenStreetMap…
            </p>
          )}
          <p className="muted">
            One request to OpenStreetMap's Overpass service, with this track's
            coordinates. The answer is kept on this computer.
          </p>
        </div>
      </Card>
    );
  const outline = shape.outline;
  return (
    <Card className="track-card" title="Circuit">
      <TrackMap
        shape={shape}
        label={`Layout of ${track.name}`}
        width={460}
        height={230}
        margin={24}
        detail
      >
        {({ width }) => <NorthMark x={width - 22} y={26} />}
      </TrackMap>
      <p className="track-facts muted">
        {outline ? (
          <>
            <span>{formatNumber(outline.length / 1000, 2)} km</span>
            <span>{outline.clockwise ? "Clockwise" : "Anticlockwise"}</span>
            <span className="pit-key">
              <i aria-hidden="true" /> Pit straight
            </span>
          </>
        ) : (
          <span>Racetrack lines from OpenStreetMap near this place</span>
        )}
      </p>
    </Card>
  );
}

function SessionTiles({
  track,
  sessions,
  points,
  now,
  onSession,
}: {
  track: Track;
  sessions: Session[];
  points: readonly ForecastPoint[];
  now: number;
  onSession: (index: number) => void;
}) {
  const format = useFormat();
  const zone = trackZone(track);
  return (
    <ul className="session-tiles" aria-label="Sessions at a glance">
      {sessions.map((session, index) => {
        const combined = combinePeriod(
          points,
          session.start,
          session.end,
          (source) => centreOf(source, track),
        );
        const grades = confidence(combined);
        const over = session.end <= now;
        const known = combined.sources > 0 && !over;
        const wet =
          combined.rainVoters > 0 &&
          combined.rainVotes * 2 >= combined.rainVoters;
        return (
          <li key={session.name}>
            <button
              type="button"
              className={`session-tile ${wet && known ? "wet" : ""} ${over ? "over" : ""}`}
              onClick={() => onSession(index)}
              title={`Open ${session.name}`}
            >
              <span className="tile-head">
                <span className="tile-name">{session.name}</span>
                <span className="tile-time">
                  {formatWeekday(session.start, zone)}{" "}
                  {formatClock(session.start, zone)}
                </span>
              </span>
              {known ? (
                <>
                  <span className="tile-main">
                    {wet ? (
                      <CloudRain size={20} aria-hidden="true" />
                    ) : (
                      <Sun size={20} aria-hidden="true" />
                    )}
                    {format.temperature(combined.temperature.value)}
                  </span>
                  <span className="tile-rows">
                    <span>
                      <CloudRain size={12} aria-hidden="true" />
                      {combined.rainVoters
                        ? `${combined.rainVotes} of ${combined.rainVoters} expect rain`
                        : "No rain value"}
                    </span>
                    <span>
                      <Wind size={12} aria-hidden="true" />
                      {format.wind(combined.wind.value)}
                      {combined.direction
                        ? ` from ${combined.direction.sector}`
                        : ""}
                    </span>
                  </span>
                  <ConfidenceBadge
                    level={grades.overall}
                    text={agreementText(grades)}
                  />
                </>
              ) : (
                <span className="tile-empty">
                  <Thermometer size={14} aria-hidden="true" />
                  {over ? "Over" : "No forecast yet"}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function WeekendOverview({
  track,
  sessions,
  start,
  end,
  now,
  onSession,
}: {
  track: Track;
  sessions: Session[];
  /** Midnight at the track of the weekend's first day, and of the day after its last. */
  start: number;
  end: number;
  now: number;
  onSession: (index: number) => void;
}) {
  const { data, refresh, online } = useForecast(track);
  const zone = trackZone(track);
  const retry = (
    <button type="button" className="button" onClick={refresh}>
      Try again
    </button>
  );

  let body;
  if (data.state === "loading")
    body = <Loading label="Fetching the forecasts" rows={3} />;
  else if (data.state === "failed")
    body = <Empty action={retry}>{data.message}</Empty>;
  else {
    const { points, failures, statuses, saved, fetchedAt } = data.value;
    // Only the 3 race days, so the charts match the sessions.
    const weekend = points.filter(
      (point) => point.time >= start && point.time < end,
    );
    const windows = combineForecasts(weekend, (source) =>
      centreOf(source, track),
    );
    const chart = {
      windows,
      sessions,
      from: start,
      to: end,
      zone,
      sync: "weekend",
    };
    body = (
      <>
        {saved ? (
          <Notice>
            {online ? "The weather services cannot be reached." : "Offline."}{" "}
            Showing the forecast from {formatDayTime(fetchedAt, zone)}.
          </Notice>
        ) : (
          <Warnings messages={failures} />
        )}
        {points.length === 0 ? (
          <Empty action={retry}>
            {online
              ? "No forecast could be loaded."
              : "Offline. No forecast is saved for this track yet."}
          </Empty>
        ) : windows.length === 0 ? (
          <Empty>
            {end <= now
              ? "This weekend is over."
              : "No forecast reaches this weekend yet."}
          </Empty>
        ) : (
          <>
            <SessionTiles
              track={track}
              sessions={sessions}
              points={points}
              now={now}
              onSession={onSession}
            />
            <ChartGroup>
              <Card title="Rain and temperature">
                <div className="chart-stack">
                  <TemperatureChart {...chart} />
                  <RainChart {...chart} />
                </div>
              </Card>
              <Card title="Wind">
                <WindChart {...chart} />
              </Card>
            </ChartGroup>
          </>
        )}
        {!saved && statuses.length > 0 && <SourcesCard statuses={statuses} />}
      </>
    );
  }

  return (
    <>
      <div className="hero">
        <PageHeader
          eyebrow="Weekend overview"
          title={track.name}
          subtitle={
            <>
              {trackSubtitle(track)} · {formatDay(start, zone)} to{" "}
              {formatDay(end - DAY / 2, zone)} · times in{" "}
              {zoneName(start, zone)}
            </>
          }
        >
          <RefreshButton
            fetchedAt={
              data.state === "ready" ? data.value.fetchedAt : undefined
            }
            onRefresh={refresh}
            busy={data.state === "loading"}
            zone={zone}
          />
        </PageHeader>
        <TrackCard track={track} />
      </div>
      {body}
      <CircuitMap track={track} />
    </>
  );
}
