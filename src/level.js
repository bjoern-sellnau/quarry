// The mine: axis-aligned chambers + tunnels. Doorways (openings) between
// touching cells are derived automatically and used for both rendering
// (walls with holes) and collision (pass-through).
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
  { min: [-15, -12, -15], max: [15, 12, 15], color: 0x12303a },   // 0 start chamber
  { min: [-4, -4, -45], max: [4, 4, -15], color: 0x0e2630 },      // 1 tunnel A->B (-z)
  { min: [-18, -14, -75], max: [18, 14, -45], color: 0x143542 },  // 2 chamber B
  { min: [18, -4, -64], max: [48, 4, -56], color: 0x0e2630 },     // 3 tunnel B->C (+x)
  { min: [48, -16, -78], max: [84, 16, -42], color: 0x16323d },   // 4 chamber C (arena)
  { min: [15, -4, -4], max: [45, 4, 4], color: 0x0e2630 },        // 5 tunnel A->D (+x)
  { min: [45, -12, -20], max: [75, 12, 16], color: 0x143542 },    // 6 chamber D
  { min: [58, 16, -68], max: [70, 40, -52], color: 0x0e2630 },    // 7 vertical shaft (+y from C)
  { min: [50, 40, -76], max: [86, 72, -44], color: 0x16323d },    // 8 high chamber E
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
      openings: { '+x': [], '-x': [], '+y': [], '-y': [], '+z': [], '-z': [] },
    }));
    this._computeOpenings();
  }

  _computeOpenings() {
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) {
      for (let j = 0; j < cells.length; j++) {
        if (i === j) continue;
        const A = cells[i], B = cells[j];
        // A's +x face touches B's -x face?
        this._tryFace(A, B, 'x', 'y', 'z');
        this._tryFace(A, B, 'y', 'x', 'z');
        this._tryFace(A, B, 'z', 'x', 'y');
      }
    }
  }

  // If A.max[axis] == B.min[axis] and the two tangent ranges overlap, create
  // a doorway on A '+axis' and B '-axis'.
  _tryFace(A, B, axis, t0, t1) {
    if (Math.abs(A.max[axis] - B.min[axis]) > EPS) return;
    const u0 = Math.max(A.min[t0], B.min[t0]);
    const u1 = Math.min(A.max[t0], B.max[t0]);
    const v0 = Math.max(A.min[t1], B.min[t1]);
    const v1 = Math.min(A.max[t1], B.max[t1]);
    if (u1 - u0 <= EPS || v1 - v0 <= EPS) return;
    const rect = { u0, u1, v0, v1 };
    A.openings['+' + axis].push(rect);
    B.openings['-' + axis].push(rect);
  }

  // ---------- Geometry ----------
  build(scene) {
    const group = new THREE.Group();

    for (const cell of this.cells) {
      const mat = new THREE.MeshStandardMaterial({
        color: cell.color,
        roughness: 0.85,
        metalness: 0.25,
        side: THREE.DoubleSide,
      });
      const lineMat = new THREE.LineBasicMaterial({ color: 0x2c6b7a, transparent: true, opacity: 0.5 });

      for (const key of Object.keys(FACES)) {
        const quads = this._faceQuads(cell, key);
        for (const q of quads) {
          const geo = this._quadGeometry(q);
          const mesh = new THREE.Mesh(geo, mat);
          group.add(mesh);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat);
          group.add(edges);
        }
      }
    }

    scene.add(group);
    this.group = group;
  }

  // Returns a list of {pts:[v3,v3,v3,v3]} quads for a face, with the doorway
  // hole(s) removed via a frame split.
  _faceQuads(cell, key) {
    const f = FACES[key];
    const axis = f.axis;
    const [t0, t1] = f.t;
    const faceVal = f.sign > 0 ? cell.max[axis] : cell.min[axis];
    const u0 = cell.min[t0], u1 = cell.max[t0];
    const v0 = cell.min[t1], v1 = cell.max[t1];

    const holes = cell.openings[key];
    // Build list of rectangles in (u,v) space, then subtract holes via frame split.
    let rects = [{ u0, u1, v0, v1 }];
    for (const h of holes) {
      const next = [];
      for (const r of rects) {
        next.push(...this._frameSplit(r, h));
      }
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

  // Subtract hole h from rect r, returning up to 4 surrounding strips.
  _frameSplit(r, h) {
    const hu0 = Math.max(r.u0, h.u0), hu1 = Math.min(r.u1, h.u1);
    const hv0 = Math.max(r.v0, h.v0), hv1 = Math.min(r.v1, h.v1);
    // No overlap → rect unchanged.
    if (hu1 - hu0 <= EPS || hv1 - hv0 <= EPS) return [r];

    const out = [];
    const push = (u0, u1, v0, v1) => {
      if (u1 - u0 > EPS && v1 - v0 > EPS) out.push({ u0, u1, v0, v1 });
    };
    push(r.u0, r.u1, r.v0, hv0);   // bottom
    push(r.u0, r.u1, hv1, r.v1);   // top
    push(r.u0, hu0, hv0, hv1);     // left
    push(hu1, r.u1, hv0, hv1);     // right
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
  // Find the cell that contains a point (boundary inclusive). Prefers the
  // previously occupied cell to avoid flicker at shared planes.
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
      if (pos[t0] >= rect.u0 + r && pos[t0] <= rect.u1 - r &&
          pos[t1] >= rect.v0 + r && pos[t1] <= rect.v1 - r) {
        return true;
      }
    }
    return false;
  }

  // Clamp pos (mutated) to stay inside the walkable union. Returns the cell
  // index the point ends up in. `state` may carry .cell for continuity.
  collide(pos, r, state = {}) {
    let idx = this.cellAt(pos, state.cell ?? -1);
    if (idx < 0) {
      // Fell outside everything: snap back to nearest cell's interior.
      idx = this._nearestCell(pos);
    }
    const cell = this.cells[idx];

    const clampAxis = (axis, t0, t1) => {
      if (pos[axis] < cell.min[axis] + r && !this._inOpening(cell, '-' + axis, pos, r)) {
        pos[axis] = cell.min[axis] + r;
      }
      if (pos[axis] > cell.max[axis] - r && !this._inOpening(cell, '+' + axis, pos, r)) {
        pos[axis] = cell.max[axis] - r;
      }
    };
    clampAxis('x', 'y', 'z');
    clampAxis('y', 'x', 'z');
    clampAxis('z', 'x', 'y');

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

  // Quick test: is a point (e.g. a projectile) inside any walkable cell?
  isInside(pos) {
    return this.cellAt(pos) >= 0;
  }
}
