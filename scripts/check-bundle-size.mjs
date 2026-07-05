#!/usr/bin/env node
/**
 * 번들 사이즈 게이트 / Bundle-size gate.
 * dist 의 ES 코어 청크(gzip) 가 예산을 넘으면 실패한다.
 * Fails when the gzipped ES core chunk exceeds the budget.
 * 사용 / usage: npm run build && node scripts/check-bundle-size.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

// 예산(gzip bytes). i18n 포함 미니파이 실측 ~98KB 기준 + 여유.
// Budget in gzip bytes; ~98KB measured (minified, i18n included) + headroom.
const BUDGET = { esCore: 108_000, esEntry: 8_000 };

const distDir = resolve(process.cwd(), 'dist');
const files = readdirSync(distDir);
const gz = (name) => gzipSync(readFileSync(resolve(distDir, name))).length;

const esCoreName = files.find((f) => /^OpenGrid-.*\.js$/.test(f));
if (!esCoreName) { console.error('✗ ES 코어 청크(OpenGrid-*.js)를 찾지 못함. 빌드 먼저 실행하세요.'); process.exit(1); }

const checks = [
  ['ES core chunk', esCoreName, gz(esCoreName), BUDGET.esCore],
  ['ES entry (open-grid.js)', 'open-grid.js', gz('open-grid.js'), BUDGET.esEntry],
];

let failed = false;
console.log('번들 사이즈 게이트 / Bundle-size gate (gzip):');
for (const [label, name, size, budget] of checks) {
  const ok = size <= budget;
  const pct = ((size / budget) * 100).toFixed(0);
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(26)} ${String(size).padStart(7)}B / ${budget}B (${pct}%)  [${name}]`);
  if (!ok) failed = true;
}
if (failed) { console.error('\n✗ 번들 예산 초과 — 회귀를 확인하거나 예산을 조정하세요.'); process.exit(1); }
console.log('\n✓ 모든 번들이 예산 이내.');
