// The player's ship: quaternion-based 6DOF flight, true Descent-style.
import * as THREE from 'three';

const TMP_Q = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

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

    // ---- Weapons ----
    // Laser level 1-3 (more bolts / more damage). Rockets are a limited ammo
    // secondary. weapon: 1 = laser, 2 = rockets.
    this.weapon = 1;
    this.laserLevel = 1;
    this.maxLaserLevel = 3;
    this.rockets = 3;
    this.laserRate = 0.14;
    this.rocketRate = 0.7;

    // Keycards collected this level.
    this.keys = { red: false, blue: false, yellow: false };
    this.hostagesAboard = 0;
  }

  reset() {
    this.position.set(0, 0, 0);
    this.quaternion.identity();
    this.velocity.set(0, 0, 0);
    this.hull = this.maxHull;
    this.shield = this.maxShield;
    this.alive = true;
    this.fireCooldown = 0;
    this.weapon = 1;
    this.laserLevel = 1;
    this.rockets = 3;
    this.keys = { red: false, blue: false, yellow: false };
    this.hostagesAboard = 0;
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

    // ---- Weapon select ----
    if (input.isDown('Digit1')) this.weapon = 1;
    if (input.isDown('Digit2') && this.rockets > 0) this.weapon = 2;

    // ---- Firing ----
    this.fireCooldown -= dt;
    if (input.firing && this.fireCooldown <= 0 && this.alive) {
      const dir = this.forward();
      const base = this.position.clone().addScaledVector(dir, this.radius + 1.0);

      if (this.weapon === 2 && this.rockets > 0) {
        this.fireCooldown = this.rocketRate;
        this.rockets--;
        fireCallback(base, dir, { kind: 'rocket', owner: 'player', damage: 120, splash: 6, speed: 60 });
        if (this.rockets === 0) this.weapon = 1;
      } else {
        this.fireCooldown = this.laserRate;
        const dmg = 34 + (this.laserLevel - 1) * 16; // L1 34, L2 50, L3 66
        // Level decides how many parallel bolts fire.
        const r = this.right();
        const offsets = this.laserLevel === 1 ? [0]
          : this.laserLevel === 2 ? [-0.6, 0.6]
          : [-0.8, 0, 0.8];
        for (const o of offsets) {
          const muzzle = base.clone().addScaledVector(r, o);
          fireCallback(muzzle, dir, { kind: 'laser', owner: 'player', damage: dmg });
        }
      }
    }

    // ---- Sync camera ----
    this.camera.position.copy(this.position);
    this.camera.quaternion.copy(this.quaternion);
  }
}
