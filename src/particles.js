// Pooled GPU particle system. One THREE.Points object with a fixed buffer —
// no per-particle meshes and no lights, so bursts never trigger shader
// recompiles or inflate draw calls. Dead particles fade to black (invisible
// under additive blending).
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 800) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseColor = new Float32Array(max * 3);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo = geo;

    const mat = new THREE.PointsMaterial({
      size: 0.6,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // Spawn a burst of `count` particles at pos, drifting outward.
  burst(pos, color, count = 14, speed = 10, life = 0.5) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = i * 3;
      this.positions[i3] = pos.x;
      this.positions[i3 + 1] = pos.y;
      this.positions[i3 + 2] = pos.z;
      // Random direction.
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const len = Math.hypot(dx, dy, dz) || 1;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.vel[i3] = (dx / len) * s;
      this.vel[i3 + 1] = (dy / len) * s;
      this.vel[i3 + 2] = (dz / len) * s;
      this.baseColor[i3] = c.r; this.baseColor[i3 + 1] = c.g; this.baseColor[i3 + 2] = c.b;
      this.colors[i3] = c.r; this.colors[i3 + 1] = c.g; this.colors[i3 + 2] = c.b;
      const l = life * (0.6 + Math.random() * 0.8);
      this.life[i] = l;
      this.maxLife[i] = l;
    }
  }

  update(dt) {
    const { positions, colors, vel, life, maxLife, baseColor } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const i3 = i * 3;
      positions[i3] += vel[i3] * dt;
      positions[i3 + 1] += vel[i3 + 1] * dt;
      positions[i3 + 2] += vel[i3 + 2] * dt;
      // Drag.
      vel[i3] *= 0.94; vel[i3 + 1] *= 0.94; vel[i3 + 2] *= 0.94;
      const k = Math.max(0, life[i] / maxLife[i]);
      colors[i3] = baseColor[i3] * k;
      colors[i3 + 1] = baseColor[i3 + 1] * k;
      colors[i3 + 2] = baseColor[i3 + 2] * k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.colors.fill(0);
    this.geo.attributes.color.needsUpdate = true;
  }
}
