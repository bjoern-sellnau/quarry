// Data-driven campaign levels. This module is intentionally free of any THREE
// imports so its geometry/connectivity can be unit-tested in plain Node.
//
// Levels are assembled with a small builder whose `attach` always creates a
// room that shares a face (with an overlapping window) with its parent — so
// connectivity is guaranteed by construction. Doors gate chosen openings.

class Builder {
  constructor() { this.cells = []; this.doors = []; }

  room(min, max, opts = {}) {
    const i = this.cells.length;
    this.cells.push({ min: [...min], max: [...max], ...opts });
    return i;
  }

  // Attach a new box to `parent` on the given face ('+x','-z', ...).
  // depth = extent along the travel axis; cross = [half, half] for the two
  // tangent axes in ascending axis order. Centred on the parent's centre line.
  attach(parent, face, depth, cross, opts = {}) {
    const P = this.cells[parent];
    const A = { x: 0, y: 1, z: 2 }[face[1]];
    const sign = face[0] === '+' ? 1 : -1;
    const center = [
      (P.min[0] + P.max[0]) / 2,
      (P.min[1] + P.max[1]) / 2,
      (P.min[2] + P.max[2]) / 2,
    ];
    const plane = sign > 0 ? P.max[A] : P.min[A];
    const min = [0, 0, 0], max = [0, 0, 0];
    if (sign > 0) { min[A] = plane; max[A] = plane + depth; }
    else { min[A] = plane - depth; max[A] = plane; }
    const tangents = [0, 1, 2].filter((a) => a !== A);
    min[tangents[0]] = center[tangents[0]] - cross[0];
    max[tangents[0]] = center[tangents[0]] + cross[0];
    min[tangents[1]] = center[tangents[1]] - cross[1];
    max[tangents[1]] = center[tangents[1]] + cross[1];
    const door = opts.door;
    delete opts.door;
    const i = this.room(min, max, opts);
    if (door) this.doors.push({ between: [parent, i], kind: door });
    return i;
  }

  // Tunnel + chamber in one travel direction. Returns the chamber index.
  corridor(parent, face, tun, ch, opts = {}) {
    const t = this.attach(parent, face, tun.depth, tun.cross, { color: opts.tunColor, door: opts.door });
    return this.attach(t, face, ch.depth, ch.cross, { color: opts.color, secret: opts.secret, kind: opts.kind });
  }
}

// Build one level from a compact spec. Produces cells, doors, and tags.
function makeLevel(cfg) {
  const b = new Builder();
  const S = cfg.scale;
  const pal = cfg.palette;
  const tun = { depth: 26 * S, cross: [4, 4] };
  const bigTun = { depth: 22 * S, cross: [5, 5] };

  // Hub.
  const hub = b.room(
    [-15 * S, -12 * S, -15 * S], [15 * S, 12 * S, 15 * S],
    { color: pal.hub },
  );

  // Spine of chambers going -z. The last one anchors the reactor wing.
  let prev = hub;
  const spine = [];
  for (let i = 0; i < cfg.spineCount; i++) {
    const ch = b.corridor(prev, '-z', tun,
      { depth: 30 * S, cross: [16 * S, 13 * S] },
      { color: i % 2 ? pal.chamberB : pal.chamberA, tunColor: pal.tunnel });
    spine.push(ch);
    prev = ch;
  }
  const lastSpine = spine[spine.length - 1];

  // Yellow keycard sits in the first spine chamber (out in the open).
  const yellowCell = spine[0];

  // Reactor wing off the last spine chamber (+x), behind a RED door.
  const reactor = b.corridor(lastSpine, '+x', bigTun,
    { depth: 40 * S, cross: [20 * S, 15 * S] },
    { color: pal.reactor, kind: 'reactor', door: 'red' });

  // Prison wing off the hub (+x), behind a YELLOW door, ending in a hall with
  // hostage cells gated by BLUE doors.
  const prisonHall = b.corridor(hub, '+x', tun,
    { depth: 32 * S, cross: [16 * S, 10 * S] },
    { color: pal.prison, door: 'yellow' });
  const prisonCells = [];
  const faces = ['+z', '-z', '+y', '-y'];
  for (let i = 0; i < cfg.hostages; i++) {
    const cell = b.attach(prisonHall, faces[i % faces.length], 16 * S, [6 * S, 5 * S],
      { color: pal.cell, kind: 'prison', door: 'blue' });
    prisonCells.push(cell);
  }

  // Emergency exit off the hub (-x), behind an EXIT door (opens on meltdown).
  const exit = b.corridor(hub, '-x', tun,
    { depth: 26 * S, cross: [12 * S, 9 * S] },
    { color: pal.exit, kind: 'exit', door: 'exit' });

  // Secret vault with the RED keycard, reached by shooting a secret door
  // hidden on the second spine chamber (-x), via a crawlway.
  const secretAnchor = spine[Math.min(1, spine.length - 1)];
  const secretVault = b.corridor(secretAnchor, '-x',
    { depth: 16 * S, cross: [3, 3] },
    { depth: 20 * S, cross: [11 * S, 9 * S] },
    { color: pal.secret, secret: true, door: 'secret' });

  // Optional extra secret (more keycard / ammo) below the hub.
  const secret2 = b.corridor(hub, '-y',
    { depth: 14 * S, cross: [3, 3] },
    { depth: 18 * S, cross: [10 * S, 8 * S] },
    { color: pal.secret, secret: true, door: 'secret' });

  return {
    name: cfg.name,
    palette: pal,
    cells: b.cells,
    doors: b.doors,
    startCell: hub,
    reactorCell: reactor,
    reactorHp: cfg.reactorHp,
    // Time to fly from the reactor back to the exit scales with the spine.
    meltdownTime: 45 + cfg.spineCount * 7,
    exitCell: exit,
    prisonCells,
    secretCells: [secretVault, secret2],
    keycards: [
      { kind: 'yellow', cell: yellowCell, dy: 6 * S },
      { kind: 'red', cell: secretVault, dy: 0 },
      { kind: 'blue', cell: prisonHall, dy: 0, dz: -6 * S },
    ],
    enemyTypes: cfg.enemyTypes,
    enemyCount: cfg.enemyCount,
    weapon: cfg.weapon,         // primary weapon granted on entering this level
    weaponLabel: cfg.weaponLabel,
  };
}

// Palettes per level for visual variety.
const LEVELS = [
  makeLevel({
    name: 'I — BOHRSCHACHT',
    scale: 1.0, spineCount: 3, hostages: 2, reactorHp: 1400, enemyCount: 10,
    enemyTypes: ['drone'],
    weapon: 'vulcan', weaponLabel: 'VULCAN-KANONE',
    palette: { hub: 0x5c7280, chamberA: 0x687784, chamberB: 0x607582, tunnel: 0x4e636f,
      reactor: 0x6e2e2e, prison: 0x3f5246, cell: 0x35463b, exit: 0x3a5a48, secret: 0x2f4538, fog: 0x0e151d },
  }),
  makeLevel({
    name: 'II — EISGROTTE',
    scale: 1.15, spineCount: 4, hostages: 2, reactorHp: 2000, enemyCount: 13,
    enemyTypes: ['drone', 'sentry'],
    weapon: 'spread', weaponLabel: 'SPREADFIRE',
    palette: { hub: 0x4a6a82, chamberA: 0x5a7e92, chamberB: 0x4f7488, tunnel: 0x3e5a6a,
      reactor: 0x6e2e3e, prison: 0x3f5256, cell: 0x35464b, exit: 0x3a5a58, secret: 0x2f4548, fog: 0x0c1620 },
  }),
  makeLevel({
    name: 'III — MAGMAKERN',
    scale: 1.25, spineCount: 4, hostages: 3, reactorHp: 2600, enemyCount: 16,
    enemyTypes: ['drone', 'sentry', 'kamikaze'],
    weapon: 'plasma', weaponLabel: 'PLASMA-WERFER',
    palette: { hub: 0x6e4438, chamberA: 0x7e4a32, chamberB: 0x743a2a, tunnel: 0x5a382e,
      reactor: 0x8e2e1e, prison: 0x5a4a36, cell: 0x46402b, exit: 0x5a5a38, secret: 0x45382f, fog: 0x18100a },
  }),
  makeLevel({
    name: 'IV — KRISTALLABYRINTH',
    scale: 1.35, spineCount: 5, hostages: 3, reactorHp: 3200, enemyCount: 19,
    enemyTypes: ['drone', 'sentry', 'kamikaze', 'wraith'],
    weapon: 'fusion', weaponLabel: 'FUSIONSKANONE',
    palette: { hub: 0x4a4a82, chamberA: 0x5a5a92, chamberB: 0x4f4f88, tunnel: 0x3e3e6a,
      reactor: 0x6e2e6e, prison: 0x46467e, cell: 0x3b3b56, exit: 0x3a5a78, secret: 0x2f2f58, fog: 0x0c0c20 },
  }),
  makeLevel({
    name: 'V — REAKTORZITADELLE',
    scale: 1.5, spineCount: 6, hostages: 4, reactorHp: 4200, enemyCount: 24,
    enemyTypes: ['drone', 'sentry', 'kamikaze', 'wraith', 'hexen'],
    weapon: 'helix', weaponLabel: 'HELIX-GESCHÜTZ',
    palette: { hub: 0x303040, chamberA: 0x3a3a4c, chamberB: 0x343444, tunnel: 0x26262e,
      reactor: 0x8e1e1e, prison: 0x3a3a3a, cell: 0x2b2b2b, exit: 0x2a6a48, secret: 0x24242f, fog: 0x070710 },
  }),
];

export { LEVELS, makeLevel, Builder };
