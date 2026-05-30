#!/usr/bin/env node
// Increments the "build X.YZ" number in index.html by 0.01.
// Run manually (`node scripts/bump-build.mjs`) or via the pre-commit hook.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'index.html');
const html = readFileSync(file, 'utf8');

const re = /(quarry \| pre-alpha \| build )(\d+)\.(\d+)/;
const m = html.match(re);
if (!m) {
  console.error('bump-build: build stamp not found in index.html');
  process.exit(1);
}

// Treat the stamp as an integer count of hundredths so 0.14 -> 0.15, 0.99 -> 1.00.
const hundredths = parseInt(m[2], 10) * 100 + parseInt(m[3], 10) + 1;
const major = Math.floor(hundredths / 100);
const minor = String(hundredths % 100).padStart(2, '0');
const next = `${m[1]}${major}.${minor}`;

writeFileSync(file, html.replace(re, next));
console.log(`bump-build: ${m[0]} -> ${next.replace(m[1], 'build ')}`.replace('build build', 'build'));
