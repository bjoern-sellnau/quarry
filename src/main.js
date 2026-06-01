import * as THREE from 'three';
import { Input } from './input.js';
import { Ship } from './ship.js';
import { Level } from './level.js';
import { Projectiles, distSqPointSegment } from './weapons.js';
import { Enemy } from './enemies.js';
import { Pickups, PICKUP_TYPES } from './pickups.js';
import { Prisoners } from './prisoners.js';
import { Mission } from './mission.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Cap pixel ratio: rendering at 2x DPR is 4x the fragments and a common cause
// of stutter on high-DPI displays. 1.5 keeps it sharp but much cheaper.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e151d);
scene.fog = new THREE.FogExp2(0x0e151d, 0.005);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 1000);

// Lighting: a fixed rig only. We deliberately avoid adding/removing lights at
// runtime — changing the scene's light count forces Three.js to recompile
// every material's shader, which is the main cause of frame stutter.
scene.add(new THREE.AmbientLight(0xaab8c4, 2.6));
scene.add(new THREE.HemisphereLight(0xcfe6f2, 0x2a3440, 1.6));
const headlamp = new THREE.PointLight(0xdaf0ff, 3.0, 160, 1.0);
scene.add(headlamp);

const input = new Input(canvas);
const level = new Level();
level.build(scene);

const ship = new Ship(camera, input);
const projectiles = new Projectiles(scene, level);
const pickups = new Pickups(scene);
const prisoners = new Prisoners(scene);
const mission = new Mission(scene, level);
const hud = new Hud();

let enemies = [];
let explosions = [];
let score = 0;
let secretsFound = 0;
let secretsTotal = 0;
let hostagesRescued = 0;
let hostagesTotal = 0;
let state = 'menu'; // menu | playing | over
const shipCellState = {};

// Rocket splash uses an expire hook from the projectile system.
projectiles._onRocketExpire = (p) => {
  spawnExplosion(p.mesh.position, 0xffae42, 2.2);
  applySplash(p.mesh.position, p.splash, p.damage * 0.6, p.owner);
};

// ---------- Enemy spawning ----------
// Spawn bots through the chambers and mission wings.
const SPAWN_CELLS = [2, 4, 4, 6, 8, 14, 18, 18];

function spawnEnemies() {
  enemies.forEach((e) => e.destroy(scene));
  enemies = [];
  for (const ci of SPAWN_CELLS) {
    const cell = level.cells[ci];
    const pos = new THREE.Vector3(
      THREE.MathUtils.lerp(cell.min.x + 3, cell.max.x - 3, Math.random()),
      THREE.MathUtils.lerp(cell.min.y + 3, cell.max.y - 3, Math.random()),
      THREE.MathUtils.lerp(cell.min.z + 3, cell.max.z - 3, Math.random()),
    );
    enemies.push(new Enemy(scene, pos));
  }
}

// ---------- Pickups & secrets ----------
function spawnPickups() {
  pickups.clear();
  secretsFound = 0;
  secretsTotal = 0;

  const scatter = [
    { type: 'shield', cell: 2 },
    { type: 'hull', cell: 4 },
    { type: 'shield', cell: 6 },
    { type: 'hull', cell: 8 },
    { type: 'laser', cell: 4 },   // laser upgrade in chamber C
    { type: 'laser', cell: 6 },   // laser upgrade in chamber D
    { type: 'rockets', cell: 2 }, // rocket resupply
  ];
  for (const s of scatter) {
    pickups.spawn(s.type, level.cells[s.cell].center.clone());
  }

  // Artifacts live in the secret vaults; they count as the level's secrets.
  for (const cell of level.cells) {
    if (cell.secret) {
      secretsTotal++;
      pickups.spawn('artifact', cell.center.clone(), { secret: true });
    }
  }
  hud.setSecrets(secretsFound, secretsTotal);
}

function spawnPrisoners() {
  prisoners.clear();
  // One hostage in each prison cell (15, 16).
  prisoners.spawn(level.cells[15].center.clone());
  prisoners.spawn(level.cells[16].center.clone());
  prisoners.setTotal(2);
  hostagesTotal = 2;
  hostagesRescued = 0;
  hud.setHostages(0, hostagesTotal);
}

function maybeDropPickup(pos) {
  const r = Math.random();
  if (r < 0.18) pickups.spawn('hull', pos.clone());
  else if (r < 0.34) pickups.spawn('shield', pos.clone());
  else if (r < 0.42) pickups.spawn('rockets', pos.clone());
}

function onCollect(type, pickup) {
  if (type === 'hull') {
    ship.hull = Math.min(ship.maxHull, ship.hull + 30);
    hud.toast(PICKUP_TYPES[type].label);
  } else if (type === 'shield') {
    ship.shield = ship.maxShield;
    hud.toast(PICKUP_TYPES[type].label);
  } else if (type === 'laser') {
    if (ship.laserLevel < ship.maxLaserLevel) {
      ship.laserLevel++;
      hud.toast('LASER UPGRADED  ▶ LVL ' + ship.laserLevel);
    } else {
      score += 100; hud.setScore(score);
      hud.toast('LASER MAXED  +100');
    }
  } else if (type === 'rockets') {
    ship.rockets += 3;
    hud.toast('+3 ROCKETS');
  } else if (type === 'artifact') {
    score += 500;
    hud.setScore(score);
  }
  if (pickup.secret) {
    secretsFound++;
    hud.setSecrets(secretsFound, secretsTotal);
    hud.toast('★ SECRET FOUND ★  ' + PICKUP_TYPES[type].label);
  }
}

// ---------- Explosions & splash ----------
function spawnExplosion(pos, color = 0xff7a3c, scale = 1) {
  const geo = new THREE.SphereGeometry(0.6 * scale, 10, 10);
  // Unlit emissive sphere — no PointLight, so no shader recompiles.
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  explosions.push({ mesh, t: 0, life: 0.5, scale });
}

// Rocket splash: damage every enemy (and the reactor) within radius.
function applySplash(center, radius, damage, owner) {
  if (owner === 'player') {
    for (const e of enemies) {
      if (e.alive && e.pos.distanceTo(center) < radius + e.radius) {
        if (e.damage(damage)) {
          spawnExplosion(e.pos, 0xff7a3c, 1.4);
          maybeDropPickup(e.pos);
          score += 100; hud.setScore(score);
        }
      }
    }
    if (mission.reactorAlive && mission.reactor.pos.distanceTo(center) < radius + mission.reactor.radius) {
      if (mission.damageReactor(damage)) onReactorDestroyed();
    }
  }
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.t += dt;
    const k = e.t / e.life;
    e.mesh.scale.setScalar(1 + k * 6 * e.scale);
    e.mesh.material.opacity = 1 - k;
    if (e.t >= e.life) {
      scene.remove(e.mesh);
      explosions.splice(i, 1);
    }
  }
}

// ---------- Combat resolution ----------
function fire(origin, dir, opts) {
  projectiles.spawn(origin, dir, opts);
}

function onReactorDestroyed() {
  hud.toast('☢ REACTOR DESTROYED — ESCAPE NOW! ☢');
  spawnExplosion(mission.reactor.pos, 0xffff66, 4);
}

function resolveHits() {
  for (let i = projectiles.list.length - 1; i >= 0; i--) {
    const p = projectiles.list[i];
    const ppos = p.mesh.position;

    if (p.owner === 'player') {
      let consumed = false;

      // Secret doors open when shot.
      if (mission.hitSecretDoors(p.prev, ppos, distSqPointSegment)) {
        hud.toast('SECRET DOOR REVEALED');
      }

      // Reactor.
      if (mission.reactorHitTest(p.prev, ppos, distSqPointSegment)) {
        spawnExplosion(ppos, 0xffd27a, 0.8);
        if (mission.damageReactor(p.damage)) onReactorDestroyed();
        if (p.kind === 'rocket') applySplash(ppos, p.splash, p.damage * 0.6, 'player');
        projectiles.consume(p);
        continue;
      }

      // Enemies (swept test).
      for (const e of enemies) {
        if (!e.alive) continue;
        const hitR = e.radius + p.radius;
        if (distSqPointSegment(e.pos, p.prev, ppos) < hitR * hitR) {
          const dead = e.damage(p.damage);
          spawnExplosion(ppos, 0xffd27a, 0.5);
          if (p.kind === 'rocket') {
            spawnExplosion(ppos, 0xffae42, 2.2);
            applySplash(ppos, p.splash, p.damage * 0.6, 'player');
          }
          projectiles.consume(p);
          consumed = true;
          if (dead) {
            spawnExplosion(e.pos, 0xff7a3c, 1.4);
            maybeDropPickup(e.pos);
            score += 100;
            hud.setScore(score);
          }
          break;
        }
      }
      if (consumed) continue;
    } else if (p.owner === 'enemy') {
      const hitR = ship.radius + p.radius;
      if (ship.alive && distSqPointSegment(ship.position, p.prev, ppos) < hitR * hitR) {
        ship.takeDamage(p.damage);
        hud.damageFlash();
        spawnExplosion(ppos, 0xff5a3c, 0.4);
        projectiles.consume(p);
      }
    }
  }

  enemies = enemies.filter((e) => e.alive);
  hud.setEnemies(enemies.length);
}

// ---------- Game state ----------
const overlay = document.getElementById('overlay');
const screenStart = document.getElementById('screen-start');
const screenEnd = document.getElementById('screen-end');

function startGame() {
  score = 0;
  ship.reset();
  shipCellState.cell = 0;
  projectiles.clear();
  explosions.forEach((e) => { scene.remove(e.mesh); });
  explosions = [];

  // Reset mission state by rebuilding doors/keycards/reactor.
  mission.clear();
  // Re-close every door for a fresh run.
  for (const d of level.doors) { d.open = false; }
  mission.reactorAlive = true;
  mission.meltdown = false;
  mission.escaped = false;
  mission.timeLeft = 0;
  mission.build();

  spawnEnemies();
  spawnPickups();
  spawnPrisoners();
  hud.setScore(0);
  hud.setEnemies(enemies.length);
  hud.setWeapon(ship);
  hud.show();
  overlay.classList.add('hidden');
  state = 'playing';
  input.requestLock();
}

function endGame(win, reason) {
  state = 'over';
  hud.hide();
  document.exitPointerLock?.();
  const title = document.getElementById('end-title');
  const msg = document.getElementById('end-msg');
  title.textContent = win ? 'ESCAPED' : 'MISSION FAILED';
  title.className = win ? 'win' : 'lose';
  msg.textContent = reason;
  document.getElementById('final-score').textContent = score;
  screenStart.classList.add('hidden');
  screenEnd.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', () => {
  screenEnd.classList.add('hidden');
  screenStart.classList.remove('hidden');
  startGame();
});

// Open keycard doors with F when close.
window.addEventListener('keydown', (e) => {
  if (state === 'playing' && e.code === 'KeyF') {
    const msg = mission.tryOpenDoors(ship);
    if (msg) hud.toast(msg);
  }
});

// ---------- Main loop ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'playing') {
    ship.update(dt, fire);
    level.collide(ship.position, ship.radius, shipCellState);
    headlamp.position.copy(ship.position);

    for (const e of enemies) e.update(dt, ship, level, fire);
    projectiles.update(dt);
    resolveHits();
    pickups.update(dt, ship, onCollect);
    prisoners.update(dt, ship, () => {
      hostagesRescued++;
      ship.hostagesAboard++;
      hud.setHostages(hostagesRescued, hostagesTotal);
      hud.toast('HOSTAGE RESCUED  (' + hostagesRescued + '/' + hostagesTotal + ')');
      score += 250; hud.setScore(score);
    });
    mission.update(dt, ship, (kind) => {
      hud.toast(kind.toUpperCase() + ' KEYCARD');
    });
    updateExplosions(dt);
    hud.setShip(ship);
    hud.setWeapon(ship);
    hud.setMeltdown(mission.meltdown, mission.timeLeft);

    // End conditions.
    if (!ship.alive) {
      endGame(false, 'Dein Schiff wurde zerstört.');
    } else if (mission.escaped) {
      let bonus = hostagesRescued * 1000 + secretsFound * 300;
      score += bonus;
      hud.setScore(score);
      endGame(true, `Reaktor zerstört, ${hostagesRescued}/${hostagesTotal} Geiseln gerettet, ${secretsFound}/${secretsTotal} Secrets. Bonus +${bonus}.`);
    } else if (mission.meltdown && mission.timeLeft <= 0) {
      endGame(false, 'Der Reaktor ist explodiert, bevor du entkommen konntest.');
    }
  } else {
    updateExplosions(dt);
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

canvas.addEventListener('click', () => {
  if (state === 'playing' && !input.locked) input.requestLock();
});
