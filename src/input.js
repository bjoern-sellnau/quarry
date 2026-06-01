// Keyboard + pointer-lock mouse input for 6DOF control.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      // Prevent the page from scrolling on Space etc. while playing.
      if (['Space', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Digit1', 'Digit2'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Mouse look only counts while the pointer is locked.
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.keys.clear();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
  }

  requestLock() {
    if (!this.locked) this.canvas.requestPointerLock();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Returns accumulated mouse delta since last call and resets it.
  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
