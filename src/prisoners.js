// Hostages held in prison cells. Fly close to rescue them (they board the
// ship). They must be returned by completing the level (reaching the exit).
import * as THREE from 'three';

function makeMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x36c0e0, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.6 }),
  );
  g.add(body);
  // SOS halo.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.06, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x36e0ff, transparent: true, opacity: 0.8 }),
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return { group: g, ring };
}

export class Prisoners {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.radius = 2.5;
  }

  spawn(pos) {
    const { group, ring } = makeMesh();
    group.position.copy(pos);
    this.scene.add(group);
    this.list.push({ mesh: group, ring, home: pos.clone(), phase: Math.random() * 6.28 });
  }

  get total() { return this._total ?? this.list.length; }

  update(dt, ship, onRescue) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.phase += dt;
      p.mesh.position.y = p.home.y + Math.sin(p.phase * 1.4) * 0.5;
      p.ring.rotation.z += dt * 1.2;
      if (ship.alive && p.mesh.position.distanceTo(ship.position) < this.radius + ship.radius) {
        onRescue(p);
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list = [];
    this._total = 0;
  }

  setTotal(n) { this._total = n; }
}
