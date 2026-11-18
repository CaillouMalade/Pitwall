// Where the dots of a spread line go, so that a bunch of them stays countable.

/** How far two dots must be apart to share a row, in % of the line. */
const DOT_GAP = 3.4;
/** Rows of dots from the middle: 0, then one up, one down, two up, two down. */
const LANES = [0, -1, 1, -2, 2];
export const LANE_PX = 9.5;

/**
 * Dots that would cover each other are stacked above and below the middle, so
 * a bunch shows how many it holds. When all rows are taken the dot moves right
 * by one gap: its exact value stays in its tooltip.
 */
export function swarm(
  sorted: readonly number[],
): { x: number; lane: number }[] {
  const last = LANES.map(() => -Infinity);
  return sorted.map((x) => {
    let row = last.findIndex((taken) => x - taken >= DOT_GAP);
    let at = x;
    if (row === -1) {
      row = last.indexOf(Math.min(...last));
      at = last[row] + DOT_GAP;
    }
    last[row] = at;
    return { x: at, lane: LANES[row] };
  });
}
