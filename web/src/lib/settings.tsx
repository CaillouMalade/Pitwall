// The user's preferences, shared with every page: units and which services to ask.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { unitFormat, type UnitFormat } from "./format.ts";
import type { ProviderId } from "./sources.ts";
import {
  loadProvidersOff,
  loadUnits,
  saveProvidersOff,
  saveUnits,
} from "./storage.ts";
import { defaultUnits, type Units } from "./units.ts";

interface Settings {
  units: Units;
  setUnits: (units: Units) => void;
  providersOff: readonly ProviderId[];
  setProvidersOff: (ids: ProviderId[]) => void;
  format: UnitFormat;
}

const SettingsContext = createContext<Settings | null>(null);

function systemLocale(): string | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.language;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<Units>(() =>
    loadUnits(defaultUnits(systemLocale())),
  );
  const [providersOff, setProvidersOffState] = useState<ProviderId[]>(() =>
    loadProvidersOff(),
  );
  const setUnits = useCallback((next: Units) => {
    setUnitsState(next);
    saveUnits(next);
  }, []);
  const setProvidersOff = useCallback((ids: ProviderId[]) => {
    setProvidersOffState(ids);
    saveProvidersOff(ids);
  }, []);
  const value = useMemo(
    () => ({
      units,
      setUnits,
      providersOff,
      setProvidersOff,
      format: unitFormat(units),
    }),
    [units, setUnits, providersOff, setProvidersOff],
  );
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error("useSettings needs a SettingsProvider.");
  return settings;
}

/** Converting and formatting in the chosen units. */
export function useFormat(): UnitFormat {
  return useSettings().format;
}
