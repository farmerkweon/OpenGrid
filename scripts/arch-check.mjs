#!/usr/bin/env node
/**
 * DD-14 §7 arch:check CLI — 아키텍처 적합성 함수(의존방향·헤드리스 전역)를 실 src 트리에 구동.
 * / Architecture fitness-function CLI (dependency direction + headless globals).
 *
 * 규칙 SSOT = src/core/host/archCheck.ts (vitest 로 검증됨). 이 CLI 는 .ts 를 직접 import 할 수 없어
 * 동일 규칙을 얇게 재구현한다(드리프트 방지를 위해 규칙 목록을 archCheck.ts 와 1:1 유지).
 * 통합 게이트는 test/unit/host/archCheck.gate.test.ts 가 npm test 로 이미 강제한다.
 * 사용 / usage: node scripts/arch-check.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const HEADLESS_DIRS = [
  'src/core/domain/', 'src/core/coordinate/', 'src/core/format/', 'src/core/cf/',
  'src/core/formula/', 'src/core/realtime/', 'src/core/command/', 'src/core/a11y/',
  // §7.1 확장(DD-14 QA): chart/appearance 코어 헤드리스 강제(humble 어댑터는 BOUNDARY_DIRS 예외). archCheck.ts 와 1:1.
  'src/core/chart/', 'src/core/appearance/',
];
const CORE_DIR = 'src/core/';
const BOUNDARY_DIRS = [
  'src/core/host/',
  'src/core/chart/CanvasAdapter.ts',
  'src/core/appearance/ResolvedAppearanceSnapshot.ts',
];

const FRAMEWORK_IMPORT_RE =
  /\bfrom\s+['"]([^'"]*(?:react(?:-dom)?|vue|jquery|\/react\/|\/vue\/|\/jquery\/|\/vanilla\/|\/adapters\/)[^'"]*)['"]/;
const DOM_GLOBAL_RE = /\b(document|window|localStorage|sessionStorage|HTMLCanvasElement|CanvasRenderingContext2D)\b/;
const GETCOMPUTEDSTYLE_RE = /\bgetComputedStyle\s*\(/;
const ARIA_WRITE_RE = /\.setAttribute\s*\(\s*['"`]aria-/;

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const startsWithAny = (p, arr) => arr.some((x) => p.startsWith(x));

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const violations = [];
for (const abs of walk(join(ROOT, CORE_DIR))) {
  const path = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
  const isBoundary = startsWithAny(path, BOUNDARY_DIRS);
  const isHeadless = startsWithAny(path, HEADLESS_DIRS) && !isBoundary;
  const isA11y = path.startsWith('src/core/a11y/');
  const lines = stripComments(readFileSync(abs, 'utf8')).split(/\r?\n/);
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (!isBoundary) {
      const m = FRAMEWORK_IMPORT_RE.exec(line);
      if (m) violations.push(['core-imports-framework', path, ln, `imports "${m[1]}"`]);
    }
    if (isHeadless) {
      const g = DOM_GLOBAL_RE.exec(line);
      if (g) violations.push(['headless-dom-global', path, ln, `DOM global "${g[1]}"`]);
      if (GETCOMPUTEDSTYLE_RE.test(line)) violations.push(['getcomputedstyle-scope', path, ln, 'getComputedStyle']);
    }
    if (isA11y && ARIA_WRITE_RE.test(line)) violations.push(['a11y-aria-write', path, ln, 'aria-* setAttribute']);
  });
}

if (violations.length === 0) {
  console.log('arch:check OK — 0 violations.');
  process.exit(0);
}
console.error(`arch:check FAILED — ${violations.length} violation(s):`);
for (const [rule, path, ln, detail] of violations) console.error(`  [${rule}] ${path}:${ln} — ${detail}`);
process.exit(1);
