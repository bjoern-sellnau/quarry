// The mine: axis-aligned chambers + tunnels. Doorways (openings) between
// touching cells are derived automatically and used for both rendering
// (walls with holes) and collision (pass-through). Some openings carry a
// `door` (keycard / secret / exit) that blocks passage until opened.
import * as THREE from 'three';

const EPS = 0.01;

// Face keys and their tangent axes (the two axes that span the face plane).
const FACES = {
  '+x': { axis: 'x', sign: 1, t: ['y', 'z'] },
  '-x': { axis: 'x', sign: -1, t: ['y', 'z'] },
  '+y': { axis: 'y', sign: 1, t: ['x', 'z'] },
  '-y': { axis: 'y', sign: -1, t: ['x', 'z'] },
  '+z': { axis: 'z', sign: 1, t: ['x', 'y'] },
  '-z': { axis: 'z', sign: -1, t: ['x', 'y'] },
};

// Cell layout. Each cell is a box [min..max]. Cells that share a face plane
// (and overlap on it) become connected by a doorway automatically.
const CELLS = [
  { min: [-15, -12, -15], max: [15, 12, 15], color: 0x5c7280 },   // 0 start chamber
  { min: [-4, -4, -45], max: [4, 4, -15], color: 0x4e636f },      // 1 tunnel A->B (-z)
  { min: [-18, -14, -75], max: [18, 14, -45], color: 0x607582 },  // 2 chamber B
  { min: [18, -4, -64], max: [48, 4, -56], color: 0x4e636f },     // 3 tunnel B->C (+x)
  { min: [48, -16, -78], max: [84, 16, -42], color: 0x687784 },   // 4 chamber C (arena)
  { min: [15, -4, -4], max: [45, 4, 4], color: 0x4e636f },        // 5 tunnel A->D (+x)
  { min: [45, -12, -20], max: [75, 12, 16], color: 0x607582 },    // 6 chamber D
  { min: [58, 16, -68], max: [70, 40, -52], color: 0x4e636f },    // 7 vertical shaft (+y from C)
  { min: [50, 40, -76], max: [86, 72, -44], color: 0x687784 },    // 8 high chamber E

  // --- Secret areas: reached through shoot-to-open secret doors. ---
  { min: [-30, -3, -60], max: [-18, 3, -54], color: 0x3a4a40 },   // 9 secret crawlway off chamber B (-x)
  { min: [-52, -10, -67], max: [-30, 10, -47], color: 0x2f4538, secret: true }, // 10 SECRET vault A (red keycard)
  { min: [75, -3, -6], max: [90, 3, 2], color: 0x3a4a40 },        // 11 secret crawlway off chamber D (+x)
  { min: [90, -10, -16], max: [110, 10, 12], color: 0x2f4538, secret: true },   // 12 SECRET vault B (yellow keycard)

  // --- Prison block (behind yellow door off chamber D, +z). ---
  { min: [50, -4, 16], max: [70, 4, 40], color: 0x4a5a4e },       // 13 prison corridor
  { min: [44, -10, 40], max: [76, 10, 64], color: 0x3f5246, kind: 'prison' }, // 14 prison hall
  { min: [24, -6, 44], max: [44, 6, 60], color: 0x35463b, kind: 'cell' },     // 15 prison cell 1 (blue door)
  { min: [76, -6, 44], max: [96, 6, 60], color: 0x35463b, kind: 'cell' },     // 16 prison cell 2 (blue door)

  // --- Reactor wing (behind red door off chamber C, +x). ---
  { min: [84, -6, -66], max: [104, 6, -54], color: 0x5a3a3a },    // 17 reactor approach
  { min: [104, -16, -78], max: [140, 16, -42], color: 0x6e2e2e, kind: 'reactor' }, // 18 reactor room

  // --- Emergency exit (off start, -x). Exit door opens once reactor blows. ---
  { min: [-35, -4, -4], max: [-15, 4, 4], color: 0x4e5a4e },      // 19 exit tunnel
  { min: [-60, -10, -16], max: [-35, 10, 12], color: 0x3a5a48, kind: 'exit' }, // 20 exit chamber
];

// Doors that gate specific openings between two cells.
// kind: 'red' | 'blue' | 'yellow' (need keycard) | 'secret' (shoot to open) | 'exit' (opens on reactor destruction)
const DOORS = [
  { between: [2, 9], kind: 'secret' },
  { between: [6, 11], kind: 'secret' },
  { between: [6, 13], kind: 'yellow' },
  { between: [14, 15], kind: 'blue' },
  { between: [14, 16], kind: 'blue' },
  { between: [4, 17], kind: 'red' },
  { between: [19, 20], kind: 'exit' },
];

export class Level {
  constructor() {
    this.cells = CELLS.map((c, i) => ({
      index: i,
      min: new THREE.Vector3(...c.min),
      max: new THREE.Vector3(...c.max),
      center: new THREE.Vector3(
        (c.min[0] + c.max[0]) / 2,
        (c.min[1] + c.max[1]) / 2,
        (c.min[2] + c.max[2]) / 2,
      ),
      color: c.color,
      secret: !!c.secret,
      kind: c.kind || null,
      openings: { '+x': [], '-x': [], '+y': [], '-y': [], '+z': [], '-z': [] },
    }));
    this._computeOpenings();
    this._attachDoors();
  }

  _computeOpenings() {
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) {
      for (let j = 0; j < cells.length; j++) {
        if (i === j) continue;
        const A = cells[i], B = cells[j];
        this._tryFace(A, B, 'x', 'y', 'z');
        this._tryFace(A, B, 'y', 'x', 'z');
        this._tryFace(A, B, 'z', 'x', 'y');
      }
    }
  }

  // If A.max[axis] == B.min[axis] and the two tangent ranges overlap, create
  // a doorway on A '+axis' and B '-axis' (same rect object shared by both).
  _tryFace(A, B, axis, t0, t1) {
    if (Math.abs(A.max[axis] - B.min[axis]) > EPS) return;
    const u0 = Math.max(A.min[t0], B.min[t0]);
    const u1 = Math.min(A.max[t0], B.max[t0]);
    const v0 = Math.max(A.min[t1], B.min[t1]);
    const v1 = Math.min(A.max[t1], B.max[t1]);
    if (u1 - u0 <= EPS || v1 - v0 <= EPS) return;
    const rect = { u0, u1, v0, v1, axis, faceVal: A.max[axis], t0, t1, a: A.index, b: B.index };
    A.openings['+' + axis].push(rect);
    B.openings['-' + axis].push(rect);
  }

  // Match each DOOR to the shared opening rect between its two cells.
  _attachDoors() {
    this.doors = [];
    for (const d of DOORS) {
      const [a, b] = d.between;
      const A = this.cells[a];
      let found = null;
      for (const key of Object.keys(A.openings)) {
        for (const rect of A.openings[key]) {
          if (rect.a === a && rect.b === b || rect.a === b && rect.b === a) { found = rect; break; }
        }
        if (found) break;
      }
      if (!found) { console.warn('door not matched for cells', a, b); continue; }
      const center = new THREE.Vector3();
      center[found.axis] = found.faceVal;
      center[found.t0] = (found.u0 + found.u1) / 2;
      center[found.t1] = (found.v0 + found.v1) / 2;
      const desc = { rect: found, kind: d.kind, open: false, cells: [a, b], center };
      found.door = desc;
      this.doors.push(desc);
    }
  }

  // ---------- Geometry ----------
  // Everything is merged into a single wall mesh (vertex-coloured) plus a
  // single line mesh for the panel outlines. Two draw calls for the whole
  // mine instead of hundreds — far cheaper to render.
  build(scene) {
    const positions = [];
    const normals = [];
    const colors = [];
    const linePos = [];

    const ab = new THREE.Vector3();
    const ad = new THREE.Vector3();
    const nrm = new THREE.Vector3();

    for (const cell of this.cells) {
      const col = new THREE.Color(cell.color);
      for (const key of Object.keys(FACES)) {
        const quads = this._faceQuads(cell, key);
        for (const q of quads) {
          const [a, b, c, d] = q.pts;
          ab.subVectors(b, a);
          ad.subVectors(d, a);
          nrm.crossVectors(ab, ad).normalize();
          for (const v of [a, b, c, a, c, d]) {
            positions.push(v.x, v.y, v.z);
            normals.push(nrm.x, nrm.y, nrm.z);
            colors.push(col.r, col.g, col.b);
          }
          // Panel outline (4 edges).
          for (const [p, q2] of [[a, b], [b, c], [c, d], [d, a]]) {
            linePos.push(p.x, p.y, p.z, q2.x, q2.y, q2.z);
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.15,
      emissive: 0x141d24,
      emissiveIntensity: 1.0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const lgeo = new THREE.BufferGeometry();
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x7fd4e6, transparent: true, opacity: 0.45 });
    scene.add(new THREE.LineSegments(lgeo, lineMat));

    this.group = mesh;
  }

  _faceQuads(cell, key) {
    const f = FACES[key];
    const axis = f.axis;
    const [t0, t1] = f.t;
    const faceVal = f.sign > 0 ? cell.max[axis] : cell.min[axis];
    const u0 = cell.min[t0], u1 = cell.max[t0];
    const v0 = cell.min[t1], v1 = cell.max[t1];

    const holes = cell.openings[key];
    let rects = [{ u0, u1, v0, v1 }];
    for (const h of holes) {
      const next = [];
      for (const r of rects) next.push(...this._frameSplit(r, h));
      rects = next;
    }

    const toPoint = (u, v) => {
      const p = { x: 0, y: 0, z: 0 };
      p[axis] = faceVal;
      p[t0] = u;
      p[t1] = v;
      return new THREE.Vector3(p.x, p.y, p.z);
    };

    return rects.map((r) => ({
      pts: [toPoint(r.u0, r.v0), toPoint(r.u1, r.v0), toPoint(r.u1, r.v1), toPoint(r.u0, r.v1)],
    }));
  }

  _frameSplit(r, h) {
    const hu0 = Math.max(r.u0, h.u0), hu1 = Math.min(r.u1, h.u1);
    const hv0 = Math.max(r.v0, h.v0), hv1 = Math.min(r.v1, h.v1);
    if (hu1 - hu0 <= EPS || hv1 - hv0 <= EPS) return [r];

    const out = [];
    const push = (u0, u1, v0, v1) => {
      if (u1 - u0 > EPS && v1 - v0 > EPS) out.push({ u0, u1, v0, v1 });
    };
    push(r.u0, r.u1, r.v0, hv0);
    push(r.u0, r.u1, hv1, r.v1);
    push(r.u0, hu0, hv0, hv1);
    push(hu1, r.u1, hv0, hv1);
    return out;
  }

  _quadGeometry(q) {
    const [a, b, c, d] = q.pts;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
      a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // ---------- Collision ----------
  cellAt(pos, preferIndex = -1) {
    if (preferIndex >= 0 && this._contains(this.cells[preferIndex], pos)) {
      return preferIndex;
    }
    for (const cell of this.cells) {
      if (this._contains(cell, pos)) return cell.index;
    }
    return -1;
  }

  _contains(cell, p) {
    return p.x >= cell.min.x - EPS && p.x <= cell.max.x + EPS &&
           p.y >= cell.min.y - EPS && p.y <= cell.max.y + EPS &&
           p.z >= cell.min.z - EPS && p.z <= cell.max.z + EPS;
  }

  _inOpening(cell, key, pos, r) {
    const f = FACES[key];
    const [t0, t1] = f.t;
    for (const rect of cell.openings[key]) {
      if (rect.door && !rect.door.open) continue; // closed door = solid wall
      if (pos[t0] >= rect.u0 + r && pos[t0] <= rect.u1 - r &&
          pos[t1] >= rect.v0 + r && pos[t1] <= rect.v1 - r) {
        return true;
      }
    }
    return false;
  }

  collide(pos, r, state = {}) {
    let idx = this.cellAt(pos, state.cell ?? -1);
    if (idx < 0) idx = this._nearestCell(pos);
    const cell = this.cells[idx];

    const clampAxis = (axis) => {
      if (pos[axis] < cell.min[axis] + r && !this._inOpening(cell, '-' + axis, pos, r)) {
        pos[axis] = cell.min[axis] + r;
      }
      if (pos[axis] > cell.max[axis] - r && !this._inOpening(cell, '+' + axis, pos, r)) {
        pos[axis] = cell.max[axis] - r;
      }
    };
    clampAxis('x');
    clampAxis('y');
    clampAxis('z');

    state.cell = idx;
    return idx;
  }

  _nearestCell(pos) {
    let best = 0, bestD = Infinity;
    for (const cell of this.cells) {
      const cx = Math.max(cell.min.x, Math.min(pos.x, cell.max.x));
      const cy = Math.max(cell.min.y, Math.min(pos.y, cell.max.y));
      const cz = Math.max(cell.min.z, Math.min(pos.z, cell.max.z));
      const d = (pos.x - cx) ** 2 + (pos.y - cy) ** 2 + (pos.z - cz) ** 2;
      if (d < bestD) { bestD = d; best = cell.index; }
    }
    return best;
  }

  isInside(pos) {
    return this.cellAt(pos) >= 0;
  }

  cellByKind(kind) {
    return this.cells.find((c) => c.kind === kind);
  }
}
