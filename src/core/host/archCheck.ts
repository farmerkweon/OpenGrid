// ============================================================
// DD-14 §3.5/§7/§7.1 arch:check — 아키텍처 적합성 함수(정적 분석) / architecture fitness function
// 의존 방향(코어→어댑터/프레임워크 import 0)·헤드리스 전역(코어 DOM 심볼 0)을 매 PR 에 기계 강제.
// 순수 함수: 파일 레코드({path,content}) 배열을 받아 위반 목록을 낸다(파일시스템·DOM 미접근).
// CLI 래퍼(scripts/arch-check.mjs)가 레포 소스를 읽어 이 함수를 구동한다.
// ============================================================

export type ArchRuleId =
  | 'core-imports-framework' // REQ-TX-845/T6-804: core → react/vue/adapter import 금지.
  | 'headless-dom-global' // §7.1: 헤드리스 코어 dir 에서 document/window/canvas 등 전역 참조 금지.
  | 'a11y-aria-write' // §7.1: core/a11y 에서 setAttribute('aria-*') 직접조작 금지.
  | 'getcomputedstyle-scope'; // §7.1: 코어에서 getComputedStyle 호출(컨테이너 스코프 경계 밖) 금지.

export interface ArchViolation {
  readonly rule: ArchRuleId;
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

export interface SourceFile {
  readonly path: string; // POSIX 슬래시 경로(예: 'src/core/coordinate/CoordinateKernel.ts').
  readonly content: string;
}

export interface ArchCheckOptions {
  /** 헤드리스 순수 dir 접두사(이 안에서 DOM 전역 금지). / Headless-pure dir prefixes. */
  readonly headlessDirs?: readonly string[];
  /** 코어 접두사(이 안에서 프레임워크 import 금지). / Core prefix (no framework imports). */
  readonly coreDir?: string;
  /** 경계 화이트리스트(헤드리스 규칙 예외 — humble shell·boundary). / Boundary whitelist. */
  readonly boundaryDirs?: readonly string[];
}

const DEFAULT_HEADLESS_DIRS = [
  'src/core/domain/',
  'src/core/coordinate/',
  'src/core/format/',
  'src/core/cf/',
  'src/core/formula/',
  'src/core/realtime/',
  'src/core/command/',
  'src/core/a11y/',
  // §7.1 확장(DD-14 QA): chart/appearance 코어도 헤드리스 강제 → getComputedStyle-scope·canvas-symbol
  //   규칙이 실제로 집행된다(정당한 humble 어댑터는 DEFAULT_BOUNDARY 화이트리스트로 예외).
  'src/core/chart/',
  'src/core/appearance/',
];

// 경계(humble/adapter) 화이트리스트: 헤드리스 규칙 예외. dir 접두사 + 개별 어댑터 파일.
//   - host/: 프레임워크 경계(포트/드라이버).
//   - chart/CanvasAdapter.ts: 유일한 canvas/DOM 렌더 어댑터(scene→픽셀).
//   - appearance/ResolvedAppearanceSnapshot.ts: 유일한 getComputedStyle 접점(컨테이너 스코프, never-throw 폴백).
const DEFAULT_BOUNDARY = [
  'src/core/host/',
  'src/core/chart/CanvasAdapter.ts',
  'src/core/appearance/ResolvedAppearanceSnapshot.ts',
];

// 코어에서 금지되는 프레임워크/어댑터 import 경로(상대·bare 모두).
const FRAMEWORK_IMPORT_RE =
  /\bfrom\s+['"]([^'"]*(?:react(?:-dom)?|vue|jquery|\/react\/|\/vue\/|\/jquery\/|\/vanilla\/|\/adapters\/)[^'"]*)['"]/;

// DOM/전역 심볼(헤드리스 dir 금지). getComputedStyle·aria 는 별 규칙으로 분리.
const DOM_GLOBAL_RE = /\b(document|window|localStorage|sessionStorage|HTMLCanvasElement|CanvasRenderingContext2D)\b/;
const GETCOMPUTEDSTYLE_RE = /\bgetComputedStyle\s*\(/;
const ARIA_WRITE_RE = /\.setAttribute\s*\(\s*['"`]aria-/;

/** 라인·블록 주석과 문자열 리터럴을 제거해 오탐을 줄인다(단순·보수적). / Strip comments to cut false positives. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // 블록 주석.
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // 라인 주석(스킴 '://' 보호).
}

function startsWithAny(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => path.startsWith(p));
}

/**
 * 정적 적합성 검사. 위반 목록 반환(빈 배열=통과).
 * / Static fitness check. Returns the list of violations (empty = pass).
 */
export function archCheck(files: readonly SourceFile[], opts: ArchCheckOptions = {}): ArchViolation[] {
  const headlessDirs = opts.headlessDirs ?? DEFAULT_HEADLESS_DIRS;
  const coreDir = opts.coreDir ?? 'src/core/';
  const boundaryDirs = opts.boundaryDirs ?? DEFAULT_BOUNDARY;
  const violations: ArchViolation[] = [];

  for (const file of files) {
    const path = file.path.replace(/\\/g, '/');
    const isCore = path.startsWith(coreDir);
    const isBoundary = startsWithAny(path, boundaryDirs);
    const isHeadless = startsWithAny(path, headlessDirs) && !isBoundary;
    const isA11y = path.startsWith('src/core/a11y/');
    const lines = stripComments(file.content).split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ln = i + 1;

      // Rule: core → framework/adapter import 금지.
      if (isCore && !isBoundary) {
        const m = FRAMEWORK_IMPORT_RE.exec(line);
        if (m) {
          violations.push({
            rule: 'core-imports-framework',
            path,
            line: ln,
            detail: `core module imports "${m[1]}" (framework/adapter dependency, REQ-TX-845)`,
          });
        }
      }

      // Rule: 헤드리스 dir DOM 전역 금지.
      if (isHeadless) {
        const g = DOM_GLOBAL_RE.exec(line);
        if (g) {
          violations.push({
            rule: 'headless-dom-global',
            path,
            line: ln,
            detail: `headless module references DOM global "${g[1]}" (REQ-TX-845 §7 headless)`,
          });
        }
        if (GETCOMPUTEDSTYLE_RE.test(line)) {
          violations.push({
            rule: 'getcomputedstyle-scope',
            path,
            line: ln,
            detail: 'getComputedStyle in headless core (container-scope boundary only, §7.1)',
          });
        }
      }

      // Rule: core/a11y aria 직접조작 금지(어댑터 단일경로).
      if (isA11y && ARIA_WRITE_RE.test(line)) {
        violations.push({
          rule: 'a11y-aria-write',
          path,
          line: ln,
          detail: 'core/a11y writes aria-* directly (must route through IAriaRenderPort, §7.1)',
        });
      }
    }
  }

  return violations;
}

/** 위반을 사람이 읽는 리포트로 직렬화(CLI 소비). / Serialize violations for the CLI. */
export function formatViolations(violations: readonly ArchViolation[]): string {
  if (violations.length === 0) return 'arch:check OK — 0 violations.';
  return (
    `arch:check FAILED — ${violations.length} violation(s):\n` +
    violations
      .map((v) => `  [${v.rule}] ${v.path}:${v.line} — ${v.detail}`)
      .join('\n')
  );
}
