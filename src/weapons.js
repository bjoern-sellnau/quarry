// Projectiles for player and enemies: lasers (fast bolts) and rockets
// (slower, heavy, with splash damage).
import * as THREE from 'three';

// Squared distance from point c to segment a->b. Swept hit test so fast bolts
// can't tunnel through targets between frames.
export function distSqPointSegment(c, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const abLen2 = abx * abx + aby * aby + abz * abz;
  let t = abLen2 > 0 ? (acx * abx + acy * aby + acz * abz) / abLen2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = acx - abx * t, dy = acy - aby * t, dz = acz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

const LASER_GEO = new THREE.CapsuleGeometry(0.16, 1.4, 4, 8);
const ROCKET_GEO = new THREE.CapsuleGeometry(0.3, 1.0, 6, 10);
const BIG_GEO = new THREE.CapsuleGeometry(0.34, 1.8, 6, 10);
const ENEMY_GEO = new THREE.SphereGeometry(0.35, 8, 8);
const Z = new THREE.Vector3(0, 0, 1);

// Cache one material per bolt colour so we never allocate per shot and never
// add lights (which would force shader recompiles).
const COLOR_MATS = new Map();
function matFor(color) {
  if (!COLOR_MATS.has(color)) {
    COLOR_MATS.set(color, new THREE.MeshBasicMaterial({ color }));
  }
  return COLOR_MATS.get(color);
}
const ENEMY_MAT = new THREE.MeshBasicMaterial({ color: 0xff5a3c });

export class Projectiles {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.list = [];
  }

  // opts: { kind:'laser'|'rocket', owner:'player'|'enemy', damage, speed, splash }
  spawn(origin, dir, opts) {
    const kind = opts.kind || 'laser';
    const owner = opts.owner;
    const isPlayer = owner === 'player';
    const isRocket = kind === 'rocket';

    let geo, mat;
    if (isRocket) { geo = ROCKET_GEO; mat = matFor(opts.color || 0xffd27a); }
    else if (isPlayer) { geo = opts.big ? BIG_GEO : LASER_GEO; mat = matFor(opts.color || 0x6cff7a); }
    else { geo = ENEMY_GEO; mat = ENEMY_MAT; }

    // Bolts use unlit emissive (MeshBasicMaterial) and carry no PointLight, so
    // spawning/despawning them never changes the scene light count.
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(Z, dir.clone().normalize());
    this.scene.add(mesh);

    const speed = opts.speed || (isRocket ? 55 : (isPlayer ? 120 : 55));
    this.list.push({
      mesh,
      prev: origin.clone(),
      vel: dir.clone().normalize().multiplyScalar(speed),
      ttl: isRocket ? 5 : 3,
      owner,
      kind,
      color: opts.color,
      damage: opts.damage,
      splash: opts.splash || 0,
      radius: isRocket ? 0.7 : (isPlayer ? (opts.big ? 1.1 : 1.0) : 0.6),
      // Ricochets per the weapon definition; rockets always explode (0).
      bounces: isRocket ? 0 : (opts.bounce || 0),
      cell: -1,
    });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.prev.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.ttl -= dt;
      if (p.ttl <= 0) { this._remove(i); continue; }

      const idx = this.level.cellAt(p.mesh.position, p.cell);
      if (idx >= 0) { p.cell = idx; continue; }

      // Outside every cell => hit a wall.
      if (this._onWallHit) this._onWallHit(p);
      if (p.kind === 'rocket') {
        if (p.splash > 0 && this._onRocketExpire) this._onRocketExpire(p);
        this._remove(i);
        continue;
      }
      if (p.bounces > 0 && this.level.reflectPoint(p)) {
        p.bounces--;
        // Re-aim the bolt mesh along its new velocity.
        p.mesh.quaternion.setFromUnitVectors(Z, p.vel.clone().normalize());
      } else {
        this._remove(i);
      }
    }
  }

  _remove(i) {
    const p = this.list[i];
    this.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  consume(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this._remove(i);
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list = [];
  }
}
