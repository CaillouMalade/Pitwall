// Builds web/src/data/track-outlines.json: the racing line of each built-in
// circuit as one loop, from OpenStreetMap (© OpenStreetMap contributors, ODbL).
//
//   node scripts/track-outlines.mjs <folder>
//
// <folder> holds one <track id>.json per circuit: the answer of the Overpass
// query printed by `node scripts/track-outlines.mjs --query <lat> <lon>`.
// The script is run by hand when a circuit changes; the app never runs it.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Lap length in metres of the layout to draw, and the driving direction. */
const CIRCUITS = {
  "red-bull-ring": { length: 4318, clockwise: true },
  spa: { length: 7004, clockwise: true },
  // `avoid` marks ways of other layouts: a loop uses as little of them as it can.
  "paul-ricard": { length: 5842, clockwise: true, avoid: /^$|Pinede/ },
  "magny-cours": { length: 4411, clockwise: true },
  hockenheim: {
    length: 4574,
    clockwise: true,
    avoid: /Rallycross|Kleiner Kurs|Schikanenvariante/,
  },
  nurburgring: { length: 5148, clockwise: true },
  hungaroring: { length: 4381, clockwise: true },
  monza: { length: 5793, clockwise: true },
  imola: { length: 4909, clockwise: false },
  mugello: { length: 5245, clockwise: true },
  zandvoort: { length: 4259, clockwise: true },
  portimao: { length: 4653, clockwise: true },
  barcelona: { length: 4657, clockwise: true },
  alcaniz: { length: 5345, clockwise: false },
  jerez: { length: 4428, clockwise: true },
  valencia: { length: 4005, clockwise: false },
};

export const overpassQuery = (latitude, longitude) =>
  `[out:json][timeout:60];way[highway=raceway](around:3500,${latitude},${longitude});out tags geom;`;

if (process.argv[2] === "--query") {
  console.log(overpassQuery(process.argv[3], process.argv[4]));
  process.exit(0);
}

// How finely points are told apart: 7 decimals is the data's own precision, 5
// (about a metre) also joins ways whose ends were drawn next to each other.
let decimals = 7;
const key = (point) =>
  `${point.lat.toFixed(decimals)},${point.lon.toFixed(decimals)}`;

function metres(a, b) {
  const dx =
    (b.lon - a.lon) *
    111_320 *
    Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = (b.lat - a.lat) * 110_570;
  return Math.hypot(dx, dy);
}

// Whole words only: "Spitzkehre" is a corner, not a pit.
const isPit = (tags) =>
  /\b(pits?|pit ?lane|box|boxes|boxengasse|bokszutca|paddock)\b/i.test(
    `${tags.name ?? ""} ${tags["name:en"] ?? ""}`,
  ) ||
  /^stands?$/i.test(tags.name ?? "") ||
  tags.service === "pit_lane";
const isOther = (tags) =>
  tags.sport === "karting" ||
  tags.sport === "karting;motor" ||
  /kart|moto|school|escuela|drift|off.?road|4x4|supermot/i.test(
    tags.name ?? "",
  );

/** The loop of ways whose length is closest to the lap length. */
function findLoop(ways, target, respectOneway = true, avoid = null) {
  // Every point where ways meet or end is a junction; between two junctions
  // runs one piece of track.
  const uses = new Map();
  for (const way of ways)
    way.geometry.forEach((point, i) => {
      const end = i === 0 || i === way.geometry.length - 1;
      uses.set(key(point), (uses.get(key(point)) ?? 0) + (end ? 1 : 2));
    });
  const junction = (point) => uses.get(key(point)) !== 2;
  const pieces = [];
  for (const way of ways) {
    const oneway = respectOneway && way.tags.oneway === "yes";
    let from = 0;
    for (let i = 1; i < way.geometry.length; i++) {
      if (i < way.geometry.length - 1 && !junction(way.geometry[i])) continue;
      const points = way.geometry.slice(from, i + 1);
      let length = 0;
      for (let j = 1; j < points.length; j++)
        length += metres(points[j - 1], points[j]);
      pieces.push({
        points,
        length,
        oneway,
        avoided: avoid?.test(way.tags.name ?? "") ? length : 0,
      });
      from = i;
    }
  }
  const leaving = new Map();
  const add = (piece, points) => {
    const start = key(points[0]);
    leaving.set(start, [
      ...(leaving.get(start) ?? []),
      { to: key(points.at(-1)), points, length: piece.length, piece },
    ]);
  };
  for (const piece of pieces) {
    add(piece, piece.points);
    if (!piece.oneway) add(piece, [...piece.points].reverse());
  }

  // Closest to the lap length wins; every metre on an avoided way counts
  // against a loop three times over.
  const cost = (length, avoided) => Math.abs(length - target) + 3 * avoided;
  let best = null;
  let steps = 0;
  const limit = target * 1.06;
  for (const start of leaving.keys()) {
    steps = 0;
    const visited = new Set([start]);
    const usedPieces = new Set();
    const walk = (node, length, avoided, trail) => {
      if (++steps > 400_000) return;
      for (const edge of leaving.get(node) ?? []) {
        if (usedPieces.has(edge.piece)) continue;
        const total = length + edge.length;
        if (total > limit) continue;
        const bad = avoided + edge.piece.avoided;
        if (edge.to === start) {
          if (
            Math.abs(total - target) <= target * 0.04 &&
            (!best || cost(total, bad) < best.cost)
          )
            best = {
              length: total,
              cost: cost(total, bad),
              edges: [...trail, edge],
            };
          continue;
        }
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        usedPieces.add(edge.piece);
        walk(edge.to, total, bad, [...trail, edge]);
        usedPieces.delete(edge.piece);
        visited.delete(edge.to);
      }
    };
    walk(start, 0, 0, []);
  }
  if (!best) return null;
  const loop = [];
  for (const edge of best.edges) loop.push(...edge.points.slice(0, -1));
  return { loop, length: best.length, cost: best.cost };
}

/** Twice the area inside a loop; positive when it runs anticlockwise. */
function signedArea(loop) {
  let sum = 0;
  const scale = Math.cos((loop[0].lat * Math.PI) / 180);
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    sum += a.lon * scale * b.lat - b.lon * scale * a.lat;
  }
  return sum;
}

/** Drop points that move the line by less than `tolerance` metres. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keepPoint = new Array(points.length).fill(false);
  keepPoint[0] = keepPoint[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const a = points[first];
    const b = points[last];
    const length = metres(a, b) || 1e-9;
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i];
      // Distance from p to the line a-b, from the triangle's area.
      const scale = Math.cos((a.lat * Math.PI) / 180) * 111_320;
      const cross = Math.abs(
        (b.lon - a.lon) * scale * (p.lat - a.lat) * 110_570 -
          (p.lon - a.lon) * scale * (b.lat - a.lat) * 110_570,
      );
      const distance = cross / length;
      if (distance > worst) {
        worst = distance;
        index = i;
      }
    }
    if (worst > tolerance) {
      keepPoint[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keepPoint[i]);
}

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node scripts/track-outlines.mjs <folder>");
  process.exit(1);
}

const outlines = {};
let failed = false;
for (const [id, circuit] of Object.entries(CIRCUITS)) {
  const file = path.join(folder, `${id}.json`);
  if (!existsSync(file)) {
    console.log(`${id}: no data, skipped`);
    continue;
  }
  const ways = JSON.parse(readFileSync(file, "utf8")).elements.filter(
    (element) => element.type === "way" && element.geometry?.length > 1,
  );
  const racing = ways.filter((way) => !isPit(way.tags) && !isOther(way.tags));
  // As drawn; joining ends a metre apart; ignoring one-way tags. The loop
  // that fits best over all of these is kept.
  let found = null;
  for (const [digits, oneway] of [
    [7, true],
    [5, true],
    [7, false],
    [5, false],
  ]) {
    decimals = digits;
    const loop = findLoop(racing, circuit.length, oneway, circuit.avoid);
    if (loop && (!found || loop.cost < found.cost - 1)) found = loop;
  }
  if (
    !found ||
    Math.abs(found.length - circuit.length) > circuit.length * 0.04
  ) {
    console.log(`${id}: no loop within 4% of ${circuit.length} m`);
    failed = true;
    continue;
  }
  let { loop } = found;
  if (signedArea(loop) < 0 !== circuit.clockwise) loop = loop.reverse();

  // The lap starts on the pit straight: at the loop point nearest the middle
  // of the longest pit lane.
  const pits = ways
    .filter((way) => isPit(way.tags) && !isOther(way.tags))
    .map((way) => {
      let length = 0;
      for (let i = 1; i < way.geometry.length; i++)
        length += metres(way.geometry[i - 1], way.geometry[i]);
      return { way, length };
    })
    .sort((a, b) => b.length - a.length);
  let startIndex = 0;
  if (pits.length) {
    const lane = pits[0].way.geometry;
    const middle = lane[Math.floor(lane.length / 2)];
    let nearest = Infinity;
    loop.forEach((point, i) => {
      const distance = metres(point, middle);
      if (distance < nearest) {
        nearest = distance;
        startIndex = i;
      }
    });
  }
  // A closed line has no "straight from first to last", so it goes in two halves.
  const simplifyLoop = (points) => {
    const half = Math.floor(points.length / 2);
    return [
      ...simplify(points.slice(0, half + 1), 1.5).slice(0, -1),
      ...simplify([...points.slice(half), points[0]], 1.5).slice(0, -1),
    ];
  };
  if (!pits.length) {
    // No pit lane on the map: start in the middle of the longest straight.
    const rough = simplifyLoop(loop);
    let longest = 0;
    let middle = rough[0];
    rough.forEach((point, i) => {
      const next = rough[(i + 1) % rough.length];
      if (metres(point, next) > longest) {
        longest = metres(point, next);
        middle = {
          lat: (point.lat + next.lat) / 2,
          lon: (point.lon + next.lon) / 2,
        };
      }
    });
    let nearest = Infinity;
    loop.forEach((point, i) => {
      if (metres(point, middle) < nearest) {
        nearest = metres(point, middle);
        startIndex = i;
      }
    });
  }
  loop = [...loop.slice(startIndex), ...loop.slice(0, startIndex)];
  const simple = simplifyLoop(loop);
  outlines[id] = {
    length: Math.round(found.length),
    clockwise: circuit.clockwise,
    loop: simple.map((point) => [
      Number(point.lat.toFixed(5)),
      Number(point.lon.toFixed(5)),
    ]),
  };
  console.log(
    `${id}: ${Math.round(found.length)} m (lap ${circuit.length} m), ${simple.length} points${pits.length ? "" : ", no pit lane found"}`,
  );
}

const target = path.join(root, "web/src/data/track-outlines.json");
writeFileSync(target, JSON.stringify(outlines) + "\n");
console.log(`Wrote ${Object.keys(outlines).length} outlines to ${target}`);
if (failed) process.exitCode = 1;
