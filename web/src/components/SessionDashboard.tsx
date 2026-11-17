import { ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import {
  rainText,
  rangeText,
  sessionMessage,
  sessionWindowRows,
  sourceRows,
  sourcesText,
} from "../lib/dashboard.ts";
import { formatClock, formatDayTime, formatValue } from "../lib/format.ts";
import type { Session } from "../lib/sessions.ts";
import { useFormat } from "../lib/settings.tsx";
import { centreOf } from "../lib/sources.ts";
import { combineWindow } from "../lib/stats.ts";
import type { ForecastPoint, Track } from "../lib/types.ts";
import { useForecast } from "../lib/use-data.ts";
import { COMPASS_SECTORS, voteText } from "../lib/wind.ts";
import { WINDOW } from "../lib/windows.ts";
import {
  Card,
  Empty,
  Loading,
  Notice,
  PageHeader,
  RefreshButton,
  Stat,
  Warnings,
} from "./ui.tsx";
import { trackSubtitle } from "./WeekendOverview.tsx";

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
  const { data, refresh, online } = useForecast(track);
  const session = sessions[index];

  return (
    <>
      <PageHeader title={track.name} subtitle={trackSubtitle(track)}>
        <RefreshButton
          fetchedAt={data.state === "ready" ? data.value.fetchedAt : undefined}
          onRefresh={refresh}
          busy={data.state === "loading"}
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
        <div className="session-title" aria-live="polite">
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
        <Loading label="Fetching the forecasts" rows={2} />
      ) : data.state === "failed" ? (
        <Empty
          action={
            <button type="button" className="button" onClick={refresh}>
              Try again
            </button>
          }
        >
          {data.message}
        </Empty>
      ) : (
        <>
          {data.value.saved ? (
            <Notice>
              {online ? "The weather services cannot be reached." : "Offline."}{" "}
              Showing the forecast from {formatDayTime(data.value.fetchedAt)}{" "}
              UTC.
            </Notice>
          ) : (
            <Warnings messages={data.value.failures} />
          )}
          <SessionWindow
            track={track}
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
  track,
  session,
  points,
  now,
}: {
  track: Track;
  session: Session;
  points: readonly ForecastPoint[];
  now: number;
}) {
  const format = useFormat();
  const rows = sessionWindowRows(points, session.start);
  const message = sessionMessage(session.start, now, rows);
  if (message) return <Empty>{message}</Empty>;

  const centre = (source: string) => centreOf(source, track);
  // Only this session's window: the middle value, the range and the votes.
  const window = combineWindow(rows[0].time, rows, centre);
  const groups = sourceRows(rows, centre);
  const vote = window.direction;
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
            value={format.temperature(window.temperature.value)}
            detail={rangeText(
              window.temperature,
              format.temperatureUnit,
              format.temperatureNumber,
            )}
          />
          <Stat
            label="Rain"
            value={formatValue(window.rain.value, "mm")}
            detail={rainText(window)}
          />
          <Stat
            label="Wind"
            value={format.wind(window.wind.value)}
            detail={rangeText(window.wind, format.windUnit, format.windNumber)}
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
        <p className="card-foot muted">{sourcesText(window)}</p>
      </Card>

      <Card title="By source">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Centre</th>
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
              {groups.map((group) =>
                group.rows.map((row) => (
                  <tr key={row.source}>
                    <th scope="row">
                      {row.label}
                      {row.via && <span className="via">{row.via}</span>}
                    </th>
                    <td className="centre">{group.centre}</td>
                    <td className="num">
                      {format.temperature(row.temperature)}
                    </td>
                    <td className="num">{formatValue(row.rain, "mm")}</td>
                    <td className="num">{format.wind(row.windSpeed)}</td>
                    <td>{row.windFrom ?? "–"}</td>
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Combined</th>
                <td className="centre">
                  {window.centres} centre{window.centres === 1 ? "" : "s"}
                </td>
                <td className="num">
                  {format.temperature(window.temperature.value)}
                </td>
                <td className="num">{formatValue(window.rain.value, "mm")}</td>
                <td className="num">{format.wind(window.wind.value)}</td>
                <td>{vote ? vote.sector : "–"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
