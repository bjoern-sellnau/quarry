// Thin wrapper around the DOM HUD elements.
export class Hud {
  constructor() {
    this.score = document.getElementById('score');
    this.enemies = document.getElementById('enemies');
    this.hullBar = document.getElementById('hull-bar');
    this.shieldBar = document.getElementById('shield-bar');
    this.flash = document.getElementById('damage-flash');
    this.root = document.getElementById('hud');
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setScore(v) { this.score.textContent = v; }
  setEnemies(v) { this.enemies.textContent = v; }

  setShip(ship) {
    this.hullBar.style.width = `${Math.max(0, (ship.hull / ship.maxHull) * 100)}%`;
    this.shieldBar.style.width = `${Math.max(0, (ship.shield / ship.maxShield) * 100)}%`;
  }

  damageFlash() {
    this.flash.classList.add('show');
    setTimeout(() => this.flash.classList.remove('show'), 60);
  }
}
