import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { formatClock } from "../lib/format.ts";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
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
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className ?? ""}`} aria-label={title}>
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

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Loading({ label }: { label: string }) {
  return (
    <p className="empty loading" role="status">
      {label}
    </p>
  );
}

export function RefreshButton({
  fetchedAt,
  onRefresh,
}: {
  fetchedAt?: number;
  onRefresh: () => void;
}) {
  return (
    <>
      {fetchedAt !== undefined && (
        <span className="muted">Updated {formatClock(fetchedAt)} UTC</span>
      )}
      <button
        type="button"
        className="icon-button"
        onClick={onRefresh}
        aria-label="Refresh forecasts"
        title="Refresh"
      >
        <RotateCw size={14} aria-hidden="true" />
      </button>
    </>
  );
}

export function Stat({
  label,
  value,
  detail,
  children,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {children}
        {value}
      </span>
      {detail && <span className="stat-detail">{detail}</span>}
    </div>
  );
}
