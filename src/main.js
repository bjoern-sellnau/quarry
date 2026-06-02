import * as THREE from 'three';
import { Input } from './input.js';
import { Ship, PRIMARY } from './ship.js';
import { Level } from './level.js';
import { Projectiles, distSqPointSegment } from './weapons.js';
import { Enemy } from './enemies.js';
import { Pickups, PICKUP_TYPES } from './pickups.js';
import { Prisoners } from './prisoners.js';
import { Mission } from './mission.js';
import { Particles } from './particles.js';
import { Debris } from './debris.js';
import { AudioEngine } from './audio.js';
import { Hud } from './hud.js';
import { LEVELS } from './levels.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e151d);
scene.fog = new THREE.FogExp2(0x0e151d, 0.004);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 2000);

// Fixed lighting rig (never changes count → no runtime shader recompiles).
scene.add(new THREE.AmbientLight(0xaab8c4, 2.6));
scene.add(new THREE.HemisphereLight(0xcfe6f2, 0x2a3440, 1.6));
const headlamp = new THREE.PointLight(0xdaf0ff, 3.0, 200, 1.0);
scene.add(headlamp);

const input = new Input(canvas);
const ship = new Ship(camera, input);
const pickups = new Pickups(scene);
const prisoners = new Prisoners(scene);
const particles = new Particles(scene);
const debris = new Debris(scene);
const audio = new AudioEngine();
const hud = new Hud();

// These are (re)created per level.
let level = null;
let mission = null;
let projectiles = null;

let enemies = [];
let explosions = [];
let levelIndex = 0;
let score = 0;
let secretsFound = 0;
let secretsTotal = 0;
let hostagesRescued = 0;
let hostagesTotal = 0;
let state = 'menu'; // menu | playing | levelcomplete | over
const shipCellState = {};

// ---------- Level loading ----------
function loadLevel(index) {
  levelIndex = index;
  const def = LEVELS[index];

  // Tear down previous level objects.
  enemies.forEach((e) => e.destroy(scene));
  enemies = [];
  explosions.forEach((e) => scene.remove(e.mesh));
  explosions = [];
  if (mission) mission.clear();
  if (projectiles) projectiles.clear();
  if (level) level.dispose(scene);
  pickups.clear();
  prisoners.clear();
  particles.clear();
  debris.clear();

  // Build geometry + palette.
  level = new Level({ cells: def.cells, doors: def.doors });
  level.build(scene);
  scene.background = new THREE.Color(def.palette.fog);
  scene.fog = new THREE.FogExp2(def.palette.fog, 0.0035);

  projectiles = new Projectiles(scene, level);
  projectiles._onWallHit = (p) => {
    const col = p.owner === 'player' ? (p.color || 0x6cff7a) : 0xff5a3c;
    particles.burst(p.mesh.position, col, 8, 9, 0.35);
  };
  projectiles._onRocketExpire = (p) => {
    spawnExplosion(p.mesh.position, 0xffae42, 2.4);
    particles.burst(p.mesh.position, 0xffae42, 16, 14, 0.5);
    applySplash(p.mesh.position, p.splash, p.damage * 0.6, p.owner);
  };

  mission = new Mission(scene, level);
  mission.build(def);

  // Ship: keep weapons, grant this level's new weapon.
  ship.reset();
  ship.position.copy(level.cells[def.startCell].center);
  ship.position.y = level.cells[def.startCell].center.y; // hub centre
  ship.unlock(def.weapon);
  shipCellState.cell = def.startCell;

  spawnEnemies(def);
  spawnPickups(def);
  spawnPrisoners(def);

  hostagesRescued = 0;
  hud.setHostages(0, hostagesTotal);
  hud.setSecrets(secretsFound, secretsTotal);
  hud.setLevel(def.name);
  hud.setWeapon(ship);
  hud.toast(`NEUE WAFFE: ${def.weaponLabel}`);
}

// ---------- Spawning ----------
function spawnEnemies(def) {
  enemies = [];
  // Spawnable rooms = large chambers (exclude tunnels and tiny cells).
  const rooms = level.cells.filter((c) => {
    const dx = c.max.x - c.min.x, dy = c.max.y - c.min.y, dz = c.max.z - c.min.z;
    return Math.min(dx, dy, dz) >= 16 && c.kind !== 'exit' && c.index !== def.startCell;
  });
  const roster = def.enemyTypes;
  for (let i = 0; i < def.enemyCount; i++) {
    const cell = rooms[(Math.random() * rooms.length) | 0] || level.cells[def.startCell];
    // Bias ~1/3 of spawns to the level's newest type for visible variety.
    let type;
    if (i % 3 === 0) type = roster[roster.length - 1];
    else type = roster[(Math.random() * roster.length) | 0];
    const pos = new THREE.Vector3(
      THREE.MathUtils.lerp(cell.min.x + 4, cell.max.x - 4, Math.random()),
      THREE.MathUtils.lerp(cell.min.y + 4, cell.max.y - 4, Math.random()),
      THREE.MathUtils.lerp(cell.min.z + 4, cell.max.z - 4, Math.random()),
    );
    enemies.push(new Enemy(scene, pos, type));
  }
}

function spawnPickups(def) {
  pickups.clear();
  secretsFound = 0;
  secretsTotal = 0;

  const rooms = level.cells.filter((c) => {
    const dx = c.max.x - c.min.x, dy = c.max.y - c.min.y, dz = c.max.z - c.min.z;
    return Math.min(dx, dy, dz) >= 16 && c.kind !== 'reactor' && c.kind !== 'exit';
  });
  const drop = (type, cell) => pickups.spawn(type, cell.center.clone());
  rooms.forEach((cell, i) => {
    const t = ['shield', 'hull', 'laser', 'rockets'][i % 4];
    drop(t, cell);
  });

  // Artifacts in the secret vaults count as the level's secrets.
  for (const ci of def.secretCells) {
    const cell = level.cells[ci];
    if (!cell) continue;
    secretsTotal++;
    pickups.spawn('artifact', cell.center.clone(), { secret: true });
  }
  hud.setSecrets(secretsFound, secretsTotal);
}

function spawnPrisoners(def) {
  prisoners.clear();
  for (const ci of def.prisonCells) {
    prisoners.spawn(level.cells[ci].center.clone());
  }
  prisoners.setTotal(def.prisonCells.length);
  hostagesTotal = def.prisonCells.length;
}

function maybeDropPickup(pos) {
  const r = Math.random();
  if (r < 0.16) pickups.spawn('hull', pos.clone());
  else if (r < 0.30) pickups.spawn('shield', pos.clone());
  else if (r < 0.40) pickups.spawn('rockets', pos.clone());
}

function onCollect(type, pickup) {
  audio.pickup();
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
      score += 100; hud.setScore(score); hud.toast('LASER MAXED  +100');
    }
  } else if (type === 'rockets') {
    ship.rockets += 3;
    hud.toast('+3 ROCKETS');
  } else if (type === 'artifact') {
    score += 500; hud.setScore(score);
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
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  explosions.push({ mesh, t: 0, life: 0.55, scale });
}

function killEnemy(e) {
  spawnExplosion(e.pos, 0xff7a3c, 2.4);                 // bigger blast
  spawnExplosion(e.pos, 0xffd27a, 1.4);
  particles.burst(e.pos, 0xffd27a, 36, 22, 0.7);
  debris.burst(e.pos, e.cfg.color, e.cfg.big ? 14 : 9, 60); // floating wreckage, 60s
  audio.enemyKill();
  maybeDropPickup(e.pos);
  score += e.armored ? 200 : 100;
  hud.setScore(score);
}

function applySplash(center, radius, damage, owner) {
  if (owner !== 'player') return;
  for (const e of enemies) {
    if (e.alive && e.pos.distanceTo(center) < radius + e.radius) {
      if (e.damage(damage)) killEnemy(e);
    }
  }
  if (mission.reactorAlive && mission.reactor.pos.distanceTo(center) < radius + mission.reactor.radius) {
    if (mission.damageReactor(damage)) onReactorDestroyed();
  }
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.t += dt;
    const k = e.t / e.life;
    e.mesh.scale.setScalar(1 + k * 6 * e.scale);
    e.mesh.material.opacity = 1 - k;
    if (e.t >= e.life) { scene.remove(e.mesh); explosions.splice(i, 1); }
  }
}

// ---------- Combat ----------
function fire(origin, dir, opts) {
  projectiles.spawn(origin, dir, opts);
  if (opts.owner === 'player') {
    if (opts.kind === 'rocket') audio.rocket(); else audio.shoot();
  }
}

function onReactorDestroyed() {
  hud.toast('☢ REAKTOR ZERSTÖRT — RAUS HIER! ☢');
  spawnExplosion(mission.reactor.pos, 0xffff66, 6);
  particles.burst(mission.reactor.pos, 0xffff66, 80, 26, 1.0);
  debris.burst(mission.reactor.pos, 0xff8844, 24, 60);
  audio.bigExplosion();
}

function resolveHits() {
  for (let i = projectiles.list.length - 1; i >= 0; i--) {
    const p = projectiles.list[i];
    const ppos = p.mesh.position;

    if (p.owner === 'player') {
      let consumed = false;
      if (mission.hitSecretDoors(p.prev, ppos, distSqPointSegment)) {
        hud.toast('GEHEIMTÜR ENTDECKT'); audio.door();
      }
      if (mission.reactorHitTest(p.prev, ppos, distSqPointSegment)) {
        spawnExplosion(ppos, 0xffd27a, 0.9);
        particles.burst(ppos, 0xffd27a, 10, 12, 0.4);
        audio.enemyHit();
        if (mission.damageReactor(p.damage)) onReactorDestroyed();
        if (p.kind === 'rocket') applySplash(ppos, p.splash, p.damage * 0.6, 'player');
        projectiles.consume(p);
        continue;
      }
      for (const e of enemies) {
        if (!e.alive) continue;
        const hitR = e.radius + p.radius;
        if (distSqPointSegment(e.pos, p.prev, ppos) < hitR * hitR) {
          const dead = e.damage(p.damage);
          spawnExplosion(ppos, 0xffd27a, 0.55);
          particles.burst(ppos, 0xffd27a, 12, 12, 0.4);
          audio.enemyHit();
          if (p.kind === 'rocket') {
            spawnExplosion(ppos, 0xffae42, 2.4);
            applySplash(ppos, p.splash, p.damage * 0.6, 'player');
          }
          projectiles.consume(p);
          consumed = true;
          if (dead) killEnemy(e);
          break;
        }
      }
      if (consumed) continue;
    } else if (p.owner === 'enemy') {
      const hitR = ship.radius + p.radius;
      if (ship.alive && distSqPointSegment(ship.position, p.prev, ppos) < hitR * hitR) {
        ship.takeDamage(p.damage);
        hud.damageFlash();
        audio.playerHit();
        spawnExplosion(ppos, 0xff5a3c, 0.4);
        particles.burst(ppos, 0xff5a3c, 8, 8, 0.35);
        projectiles.consume(p);
      }
    }
  }
  enemies = enemies.filter((e) => e.alive);
  hud.setEnemies(enemies.length);
}

// Ramming + kamikaze contact.
function resolveRamming() {
  if (!ship.alive) return;
  for (const e of enemies) {
    if (!e.alive) continue;
    const reach = ship.radius + e.radius;
    if (ship.position.distanceTo(e.pos) >= reach) continue;

    if (e.kamikaze) {
      e.alive = false;
      killEnemy(e);
      spawnExplosion(e.pos, 0xffe033, 3);
      ship.takeDamage(e.explodeDmg);
      hud.damageFlash(); audio.playerHit();
    } else if (!e.armored) {
      e.alive = false;
      killEnemy(e);
      ship.takeDamage(8);
      hud.damageFlash();
    } else {
      e.damage(18);
      ship.takeDamage(18);
      hud.damageFlash(); audio.playerHit();
      particles.burst(ship.position, 0x5ad0ff, 10, 10, 0.4);
      const away = ship.position.clone().sub(e.pos).normalize();
      ship.velocity.addScaledVector(away, 22);
      e.vel.addScaledVector(away, -10);
    }
  }
  enemies = enemies.filter((e) => e.alive);
  hud.setEnemies(enemies.length);
}

function combatIntensity() {
  if (mission.meltdown) return 1;
  let aware = 0;
  for (const e of enemies) if (e.alive && e.aware) aware++;
  return Math.min(1, aware / 3);
}

// ---------- State / screens ----------
const overlay = document.getElementById('overlay');
const screenStart = document.getElementById('screen-start');
const screenEnd = document.getElementById('screen-end');
const screenNext = document.getElementById('screen-next');

function startCampaign() {
  audio.init();
  audio.setEnabled(true);
  score = 0;
  ship.unlocked = ['laser'];
  ship.weaponId = 'laser';
  ship.laserLevel = 1;
  ship.rockets = 5;
  hud.setScore(0);
  loadLevel(0);
  hud.show();
  overlay.classList.add('hidden');
  state = 'playing';
  input.requestLock();
}

function completeLevel() {
  state = 'levelcomplete';
  hud.hide();
  document.exitPointerLock?.();
  audio.setIntensity(0);
  const bonus = hostagesRescued * 1000 + secretsFound * 300 + 500;
  score += bonus;
  hud.setScore(score);

  const last = levelIndex >= LEVELS.length - 1;
  if (last) {
    endGame(true, `Kampagne abgeschlossen! Alle ${LEVELS.length} Sektoren befreit.`);
    return;
  }
  document.getElementById('next-title').textContent = `SEKTOR ${levelIndex + 1} GESCHAFFT`;
  document.getElementById('next-msg').textContent =
    `Reaktor zerstört, ${hostagesRescued}/${hostagesTotal} Geiseln gerettet, ${secretsFound}/${secretsTotal} Secrets. Bonus +${bonus}. ` +
    `Nächster Sektor: ${LEVELS[levelIndex + 1].name} — neue Waffe & neuer Gegnertyp.`;
  document.getElementById('next-score').textContent = score;
  screenStart.classList.add('hidden');
  screenEnd.classList.add('hidden');
  screenNext.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function endGame(win, reason) {
  state = 'over';
  hud.hide();
  document.exitPointerLock?.();
  audio.setIntensity(0);
  audio.setEnabled(false);
  if (!win) audio.bigExplosion();
  const title = document.getElementById('end-title');
  title.textContent = win ? 'SIEG' : 'MISSION GESCHEITERT';
  title.className = win ? 'win' : 'lose';
  document.getElementById('end-msg').textContent = reason;
  document.getElementById('final-score').textContent = score;
  screenStart.classList.add('hidden');
  screenNext.classList.add('hidden');
  screenEnd.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

document.getElementById('btn-start').addEventListener('click', startCampaign);
document.getElementById('btn-restart').addEventListener('click', () => {
  screenEnd.classList.add('hidden');
  screenStart.classList.remove('hidden');
  startCampaign();
});
document.getElementById('btn-next').addEventListener('click', () => {
  screenNext.classList.add('hidden');
  audio.setEnabled(true);
  loadLevel(levelIndex + 1);
  hud.show();
  overlay.classList.add('hidden');
  state = 'playing';
  input.requestLock();
});

// Open keycard doors with F when close.
window.addEventListener('keydown', (e) => {
  if (state === 'playing' && e.code === 'KeyF') {
    const msg = mission.tryOpenDoors(ship);
    if (msg) { hud.toast(msg); if (msg.includes('OPEN') || msg.includes('GEÖFFNET')) audio.door(); }
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
    resolveRamming();
    pickups.update(dt, ship, onCollect);
    prisoners.update(dt, ship, () => {
      hostagesRescued++;
      ship.hostagesAboard++;
      hud.setHostages(hostagesRescued, hostagesTotal);
      hud.toast('GEISEL GERETTET  (' + hostagesRescued + '/' + hostagesTotal + ')');
      score += 250; hud.setScore(score);
    });
    mission.update(dt, ship, (kind) => hud.toast(kind.toUpperCase() + ' KEYCARD'));
    updateExplosions(dt);
    particles.update(dt);
    debris.update(dt);
    audio.setIntensity(combatIntensity());
    hud.setShip(ship);
    hud.setWeapon(ship);
    hud.setMeltdown(mission.meltdown, mission.timeLeft);

    if (!ship.alive) {
      endGame(false, 'Dein Schiff wurde zerstört.');
    } else if (mission.escaped) {
      completeLevel();
    } else if (mission.meltdown && mission.timeLeft <= 0) {
      endGame(false, 'Der Reaktor ist explodiert, bevor du entkommen konntest.');
    }
  } else {
    updateExplosions(dt);
    particles.update(dt);
    debris.update(dt);
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
