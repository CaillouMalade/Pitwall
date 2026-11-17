import { PROVIDER_AREAS } from "../lib/credits.ts";
import { PROVIDER_IDS } from "../lib/providers/index.ts";
import { useSettings } from "../lib/settings.tsx";
import { PROVIDER_LABELS } from "../lib/sources.ts";
import { TEMPERATURE_UNITS, WIND_UNITS } from "../lib/units.ts";
import { ThemeSwitch } from "./ThemeSwitch.tsx";
import { Dialog, Segmented } from "./ui.tsx";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { units, setUnits, providersOff, setProvidersOff } = useSettings();
  const on = PROVIDER_IDS.filter((id) => !providersOff.includes(id));

  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="settings">
        <div className="setting">
          <span id="setting-appearance">Appearance</span>
          <ThemeSwitch />
        </div>
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
        <fieldset className="setting-list">
          <legend>Forecast services</legend>
          {PROVIDER_IDS.map((id) => {
            const checked = !providersOff.includes(id);
            return (
              <label key={id} className="check">
                <input
                  type="checkbox"
                  checked={checked}
                  // The last one stays on: with none there is nothing to show.
                  disabled={checked && on.length === 1}
                  onChange={() =>
                    setProvidersOff(
                      checked
                        ? [...providersOff, id]
                        : providersOff.filter((item) => item !== id),
                    )
                  }
                />
                <span>{PROVIDER_LABELS[id]}</span>
                <span className="muted">{PROVIDER_AREAS[id]}</span>
              </label>
            );
          })}
        </fieldset>
      </div>
    </Dialog>
  );
}
