// Mission objects: coloured keycard doors, shoot-to-open secret doors,
// keycard pickups, the reactor, and the emergency exit + meltdown countdown.
import * as THREE from 'three';

const DOOR_COLORS = {
  red: 0xff4444,
  blue: 0x4477ff,
  yellow: 0xffd23f,
  secret: 0x556055,   // blends with walls, only a faint seam
  exit: 0x44ff88,
};

// Builds a thin slab mesh filling a door's opening rect.
function doorSlab(door) {
  const r = door.rect;
  const size = { x: 0, y: 0, z: 0 };
  const span0 = r.u1 - r.u0;
  const span1 = r.v1 - r.v0;
  size[r.axis] = 0.6;
  size[r.t0] = span0;
  size[r.t1] = span1;
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
  const isSecret = door.kind === 'secret';
  const col = DOOR_COLORS[door.kind] ?? 0x888888;
  const mat = new THREE.MeshStandardMaterial({
    color: col,
    emissive: col,
    emissiveIntensity: isSecret ? 0.05 : 0.5,
    metalness: 0.4,
    roughness: isSecret ? 0.9 : 0.4,
    transparent: true,
    opacity: isSecret ? 0.92 : 0.85,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(door.center);
  return mesh;
}

export class Mission {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.doorMeshes = [];
    this.keycards = [];
    this.reactor = null;
    this.exitCell = null;

    this.reactorAlive = true;
    this.meltdown = false;
    this.timeLeft = 0;
    this.meltdownDuration = 45; // seconds to reach the exit
    this.escaped = false;
  }

  // def: the level definition from levels.js (placements + reactor HP).
  build(def) {
    this.meltdownDuration = def.meltdownTime || 55;

    // Door slabs.
    for (const door of this.level.doors) {
      const mesh = doorSlab(door);
      mesh.userData.door = door;
      this.scene.add(mesh);
      this.doorMeshes.push(mesh);
      door.mesh = mesh;
    }

    // Keycards from the level definition.
    for (const k of def.keycards) {
      const pos = this.level.cells[k.cell].center.clone();
      pos.add(new THREE.Vector3(k.dx || 0, k.dy || 0, k.dz || 0));
      this._spawnKeycard(k.kind, pos);
    }

    // Reactor core (HP scales per level — no longer a one-shot).
    const rc = this.level.cells[def.reactorCell];
    this.reactor = this._makeReactor(rc.center.clone(), def.reactorHp);
    this.scene.add(this.reactor.group);

    // Exit marker.
    this.exitCell = this.level.cells[def.exitCell];
    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(2, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.5 }),
    );
    beacon.position.copy(this.exitCell.center);
    this.scene.add(beacon);
    this.exitBeacon = beacon;
  }

  _spawnKeycard(kind, pos) {
    const col = DOOR_COLORS[kind];
    const g = new THREE.Group();
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 0.12),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 }),
    );
    g.add(card);
    g.position.copy(pos);
    this.scene.add(g);
    this.keycards.push({ kind, mesh: g, phase: Math.random() * 6.28 });
  }

  _makeReactor(pos, hp = 1400) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.5, 1),
      new THREE.MeshStandardMaterial({ color: 0xff6622, emissive: 0xff3300, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.5 }),
    );
    group.add(core);
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5, 0),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, wireframe: true, transparent: true, opacity: 0.4 }),
    );
    group.add(cage);
    return { group, core, cage, pos: pos.clone(), hp, maxHp: hp, radius: 5 };
  }

  // Try to open a keycard door the ship is near. Returns a message or null.
  tryOpenDoors(ship) {
    let msg = null;
    for (const door of this.level.doors) {
      if (door.open) continue;
      if (door.kind === 'secret' || door.kind === 'exit') continue;
      const need = door.kind; // 'red'|'blue'|'yellow'
      if (ship.position.distanceTo(door.center) < 7) {
        if (ship.keys[need]) {
          this._openDoor(door);
          msg = need.toUpperCase() + ' DOOR OPENED';
        } else {
          msg = 'NEED ' + need.toUpperCase() + ' KEYCARD';
        }
      }
    }
    return msg;
  }

  _openDoor(door) {
    door.open = true;
    if (door.mesh) {
      this.scene.remove(door.mesh);
      door.mesh = null;
    }
  }

  // Called when a player projectile passes near a secret door — shoot to open.
  hitSecretDoors(segA, segB, distSqFn) {
    let opened = false;
    for (const door of this.level.doors) {
      if (door.open || door.kind !== 'secret') continue;
      if (distSqFn(door.center, segA, segB) < 9) { // within 3 units of the seam
        this._openDoor(door);
        opened = true;
      }
    }
    return opened;
  }

  // Damage the reactor; returns true the moment it is destroyed.
  damageReactor(amount) {
    if (!this.reactorAlive) return false;
    this.reactor.hp -= amount;
    if (this.reactor.hp <= 0) {
      this.reactorAlive = false;
      this._startMeltdown();
      return true;
    }
    return false;
  }

  _startMeltdown() {
    this.meltdown = true;
    this.timeLeft = this.meltdownDuration;
    // Open the emergency exit door.
    for (const door of this.level.doors) {
      if (door.kind === 'exit') this._openDoor(door);
    }
    // Reactor visually goes critical.
    if (this.reactor) {
      this.reactor.core.material.emissive.setHex(0xffff66);
      this.reactor.core.material.emissiveIntensity = 2.5;
    }
  }

  reactorHitTest(segA, segB, distSqFn) {
    if (!this.reactorAlive) return false;
    const r = this.reactor.radius;
    return distSqFn(this.reactor.pos, segA, segB) < r * r;
  }

  update(dt, ship, onKeycard) {
    // Animate keycards + pickup.
    for (let i = this.keycards.length - 1; i >= 0; i--) {
      const k = this.keycards[i];
      k.phase += dt;
      k.mesh.rotation.y += dt * 1.5;
      k.mesh.position.y += Math.sin(k.phase * 1.6) * dt * 0.5;
      if (ship.alive && k.mesh.position.distanceTo(ship.position) < 2.2 + ship.radius) {
        ship.keys[k.kind] = true;
        onKeycard(k.kind);
        this.scene.remove(k.mesh);
        this.keycards.splice(i, 1);
      }
    }

    // Animate reactor.
    if (this.reactor && this.reactorAlive) {
      this.reactor.core.rotation.y += dt * 0.4;
      this.reactor.cage.rotation.y -= dt * 0.2;
    }

    if (this.exitBeacon) this.exitBeacon.rotation.y += dt;

    // Meltdown countdown.
    if (this.meltdown && !this.escaped) {
      this.timeLeft -= dt;
      if (ship.alive && this.exitCell) {
        const c = this.exitCell;
        const inExit = ship.position.x >= c.min.x && ship.position.x <= c.max.x &&
                       ship.position.y >= c.min.y && ship.position.y <= c.max.y &&
                       ship.position.z >= c.min.z && ship.position.z <= c.max.z;
        if (inExit) this.escaped = true;
      }
    }
  }

  clear() {
    for (const m of this.doorMeshes) this.scene.remove(m);
    for (const k of this.keycards) this.scene.remove(k.mesh);
    if (this.reactor) this.scene.remove(this.reactor.group);
    if (this.exitBeacon) this.scene.remove(this.exitBeacon);
    this.doorMeshes = [];
    this.keycards = [];
  }
}
