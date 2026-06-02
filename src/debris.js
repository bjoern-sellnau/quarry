// Debris chunks flung off destroyed enemies. They drift through the chamber
// (no gravity — it's a mine in low-g), tumble, and despawn after a TTL
// (default 60s), shrinking away in their final seconds. Pooled, no lights.
import * as THREE from 'three';

const SHAPES = [
  new THREE.TetrahedronGeometry(0.5, 0),
  new THREE.BoxGeometry(0.6, 0.4, 0.5),
  new THREE.OctahedronGeometry(0.45, 0),
];

const MATS = new Map();
function matFor(color) {
  if (!MATS.has(color)) {
    MATS.set(color, new THREE.MeshStandardMaterial({
      color, metalness: 0.7, roughness: 0.5, emissive: color, emissiveIntensity: 0.25,
    }));
  }
  return MATS.get(color);
}

export class Debris {
  constructor(scene, max = 260) {
    this.scene = scene;
    this.list = [];
    this.max = max;
  }

  burst(pos, color, count = 9, ttl = 60) {
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.max) {
        // Recycle the oldest chunk.
        const old = this.list.shift();
        this.scene.remove(old.mesh);
      }
      const mesh = new THREE.Mesh(SHAPES[(Math.random() * SHAPES.length) | 0], matFor(color));
      mesh.position.copy(pos);
      mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      const s = 0.6 + Math.random() * 0.8;
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.list.push({
        mesh,
        baseScale: s,
        vel: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
          .normalize().multiplyScalar(3 + Math.random() * 7),
        spin: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4),
        ttl: ttl * (0.8 + Math.random() * 0.4),
      });
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.ttl -= dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(0.985); // gentle drag, then it floats
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.ttl < 4) {
        // Shrink away in the last few seconds.
        d.mesh.scale.setScalar(Math.max(0, d.baseScale * (d.ttl / 4)));
      }
      if (d.ttl <= 0) {
        this.scene.remove(d.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const d of this.list) this.scene.remove(d.mesh);
    this.list = [];
  }
}
