// Procedural wall textures, one style per campaign level. Generated on a
// canvas so there are no external image assets. Kept low-saturation/greyish so
// the per-cell vertex colours still tint each chamber.
import * as THREE from 'three';

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d'), size };
}

function speckle(ctx, size, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = (Math.random() * 80) | 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 2 + 0.5;
    ctx.fillRect(x, y, r, r);
  }
}

function cracks(ctx, size, n, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < n; i++) {
    let x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 3 + (Math.random() * 4 | 0);
    for (let s = 0; s < segs; s++) {
      x += (Math.random() - 0.5) * size * 0.4;
      y += (Math.random) * size * 0.3 * (Math.random() < 0.5 ? -1 : 1);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

const BUILDERS = {
  rock(ctx, size) {
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, size, size);
    // Mottled stone blotches.
    for (let i = 0; i < 90; i++) {
      const v = 90 + ((Math.random() * 70) | 0);
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 16 + 4, 0, 6.28);
      ctx.fill();
    }
    speckle(ctx, size, 1200, 0.5);
    cracks(ctx, size, 8, 'rgba(40,40,40,0.5)', 1.5);
  },
  ice(ctx, size) {
    ctx.fillStyle = '#b8c4cc'; ctx.fillRect(0, 0, size, size);
    cracks(ctx, size, 26, 'rgba(255,255,255,0.7)', 1);
    cracks(ctx, size, 10, 'rgba(120,140,160,0.5)', 2);
    speckle(ctx, size, 500, 0.25);
  },
  magma(ctx, size) {
    ctx.fillStyle = '#3a3030'; ctx.fillRect(0, 0, size, size);
    // Glowing veins.
    for (let i = 0; i < 18; i++) {
      let x = Math.random() * size, y = Math.random() * size;
      ctx.strokeStyle = `rgba(255,${120 + (Math.random() * 100 | 0)},40,0.85)`;
      ctx.lineWidth = Math.random() * 2 + 1;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    speckle(ctx, size, 800, 0.6);
  },
  crystal(ctx, size) {
    ctx.fillStyle = '#6a6a86'; ctx.fillRect(0, 0, size, size);
    // Faceted triangles.
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 26 + 6;
      const v = 120 + ((Math.random() * 90) | 0);
      ctx.fillStyle = `rgba(${v},${v},${v + 20},0.4)`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + r, y + (Math.random() - 0.5) * r);
      ctx.lineTo(x + (Math.random() - 0.5) * r, y + r);
      ctx.closePath(); ctx.fill();
    }
    cracks(ctx, size, 14, 'rgba(220,230,255,0.4)', 1);
  },
  metal(ctx, size) {
    ctx.fillStyle = '#707078'; ctx.fillRect(0, 0, size, size);
    // Panel grid + rivets.
    ctx.strokeStyle = 'rgba(30,30,36,0.8)'; ctx.lineWidth = 2;
    const step = size / 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,200,210,0.7)';
    for (let gx = 0; gx <= 4; gx++) for (let gy = 0; gy <= 4; gy++) {
      ctx.beginPath(); ctx.arc(gx * step + 4, gy * step + 4, 1.8, 0, 6.28); ctx.fill();
    }
    speckle(ctx, size, 400, 0.3);
  },
};

export function makeWallTexture(style) {
  const { c, ctx, size } = makeCanvas(256);
  (BUILDERS[style] || BUILDERS.rock)(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
