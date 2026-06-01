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
const ENEMY_GEO = new THREE.SphereGeometry(0.35, 8, 8);
const Z = new THREE.Vector3(0, 0, 1);

const MATS = {
  playerLaser: new THREE.MeshBasicMaterial({ color: 0x6cff7a }),
  rocket: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  enemyLaser: new THREE.MeshBasicMaterial({ color: 0xff5a3c }),
};

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

    let geo, mat, lightColor;
    if (isRocket) { geo = ROCKET_GEO; mat = MATS.rocket; lightColor = 0xffae42; }
    else if (isPlayer) { geo = LASER_GEO; mat = MATS.playerLaser; lightColor = 0x6cff7a; }
    else { geo = ENEMY_GEO; mat = MATS.enemyLaser; lightColor = 0xff5a3c; }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(Z, dir.clone().normalize());

    const light = new THREE.PointLight(lightColor, isRocket ? 4 : 2.5, isRocket ? 14 : 8);
    mesh.add(light);
    this.scene.add(mesh);

    const speed = opts.speed || (isRocket ? 55 : (isPlayer ? 120 : 55));
    this.list.push({
      mesh,
      prev: origin.clone(),
      vel: dir.clone().normalize().multiplyScalar(speed),
      ttl: isRocket ? 5 : 3,
      owner,
      kind,
      damage: opts.damage,
      splash: opts.splash || 0,
      radius: isRocket ? 0.7 : (isPlayer ? 1.0 : 0.6),
    });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.prev.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.ttl -= dt;
      if (p.ttl <= 0 || !this.level.isInside(p.mesh.position)) {
        // Rockets that hit a wall still splash (handled in main via wallHit flag).
        if (p.kind === 'rocket' && p.splash > 0 && this._onRocketExpire) {
          this._onRocketExpire(p);
        }
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
