import { useState } from "react";
import { ChevronDown, Info, Pencil, Plus, Settings } from "lucide-react";
import { GRADE1_TRACKS } from "../data/grade1-tracks.ts";
import { formatClock, formatCountdown, formatDayTime } from "../lib/format.ts";
import type { Session } from "../lib/sessions.ts";
import { readText, TRACKS_COLLAPSED_KEY, writeText } from "../lib/storage.ts";
import { formatCoordinates } from "../lib/tracks.ts";
import type { Track } from "../lib/types.ts";
import { useTrackShape } from "../lib/use-outline.ts";
import { trackZone, zoneName } from "../lib/zone.ts";
import { TrackMap } from "./TrackMap.tsx";

interface Props {
  tracks: readonly Track[];
  userTracks: readonly Track[];
  track: Track;
  sessions: Session[];
  now: number;
  /** The session shown on the Session dashboard, when that page is open. */
  currentSession: number | null;
  onSelect: (id: string) => void;
  onSession: (index: number) => void;
  onAddTrack: () => void;
  onEditTrack: () => void;
  onEditWeekend: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

export function Sidebar({
  tracks,
  userTracks,
  track,
  sessions,
  now,
  currentSession,
  onSelect,
  onSession,
  onAddTrack,
  onEditTrack,
  onEditWeekend,
  onSettings,
  onAbout,
}: Props) {
  const own = userTracks.some((item) => item.id === track.id);
  const zone = trackZone(track);
  const shape = useTrackShape(track);
  // The list is closed until asked for: most visits stay on one track.
  const [open, setOpen] = useState(
    () => readText(TRACKS_COLLAPSED_KEY) === "open",
  );
  const toggle = () => {
    writeText(TRACKS_COLLAPSED_KEY, open ? "closed" : "open");
    setOpen(!open);
  };
  // The next session that has not ended yet gets a marker.
  const next = sessions.findIndex((session) => session.end > now);

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={24} height={24} />
        <span>Pitwall</span>
      </div>

      <section aria-labelledby="track-heading" className="side-section tracks">
        <div className="side-row">
          <h2 id="track-heading" className="side-heading">
            Track
          </h2>
          <div className="side-actions">
            {own && (
              <button
                type="button"
                className="icon-button"
                onClick={onEditTrack}
                aria-label={`Edit ${track.name}`}
                title="Edit track"
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={onAddTrack}
              aria-label="Add a track"
              title="Add a track"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="button"
          className="track-current"
          aria-expanded={open}
          aria-controls="track-list"
          onClick={toggle}
          aria-label={`${track.name}. ${open ? "Hide the track list" : "Choose another track"}`}
          title={open ? "Hide the track list" : "Choose another track"}
        >
          {shape && (
            <TrackMap
              shape={shape}
              label=""
              width={64}
              height={48}
              margin={5}
              className="mini"
            />
          )}
          <span className="track-current-text">
            <span className="track-current-name">{track.name}</span>
            <span className="track-current-sub">
              {track.country || formatCoordinates(track)} ·{" "}
              {formatClock(now, zone)} {zoneName(now, zone)}
            </span>
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`chevron ${open ? "up" : ""}`}
          />
        </button>

        {/* A plain select as well: the quickest way with a keyboard, and the only list on a phone. */}
        <select
          className="track-select"
          aria-label="Track"
          value={track.id}
          onChange={(event) => onSelect(event.target.value)}
        >
          <optgroup label="FIA Grade 1">
            {GRADE1_TRACKS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
          {userTracks.length > 0 && (
            <optgroup label="Your tracks">
              {userTracks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        <div
          id="track-list"
          className={`track-list-wrap ${open ? "open" : ""}`}
          hidden={!open}
        >
          <ul className="track-list" aria-label="Tracks">
            {tracks.map((item, index) => (
              <li key={item.id}>
                {index === GRADE1_TRACKS.length && (
                  <div className="list-divider">Your tracks</div>
                )}
                <button
                  type="button"
                  className="track-item"
                  aria-current={item.id === track.id ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  <span className="track-name">{item.name}</span>
                  <span className="track-country">{item.country}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="sessions-heading" className="side-section">
        <div className="side-row">
          <h2 id="sessions-heading" className="side-heading">
            Sessions <span className="muted">{zoneName(now, zone)}</span>
          </h2>
          <div className="side-actions">
            <button
              type="button"
              className="icon-button"
              onClick={onEditWeekend}
              aria-label="Edit sessions"
              title="Edit sessions"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        <ul className="session-list" aria-label="Sessions">
          {sessions.map((session, index) => (
            <li key={session.name}>
              <button
                type="button"
                className={`session-item ${session.end <= now ? "over" : ""}`}
                aria-current={currentSession === index ? "true" : undefined}
                onClick={() => onSession(index)}
              >
                <span className="session-name">
                  {session.name}
                  {index === next && (
                    <span className="session-next">
                      {session.start <= now
                        ? "now"
                        : formatCountdown(now, session.start)}
                    </span>
                  )}
                </span>
                <span className="session-time">
                  {formatDayTime(session.start, zone)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="side-footer">
        <button type="button" className="side-button" onClick={onSettings}>
          <Settings size={15} aria-hidden="true" /> Settings
        </button>
        <button type="button" className="side-button" onClick={onAbout}>
          <Info size={15} aria-hidden="true" /> About
        </button>
      </div>
    </aside>
  );
}
