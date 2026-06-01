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
    this.fireRate = 0.14;    // seconds between shots
  }

  reset() {
    this.position.set(0, 0, 0);
    this.quaternion.identity();
    this.velocity.set(0, 0, 0);
    this.hull = this.maxHull;
    this.shield = this.maxShield;
    this.alive = true;
    this.fireCooldown = 0;
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

    // ---- Firing ----
    this.fireCooldown -= dt;
    if (input.firing && this.fireCooldown <= 0 && this.alive) {
      this.fireCooldown = this.fireRate;
      const dir = this.forward();
      // Spawn the bolt ahead of the ship so it doesn't flash over the camera
      // (and can never collide with the player itself).
      const muzzle = this.position.clone().addScaledVector(dir, this.radius + 1.0);
      fireCallback(muzzle, dir, this.quaternion.clone());
    }

    // ---- Sync camera ----
    this.camera.position.copy(this.position);
    this.camera.quaternion.copy(this.quaternion);
  }
}
