import { useState } from "react";
import { checkTrack, createTrack, TrackInputError } from "../lib/tracks.ts";
import type { Track } from "../lib/types.ts";
import { Dialog, Field } from "./ui.tsx";

interface Props {
  /** Every track in the app, for the name check. */
  tracks: readonly Track[];
  /** The track being edited; without one the dialog adds a new track. */
  editing?: Track;
  onSave: (track: Track) => void;
  onDelete?: (track: Track) => void;
  onClose: () => void;
}

/** Add a track at any coordinates, or edit or delete one the user added. */
export function TrackDialog({
  tracks,
  editing,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(editing?.name ?? "");
  const [latitude, setLatitude] = useState(
    editing ? String(editing.latitude) : "",
  );
  const [longitude, setLongitude] = useState(
    editing ? String(editing.longitude) : "",
  );
  const [error, setError] = useState<{ field: string; message: string } | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const input = checkTrack(name, latitude, longitude, tracks, editing?.id);
      // A track that moved gets its time zone looked up again.
      const moved =
        !!editing &&
        (editing.latitude !== input.latitude ||
          editing.longitude !== input.longitude);
      onSave(
        editing
          ? {
              ...editing,
              ...input,
              timezone: moved ? undefined : editing.timezone,
            }
          : createTrack(input, tracks),
      );
    } catch (problem) {
      setError(
        problem instanceof TrackInputError
          ? { field: problem.field, message: problem.message }
          : { field: "form", message: (problem as Error).message },
      );
    }
  };

  const invalid = (field: string) =>
    error?.field === field ? true : undefined;

  return (
    <Dialog title={editing ? "Edit track" : "Add a track"} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={invalid("name")}
            autoComplete="off"
            autoFocus
          />
        </Field>
        <div className="field-row">
          <Field label="Latitude">
            <input
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder="45.6191"
              inputMode="decimal"
              aria-invalid={invalid("latitude")}
              autoComplete="off"
            />
          </Field>
          <Field label="Longitude">
            <input
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder="9.2822"
              inputMode="decimal"
              aria-invalid={invalid("longitude")}
              autoComplete="off"
            />
          </Field>
        </div>
        <p className="form-message" role="alert">
          {error && <span className="form-error">{error.message}</span>}
        </p>
        <div className="dialog-actions">
          {editing &&
            onDelete &&
            (confirming ? (
              <button
                type="button"
                className="button danger"
                onClick={() => onDelete(editing)}
              >
                Delete {editing.name}
              </button>
            ) : (
              <button
                type="button"
                className="button quiet danger-text"
                onClick={() => setConfirming(true)}
              >
                Delete
              </button>
            ))}
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            {editing ? "Save" : "Add track"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
