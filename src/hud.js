// Thin wrapper around the DOM HUD elements.
export class Hud {
  constructor() {
    this.score = document.getElementById('score');
    this.enemies = document.getElementById('enemies');
    this.secrets = document.getElementById('secrets');
    this.hullBar = document.getElementById('hull-bar');
    this.shieldBar = document.getElementById('shield-bar');
    this.flash = document.getElementById('damage-flash');
    this.toastEl = document.getElementById('toast');
    this.root = document.getElementById('hud');
    this._toastTimer = null;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setScore(v) { this.score.textContent = v; }
  setEnemies(v) { this.enemies.textContent = v; }
  setSecrets(found, total) { this.secrets.textContent = `${found}/${total}`; }

  setShip(ship) {
    this.hullBar.style.width = `${Math.max(0, (ship.hull / ship.maxHull) * 100)}%`;
    this.shieldBar.style.width = `${Math.max(0, (ship.shield / ship.maxShield) * 100)}%`;
  }

  damageFlash() {
    this.flash.classList.add('show');
    setTimeout(() => this.flash.classList.remove('show'), 60);
  }

  // Briefly show a centred status message (pickup collected, secret found...).
  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }
}
