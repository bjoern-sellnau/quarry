// Data-driven campaign levels. THREE-free so connectivity/gating can be
// unit-tested in plain Node. The Builder's `attach` always shares a face with
// an overlapping window, so connectivity is guaranteed by construction; each
// level below has its OWN hand-authored topology (shaft / spokes / cross /
// zigzag / citadel) rather than a shared template.

class Builder {
  constructor() { this.cells = []; this.doors = []; }

  room(min, max, opts = {}) {
    const i = this.cells.length;
    this.cells.push({ min: [...min], max: [...max], ...opts });
    return i;
  }

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

  corridor(parent, face, tun, ch, opts = {}) {
    const t = this.attach(parent, face, tun.depth, tun.cross, { color: opts.tunColor, door: opts.door });
    return this.attach(t, face, ch.depth, ch.cross, { color: opts.color, secret: opts.secret, kind: opts.kind });
  }
}

// ---- Reusable wings (each gated by exactly one door) -----------------------
const TUN = (S) => ({ depth: 26 * S, cross: [4, 4] });

function chamber(b, parent, face, S, pal, color, size = [16, 13], depth = 30) {
  return b.corridor(parent, face, TUN(S),
    { depth: depth * S, cross: [size[0] * S, size[1] * S] },
    { color, tunColor: pal.tunnel });
}

function reactorWing(b, anchor, face, S, pal) {
  return b.corridor(anchor, face, { depth: 22 * S, cross: [5, 5] },
    { depth: 40 * S, cross: [20 * S, 15 * S] },
    { color: pal.reactor, kind: 'reactor', door: 'red', tunColor: pal.tunnel });
}

function prisonWing(b, anchor, face, S, pal, hostages, cellFaces) {
  const hall = b.corridor(anchor, face, TUN(S),
    { depth: 34 * S, cross: [16 * S, 11 * S] },
    { color: pal.prison, door: 'yellow', tunColor: pal.tunnel });
  const cells = [];
  for (let i = 0; i < hostages; i++) {
    cells.push(b.attach(hall, cellFaces[i % cellFaces.length], 16 * S, [6 * S, 5 * S],
      { color: pal.cell, kind: 'prison', door: 'blue' }));
  }
  return { hall, cells };
}

function exitWing(b, anchor, face, S, pal) {
  return b.corridor(anchor, face, TUN(S),
    { depth: 26 * S, cross: [12 * S, 9 * S] },
    { color: pal.exit, kind: 'exit', door: 'exit', tunColor: pal.tunnel });
}

function secretWing(b, anchor, face, S, pal) {
  return b.corridor(anchor, face, { depth: 16 * S, cross: [3, 3] },
    { depth: 20 * S, cross: [11 * S, 9 * S] },
    { color: pal.secret, secret: true, door: 'secret', tunColor: pal.tunnel });
}

function hub(b, S, color, half = [15, 12, 15]) {
  return b.room([-half[0] * S, -half[1] * S, -half[2] * S], [half[0] * S, half[1] * S, half[2] * S], { color });
}

function finalize(b, m) {
  return {
    name: m.name, palette: m.pal, style: m.style,
    cells: b.cells, doors: b.doors,
    startCell: m.hub,
    reactorCell: m.reactor, reactorHp: m.reactorHp,
    meltdownTime: m.meltdownTime,
    exitCell: m.exit,
    prisonCells: m.prison.cells,
    secretCells: m.secrets,
    // Lock-and-key: yellow in the open; red + blue inside the yellow zone.
    keycards: [
      { kind: 'yellow', cell: m.yellowCell, dy: 6 * m.S },
      { kind: 'red', cell: m.prison.hall, dz: 6 * m.S },
      { kind: 'blue', cell: m.prison.hall, dz: -6 * m.S },
    ],
    enemyTypes: m.enemyTypes, enemyCount: m.enemyCount,
    weapon: m.weapon, weaponLabel: m.weaponLabel,
  };
}

// ---- Five distinct layouts -------------------------------------------------

// I — BOHRSCHACHT: a deep vertical drill shaft. The spine descends (-y).
function buildL1(c) {
  const b = new Builder(); const S = c.scale, pal = c.palette;
  const h = hub(b, S, pal.hub);
  const sh1 = chamber(b, h, '-y', S, pal, pal.chamberA, [13, 13], 26);
  const sh2 = chamber(b, sh1, '-y', S, pal, pal.chamberB, [13, 13], 26);
  const sh3 = chamber(b, sh2, '-y', S, pal, pal.chamberA, [15, 14], 28);
  const reactor = reactorWing(b, sh3, '+x', S, pal);     // bottom of the shaft
  const prison = prisonWing(b, h, '+x', S, pal, c.hostages, ['+z', '-z']);
  const exit = exitWing(b, h, '-x', S, pal);
  const secrets = [secretWing(b, sh1, '-z', S, pal), secretWing(b, sh2, '+z', S, pal)];
  return finalize(b, { ...c, pal, hub: h, reactor, prison, exit, secrets, yellowCell: sh1, S });
}

// II — EISGROTTE: hub-and-spoke caverns radiating in five directions.
function buildL2(c) {
  const b = new Builder(); const S = c.scale, pal = c.palette;
  const h = hub(b, S, pal.hub);
  const a1 = chamber(b, h, '+z', S, pal, pal.chamberA, [17, 13], 32);
  const a2 = chamber(b, a1, '+z', S, pal, pal.chamberB, [18, 14], 34);
  const reactor = reactorWing(b, a2, '+x', S, pal);      // end of the long spoke
  const c1 = chamber(b, h, '-z', S, pal, pal.chamberA, [16, 12], 30); // open spoke (yellow card)
  const u1 = chamber(b, h, '+y', S, pal, pal.chamberB, [14, 12], 26); // upper grotto
  const prison = prisonWing(b, h, '+x', S, pal, c.hostages, ['+z', '-z']);
  const exit = exitWing(b, h, '-x', S, pal);
  const secrets = [secretWing(b, c1, '+x', S, pal), secretWing(b, u1, '-x', S, pal)];
  return finalize(b, { ...c, pal, hub: h, reactor, prison, exit, secrets, yellowCell: c1, S });
}

// III — MAGMAKERN: a cross/plus, four arms from a central hub.
function buildL3(c) {
  const b = new Builder(); const S = c.scale, pal = c.palette;
  const h = hub(b, S, pal.hub);
  const n1 = chamber(b, h, '+z', S, pal, pal.chamberA, [16, 13], 30);   // north arm
  const reactor = reactorWing(b, n1, '+z', S, pal);                     // deep north
  const e1 = chamber(b, h, '+x', S, pal, pal.chamberB, [16, 13], 30);   // east arm (yellow card)
  const d1 = chamber(b, h, '-y', S, pal, pal.chamberA, [14, 12], 26);   // down arm
  const prison = prisonWing(b, h, '-z', S, pal, c.hostages, ['+x', '-x', '+y']);
  const exit = exitWing(b, h, '-x', S, pal);
  const secrets = [secretWing(b, e1, '+y', S, pal), secretWing(b, d1, '+x', S, pal)];
  return finalize(b, { ...c, pal, hub: h, reactor, prison, exit, secrets, yellowCell: e1, S });
}

// IV — KRISTALLABYRINTH: a zig-zagging maze of chambers.
function buildL4(c) {
  const b = new Builder(); const S = c.scale, pal = c.palette;
  const h = hub(b, S, pal.hub);
  const z1 = chamber(b, h, '+z', S, pal, pal.chamberA, [13, 11], 26);
  const z2 = chamber(b, z1, '+x', S, pal, pal.chamberB, [13, 11], 26);
  const z3 = chamber(b, z2, '+z', S, pal, pal.chamberA, [13, 11], 26);
  const z4 = chamber(b, z3, '-x', S, pal, pal.chamberB, [13, 11], 26);
  const z5 = chamber(b, z4, '+z', S, pal, pal.chamberA, [15, 13], 30);
  const reactor = reactorWing(b, z5, '+x', S, pal);
  const prison = prisonWing(b, h, '+x', S, pal, c.hostages, ['+z', '-z', '+y']);
  const exit = exitWing(b, h, '-x', S, pal);
  const secrets = [secretWing(b, z2, '-y', S, pal), secretWing(b, z4, '+y', S, pal)];
  return finalize(b, { ...c, pal, hub: h, reactor, prison, exit, secrets, yellowCell: z1, S });
}

// V — REAKTORZITADELLE: a large central arena, reactor above, prison below,
// approach spine ahead.
function buildL5(c) {
  const b = new Builder(); const S = c.scale, pal = c.palette;
  const h = hub(b, S, pal.hub, [20, 16, 20]); // big arena
  const reactor = reactorWing(b, h, '+y', S, pal);          // reactor up top
  const prison = prisonWing(b, h, '-y', S, pal, c.hostages, ['+x', '-x', '+z', '-z']);
  const s1 = chamber(b, h, '+z', S, pal, pal.chamberA, [17, 13], 32); // approach spine (yellow card)
  const s2 = chamber(b, s1, '+z', S, pal, pal.chamberB, [18, 14], 34);
  const s3 = chamber(b, s2, '+x', S, pal, pal.chamberA, [16, 13], 30);
  const exit = exitWing(b, h, '-z', S, pal);
  const secrets = [secretWing(b, s2, '-x', S, pal), secretWing(b, s3, '+y', S, pal)];
  return finalize(b, { ...c, pal, hub: h, reactor, prison, exit, secrets, yellowCell: s1, S });
}

// ---- Per-level configuration ----------------------------------------------
const CONFIGS = [
  { build: buildL1, name: 'I — BOHRSCHACHT', style: 'rock',
    scale: 1.0, hostages: 2, reactorHp: 1400, enemyCount: 10, meltdownTime: 60,
    enemyTypes: ['drone'], weapon: 'vulcan', weaponLabel: 'VULCAN-KANONE',
    palette: { hub: 0x5c7280, chamberA: 0x687784, chamberB: 0x607582, tunnel: 0x4e636f,
      reactor: 0x6e2e2e, prison: 0x3f5246, cell: 0x35463b, exit: 0x3a5a48, secret: 0x2f4538, fog: 0x0e151d } },
  { build: buildL2, name: 'II — EISGROTTE', style: 'ice',
    scale: 1.15, hostages: 2, reactorHp: 2000, enemyCount: 13, meltdownTime: 70,
    enemyTypes: ['drone', 'sentry'], weapon: 'spread', weaponLabel: 'SPREADFIRE',
    palette: { hub: 0x4a6a82, chamberA: 0x5a7e92, chamberB: 0x4f7488, tunnel: 0x3e5a6a,
      reactor: 0x6e2e3e, prison: 0x3f5256, cell: 0x35464b, exit: 0x3a5a58, secret: 0x2f4548, fog: 0x0c1620 } },
  { build: buildL3, name: 'III — MAGMAKERN', style: 'magma',
    scale: 1.25, hostages: 3, reactorHp: 2600, enemyCount: 16, meltdownTime: 72,
    enemyTypes: ['drone', 'sentry', 'kamikaze'], weapon: 'plasma', weaponLabel: 'PLASMA-WERFER',
    palette: { hub: 0x6e4438, chamberA: 0x7e4a32, chamberB: 0x743a2a, tunnel: 0x5a382e,
      reactor: 0x8e2e1e, prison: 0x5a4a36, cell: 0x46402b, exit: 0x5a5a38, secret: 0x45382f, fog: 0x18100a } },
  { build: buildL4, name: 'IV — KRISTALLABYRINTH', style: 'crystal',
    scale: 1.3, hostages: 3, reactorHp: 3200, enemyCount: 19, meltdownTime: 85,
    enemyTypes: ['drone', 'sentry', 'kamikaze', 'wraith'], weapon: 'fusion', weaponLabel: 'FUSIONSKANONE',
    palette: { hub: 0x4a4a82, chamberA: 0x5a5a92, chamberB: 0x4f4f88, tunnel: 0x3e3e6a,
      reactor: 0x6e2e6e, prison: 0x46467e, cell: 0x3b3b56, exit: 0x3a5a78, secret: 0x2f2f58, fog: 0x0c0c20 } },
  { build: buildL5, name: 'V — REAKTORZITADELLE', style: 'metal',
    scale: 1.4, hostages: 4, reactorHp: 4200, enemyCount: 24, meltdownTime: 95,
    enemyTypes: ['drone', 'sentry', 'kamikaze', 'wraith', 'hexen'], weapon: 'helix', weaponLabel: 'HELIX-GESCHÜTZ',
    palette: { hub: 0x303040, chamberA: 0x3a3a4c, chamberB: 0x343444, tunnel: 0x26262e,
      reactor: 0x8e1e1e, prison: 0x3a3a3a, cell: 0x2b2b2b, exit: 0x2a6a48, secret: 0x24242f, fog: 0x070710 } },
];

const LEVELS = CONFIGS.map((c) => c.build(c));

export { LEVELS, CONFIGS, Builder };
