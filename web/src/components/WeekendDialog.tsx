import { useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { formatDay } from "../lib/format.ts";
import {
  checkPlan,
  checkSessions,
  checkTypeName,
  DEFAULT_MINUTES,
  matchingType,
  MAX_MINUTES,
  MAX_NAME_LENGTH,
  MAX_SESSIONS,
  MAX_TYPE_NAME_LENGTH,
  MAX_TYPES,
  MIN_MINUTES,
  parseDay,
  PlanInputError,
  sameSessions,
  STANDARD_TYPE,
  WEEKEND_DAYS,
  type SessionPlan,
  type WeekendPlan,
  type WeekendType,
} from "../lib/sessions.ts";
import type { WeekendTypes } from "../lib/storage.ts";
import type { Track } from "../lib/types.ts";
import { DAY } from "../lib/windows.ts";
import { trackZone, zoneName } from "../lib/zone.ts";
import { Dialog, Field } from "./ui.tsx";

interface Props {
  track: Track;
  plan: WeekendPlan;
  types: WeekendTypes;
  /** Save the list of weekend types and which one is the default; may throw. */
  onTypes: (types: WeekendTypes) => void;
  /** Null puts the track back on the default weekend type. */
  onSave: (plan: WeekendPlan | null) => void;
  onClose: () => void;
}

interface Row extends SessionPlan {
  /** Stable while the row is edited, so inputs keep their focus. */
  key: number;
}

const CUSTOM = "";

/**
 * The sessions of one track's weekend, and the weekend types they can be
 * saved as: a type can be applied to any track, and one type is the default.
 */
export function WeekendDialog({
  track,
  plan,
  types,
  onTypes,
  onSave,
  onClose,
}: Props) {
  const [start, setStart] = useState(plan.start ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    plan.sessions.map((session, key) => ({ ...session, key })),
  );
  const [nextKey, setNextKey] = useState(plan.sessions.length);
  const [error, setError] = useState<PlanInputError | Error | null>(null);
  const [naming, setNaming] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const change = (key: number, patch: Partial<SessionPlan>) => {
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setSaved(null);
  };
  const load = (sessions: readonly SessionPlan[]) => {
    setRows(sessions.map((session, key) => ({ ...session, key })));
    setNextKey(sessions.length);
    setError(null);
  };

  // The type the rows are equal to right now, if any.
  const current = (() => {
    try {
      return matchingType(checkSessions(rows), types.types);
    } catch {
      return null;
    }
  })();
  const defaultType =
    types.types.find((type) => type.id === types.defaultId) ?? STANDARD_TYPE;
  const zone = trackZone(track);
  const first = start === "" ? null : parseDay(start);
  const dayLabel = (day: number) =>
    first === null ? `Day ${day + 1}` : formatDay(first + day * DAY);

  const attempt = (action: () => void) => {
    try {
      action();
      setError(null);
    } catch (problem) {
      setError(problem as Error);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    attempt(() => {
      const checked = checkPlan(start, rows);
      // A weekend equal to the default type is not kept: the track follows it.
      onSave(
        checked.start === null &&
          sameSessions(checked.sessions, defaultType.sessions)
          ? null
          : checked,
      );
    });
  };

  const saveType = () =>
    attempt(() => {
      const sessions = checkSessions(rows);
      const name = checkTypeName(typeName, types.types);
      if (types.types.length > MAX_TYPES)
        throw new PlanInputError(
          null,
          `There can be at most ${MAX_TYPES} weekend types of your own.`,
        );
      const type: WeekendType = { id: `type-${Date.now()}`, name, sessions };
      onTypes({ ...types, types: [...types.types, type] });
      setNaming(false);
      setTypeName("");
      setSaved(`Saved as "${name}".`);
    });

  const errorRow = error instanceof PlanInputError ? error.row : undefined;

  return (
    <Dialog title={`Weekend at ${track.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <fieldset className="type-box">
          <legend>Weekend type</legend>
          <div className="type-row">
            <select
              aria-label="Weekend type"
              value={current?.id ?? CUSTOM}
              onChange={(event) => {
                const type = types.types.find(
                  (item) => item.id === event.target.value,
                );
                if (type) load(type.sessions);
                setSaved(null);
              }}
            >
              {!current && <option value={CUSTOM}>Not saved as a type</option>}
              {types.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                  {type.id === types.defaultId ? " (default)" : ""}
                </option>
              ))}
            </select>
            {current ? (
              <>
                <button
                  type="button"
                  className="button"
                  aria-pressed={current.id === types.defaultId}
                  disabled={current.id === types.defaultId}
                  title="Tracks without a weekend of their own use the default type"
                  onClick={() =>
                    attempt(() => {
                      onTypes({ ...types, defaultId: current.id });
                      setSaved(`"${current.name}" is now the default.`);
                    })
                  }
                >
                  <Star size={14} aria-hidden="true" />
                  {current.id === types.defaultId
                    ? "Default"
                    : "Set as default"}
                </button>
                {current.id !== STANDARD_TYPE.id && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete the type ${current.name}`}
                    title="Delete this type"
                    onClick={() =>
                      attempt(() => {
                        onTypes({
                          types: types.types.filter(
                            (type) => type.id !== current.id,
                          ),
                          defaultId:
                            types.defaultId === current.id
                              ? STANDARD_TYPE.id
                              : types.defaultId,
                        });
                        setSaved(`Deleted "${current.name}".`);
                      })
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </>
            ) : (
              !naming && (
                <button
                  type="button"
                  className="button"
                  onClick={() => setNaming(true)}
                >
                  Save as a type…
                </button>
              )
            )}
          </div>
          {naming && !current && (
            <div className="type-row">
              <input
                value={typeName}
                maxLength={MAX_TYPE_NAME_LENGTH}
                placeholder="Name, for example Sprint weekend"
                aria-label="Name of the new weekend type"
                autoFocus
                autoComplete="off"
                onChange={(event) => setTypeName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveType();
                  }
                }}
              />
              <button
                type="button"
                className="button primary"
                onClick={saveType}
              >
                Save type
              </button>
              <button
                type="button"
                className="button quiet"
                onClick={() => setNaming(false)}
              >
                Cancel
              </button>
            </div>
          )}
          <p className="muted type-hint" role="status">
            {saved ??
              "A type is a list of sessions you can reuse on any track. The default type is what every track starts with."}
          </p>
        </fieldset>

        <div className="field-row">
          <Field label="First day">
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              aria-invalid={errorRow === null ? true : undefined}
            />
          </Field>
          <div className="field">
            <span>&nbsp;</span>
            <button
              type="button"
              className="button"
              aria-pressed={start === ""}
              onClick={() => setStart("")}
            >
              Always tomorrow
            </button>
          </div>
        </div>

        <fieldset className="sessions-edit">
          <legend>
            Sessions, in the track's time ({zoneName(Date.now(), zone)})
          </legend>
          <div className="session-row head" aria-hidden="true">
            <span>Name</span>
            <span>Day</span>
            <span>Start</span>
            <span>Minutes</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div className="session-row" key={row.key}>
              <input
                value={row.name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) =>
                  change(row.key, { name: event.target.value })
                }
                aria-label={`Session ${index + 1} name`}
                aria-invalid={errorRow === index ? true : undefined}
                autoComplete="off"
              />
              <select
                value={row.day}
                onChange={(event) =>
                  change(row.key, { day: Number(event.target.value) })
                }
                aria-label={`Session ${index + 1} day`}
              >
                {Array.from({ length: WEEKEND_DAYS }, (_, day) => (
                  <option key={day} value={day}>
                    {dayLabel(day)}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={row.time}
                onChange={(event) =>
                  change(row.key, { time: event.target.value })
                }
                aria-label={`Session ${index + 1} start`}
              />
              <input
                type="number"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={5}
                value={Number.isFinite(row.minutes) ? row.minutes : ""}
                onChange={(event) =>
                  change(row.key, {
                    minutes:
                      event.target.value === ""
                        ? Number.NaN
                        : Number(event.target.value),
                  })
                }
                aria-label={`Session ${index + 1} length in minutes`}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setRows(rows.filter((item) => item !== row));
                  setSaved(null);
                }}
                disabled={rows.length === 1}
                aria-label={`Remove ${row.name || `session ${index + 1}`}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button quiet"
            disabled={rows.length >= MAX_SESSIONS}
            onClick={() => {
              setRows([
                ...rows,
                {
                  key: nextKey,
                  name: "",
                  day: 0,
                  time: "12:00",
                  minutes: DEFAULT_MINUTES,
                },
              ]);
              setNextKey(nextKey + 1);
              setSaved(null);
            }}
          >
            <Plus size={14} aria-hidden="true" /> Add session
          </button>
        </fieldset>

        <p className="form-message" role="alert">
          {error && <span className="form-error">{error.message}</span>}
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button quiet"
            onClick={() => {
              setStart("");
              load(defaultType.sessions);
              setSaved(null);
            }}
          >
            Reset to default
          </button>
          <span className="spacer" />
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
