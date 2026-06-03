// Thin wrapper around the DOM HUD elements.
export class Hud {
  constructor() {
    this.score = document.getElementById('score');
    this.enemies = document.getElementById('enemies');
    this.secrets = document.getElementById('secrets');
    this.hostages = document.getElementById('hostages');
    this.hullBar = document.getElementById('hull-bar');
    this.shieldBar = document.getElementById('shield-bar');
    this.weaponEl = document.getElementById('weapon');
    this.weaponListEl = document.getElementById('weapon-list');
    this.levelEl = document.getElementById('level-name');
    this.keysEl = document.getElementById('keys');
    this.flash = document.getElementById('damage-flash');
    this.toastEl = document.getElementById('toast');
    this.timerEl = document.getElementById('meltdown');
    this.root = document.getElementById('hud');
    this._toastTimer = null;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setScore(v) { this.score.textContent = v; }
  setEnemies(v) { this.enemies.textContent = v; }
  setSecrets(found, total) { this.secrets.textContent = `${found}/${total}`; }
  setHostages(found, total) { this.hostages.textContent = `${found}/${total}`; }

  setShip(ship) {
    this.hullBar.style.width = `${Math.max(0, (ship.hull / ship.maxHull) * 100)}%`;
    this.shieldBar.style.width = `${Math.max(0, (ship.shield / ship.maxShield) * 100)}%`;
  }

  setLevel(name) { if (this.levelEl) this.levelEl.textContent = name; }

  setWeapon(ship) {
    // Active weapon line (laser shows level, vulcan shows ammo) + rockets.
    let active;
    if (ship.weaponId === 'laser') active = `LASER LVL ${ship.laserLevel}`;
    else if (ship.weaponId === 'vulcan') active = `VULCAN ${ship.vulcanAmmo}`;
    else active = ship.weaponId.toUpperCase();
    this.weaponEl.textContent = `${active}   ⟂ ROCKETS ×${ship.rockets}`;

    // Unlocked-weapon selector (1..N) with the active one highlighted.
    if (this.weaponListEl) {
      this.weaponListEl.innerHTML = ship.unlocked.map((id, i) => {
        const on = id === ship.weaponId ? ' on' : '';
        const label = id === 'laser' ? 'LASER' : id.toUpperCase();
        return `<span class="wslot${on}">${i + 1} ${label}</span>`;
      }).join('');
    }

    const k = ship.keys;
    this.keysEl.innerHTML =
      `<span class="key red ${k.red ? 'on' : ''}">R</span>` +
      `<span class="key blue ${k.blue ? 'on' : ''}">B</span>` +
      `<span class="key yellow ${k.yellow ? 'on' : ''}">Y</span>`;
  }

  setMeltdown(active, timeLeft) {
    if (!active) { this.timerEl.classList.add('hidden'); return; }
    this.timerEl.classList.remove('hidden');
    const t = Math.max(0, timeLeft);
    this.timerEl.textContent = `☢ MELTDOWN ${t.toFixed(1)}s — REACH THE EXIT`;
    this.timerEl.classList.toggle('critical', t < 12);
  }

  damageFlash() {
    this.flash.classList.add('show');
    setTimeout(() => this.flash.classList.remove('show'), 60);
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }
}
