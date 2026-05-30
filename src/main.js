import * as THREE from 'three';
import { Input } from './input.js';
import { Ship } from './ship.js';
import { Level } from './level.js';
import { Projectiles } from './weapons.js';
import { Enemy } from './enemies.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1018);
scene.fog = new THREE.FogExp2(0x0a1018, 0.006);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 1000);

// Lighting: bright-ish ambient + a strong headlamp that follows the ship.
scene.add(new THREE.AmbientLight(0x8090a0, 1.4));
scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x202830, 0.9));
const headlamp = new THREE.PointLight(0xcfeaff, 2.6, 120, 1.2);
scene.add(headlamp);

const input = new Input(canvas);
const level = new Level();
level.build(scene);

// A bright fill light in every chamber so rooms read clearly.
for (const cell of level.cells) {
  const l = new THREE.PointLight(0x9fd6e6, 1.8, 120);
  l.position.copy(cell.center);
  scene.add(l);
}

const ship = new Ship(camera, input);
const projectiles = new Projectiles(scene, level);
const hud = new Hud();

let enemies = [];
let explosions = [];
let score = 0;
let state = 'menu'; // menu | playing | over
const shipCellState = {};

// ---------- Enemy spawning ----------
// Spawn bots in the chambers (skip the start chamber and thin tunnels).
const SPAWN_CELLS = [2, 4, 4, 6, 8]; // chamber indices, C and gets two

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

// ---------- Explosions ----------
function spawnExplosion(pos, color = 0xff7a3c, scale = 1) {
  const geo = new THREE.SphereGeometry(0.6 * scale, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  const light = new THREE.PointLight(color, 8, 30);
  light.position.copy(pos);
  scene.add(light);
  explosions.push({ mesh, light, t: 0, life: 0.5, scale });
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.t += dt;
    const k = e.t / e.life;
    e.mesh.scale.setScalar(1 + k * 6 * e.scale);
    e.mesh.material.opacity = 1 - k;
    e.light.intensity = 8 * (1 - k);
    if (e.t >= e.life) {
      scene.remove(e.mesh);
      scene.remove(e.light);
      explosions.splice(i, 1);
    }
  }
}

// ---------- Combat resolution ----------
function fire(origin, dir, owner) {
  projectiles.spawn(origin, dir, owner);
}

function resolveHits() {
  for (let i = projectiles.list.length - 1; i >= 0; i--) {
    const p = projectiles.list[i];
    const ppos = p.mesh.position;

    if (p.owner === 'player') {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (ppos.distanceTo(e.pos) < e.radius + p.radius) {
          const dead = e.damage(p.damage);
          spawnExplosion(ppos, 0xffd27a, 0.5);
          projectiles.consume(p);
          if (dead) {
            spawnExplosion(e.pos, 0xff7a3c, 1.4);
            e.destroy(scene);
            score += 100;
            hud.setScore(score);
          }
          break;
        }
      }
    } else {
      if (ship.alive && ppos.distanceTo(ship.position) < ship.radius + p.radius) {
        ship.takeDamage(p.damage);
        hud.damageFlash();
        spawnExplosion(ppos, 0xff5a3c, 0.4);
        projectiles.consume(p);
      }
    }
  }

  // Remove dead enemies from the active list.
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
  explosions.forEach((e) => { scene.remove(e.mesh); scene.remove(e.light); });
  explosions = [];
  spawnEnemies();
  hud.setScore(0);
  hud.setEnemies(enemies.length);
  hud.show();
  overlay.classList.add('hidden');
  state = 'playing';
  input.requestLock();
}

function endGame(win) {
  state = 'over';
  hud.hide();
  document.exitPointerLock?.();
  const title = document.getElementById('end-title');
  const msg = document.getElementById('end-msg');
  title.textContent = win ? 'MINE GESÄUBERT' : 'SCHIFF ZERSTÖRT';
  title.className = win ? 'win' : 'lose';
  msg.textContent = win
    ? 'Alle Roboter ausgeschaltet. Saubere Arbeit, Pilot.'
    : 'Die Mine hat dich verschluckt.';
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
    updateExplosions(dt);
    hud.setShip(ship);

    if (!ship.alive) endGame(false);
    else if (enemies.length === 0) endGame(true);
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

// Re-grab pointer lock when clicking the canvas mid-game.
canvas.addEventListener('click', () => {
  if (state === 'playing' && !input.locked) input.requestLock();
});
