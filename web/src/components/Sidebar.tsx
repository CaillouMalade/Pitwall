import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { GRADE1_TRACKS } from "../data/grade1-tracks.ts";
import { formatDayTime } from "../lib/format.ts";
import type { Session } from "../lib/sessions.ts";
import { appendUserTrack } from "../lib/storage.ts";
import { checkNewTrack, TrackInputError } from "../lib/tracks.ts";
import type { Track } from "../lib/types.ts";
import { ThemeSwitch } from "./ThemeSwitch.tsx";

interface Props {
  tracks: Track[];
  userTracks: Track[];
  track: Track;
  sessions: Session[];
  onSelect: (id: string) => void;
  onAdded: (track: Track, all: Track[]) => void;
}

export function Sidebar({
  tracks,
  userTracks,
  track,
  sessions,
  onSelect,
  onAdded,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={22} height={22} />
        <span>Pitwall</span>
      </div>

      <section aria-labelledby="track-heading" className="side-section">
        <h2 id="track-heading" className="side-heading">
          Track
        </h2>
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
      </section>

      <section aria-labelledby="sessions-heading" className="side-section">
        <h2 id="sessions-heading" className="side-heading">
          Sessions <span className="muted">UTC</span>
        </h2>
        <dl className="session-list">
          {sessions.map((session) => (
            <div key={session.name}>
              <dt>{session.name}</dt>
              <dd>{formatDayTime(session.start)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <AddTrack tracks={tracks} onAdded={onAdded} />

      <div className="side-footer">
        <ThemeSwitch />
      </div>
    </aside>
  );
}

function AddTrack({
  tracks,
  onAdded,
}: {
  tracks: Track[];
  onAdded: Props["onAdded"];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(
    null,
  );
  const [added, setAdded] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const track = checkNewTrack(
        name,
        latitude,
        longitude,
        tracks,
        GRADE1_TRACKS,
      );
      const all = appendUserTrack(track);
      setName("");
      setLatitude("");
      setLongitude("");
      setError(null);
      setAdded(track.name);
      onAdded(track, all);
    } catch (problem) {
      setAdded(null);
      setError(
        problem instanceof TrackInputError
          ? { field: problem.field, message: problem.message }
          : { field: "location", message: (problem as Error).message },
      );
    }
  };

  const invalid = (field: string) =>
    error?.field === field ? true : undefined;

  return (
    <section className="side-section">
      <button
        type="button"
        className="disclosure"
        aria-expanded={open}
        aria-controls="add-track-form"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className="disclosure-icon"
        />
        Add a track
      </button>
      {open && (
        <form
          id="add-track-form"
          className="add-track"
          onSubmit={submit}
          noValidate
        >
          <label>
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Monza Parabolica"
              aria-invalid={invalid("name")}
              autoComplete="off"
            />
          </label>
          <div className="coordinates">
            <label>
              <span>Latitude</span>
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="45.615"
                inputMode="decimal"
                aria-invalid={invalid("latitude")}
                autoComplete="off"
              />
            </label>
            <label>
              <span>Longitude</span>
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="9.29"
                inputMode="decimal"
                aria-invalid={invalid("longitude")}
                autoComplete="off"
              />
            </label>
          </div>
          <button type="submit" className="button primary">
            Add track
          </button>
          <p className="form-message" role="status" aria-live="polite">
            {error ? (
              <span className="form-error">{error.message}</span>
            ) : added ? (
              `Added ${added}.`
            ) : null}
          </p>
        </form>
      )}
    </section>
  );
}
