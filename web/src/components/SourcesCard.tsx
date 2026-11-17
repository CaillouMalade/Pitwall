import type { ProviderStatus } from "../lib/fetching.ts";
import { sourceLabel } from "../lib/sources.ts";
import { Card } from "./ui.tsx";

type State = "answered" | "none" | "failed";

interface Item {
  id: string;
  label: string;
  state: State;
  /** What a pointer or a screen reader is told. */
  title: string;
}

function items(statuses: readonly ProviderStatus[]): Item[] {
  return statuses.flatMap((status) =>
    status.sources.map((id): Item => {
      const label = sourceLabel(id);
      if (status.state === "failed")
        return {
          id,
          label,
          state: "failed",
          title: `${label}: ${status.message ?? "failed"}`,
        };
      return status.answered.includes(id)
        ? { id, label, state: "answered", title: `${label}: answered` }
        : {
            id,
            label,
            state: "none",
            title: `${label}: nothing for this place`,
          };
    }),
  );
}

/** Which sources answered for this track, which have nothing here and which failed. */
export function SourcesCard({
  statuses,
}: {
  statuses: readonly ProviderStatus[];
}) {
  const all = items(statuses);
  const answered = all.filter((item) => item.state === "answered").length;
  return (
    <Card
      title="Sources"
      aside={
        <span className="muted">
          {answered} of {all.length} answered
        </span>
      }
    >
      <ul className="sources">
        {all.map((item) => (
          <li
            key={item.id}
            className={`source ${item.state}`}
            title={item.title}
          >
            <i aria-hidden="true" />
            <span>{item.label}</span>
            <span className="visually-hidden">
              {item.state === "answered"
                ? "answered"
                : item.state === "failed"
                  ? "failed"
                  : "nothing for this place"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
