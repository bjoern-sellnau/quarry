// The player's ship: quaternion-based 6DOF flight, true Descent-style.
import * as THREE from 'three';

const TMP_Q = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

// Primary weapon definitions (Descent-inspired). `fan` fires multiple bolts in
// an arc; `spread` adds random scatter; `bounce` lets bolts ricochet.
export const PRIMARY = {
  laser:  { name: 'LASER',      rate: 0.15, kind: 'laser',  speed: 120, color: 0x6cff7a, bounce: 2 },
  vulcan: { name: 'VULCAN',     rate: 0.06, kind: 'vulcan', speed: 175, color: 0xffe27a, bounce: 0, dmg: 13, spread: 0.05 },
  spread: { name: 'SPREADFIRE', rate: 0.20, kind: 'spread', speed: 110, color: 0xff9a3c, bounce: 1, dmg: 18, fan: 5, fanAngle: 0.16 },
  plasma: { name: 'PLASMA',     rate: 0.09, kind: 'plasma', speed: 150, color: 0x4ad0ff, bounce: 0, dmg: 38, big: true },
  fusion: { name: 'FUSION',     rate: 0.45, kind: 'fusion', speed: 130, color: 0xff44ff, bounce: 0, dmg: 130, big: true },
  helix:  { name: 'HELIX',      rate: 0.12, kind: 'helix',  speed: 140, color: 0xaaff44, bounce: 1, dmg: 30, fan: 3, fanAngle: 0.12 },
};

export class Ship {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;

    this.position = new THREE.Vector3(0, 0, 0);
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();

    // Tunables
    this.thrust = 42;        // linear acceleration (units/s^2)
    this.boostMult = 1.9;
    this.damping = 2.2;      // velocity decay per second
    this.maxSpeed = 34;
    this.rollSpeed = 2.4;    // rad/s
    this.mouseSens = 0.0022; // rad per pixel

    this.radius = 1.0;

    // Stats
    this.maxHull = 100;
    this.maxShield = 100;
    this.hull = this.maxHull;
    this.shield = this.maxShield;
    this.shieldRegen = 6;    // shield per second
    this.alive = true;

    this.fireCooldown = 0;
    this.secCooldown = 0;

    // ---- Weapons ----
    // Primary weapons are unlocked across the campaign (laser, vulcan, ...).
    // Rockets are the secondary (right mouse). Laser still has levels 1-3.
    this.unlocked = ['laser'];
    this.weaponId = 'laser';
    this.laserLevel = 1;
    this.maxLaserLevel = 3;
    this.rockets = 5;
    this.rocketRate = 0.7;

    // Keycards collected this level.
    this.keys = { red: false, blue: false, yellow: false };
    this.hostagesAboard = 0;
  }

  // Per-level reset of position/health/keys; weapons persist across the
  // campaign (handled by main), so only clamp the selected weapon here.
  reset() {
    this.position.set(0, 0, 0);
    this.quaternion.identity();
    this.velocity.set(0, 0, 0);
    this.hull = this.maxHull;
    this.shield = this.maxShield;
    this.alive = true;
    this.fireCooldown = 0;
    this.secCooldown = 0;
    this.keys = { red: false, blue: false, yellow: false };
    this.hostagesAboard = 0;
    if (!this.unlocked.includes(this.weaponId)) this.weaponId = this.unlocked[0];
  }

  unlock(id) {
    if (!this.unlocked.includes(id)) this.unlocked.push(id);
    this.weaponId = id; // auto-select the newly granted weapon
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
  }

  // Apply a local-axis rotation to the ship's orientation.
  _rotateLocal(axis, angle) {
    TMP_Q.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(TMP_Q);
  }

  takeDamage(amount) {
    if (!this.alive) return;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount > 0) {
      this.hull -= amount;
      if (this.hull <= 0) {
        this.hull = 0;
        this.alive = false;
      }
    }
  }

  // Right-hand basis vectors for muzzle offsets (multi-bolt lasers).
  right() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
  }
  up() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
  }

  update(dt, fireCallback) {
    const input = this.input;

    // ---- Rotation ----
    // Mouse → pitch (X) and yaw (Y), applied in local space (no gimbal lock).
    const m = input.consumeMouse();
    if (m.x !== 0) this._rotateLocal(AXIS_Y, -m.x * this.mouseSens);
    if (m.y !== 0) this._rotateLocal(AXIS_X, -m.y * this.mouseSens);

    // Roll on Q/E (local Z).
    let roll = 0;
    if (input.isDown('KeyQ')) roll += 1;
    if (input.isDown('KeyE')) roll -= 1;
    if (roll !== 0) this._rotateLocal(AXIS_Z, roll * this.rollSpeed * dt);

    this.quaternion.normalize();

    // ---- Translation ----
    const accel = new THREE.Vector3();
    if (input.isDown('KeyW')) accel.z -= 1;
    if (input.isDown('KeyS')) accel.z += 1;
    if (input.isDown('KeyD')) accel.x += 1;
    if (input.isDown('KeyA')) accel.x -= 1;
    if (input.isDown('Space')) accel.y += 1;
    if (input.isDown('ControlLeft') || input.isDown('ControlRight')) accel.y -= 1;

    let thrust = this.thrust;
    if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) thrust *= this.boostMult;

    if (accel.lengthSq() > 0) {
      accel.normalize().multiplyScalar(thrust * dt);
      accel.applyQuaternion(this.quaternion); // local → world
      this.velocity.add(accel);
    }

    // Damping + clamp.
    const decay = Math.max(0, 1 - this.damping * dt);
    this.velocity.multiplyScalar(decay);
    const speedCap = (input.isDown('ShiftLeft') || input.isDown('ShiftRight'))
      ? this.maxSpeed * this.boostMult : this.maxSpeed;
    if (this.velocity.length() > speedCap) {
      this.velocity.setLength(speedCap);
    }

    this.position.addScaledVector(this.velocity, dt);

    // ---- Shield regen ----
    if (this.alive && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.shieldRegen * dt);
    }

    // ---- Weapon select (number keys index into the unlocked list) ----
    for (let i = 1; i <= this.unlocked.length && i <= 9; i++) {
      if (input.isDown('Digit' + i)) this.weaponId = this.unlocked[i - 1];
    }

    // ---- Primary fire ----
    this.fireCooldown -= dt;
    this.secCooldown -= dt;
    if (input.firing && this.fireCooldown <= 0 && this.alive) {
      this._firePrimary(fireCallback);
    }

    // ---- Secondary fire (rockets, right mouse) ----
    if (input.firingSecondary && this.secCooldown <= 0 && this.rockets > 0 && this.alive) {
      this.secCooldown = this.rocketRate;
      this.rockets--;
      const dir = this.forward();
      const base = this.position.clone().addScaledVector(dir, this.radius + 1.0);
      fireCallback(base, dir, { kind: 'rocket', owner: 'player', damage: 120, splash: 6, speed: 60, color: 0xffae42 });
    }

    // ---- Sync camera ----
    this.camera.position.copy(this.position);
    this.camera.quaternion.copy(this.quaternion);
  }

  _firePrimary(fireCallback) {
    const w = PRIMARY[this.weaponId] || PRIMARY.laser;
    this.fireCooldown = w.rate;
    const dir = this.forward();
    const base = this.position.clone().addScaledVector(dir, this.radius + 1.0);
    const right = this.right();
    const up = this.up();
    const common = { kind: w.kind, owner: 'player', speed: w.speed, color: w.color, bounce: w.bounce, big: w.big };

    if (this.weaponId === 'laser') {
      const dmg = 34 + (this.laserLevel - 1) * 16; // L1 34 / L2 50 / L3 66
      const offsets = this.laserLevel === 1 ? [0] : this.laserLevel === 2 ? [-0.6, 0.6] : [-0.8, 0, 0.8];
      for (const o of offsets) {
        fireCallback(base.clone().addScaledVector(right, o), dir, { ...common, damage: dmg });
      }
      return;
    }

    if (w.fan) {
      // Fan of bolts spread across an arc around the ship's up axis.
      const half = (w.fan - 1) / 2;
      for (let i = 0; i < w.fan; i++) {
        const ang = (i - half) * w.fanAngle;
        const d = dir.clone().applyAxisAngle(up, ang);
        // Helix weapons also stagger vertically for a corkscrew look.
        const vo = this.weaponId === 'helix' ? Math.sin(i * 2.1) * 0.4 : 0;
        fireCallback(base.clone().addScaledVector(up, vo), d, { ...common, damage: w.dmg });
      }
      return;
    }

    if (w.spread) {
      // Vulcan: rapid single bolt with slight random scatter.
      const d = dir.clone()
        .applyAxisAngle(up, (Math.random() - 0.5) * w.spread)
        .applyAxisAngle(right, (Math.random() - 0.5) * w.spread);
      fireCallback(base, d, { ...common, damage: w.dmg });
      return;
    }

    // Single heavy bolt (plasma / fusion).
    fireCallback(base, dir, { ...common, damage: w.dmg });
  }
}
