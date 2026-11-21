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
  | 'getcomputedstyle-scope' // §7.1: 코어에서 getComputedStyle 호출(컨테이너 스코프 경계 밖) 금지.
  | 'headless-imports-render' // 계산 ← 그리기 한쪽 의존: 헤드리스 dir 에서 render/·GridRenderer·OpenGrid·RenderController import 금지.
  | 'headless-dom-type' // 새 헤드리스 파일 목록에서 DOM 형 이름(HTMLElement·Element·Node·MouseEvent·PointerEvent) 금지.
  | 'paint-path-dom-read' // 그리는 길 파일에서 배치를 강제하는 DOM 읽기(getComputedStyle·getBoundingClientRect·offset/client/scroll 크기 속성) 금지.
  | 'private-name-string-access'; // private/protected 로 선언된 `_이름` 을 글자로 부르기(`o['_x']`·`'_x' in o`) 금지 — 빌드의 이름 줄이기는 글자를 안 바꾼다.

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
  /** 헤드리스 dir 이 import 하면 안 되는 그리기 쪽 경로(확장자 뺀 접두사). / DOM-side targets headless code must not import. */
  readonly renderSideTargets?: readonly string[];
  /** DOM 형 이름 금지 대상(새 헤드리스 파일·dir 접두사). / New headless files where DOM type names are banned. */
  readonly domTypeBannedFiles?: readonly string[];
  /** 그리는 길 파일(접두사) — DOM 읽기 금지. / Paint-path files where layout-forcing DOM reads are banned. */
  readonly paintPathFiles?: readonly string[];
  /** 그리는 길 DOM 읽기 허용 목록: 파일 통째(method 없음) 또는 그 파일의 메서드 하나. / Allowed readers. */
  readonly paintPathReadAllow?: readonly PaintReadAllow[];
  /** 글자로 불러도 되는 비공개 이름(이미 있던 예외 — 빌드 이름표가 그 글자를 보고 지킴). / Private names allowed as strings. */
  readonly privateStringAllow?: readonly string[];
}

/** 그리는 길 DOM 읽기 허용 항목. method 를 주면 그 메서드 몸통 안에서만 허용. / Allow entry for paint-path reads. */
export interface PaintReadAllow {
  readonly path: string;
  readonly method?: string;
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

// 계산(헤드리스) ← 그리기(DOM) 한쪽 의존. 헤드리스 dir 에서 아래로 가는 import 는 방향이 거꾸로다.
//   (확장자를 뺀 해석 경로가 접두사와 같거나 'prefix/'·'prefix.' 로 시작하면 위반.)
const DEFAULT_RENDER_SIDE = [
  'src/core/render',
  'src/core/GridRenderer',
  'src/core/OpenGrid',
  'src/core/RenderController',
];

// DOM 형 이름 금지 대상: 넓은 그리드 성능 작업으로 새로 만드는 헤드리스 파일만.
//   기존 헤드리스 파일(appearance/AppearanceProvider.ts 의 Element, chart/types.ts 의 HTMLElement)은 손대지 않고 규칙 밖에 둔다.
//   scripts/arch-check.mjs 와 1:1.
const DEFAULT_DOM_TYPE_BANNED = [
  'src/core/coordinate/ExtraColumns.ts',
  'src/core/coordinate/ColumnGeometry.ts',
  'src/core/coordinate/ColumnWindow.ts',
  'src/core/coordinate/ColumnWindowPolicy.ts',
  'src/core/coordinate/CellTextPolicy.ts',
  'src/core/coordinate/RangeRectCalculator.ts',
  'src/core/coordinate/ViewportHeightJudge.ts',
  'src/core/coordinate/geometryPorts.ts',
  'src/core/domain/render/',
  'src/core/domain/resize/',
  'src/core/domain/sort/',
  'src/core/domain/footer/',
];

// 그리는 길: 이 파일들이 DOM 을 읽으면 그리기 도중 강제 배치(레이아웃)가 일어난다. 읽은 값은 값 객체로 받아야 한다.
const DEFAULT_PAINT_PATH = [
  'src/core/render/body/',
  'src/core/render/header/',
  'src/core/render/GeometryApplier.ts',
  'src/core/render/RenderScheduler.ts',
  'src/core/render/FooterView.ts',
];

// 그리는 길 DOM 읽기 허용: 스크롤·크기 읽기 전담 두 곳 + 줄바꿈 머리글 높이 한 번(HeaderView.height).
const DEFAULT_PAINT_READ_ALLOW: readonly PaintReadAllow[] = [
  { path: 'src/core/render/ScrollObserver.ts' },
  { path: 'src/core/render/viewport/ViewportSampler.ts' },
  { path: 'src/core/render/header/HeaderView.ts', method: 'height' },
];

// 글자로 불러도 되는 비공개 이름: 이미 있던 한 곳(문맥 메뉴 동작 표). 빌드 이름표가 그 글자를 보고 이 이름을 지킨다.
//   새로 더하지 말고 메서드로 부를 것. scripts/arch-check.mjs 와 1:1.
const DEFAULT_PRIVATE_STRING_ALLOW = ['_actions'];

// TS 에서 private/protected 로 선언된 `_이름`(필드·메서드·접근자·생성자 매개변수 속성).
const PRIVATE_DECL_RE =
  /\b(?:private|protected)\s+(?:static\s+)?(?:readonly\s+)?(?:override\s+)?(?:get\s+|set\s+|async\s+)?(_[A-Za-z0-9]\w*)/g;
// 글자로 속성을 부르는 두 꼴: o['_x'] 와 '_x' in o (홑·겹따옴표·템플릿).
const STRING_ACCESS_RE = /\[\s*(['"`])(_[A-Za-z0-9]\w*)\1\s*\]|(['"`])(_[A-Za-z0-9]\w*)\3\s+in\b/g;

// 코어에서 금지되는 프레임워크/어댑터 import 경로(상대·bare 모두).
const FRAMEWORK_IMPORT_RE =
  /\bfrom\s+['"]([^'"]*(?:react(?:-dom)?|vue|jquery|\/react\/|\/vue\/|\/jquery\/|\/vanilla\/|\/adapters\/)[^'"]*)['"]/;

// DOM/전역 심볼(헤드리스 dir 금지). getComputedStyle·aria 는 별 규칙으로 분리.
const DOM_GLOBAL_RE = /\b(document|window|localStorage|sessionStorage|HTMLCanvasElement|CanvasRenderingContext2D)\b/;
const GETCOMPUTEDSTYLE_RE = /\bgetComputedStyle\s*\(/;
const ARIA_WRITE_RE = /\.setAttribute\s*\(\s*['"`]aria-/;
// import·export from·동적 import 의 모듈 경로(한 줄에 여럿이어도 전부 — matchAll 로 쓴다).
const IMPORT_SPEC_RE = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const DOM_TYPE_RE =
  /\b(HTML\w*Element|SVG\w*Element|Element|Node|DOMRect(?:ReadOnly)?|Document|(?:Mouse|Pointer|Keyboard|Wheel|Focus|Touch|Drag|UI)Event)\b/;
// 읽기만 잡는다: 메서드 호출 셋 + 속성 읽기 세 꼴(점 접근 · 대괄호 접근 · 구조 분해).
//   점·대괄호 접근은 바로 뒤가 대입 '=' 이면 쓰기라 뺀다('==='·'+=' 는 읽기).
const DOM_READ_PROPS = 'offsetWidth|offsetHeight|clientWidth|clientHeight|scrollLeft|scrollTop|scrollWidth|scrollHeight';
const DOM_READ_CALL_RE = /\b(getComputedStyle|getBoundingClientRect|getClientRects)\s*\(/;
const DOM_READ_PROP_RE = new RegExp(`\\.(${DOM_READ_PROPS})\\b(?!\\s*=(?!=))`);
const DOM_READ_BRACKET_RE = new RegExp(`\\[\\s*['"\`](${DOM_READ_PROPS})['"\`]\\s*\\](?!\\s*=(?!=))`);
const DOM_READ_DESTRUCT_RE = new RegExp(`\\{[^}]*\\b(${DOM_READ_PROPS})\\b[^}]*\\}\\s*=(?!=)`);

/** 파일 기준 상대 모듈 경로를 'src/...' 경로로 푼다(확장자 뺌). 상대·'@/' 가 아니면 null. / Resolve a module specifier. */
function resolveSpecifier(fromPath: string, spec: string): string | null {
  let base: string[];
  let rest: string;
  if (spec.startsWith('@/')) {
    base = ['src'];
    rest = spec.slice(2);
  } else if (spec.startsWith('./') || spec.startsWith('../')) {
    base = fromPath.split('/').slice(0, -1);
    rest = spec;
  } else {
    return null;
  }
  const parts = [...base];
  for (const seg of rest.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/').replace(/\.(?:js|ts|mjs)$/, '');
}

function isUnderTarget(resolved: string, targets: readonly string[]): boolean {
  return targets.some((t) => resolved === t || resolved.startsWith(t + '/') || resolved.startsWith(t + '.'));
}

/**
 * 메서드 몸통 줄 번호 집합(0-base). 줄 머리에서 `name(...) {` 로 여는 줄부터 중괄호가 닫히는 줄까지. 단순 중괄호 셈.
 * 메서드·getter 만 연다 — `set name(v)` 와 `this.name()` 호출은 열지 않는다.
 * / Line indices inside the body of method (or getter) `name`; setters and call sites never open it.
 */
function methodBodyLines(lines: readonly string[], name: string): Set<number> {
  const out = new Set<number>();
  const open = new RegExp(
    `^\\s*(?:(?:public|private|protected|static|override|async|readonly)\\s+)*(?:get\\s+)?${name}\\s*\\([^)]*\\)\\s*(?::\\s*[\\w<>\\[\\]| ]+)?\\{`,
  );
  let depth = 0;
  let inside = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inside && open.test(line)) inside = true;
    if (!inside) continue;
    out.add(i);
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth <= 0) {
      inside = false;
      depth = 0;
    }
  }
  return out;
}

/**
 * 라인·블록 주석만 지운다. 문자열 리터럴은 지우지 않는다(그래서 문자열 안 낱말도 규칙에 걸린다).
 * 따옴표·템플릿·정규식 리터럴 안의 `//`·`/*` 는 주석으로 보지 않고, 주석 안의 `/*` 도 따로 열지 않는다.
 * 블록 주석은 그 안의 줄바꿈만 남겨 보고 줄 번호가 원본과 같다. 작은 스캐너라 정규식/나눗셈 가르기는 앞 글자로 짐작한다.
 * / Removes line and block comments only (string literals are kept). Quotes, templates and regex literals
 *   are skipped; block comments keep their newlines so reported line numbers match the source.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  const tpl: number[] = []; // 템플릿 `${ }` 안 중괄호 깊이.
  let prev = ''; // 마지막 공백 아닌 코드 글자(정규식 리터럴 시작 짐작용).
  while (i < n) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === '/' && nx === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && nx === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && src[j] !== ch && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      prev = ch;
      continue;
    }
    if (ch === '`' || (ch === '}' && tpl.length > 0 && tpl[tpl.length - 1] === 0)) {
      if (ch === '}') tpl.pop();
      let j = i + 1;
      while (j < n && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
      if (j < n && src[j] === '$') {
        tpl.push(0);
        out += src.slice(i, j + 2);
        i = j + 2;
        prev = '{';
      } else {
        out += src.slice(i, j + 1);
        i = j + 1;
        prev = '`';
      }
      continue;
    }
    if (ch === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev))) {
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== '\n') {
        const c = src[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '[') cls = true;
        else if (c === ']') cls = false;
        else if (c === '/' && !cls) break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      prev = 'a';
      continue;
    }
    if (tpl.length > 0) {
      if (ch === '{') tpl[tpl.length - 1]++;
      else if (ch === '}') tpl[tpl.length - 1]--;
    }
    if (!/\s/.test(ch)) prev = ch;
    out += ch;
    i++;
  }
  return out;
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
  const renderSide = opts.renderSideTargets ?? DEFAULT_RENDER_SIDE;
  const domTypeBanned = opts.domTypeBannedFiles ?? DEFAULT_DOM_TYPE_BANNED;
  const paintPath = opts.paintPathFiles ?? DEFAULT_PAINT_PATH;
  const paintAllow = opts.paintPathReadAllow ?? DEFAULT_PAINT_READ_ALLOW;
  const privateAllow = new Set(opts.privateStringAllow ?? DEFAULT_PRIVATE_STRING_ALLOW);
  const violations: ArchViolation[] = [];

  // 넘겨받은 파일 전체에서 비공개 이름을 모은다. 빌드의 이름 줄이기는 이름 글자 기준이라 파일을 가리지 않는다.
  // Collect private names across all given files: build-time renaming goes by spelling, not by file.
  const privateNames = new Set<string>();
  for (const file of files) {
    for (const m of stripComments(file.content).matchAll(PRIVATE_DECL_RE)) privateNames.add(m[1]);
  }

  for (const file of files) {
    const path = file.path.replace(/\\/g, '/');
    const isCore = path.startsWith(coreDir);
    const isBoundary = startsWithAny(path, boundaryDirs);
    const isHeadless = startsWithAny(path, headlessDirs) && !isBoundary;
    const isA11y = path.startsWith('src/core/a11y/');
    const isDomTypeBanned = startsWithAny(path, domTypeBanned) && !isBoundary;
    const allowHere = paintAllow.filter((a) => a.path === path);
    const isPaintPath = startsWithAny(path, paintPath) && !allowHere.some((a) => a.method === undefined);
    const lines = stripComments(file.content).split(/\r?\n/);
    const allowedLines = new Set<number>();
    if (isPaintPath) {
      for (const a of allowHere) {
        if (a.method !== undefined) for (const i of methodBodyLines(lines, a.method)) allowedLines.add(i);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ln = i + 1;

      // Rule: 헤드리스 → 그리기 쪽 import 금지(의존은 계산 ← 그리기 한쪽).
      if (isHeadless) {
        for (const im of line.matchAll(IMPORT_SPEC_RE)) {
          const resolved = resolveSpecifier(path, im[1]);
          if (resolved !== null && isUnderTarget(resolved, renderSide)) {
            violations.push({
              rule: 'headless-imports-render',
              path,
              line: ln,
              detail: `headless module imports DOM-side "${im[1]}" (dependency must point headless <- render)`,
            });
          }
        }
      }

      // Rule: 새 헤드리스 파일에서 DOM 형 이름 금지.
      if (isDomTypeBanned) {
        const t = DOM_TYPE_RE.exec(line);
        if (t) {
          violations.push({
            rule: 'headless-dom-type',
            path,
            line: ln,
            detail: `headless module names DOM type "${t[1]}" (pass values, not DOM objects)`,
          });
        }
      }

      // Rule: 그리는 길 DOM 읽기 금지(허용 목록 밖).
      if (isPaintPath && !allowedLines.has(i)) {
        const c = DOM_READ_CALL_RE.exec(line);
        const p = DOM_READ_PROP_RE.exec(line);
        const b = DOM_READ_BRACKET_RE.exec(line);
        const d = DOM_READ_DESTRUCT_RE.exec(line);
        const what = c ? `${c[1]}()` : p ? `.${p[1]}` : b ? `['${b[1]}']` : d ? `{ ${d[1]} } =` : null;
        if (what !== null) {
          violations.push({
            rule: 'paint-path-dom-read',
            path,
            line: ln,
            detail: `paint-path module reads DOM layout ${what} (read in ScrollObserver/ViewportSampler, pass values)`,
          });
        }
      }

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

      // Rule: 비공개 이름을 글자로 부르기 금지(빌드가 줄인 이름과 어긋난다).
      for (const m of line.matchAll(STRING_ACCESS_RE)) {
        const name = m[2] ?? m[4];
        if (privateNames.has(name) && !privateAllow.has(name)) {
          violations.push({
            rule: 'private-name-string-access',
            path,
            line: ln,
            detail: `private member "${name}" accessed by string (the build renames private names, never strings)`,
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
