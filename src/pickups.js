// Collectible pickups: hull repair, shield recharge, and rare artifacts
// (used as secret-area rewards). They bob and spin, and are vacuumed up when
// the ship gets close.
import * as THREE from 'three';

export const PICKUP_TYPES = {
  hull:     { color: 0xffae42, light: 0xffae42, label: 'HULL REPAIR +30' },
  shield:   { color: 0x36e0ff, light: 0x36e0ff, label: 'SHIELD RECHARGED' },
  artifact: { color: 0xffd700, light: 0xffd700, label: 'ARTIFACT  +500' },
  laser:    { color: 0x6cff7a, light: 0x6cff7a, label: 'LASER UPGRADE' },
  rockets:  { color: 0xff8844, light: 0xff8844, label: '+3 ROCKETS' },
};

function makeMesh(type) {
  const cfg = PICKUP_TYPES[type];
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(type === 'artifact' ? 1.1 : 0.8, 0),
    new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.3,
    }),
  );
  g.add(core);
  // Wireframe shell for a "hologram" look.
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(type === 'artifact' ? 1.7 : 1.3, 0),
    new THREE.MeshBasicMaterial({ color: cfg.color, wireframe: true, transparent: true, opacity: 0.4 }),
  );
  g.add(shell);
  // No PointLight — the emissive core reads fine and avoids shader recompiles
  // when pickups spawn/are collected.
  return { group: g, core, shell };
}

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.radius = 2.0; // collection radius
  }

  spawn(type, pos, opts = {}) {
    const { group, core, shell } = makeMesh(type);
    group.position.copy(pos);
    this.scene.add(group);
    this.list.push({
      type,
      mesh: group,
      core,
      shell,
      home: pos.clone(),
      phase: Math.random() * Math.PI * 2,
      secret: !!opts.secret,
    });
  }

  // ship: the player; onCollect(type, pickup) is called when one is grabbed.
  update(dt, ship, onCollect) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.phase += dt;
      // Bob + spin.
      p.mesh.position.y = p.home.y + Math.sin(p.phase * 1.6) * 0.6;
      p.core.rotation.y += dt * 1.4;
      p.core.rotation.x += dt * 0.8;
      p.shell.rotation.y -= dt * 0.6;

      if (ship.alive && p.mesh.position.distanceTo(ship.position) < this.radius + ship.radius) {
        onCollect(p.type, p);
        this.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.mesh);
    this.list = [];
  }
}
