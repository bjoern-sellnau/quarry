// Laser bolts for both the player and enemies.
import * as THREE from 'three';

// Squared distance from point c to segment a->b. Used for swept hit tests so
// fast bolts can't tunnel through targets between frames.
export function distSqPointSegment(c, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const abLen2 = abx * abx + aby * aby + abz * abz;
  let t = abLen2 > 0 ? (acx * abx + acy * aby + acz * abz) / abLen2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = acx - abx * t, dy = acy - aby * t, dz = acz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}


const PLAYER_GEO = new THREE.CapsuleGeometry(0.18, 1.6, 4, 8);
const ENEMY_GEO = new THREE.SphereGeometry(0.35, 8, 8);
const PLAYER_MAT = new THREE.MeshBasicMaterial({ color: 0x6cff7a });
const ENEMY_MAT = new THREE.MeshBasicMaterial({ color: 0xff5a3c });
const Z = new THREE.Vector3(0, 0, 1);

export class Projectiles {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.list = [];
  }

  spawn(origin, dir, owner) {
    const isPlayer = owner === 'player';
    const speed = isPlayer ? 120 : 55;
    const mesh = new THREE.Mesh(
      isPlayer ? PLAYER_GEO : ENEMY_GEO,
      isPlayer ? PLAYER_MAT : ENEMY_MAT,
    );
    mesh.position.copy(origin);
    if (isPlayer) {
      // Orient capsule along travel direction.
      mesh.quaternion.setFromUnitVectors(Z, dir.clone().normalize());
    }

    const light = new THREE.PointLight(isPlayer ? 0x6cff7a : 0xff5a3c, 2.5, 8);
    mesh.add(light);

    this.scene.add(mesh);
    this.list.push({
      mesh,
      prev: origin.clone(),       // previous-frame position, for swept hit tests
      vel: dir.clone().normalize().multiplyScalar(speed),
      ttl: 3,
      owner,
      damage: isPlayer ? 34 : 12,
      radius: isPlayer ? 0.3 : 0.5,
    });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.prev.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.ttl -= dt;
      if (p.ttl <= 0 || !this.level.isInside(p.mesh.position)) {
        this._remove(i);
      }
    }
  }

  _remove(i) {
    const p = this.list[i];
    this.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  // Remove a projectile by reference (after it hit something).
  consume(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this._remove(i);
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list = [];
  }
}
