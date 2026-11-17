import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatDay } from "../lib/format.ts";
import {
  checkPlan,
  DEFAULT_PLAN,
  isDefaultPlan,
  MAX_NAME_LENGTH,
  MAX_SESSIONS,
  parseDay,
  PlanInputError,
  WEEKEND_DAYS,
  type SessionPlan,
  type WeekendPlan,
} from "../lib/sessions.ts";
import type { Track } from "../lib/types.ts";
import { DAY } from "../lib/windows.ts";
import { Dialog, Field } from "./ui.tsx";

interface Props {
  track: Track;
  plan: WeekendPlan;
  /** Null puts the track back on the default weekend. */
  onSave: (plan: WeekendPlan | null) => void;
  onClose: () => void;
}

interface Row extends SessionPlan {
  /** Stable while the row is edited, so inputs keep their focus. */
  key: number;
}

/** The sessions of one track's weekend: first day, and each session's day and time. */
export function WeekendDialog({ track, plan, onSave, onClose }: Props) {
  const [start, setStart] = useState(plan.start ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    plan.sessions.map((session, key) => ({ ...session, key })),
  );
  const [nextKey, setNextKey] = useState(plan.sessions.length);
  const [error, setError] = useState<PlanInputError | Error | null>(null);

  const change = (key: number, patch: Partial<SessionPlan>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const first = start === "" ? null : parseDay(start);
  const dayLabel = (day: number) =>
    first === null ? `Day ${day + 1}` : formatDay(first + day * DAY);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const checked = checkPlan(start, rows);
      onSave(isDefaultPlan(checked) ? null : checked);
    } catch (problem) {
      setError(problem as Error);
    }
  };

  const reset = () => {
    setStart("");
    setRows(DEFAULT_PLAN.sessions.map((session, key) => ({ ...session, key })));
    setNextKey(DEFAULT_PLAN.sessions.length);
    setError(null);
  };

  const errorRow = error instanceof PlanInputError ? error.row : undefined;

  return (
    <Dialog title={`Weekend at ${track.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
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
          <legend>Sessions, UTC</legend>
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
                aria-label={`Session ${index + 1} time`}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setRows(rows.filter((item) => item !== row))}
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
                { key: nextKey, name: "", day: 0, time: "12:00" },
              ]);
              setNextKey(nextKey + 1);
            }}
          >
            <Plus size={14} aria-hidden="true" /> Add session
          </button>
        </fieldset>

        <p className="form-message" role="alert">
          {error && <span className="form-error">{error.message}</span>}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button quiet" onClick={reset}>
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
