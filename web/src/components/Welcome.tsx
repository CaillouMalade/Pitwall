import { useState } from "react";
import { useSettings } from "../lib/settings.tsx";
import type { Track } from "../lib/types.ts";
import { TEMPERATURE_UNITS, WIND_UNITS } from "../lib/units.ts";
import { Dialog, Field, Segmented } from "./ui.tsx";

/** The first launch: pick a track and the units, then straight to the forecast. */
export function Welcome({
  tracks,
  track,
  onDone,
}: {
  tracks: readonly Track[];
  track: Track;
  onDone: (trackId: string) => void;
}) {
  const { units, setUnits } = useSettings();
  const [trackId, setTrackId] = useState(track.id);

  return (
    <Dialog
      title="Set up Pitwall"
      onClose={() => onDone(trackId)}
      dismissable={false}
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          onDone(trackId);
        }}
      >
        <Field label="Track">
          <select
            value={trackId}
            onChange={(event) => setTrackId(event.target.value)}
            autoFocus
          >
            {tracks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.country ? `, ${item.country}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="setting">
          <span>Temperature</span>
          <Segmented
            label="Temperature"
            value={units.temperature}
            options={TEMPERATURE_UNITS}
            onChange={(temperature) => setUnits({ ...units, temperature })}
          />
        </div>
        <div className="setting">
          <span>Wind speed</span>
          <Segmented
            label="Wind speed"
            value={units.wind}
            options={WIND_UNITS}
            onChange={(wind) => setUnits({ ...units, wind })}
          />
        </div>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="submit" className="button primary">
            Continue
          </button>
        </div>
      </form>
    </Dialog>
  );
}
