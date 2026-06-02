// Mining-bot enemies with per-level types. Each level introduces a new type:
//   drone (L1) · sentry (L2) · kamikaze (L3) · wraith (L4) · hexen (L5).
import * as THREE from 'three';

export const ENEMY_TYPES = {
  drone:    { hp: 45,  speed: 10, radius: 1.2, color: 0x8a3b2f, eye: 0xff7a3c, shape: 'ico',
              armored: false, behavior: 'standard', dmg: 10, fire: [1.3, 1.1], detect: 60 },
  sentry:   { hp: 130, speed: 6,  radius: 1.6, color: 0x44505c, eye: 0x5ad0ff, shape: 'dodeca',
              armored: true,  behavior: 'standard', dmg: 16, fire: [1.0, 0.9], detect: 64 },
  kamikaze: { hp: 28,  speed: 21, radius: 1.0, color: 0xff3322, eye: 0xffe033, shape: 'tetra',
              armored: false, behavior: 'charge', dmg: 0, explode: 34, fire: null, detect: 72 },
  wraith:   { hp: 55,  speed: 16, radius: 1.1, color: 0x6a4aff, eye: 0xb39bff, shape: 'octa',
              armored: false, behavior: 'strafe', dmg: 12, fire: [0.9, 0.8], detect: 70 },
  hexen:    { hp: 230, speed: 7,  radius: 2.0, color: 0x222230, eye: 0xff2266, shape: 'ico',
              armored: true,  behavior: 'standard', dmg: 24, fire: [0.8, 0.7], detect: 80, big: true },
};

const GEO = {
  ico: (r) => new THREE.IcosahedronGeometry(r, 0),
  dodeca: (r) => new THREE.DodecahedronGeometry(r, 0),
  tetra: (r) => new THREE.TetrahedronGeometry(r * 1.3, 0),
  octa: (r) => new THREE.OctahedronGeometry(r, 0),
};

function makeMesh(cfg) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    (GEO[cfg.shape] || GEO.ico)(cfg.radius),
    new THREE.MeshStandardMaterial({
      color: cfg.color, metalness: cfg.armored ? 0.85 : 0.55, roughness: 0.45,
      emissive: cfg.color, emissiveIntensity: 0.6,
    }),
  );
  g.add(body);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.radius * 0.28, 10, 10),
    new THREE.MeshBasicMaterial({ color: cfg.eye }),
  );
  eye.position.set(0, 0, cfg.radius * 0.9);
  g.add(eye);
  return { group: g, body };
}

export class Enemy {
  constructor(scene, pos, typeId = 'drone') {
    const cfg = ENEMY_TYPES[typeId] || ENEMY_TYPES.drone;
    this.type = typeId;
    this.cfg = cfg;
    const built = makeMesh(cfg);
    this.mesh = built.group;
    this.body = built.body;
    this.baseEmissive = cfg.color;
    this.mesh.position.copy(pos);
    scene.add(this.mesh);

    this.pos = this.mesh.position;
    this.vel = new THREE.Vector3();
    this.hp = cfg.hp;
    this.radius = cfg.radius;
    this.armored = cfg.armored;
    this.kamikaze = cfg.behavior === 'charge';
    this.explodeDmg = cfg.explode || 0;
    this.alive = true;
    this.aware = false;
    this.flashTimer = 0;

    this.fireTimer = 1 + Math.random() * 1.5;
    this.speed = cfg.speed + Math.random() * 2;
    this.detectRange = cfg.detect;
    this.fireRange = 52;
    this.wanderDir = new THREE.Vector3().randomDirection();
    this.wanderTimer = 0;
    this.cellState = {};
    this.strafeSign = Math.random() < 0.5 ? 1 : -1;
  }

  damage(amount) {
    this.hp -= amount;
    this.flashTimer = 0.12;
    this.body.material.emissive.setHex(0xffffff);
    if (this.hp <= 0) this.alive = false;
    return !this.alive;
  }

  update(dt, ship, level, fire) {
    const toPlayer = new THREE.Vector3().subVectors(ship.position, this.pos);
    const dist = toPlayer.length();
    const sameArea = this._reachable(level);
    const playerCell = level.cellAt(ship.position);
    const canSee = ship.alive && dist < this.detectRange && sameArea.has(playerCell);
    this.aware = canSee;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.body.material.emissive.setHex(this.baseEmissive);
    }

    if (canSee) {
      const dir = toPlayer.clone().normalize();
      this.mesh.lookAt(new THREE.Vector3().addVectors(this.pos, toPlayer));

      if (this.cfg.behavior === 'charge') {
        // Kamikaze: rush straight in.
        this.vel.lerp(dir.multiplyScalar(this.speed), 0.08);
      } else if (this.cfg.behavior === 'strafe') {
        // Wraith: orbit while approaching, hard to pin down.
        const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        const want = dir.clone().multiplyScalar(dist > 26 ? 1 : -0.3)
          .addScaledVector(side, this.strafeSign * 1.2).normalize();
        this.vel.lerp(want.multiplyScalar(this.speed), 0.07);
      } else {
        // Standard: keep mid-range.
        const desired = dist > 24 ? 1 : (dist < 13 ? -0.6 : 0);
        this.vel.lerp(dir.multiplyScalar(this.speed * desired), 0.05);
      }

      // Ranged fire (non-kamikaze).
      if (this.cfg.fire) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0 && dist < this.fireRange) {
          this.fireTimer = this.cfg.fire[0] + Math.random() * this.cfg.fire[1];
          const lead = ship.velocity.clone().multiplyScalar(dist / 55);
          const aim = new THREE.Vector3().addVectors(ship.position, lead).sub(this.pos).normalize();
          const muzzle = this.pos.clone().addScaledVector(aim, this.radius + 0.3);
          fire(muzzle, aim, { kind: 'laser', owner: 'enemy', damage: this.cfg.dmg });
        }
      }
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 2;
        this.wanderDir.randomDirection();
      }
      this.vel.lerp(this.wanderDir.clone().multiplyScalar(this.speed * 0.35), 0.02);
      this.mesh.rotation.y += dt * 0.5;
    }

    this.pos.addScaledVector(this.vel, dt);
    level.collide(this.pos, this.radius, this.cellState);
  }

  _reachable(level) {
    const set = new Set();
    const here = level.cellAt(this.pos, this.cellState.cell ?? -1);
    if (here < 0) return set;
    set.add(here);
    const cell = level.cells[here];
    for (const key of Object.keys(cell.openings)) {
      if (cell.openings[key].length === 0) continue;
      const f = key[0];
      const axis = key[1];
      for (const other of level.cells) {
        if (other.index === here) continue;
        const touch = f === '+'
          ? Math.abs(cell.max[axis] - other.min[axis]) < 0.02
          : Math.abs(cell.min[axis] - other.max[axis]) < 0.02;
        if (touch) set.add(other.index);
      }
    }
    return set;
  }

  destroy(scene) { scene.remove(this.mesh); }
}
