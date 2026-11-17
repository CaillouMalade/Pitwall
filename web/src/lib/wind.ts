// Wind direction: compass sectors, and averaging without the 350°/10° trap.

export const COMPASS_SECTORS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;
export type Sector = (typeof COMPASS_SECTORS)[number];

/** A wind direction in degrees as N, NE, E, SE, S, SW, W or NW. */
export function compassSector(degrees: number): Sector {
  // Round to the closest of the 8 sectors; 360° goes back to N.
  const index = (((Math.round(degrees / 45) % 8) + 8) % 8) as number;
  return COMPASS_SECTORS[index];
}

/**
 * The mean of directions as arrows, not as numbers: 350° and 10° give 0°, not
 * 180°. Null for no directions, or for ones that cancel out (north and south).
 */
export function meanDirection(degrees: readonly number[]): number | null {
  if (degrees.length === 0) return null;
  let east = 0;
  let north = 0;
  for (const value of degrees) {
    east += Math.sin((value * Math.PI) / 180);
    north += Math.cos((value * Math.PI) / 180);
  }
  if (Math.hypot(east, north) / degrees.length < 1e-6) return null;
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}

export interface DirectionVote {
  sector: Sector;
  agreeing: number;
  /** How many directions were counted. */
  of: number;
}

/**
 * The most common sector among the directions. Votes are counted instead of
 * averaging the degrees, so the answer also says how many agree.
 */
export function directionVote(
  degrees: readonly (number | null)[],
): DirectionVote | null {
  const votes = new Map<Sector, number>();
  for (const value of degrees) {
    if (value === null) continue;
    const sector = compassSector(value);
    votes.set(sector, (votes.get(sector) ?? 0) + 1);
  }
  let best: Sector | null = null;
  let total = 0;
  for (const [sector, count] of votes) {
    total += count;
    if (best === null || count > votes.get(best)!) best = sector;
  }
  return best === null
    ? null
    : { sector: best, agreeing: votes.get(best)!, of: total };
}

export function voteText(vote: DirectionVote): string {
  return `${vote.agreeing} of ${vote.of} agree`;
}
