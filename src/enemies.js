// Floating mining-bot enemies. They drift, detect the player by range +
// shared/adjacent cell, then close in and fire leading shots.
import * as THREE from 'three';

function makeRobotMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({ color: 0x8a3b2f, metalness: 0.6, roughness: 0.4, emissive: 0x2a0a05 }),
  );
  g.add(body);
  // Glowing "eye".
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7a3c }),
  );
  eye.position.set(0, 0, 1.0);
  g.add(eye);
  g.add(new THREE.PointLight(0xff5a3c, 2.5, 14));
  return g;
}

export class Enemy {
  constructor(scene, pos) {
    this.mesh = makeRobotMesh();
    this.mesh.position.copy(pos);
    scene.add(this.mesh);

    this.pos = this.mesh.position;
    this.vel = new THREE.Vector3();
    this.hp = 50;
    this.radius = 1.2;
    this.alive = true;

    this.fireTimer = 1 + Math.random() * 1.5;
    this.speed = 9 + Math.random() * 3;
    this.detectRange = 60;
    this.fireRange = 50;
    this.wanderDir = new THREE.Vector3().randomDirection();
    this.wanderTimer = 0;
    this.cellState = {};
  }

  damage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) this.alive = false;
    return !this.alive;
  }

  update(dt, ship, level, fire) {
    const toPlayer = new THREE.Vector3().subVectors(ship.position, this.pos);
    const dist = toPlayer.length();
    const sameAreaCells = this._reachable(level);
    const playerCell = level.cellAt(ship.position);
    const canSee = ship.alive && dist < this.detectRange && sameAreaCells.has(playerCell);

    if (canSee) {
      // Approach but keep some distance.
      const dir = toPlayer.clone().normalize();
      const desired = dist > 22 ? 1 : (dist < 12 ? -0.6 : 0);
      this.vel.lerp(dir.multiplyScalar(this.speed * desired), 0.05);

      // Face the player.
      const look = new THREE.Vector3().addVectors(this.pos, toPlayer);
      this.mesh.lookAt(look);

      // Fire with simple lead.
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && dist < this.fireRange) {
        this.fireTimer = 1.4 + Math.random() * 1.2;
        const lead = ship.velocity.clone().multiplyScalar(dist / 55);
        const aim = new THREE.Vector3().addVectors(ship.position, lead).sub(this.pos).normalize();
        const muzzle = this.pos.clone().addScaledVector(aim, 1.4);
        fire(muzzle, aim, 'enemy');
      }
    } else {
      // Wander.
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

  // Cells the enemy can shoot/see into: its own cell plus directly connected ones.
  _reachable(level) {
    const set = new Set();
    const here = level.cellAt(this.pos, this.cellState.cell ?? -1);
    if (here < 0) return set;
    set.add(here);
    const cell = level.cells[here];
    for (const key of Object.keys(cell.openings)) {
      if (cell.openings[key].length === 0) continue;
      // Find neighbour sharing this face.
      const f = key[0]; // + or -
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

  destroy(scene) {
    scene.remove(this.mesh);
  }
}
