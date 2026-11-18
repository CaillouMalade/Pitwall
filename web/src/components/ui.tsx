import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, CloudOff, RotateCw, X } from "lucide-react";
import { formatClock, formatDayTime } from "../lib/format.ts";
import type { Confidence } from "../lib/stats.ts";
import { localDay } from "../lib/zone.ts";

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  children,
}: {
  title: string;
  /** A short line above the title, like the page's name. */
  eyebrow?: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-title">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  );
}

export function Card({
  title,
  aside,
  children,
  className,
  label,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A name for screen readers, for a card without a title. */
  label?: string;
}) {
  return (
    <section className={`card ${className ?? ""}`} aria-label={title ?? label}>
      {(title || aside) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Warnings({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div className="warnings" role="status">
      {messages.map((message) => (
        <p key={message} className="warning">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>Skipped {message}</span>
        </p>
      ))}
    </div>
  );
}

/** One line above the content: the app is offline, or showing something kept from earlier. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="status">
      <CloudOff size={14} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Empty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Grey blocks the size of what is on its way. */
export function Loading({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <div className="skeletons" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="skeleton" />
      ))}
    </div>
  );
}

export function RefreshButton({
  fetchedAt,
  onRefresh,
  busy,
  zone = "UTC",
}: {
  fetchedAt?: number;
  onRefresh: () => void;
  busy?: boolean;
  /** The time zone the time is shown in: the track's. */
  zone?: string;
}) {
  // A forecast from another day says so: "Mon 16 Nov, 21:40" instead of "21:40".
  const sameDay =
    fetchedAt !== undefined &&
    localDay(fetchedAt, zone) === localDay(Date.now(), zone);
  return (
    <>
      {fetchedAt !== undefined && (
        <span className="muted">
          Updated{" "}
          {sameDay
            ? formatClock(fetchedAt, zone)
            : formatDayTime(fetchedAt, zone)}
        </span>
      )}
      <button
        type="button"
        className="icon-button"
        onClick={onRefresh}
        disabled={busy}
        aria-label="Refresh forecasts"
        title="Refresh"
      >
        <RotateCw size={14} aria-hidden="true" className={busy ? "spin" : ""} />
      </button>
    </>
  );
}

const CONFIDENCE_TEXT: Record<Confidence, string> = {
  high: "Forecasts agree",
  medium: "Some spread",
  low: "Forecasts disagree",
  unknown: "Too few forecasts",
};

/** How far the forecasts are apart, as a coloured label. */
export function ConfidenceBadge({
  level,
  short,
}: {
  level: Confidence;
  short?: boolean;
}) {
  return (
    <span className={`confidence ${level}`}>
      <i aria-hidden="true" />
      {short ? (level === "unknown" ? "n/a" : level) : CONFIDENCE_TEXT[level]}
    </span>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone,
  aside,
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** Which of the weather colours the tile takes. */
  tone?: "temp" | "rain" | "wind";
  /** Something small next to the label, like a confidence badge. */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <span className="stat-label">
        {label}
        {aside}
      </span>
      <span className="stat-value">
        {children}
        {value}
      </span>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  );
}

/** A row of mutually exclusive choices, as a radio group. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  iconOnly,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  iconOnly?: boolean;
}) {
  const move = (event: React.KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    const buttons = event.currentTarget.parentElement?.children;
    (
      buttons?.[(index + step + options.length) % options.length] as
        HTMLElement | undefined
    )?.focus();
  };
  return (
    <div
      className={`segmented ${iconOnly ? "icons" : ""}`}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-label={iconOnly ? option.label : undefined}
          title={iconOnly ? option.label : undefined}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {option.icon}
          {!iconOnly && option.label}
        </button>
      ))}
    </div>
  );
}

/** A modal dialog. Escape, the close button and a click outside all close it. */
export function Dialog({
  title,
  onClose,
  children,
  dismissable = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** False for a dialog that must be answered, like the first-run setup. */
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissable) onClose();
      }}
      onMouseDown={(event) => {
        // The dialog element itself is the backdrop; its content is inside.
        if (dismissable && event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          {dismissable && (
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
