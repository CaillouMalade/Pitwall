import { useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Info,
  MoreVertical,
  Pencil,
  Plus,
  Settings,
} from "lucide-react";
import { GRADE1_TRACKS } from "../data/grade1-tracks.ts";
import { formatClock } from "../lib/format.ts";
import { formatCoordinates } from "../lib/tracks.ts";
import type { Track } from "../lib/types.ts";
import { useTrackShape } from "../lib/use-outline.ts";
import { trackZone, zoneName } from "../lib/zone.ts";
import { TrackMap } from "./TrackMap.tsx";

interface Props {
  userTracks: readonly Track[];
  track: Track;
  now: number;
  /** True once the page has moved under the bar, which then frosts over. */
  scrolled: boolean;
  onSelect: (id: string) => void;
  onAddTrack: () => void;
  onEditTrack: () => void;
  onEditWeekend: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

/**
 * The phone app's top bar. It stands in for the sidebar: the track is chosen
 * here, sessions are chosen on the pages themselves, and the rest is a menu.
 */
export function PhoneBar({
  userTracks,
  track,
  now,
  scrolled,
  onSelect,
  onAddTrack,
  onEditTrack,
  onEditWeekend,
  onSettings,
  onAbout,
}: Props) {
  const own = userTracks.some((item) => item.id === track.id);
  const zone = trackZone(track);
  const shape = useTrackShape(track);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const items = [
    { label: "Add a track", icon: Plus, run: onAddTrack },
    ...(own
      ? [{ label: `Edit ${track.name}`, icon: Pencil, run: onEditTrack }]
      : []),
    { label: "Edit sessions", icon: CalendarClock, run: onEditWeekend },
    { label: "Settings", icon: Settings, run: onSettings },
    { label: "About", icon: Info, run: onAbout },
  ];
  return (
    <header className={scrolled ? "phone-bar scrolled" : "phone-bar"}>
      {/* The sidebar's track card; the system's own picker opens over it. */}
      <div className="phone-track">
        <div className="track-current" aria-hidden="true">
          {shape && (
            <TrackMap
              shape={shape}
              label=""
              width={64}
              height={48}
              margin={5}
              className="mini"
            />
          )}
          <span className="track-current-text">
            <span className="track-current-name">{track.name}</span>
            <span className="track-current-sub">
              {track.country || formatCoordinates(track)} ·{" "}
              {formatClock(now, zone)} {zoneName(now, zone)}
            </span>
          </span>
          <ChevronDown size={16} className="chevron" />
        </div>
        <select
          aria-label="Track"
          value={track.id}
          onChange={(event) => onSelect(event.target.value)}
        >
          <optgroup label="FIA Grade 1">
            {GRADE1_TRACKS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
          {userTracks.length > 0 && (
            <optgroup label="Your tracks">
              {userTracks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      <div className="phone-menu">
        <button
          type="button"
          className="icon-button"
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MoreVertical size={20} aria-hidden="true" />
        </button>
        {open && (
          <>
            <button
              type="button"
              className="phone-menu-scrim"
              aria-label="Close the menu"
              onClick={() => setOpen(false)}
            />
            <div className="phone-menu-list" role="menu">
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.run();
                  }}
                >
                  <item.icon size={17} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
