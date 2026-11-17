import { ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import {
  chanceOfRain,
  COMPASS_SECTORS,
  directionVotes,
  intervalText,
  providerRows,
  sessionMessage,
  sessionWindowRows,
  voteText,
} from "../lib/dashboard.ts";
import { formatClock, formatDayTime, formatValue } from "../lib/format.ts";
import type { Session } from "../lib/sessions.ts";
import { combineForecasts } from "../lib/stats.ts";
import type { Track } from "../lib/types.ts";
import { useForecast } from "../lib/use-data.ts";
import { WINDOW } from "../lib/windows.ts";
import {
  Card,
  Empty,
  Loading,
  PageHeader,
  RefreshButton,
  Stat,
  Warnings,
} from "./ui.tsx";

interface Props {
  track: Track;
  sessions: Session[];
  index: number;
  onIndex: (index: number) => void;
  now: number;
}

export function SessionDashboard({
  track,
  sessions,
  index,
  onIndex,
  now,
}: Props) {
  const { data, refresh } = useForecast(track);
  const session = sessions[index];

  return (
    <>
      <PageHeader title={track.name} subtitle={track.country}>
        <RefreshButton
          fetchedAt={data.state === "ready" ? data.value.fetchedAt : undefined}
          onRefresh={refresh}
        />
      </PageHeader>

      <div className="session-nav">
        <button
          type="button"
          className="button"
          onClick={() => onIndex(index - 1)}
          disabled={index === 0}
          aria-label="Previous session"
        >
          <ChevronLeft size={16} aria-hidden="true" /> Previous
        </button>
        <div className="session-title">
          <h2>{session.name}</h2>
          <span className="muted">
            {formatDayTime(session.start)} UTC · {index + 1} of{" "}
            {sessions.length}
          </span>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => onIndex(index + 1)}
          disabled={index === sessions.length - 1}
          aria-label="Next session"
        >
          Next <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {data.state === "loading" ? (
        <Loading label="Fetching the forecasts" />
      ) : data.state === "failed" ? (
        <Empty>{data.message}</Empty>
      ) : (
        <>
          <Warnings messages={data.value.failures} />
          <SessionWindow
            session={session}
            points={data.value.points}
            now={now}
          />
        </>
      )}
    </>
  );
}

function SessionWindow({
  session,
  points,
  now,
}: {
  session: Session;
  points: Parameters<typeof combineForecasts>[0];
  now: number;
}) {
  const rows = sessionWindowRows(points, session.start);
  const message = sessionMessage(session.start, now, rows);
  if (message) return <Empty>{message}</Empty>;

  // Only this session's window: one entry with the means and their 95% interval.
  const [window] = combineForecasts(rows);
  const vote = directionVotes(rows);
  const providers = providerRows(rows);
  const windowText = `${formatClock(window.time)}–${formatClock(window.time + WINDOW)} UTC`;

  return (
    <>
      <Card
        title="Combined"
        aside={<span className="muted">Window {windowText}</span>}
      >
        <div className="stats">
          <Stat
            label="Temperature"
            value={formatValue(window.temperature.mean, "°C")}
            detail={intervalText(window.temperature, "°C")}
          />
          <Stat
            label="Chance of rain"
            value={`${chanceOfRain(window).toFixed(0)}%`}
            detail={`${window.rainProviders} of ${window.providers} predict rain`}
          />
          <Stat
            label="Wind"
            value={formatValue(window.windKmh.mean, "km/h", 0)}
            detail={intervalText(window.windKmh, "km/h", 0)}
          />
          <Stat
            label="Wind from"
            value={vote ? vote.sector : "Unknown"}
            detail={vote ? voteText(vote) : undefined}
          >
            {vote && (
              <ArrowUp
                className="wind-arrow"
                size={18}
                aria-hidden="true"
                // The arrow points where the wind blows to.
                style={{
                  transform: `rotate(${COMPASS_SECTORS.indexOf(vote.sector) * 45 + 180}deg)`,
                }}
              />
            )}
          </Stat>
        </div>
      </Card>

      <Card title="By provider">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col" className="num">
                  Temperature
                </th>
                <th scope="col" className="num">
                  Rain
                </th>
                <th scope="col" className="num">
                  Wind
                </th>
                <th scope="col">From</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((row) => (
                <tr key={row.source}>
                  <th scope="row">{row.provider}</th>
                  <td className="num">{formatValue(row.temperature, "°C")}</td>
                  <td className="num">{formatValue(row.rain, "mm")}</td>
                  <td className="num">{formatValue(row.windKmh, "km/h", 0)}</td>
                  <td>{row.windFrom}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Combined</th>
                <td className="num">
                  {formatValue(window.temperature.mean, "°C")}
                </td>
                <td className="num">{formatValue(window.rain.mean, "mm")}</td>
                <td className="num">
                  {formatValue(window.windKmh.mean, "km/h", 0)}
                </td>
                <td>{vote ? vote.sector : "Unknown"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
