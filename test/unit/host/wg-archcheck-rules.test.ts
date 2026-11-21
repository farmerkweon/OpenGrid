// @vitest-environment node
/**
 * 넓은 그리드 S0 — 구조 게이트 새 규칙 셋과 계약 사본 확인.
 *
 *  - AR-06 : 실제 src/core 에 arch 위반 0, 새 헤드리스 계약은 coordinate/·domain/ 아래.
 *  - AR-08 : 새 규칙 셋 ① headless-imports-render ② headless-dom-type ③ paint-path-dom-read 이 실제 트리에서 0.
 *  - ST-13 : 규칙마다 일부러 어긴 임시 파일 하나로 빨개짐(ⓐⓑⓒ), 허용 목록이 실제로 먹음(ⓓ),
 *            기존 주인 없는 파일(AppearanceProvider·chart/types)은 규칙 밖(ⓔ — 같은 내용을 새 파일 경로에 두면 잡히는 대조군 포함).
 *  - CLI   : scripts/arch-check.mjs 가 같은 세 규칙을 같은 이름으로 잡음(archCheck.ts 와 1:1).
 *  - AR-10 : SLICE_OWNERSHIP 다섯 키.
 *  - AR-11 : 계약 사본 6개 = 설계 계약(주석을 뺀 코드 비교, 공지한 계약 변경 v2 반영).
 *
 * 기존 archCheck.test.ts·archCheck.gate.test.ts 는 고치지 않는다 — 같은 규칙 함수를 이 파일에서 부른다.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readdirSync, readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { archCheck, formatViolations, type SourceFile, type ArchRuleId } from '../../../src/core/host/archCheck.js';
import { SLICE_OWNERSHIP } from '../../../src/core/coordinate/ports.js';

const ROOT = resolve(__dirname, '../../..');
const NEW_RULES: readonly ArchRuleId[] = ['headless-imports-render', 'headless-dom-type', 'paint-path-dom-read'];

function collect(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
        out.push({ path: p.slice(ROOT.length + 1).replace(/\\/g, '/'), content: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(ROOT, dir));
  return out;
}

const rulesOf = (files: SourceFile[]): ArchRuleId[] => archCheck(files).map((v) => v.rule);
const one = (path: string, content: string): SourceFile[] => [{ path, content }];

/** 계약 사본 6개(src 경로 ↔ 설계 계약 파일). */
const CONTRACTS: readonly (readonly [string, string])[] = [
  ['src/core/coordinate/geometryPorts.ts', 'geometryPorts.ts'],
  ['src/core/domain/render/ports.ts', 'renderRequestPorts.ts'],
  ['src/core/domain/resize/ports.ts', 'resizePorts.ts'],
  ['src/core/domain/sort/ports.ts', 'sortPorts.ts'],
  ['src/core/domain/footer/ports.ts', 'footerPorts.ts'],
  ['src/core/render/ports.ts', 'renderPorts.ts'],
];
const HEADLESS_CONTRACTS = CONTRACTS.map(([p]) => p).filter((p) => !p.startsWith('src/core/render/'));

describe('AR-06 · AR-08 실제 트리', () => {
  const files = collect('src/core');

  it('AR-06 src/core 에 arch 위반 0 (기존 규칙 + 새 규칙)', () => {
    const v = archCheck(files);
    expect(v, formatViolations(v)).toEqual([]);
  });

  it('AR-06 새 헤드리스 계약 다섯은 coordinate/·domain/ 아래에 있고 실제로 읽힘', () => {
    for (const p of HEADLESS_CONTRACTS) {
      expect(p.startsWith('src/core/coordinate/') || p.startsWith('src/core/domain/')).toBe(true);
      expect(files.some((f) => f.path === p)).toBe(true);
    }
  });

  it('AR-08 새 규칙 셋 위반 0 (지금 코드)', () => {
    const v = archCheck(files).filter((x) => NEW_RULES.includes(x.rule));
    expect(v, formatViolations(v)).toEqual([]);
  });

  it('AR-08 render/ports.ts 는 계산 쪽을 가져다 쓰지만(그리기 → 계산) 위반이 아님', () => {
    const src = files.find((f) => f.path === 'src/core/render/ports.ts');
    expect(src?.content).toContain("from '../coordinate/geometryPorts.js'");
    expect(rulesOf([src as SourceFile])).toEqual([]);
  });
});

describe('ST-13 ⓐ 헤드리스 → 그리기 쪽 import 금지', () => {
  it.each([
    ['src/core/coordinate/ColumnGeometry.ts', "import { BodyView } from '../render/BodyView';"],
    ['src/core/coordinate/ColumnGeometry.ts', "import type { IBodyView } from '../render/ports.js';"],
    ['src/core/domain/render/RenderPlanner.ts', "import { x } from '../../render/body/BodyView.js';"],
    ['src/core/domain/sort/Sorter.ts', "import { GridRenderer } from '../../GridRenderer.js';"],
    ['src/core/coordinate/CoordinateKernel.ts', "import type { OpenGrid } from '../OpenGrid';"],
    ['src/core/formula/Engine.ts', "export { y } from '../RenderController.js';"],
    ['src/core/cf/Rules.ts', "const m = await import('../render/index.js');"],
    ['src/core/domain/footer/FooterValues.ts', "import { z } from '@/core/render/FooterView';"],
  ])('%s : %s → 위반', (path, line) => {
    const v = archCheck(one(path, `${line}\nexport const a = 1;\n`));
    expect(v.map((x) => x.rule)).toEqual(['headless-imports-render']);
    expect(v[0].line).toBe(1);
  });

  it.each([
    ['src/core/coordinate/ColumnGeometry.ts', "import type { Px } from './types.js';"],
    ['src/core/domain/render/RenderPlanner.ts', "import type { RowSpan } from '../../coordinate/geometryPorts.js';"],
    ['src/core/coordinate/X.ts', "import { r } from '../renderers/TextRenderer.js';"],
    ['src/core/render/body/BodyView.ts', "import type { IColumnGeometry } from '../../coordinate/geometryPorts.js';"],
    ['src/core/GridRenderer.ts', "import { BodyView } from './render/body/BodyView.js';"],
  ])('%s : %s → 통과(방향이 맞거나 헤드리스가 아님)', (path, line) => {
    expect(rulesOf(one(path, `${line}\n`))).toEqual([]);
  });

  it('주석 속 import 문장은 위반 아님', () => {
    expect(rulesOf(one('src/core/coordinate/X.ts', "// import { a } from '../render/BodyView';\nexport const a = 1;\n"))).toEqual([]);
  });
});

describe('ST-13 ⓑ 새 헤드리스 파일에서 DOM 형 이름 금지', () => {
  it.each([
    ['src/core/domain/render/RenderPlanner.ts', 'export function f(el: HTMLElement) { return el; }'],
    ['src/core/coordinate/ColumnGeometry.ts', 'export type T = Element | null;'],
    ['src/core/coordinate/geometryPorts.ts', 'export interface P { n: Node }'],
    ['src/core/domain/resize/ResizeGesture.ts', 'export function f(e: MouseEvent) { return e; }'],
    ['src/core/domain/sort/Sorter.ts', 'export function f(e: PointerEvent) { return e; }'],
    ['src/core/domain/footer/FooterValues.ts', 'let x: HTMLElement | undefined;'],
    ['src/core/coordinate/ViewportHeightJudge.ts', 'export type E = Element;'],
  ])('%s → 위반', (path, line) => {
    const v = archCheck(one(path, `${line}\n`));
    expect(v.map((x) => x.rule)).toEqual(['headless-dom-type']);
  });

  it('주석 속 DOM 형 이름·비슷한 이름(NodeBudget·ElementRef 아님 경계)은 통과', () => {
    const content = '/** HTMLElement 를 받지 않는다 */\n// MouseEvent 도\nexport class NodeBudget {}\nexport type Elements = number;\n';
    expect(rulesOf(one('src/core/coordinate/ColumnGeometry.ts', content))).toEqual([]);
  });

  it('목록 밖 기존 헤드리스 파일은 이 규칙 대상이 아님(규칙은 새 파일 목록에만)', () => {
    expect(rulesOf(one('src/core/coordinate/CoordinateKernel.ts', 'export type T = HTMLElement;\n'))).toEqual([]);
  });
});

describe('ST-13 ⓒ 그리는 길 파일에서 DOM 읽기 금지', () => {
  it.each([
    ['src/core/render/body/BodyView.ts', 'const r = el.getBoundingClientRect();'],
    ['src/core/render/body/rows/DataRowPainter.ts', 'const s = getComputedStyle(el);'],
    ['src/core/render/header/ResizeHandleBinder.ts', 'const w = th.offsetWidth;'],
    ['src/core/render/GeometryApplier.ts', 'if (wrap.scrollLeft > 0) return;'],
    ['src/core/render/RenderScheduler.ts', 'const h = box.clientHeight;'],
    ['src/core/render/body/CellPainter.ts', 'el.scrollTop = el.scrollTop + 1;'],
    ['src/core/render/body/CellPainter.ts', 'if (a === el.offsetHeight) {}'],
    ['src/core/render/body/CellPainter.ts', 'el.scrollLeft += 4;'],
    ['src/core/render/body/CellPainter.ts', 'const w = el.clientWidth;'],
  ])('%s : %s → 위반', (path, line) => {
    const v = archCheck(one(path, `${line}\n`));
    expect(v.map((x) => x.rule)).toEqual(['paint-path-dom-read']);
  });

  it('쓰기만(대입)은 읽기가 아니라 통과', () => {
    expect(rulesOf(one('src/core/render/GeometryApplier.ts', 'wrap.scrollLeft = x;\nel.style.width = w + "px";\n'))).toEqual([]);
  });

  it('그리는 길이 아닌 render/ 파일(기존 CellApplier 등)은 대상이 아님', () => {
    expect(rulesOf(one('src/core/render/CellApplier.ts', 'const r = el.getBoundingClientRect();\n'))).toEqual([]);
  });
});

describe('ST-13 ⓓ 허용 목록이 실제로 먹음', () => {
  it('HeaderView.height() 안의 offsetHeight 읽기는 통과', () => {
    const content = [
      'export class HeaderView {',
      '  paintAll(): void {',
      '    this._x = 1;',
      '  }',
      '  height(): number {',
      '    if (this._wrap) {',
      '      return this._table.offsetHeight;',
      '    }',
      '    return 0;',
      '  }',
      '}',
    ].join('\n');
    expect(rulesOf(one('src/core/render/header/HeaderView.ts', content))).toEqual([]);
  });

  it('같은 HeaderView 파일의 다른 메서드에서 읽으면 위반(허용은 그 메서드 몸통만)', () => {
    const content = [
      'export class HeaderView {',
      '  height(): number {',
      '    return this._table.offsetHeight;',
      '  }',
      '  paintAll(): void {',
      '    const w = this._th.offsetWidth;',
      '  }',
      '}',
    ].join('\n');
    const v = archCheck(one('src/core/render/header/HeaderView.ts', content));
    expect(v.map((x) => [x.rule, x.line])).toEqual([['paint-path-dom-read', 6]]);
  });

  it('ScrollObserver·ViewportSampler 는 파일 통째로 허용', () => {
    expect(rulesOf(one('src/core/render/ScrollObserver.ts', 'const l = wrap.scrollLeft; const w = wrap.clientWidth;\n'))).toEqual([]);
    expect(rulesOf(one('src/core/render/viewport/ViewportSampler.ts', 'const r = el.getBoundingClientRect();\n'))).toEqual([]);
  });
});

describe('ST-13 ⓔ 기존 주인 없는 파일은 규칙 밖 (대조군 포함)', () => {
  const existing = ['src/core/appearance/AppearanceProvider.ts', 'src/core/chart/types.ts'];

  it.each(existing)('%s 실제 내용 → 위반 0', (p) => {
    const content = readFileSync(join(ROOT, p), 'utf8');
    expect(archCheck(one(p, content))).toEqual([]);
  });

  it.each(existing)('대조군: %s 의 같은 내용을 새 헤드리스 파일 경로에 두면 headless-dom-type 으로 잡힘', (p) => {
    const content = readFileSync(join(ROOT, p), 'utf8');
    const rules = rulesOf(one('src/core/coordinate/ColumnGeometry.ts', content));
    expect(rules).toContain('headless-dom-type');
  });
});

describe('CLI scripts/arch-check.mjs 가 같은 세 규칙을 잡음 (1:1)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'og-archcheck-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const put = (rel: string, content: string): void => {
    const abs = join(tmp, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
  };
  const runCli = () => spawnSync(process.execPath, [join(ROOT, 'scripts/arch-check.mjs')], { cwd: tmp, encoding: 'utf8' });

  it('깨끗한 임시 트리 → 종료 0', () => {
    put('src/core/coordinate/ColumnGeometry.ts', "import type { Px } from './types.js';\nexport const a = 1;\n");
    put('src/core/render/header/HeaderView.ts', 'export class HeaderView {\n  height(): number {\n    return this._t.offsetHeight;\n  }\n}\n');
    const r = runCli();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('0 violations');
  });

  it('규칙마다 하나씩 어긴 파일 → 종료 1, 세 규칙 이름이 모두 출력', () => {
    put('src/core/coordinate/ColumnWindow.ts', "import { BodyView } from '../render/BodyView';\n");
    put('src/core/domain/render/RenderPlanner.ts', 'export function f(el: HTMLElement) { return el; }\n');
    put('src/core/render/body/BodyView.ts', 'const r = el.getBoundingClientRect();\n');
    const r = runCli();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('[headless-imports-render] src/core/coordinate/ColumnWindow.ts:1');
    expect(r.stderr).toContain('[headless-dom-type] src/core/domain/render/RenderPlanner.ts:1');
    expect(r.stderr).toContain('[paint-path-dom-read] src/core/render/body/BodyView.ts:1');
    expect(r.stderr).toContain('3 violation(s)');
  });

  it('같은 임시 트리를 규칙 함수에 넣어도 같은 세 위반(두 구현이 같은 답)', () => {
    // 임시 트리는 저장소 밖이라 collect 대신 직접 모은다.
    const gather: SourceFile[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else gather.push({ path: p.slice(tmp.length + 1).replace(/\\/g, '/'), content: readFileSync(p, 'utf8') });
      }
    };
    walk(join(tmp, 'src'));
    const v = archCheck(gather).map((x) => `${x.rule} ${x.path}:${x.line}`).sort();
    expect(v).toEqual([
      'headless-dom-type src/core/domain/render/RenderPlanner.ts:1',
      'headless-imports-render src/core/coordinate/ColumnWindow.ts:1',
      'paint-path-dom-read src/core/render/body/BodyView.ts:1',
    ]);
  });
});

describe('ST-13 덧 — 코드 검토 S0-3 의 우회 꼴(a·b·c·e·g)과 S0-4 줄 번호', () => {
  it('a 한 줄에 import 둘 — 둘째가 그리기 쪽이면 잡힘', () => {
    const v = archCheck(one('src/core/coordinate/ColumnWindow.ts', "import a from './types'; import b from '../render/BodyView';\n"));
    expect(v.map((x) => [x.rule, x.line, x.detail.includes('../render/BodyView')])).toEqual([['headless-imports-render', 1, true]]);
  });

  it('b 문자열 속 /* 가 뒤 코드를 지우지 않음', () => {
    const content = "const g = 'src/*'; export type K = number;\nexport type Z = HTMLElement;\nconst end = '*/';\n";
    const v = archCheck(one('src/core/domain/resize/c.ts', content));
    expect(v.map((x) => [x.rule, x.line])).toEqual([['headless-dom-type', 2]]);
  });

  it('b 템플릿·정규식 리터럴 안의 // 도 주석이 아님', () => {
    const content = 'const u = `http://x/${a}`; export type A = HTMLElement;\nconst r = /\\/\\//; export type B = Node;\n';
    const v = archCheck(one('src/core/domain/sort/x.ts', content));
    expect(v.map((x) => [x.rule, x.line])).toEqual([['headless-dom-type', 1], ['headless-dom-type', 2]]);
  });

  it('b 라인 주석 안의 /** 가 블록 주석을 열지 않음(뒤 코드가 살아 있음)', () => {
    const content = '// cf/** 는 계산 쪽\nexport type A = HTMLElement;\n/** 진짜 블록 */\n';
    const v = archCheck(one('src/core/domain/footer/x.ts', content));
    expect(v.map((x) => [x.rule, x.line])).toEqual([['headless-dom-type', 2]]);
  });

  it('b 주석 속 낱말은 여전히 안 잡힘(문자열은 남지만 주석은 지움)', () => {
    const content = "/* HTMLElement */\n// MouseEvent\nexport const s = 'a';\n";
    expect(rulesOf(one('src/core/domain/render/x.ts', content))).toEqual([]);
  });

  it.each(['HTMLDivElement', 'KeyboardEvent', 'DOMRect', 'DOMRectReadOnly', 'SVGElement', 'SVGPathElement', 'Document',
    'WheelEvent', 'FocusEvent', 'TouchEvent', 'DragEvent', 'UIEvent'])('c DOM 형 낱말 %s → 위반(새 헤드리스 파일)', (w) => {
    expect(rulesOf(one('src/core/domain/sort/a.ts', `export type E = ${w};\n`))).toEqual(['headless-dom-type']);
  });

  it('c 넓힌 낱말도 목록 밖 파일에는 안 걸림 · 비슷한 이름은 통과', () => {
    expect(rulesOf(one('src/core/coordinate/CoordinateKernel.ts', 'export type E = KeyboardEvent;\n'))).toEqual([]);
    expect(rulesOf(one('src/core/domain/sort/a.ts', 'export type DocumentLike = { id: string };\nexport class NodeBudget {}\n'))).toEqual([]);
  });

  it.each([
    ['const { offsetWidth } = el;', '{ offsetWidth } ='],
    ['const { a, scrollTop: t } = wrap;', '{ scrollTop } ='],
    ["const s = el['scrollLeft'];", "['scrollLeft']"],
    ['const s = el["clientWidth"];', "['clientWidth']"],
    ['const r = el.getClientRects();', 'getClientRects()'],
    ['const w = el.scrollWidth;', '.scrollWidth'],
    ['const h = el.scrollHeight;', '.scrollHeight'],
  ])('e 그리는 길 DOM 읽기 변형 %s → 위반', (line, what) => {
    const v = archCheck(one('src/core/render/body/BodyRow.ts', `${line}\n`));
    expect(v.map((x) => x.rule)).toEqual(['paint-path-dom-read']);
    expect(v[0].detail).toContain(what);
  });

  it("e 대괄호 쓰기(el['scrollLeft'] = x)·객체 리터럴은 읽기가 아님", () => {
    const content = "el['scrollLeft'] = x;\nconst o = { offsetWidth: 3 };\n";
    expect(rulesOf(one('src/core/render/body/BodyRow.ts', content))).toEqual([]);
  });

  it('g setter `set height(v)` 는 허용 메서드로 열리지 않음 · getter 는 열림', () => {
    const setter = 'export class HeaderView {\n  set height(v: number) {\n    const z = this._t.offsetHeight;\n  }\n}\n';
    expect(archCheck(one('src/core/render/header/HeaderView.ts', setter)).map((x) => [x.rule, x.line])).toEqual([['paint-path-dom-read', 3]]);
    const getter = 'export class HeaderView {\n  get height(): number {\n    return this._t.offsetHeight;\n  }\n}\n';
    expect(rulesOf(one('src/core/render/header/HeaderView.ts', getter))).toEqual([]);
  });

  it('g 호출 자리 `this.height()` 뒤 블록은 허용 구역이 아님', () => {
    const content = 'export class HeaderView {\n  paintAll(): void {\n    if (this.ok) { this.height(); const w = this._th.offsetWidth; }\n  }\n}\n';
    expect(archCheck(one('src/core/render/header/HeaderView.ts', content)).map((x) => x.line)).toEqual([3]);
  });

  it('S0-4 여러 줄 블록 주석 아래 위반의 보고 줄 = 원본 줄', () => {
    const content = '/**\n * 설명\n * 둘째 줄\n */\nexport type A = HTMLElement;\n';
    expect(archCheck(one('src/core/domain/render/x.ts', content)).map((x) => x.line)).toEqual([5]);
  });

  // 검토 임시 트리의 우회 10종(경로·내용 그대로). d(형 별칭)·f(목록 밖 DOM 모듈)는 이번 판 규칙 밖이라 안 잡히는 것이 기대값.
  const BYPASS: readonly SourceFile[] = [
    { path: 'src/core/coordinate/CellTextPolicy.ts', content: "import { E } from '../EditManager';\n" },
    { path: 'src/core/coordinate/ColumnGeometry.ts', content: "import { A } from '@/core/render/BodyView';\n" },
    { path: 'src/core/coordinate/ColumnWindow.ts', content: "import a from './types'; import b from '../render/BodyView';\n" },
    { path: 'src/core/coordinate/ExtraColumns.ts', content: "import {\n  X,\n} from '../GridRenderer.js';\n" },
    { path: 'src/core/domain/footer/b.ts', content: "import type { DomEl } from '../../domAlias'; export type F = DomEl;\n" },
    { path: 'src/core/domain/resize/c.ts', content: "const g = 'src/*'; export type K = number;\nexport type Z = HTMLElement;\nconst end = '*/';\n" },
    { path: 'src/core/domain/sort/a.ts', content: 'export type E1 = HTMLDivElement; export type E2 = KeyboardEvent; export type E3 = DOMRect; export type E4 = SVGElement;\n' },
    { path: 'src/core/domAlias.ts', content: 'export type DomEl = HTMLElement;\n' },
    {
      path: 'src/core/render/body/BodyRow.ts',
      content: "const { offsetWidth } = el;\nconst s = el['scrollLeft'];\nconst r = el.getClientRects();\nconst w = el.scrollWidth;\nconst q = el?.getBoundingClientRect();\nx.scrollTop = 5;\nconst t = a.scrollTop == b;\n",
    },
    {
      path: 'src/core/render/header/HeaderView.ts',
      content: 'export class HeaderView {\n  set height(v: number) {\n    const z = this._t.offsetHeight;\n  }\n  other() { return this._t.offsetHeight; }\n}\n',
    },
  ];

  it('검토 우회 트리 — 규칙 함수가 13줄을 잡고, d·f 만 남음', () => {
    const v = archCheck(BYPASS).map((x) => `${x.rule} ${x.path}:${x.line}`).sort();
    expect(v).toEqual([
      'headless-dom-type src/core/domain/resize/c.ts:2',
      'headless-dom-type src/core/domain/sort/a.ts:1',
      'headless-imports-render src/core/coordinate/ColumnGeometry.ts:1',
      'headless-imports-render src/core/coordinate/ColumnWindow.ts:1',
      'headless-imports-render src/core/coordinate/ExtraColumns.ts:3',
      'paint-path-dom-read src/core/render/body/BodyRow.ts:1',
      'paint-path-dom-read src/core/render/body/BodyRow.ts:2',
      'paint-path-dom-read src/core/render/body/BodyRow.ts:3',
      'paint-path-dom-read src/core/render/body/BodyRow.ts:4',
      'paint-path-dom-read src/core/render/body/BodyRow.ts:5',
      'paint-path-dom-read src/core/render/body/BodyRow.ts:7',
      'paint-path-dom-read src/core/render/header/HeaderView.ts:3',
      'paint-path-dom-read src/core/render/header/HeaderView.ts:5',
    ]);
  });

  it('검토 우회 트리 — CLI 도 같은 13줄(1:1)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'og-archbypass-'));
    try {
      for (const f of BYPASS) {
        mkdirSync(dirname(join(tmp, f.path)), { recursive: true });
        writeFileSync(join(tmp, f.path), f.content, 'utf8');
      }
      const r = spawnSync(process.execPath, [join(ROOT, 'scripts/arch-check.mjs')], { cwd: tmp, encoding: 'utf8' });
      expect(r.status).toBe(1);
      const got = r.stderr.split(/\r?\n/).filter((l) => l.startsWith('  [')).map((l) => l.replace(/^\s+\[([^\]]+)\] (\S+) — .*$/, '$1 $2')).sort();
      expect(got).toEqual(archCheck(BYPASS).map((x) => `${x.rule} ${x.path}:${x.line}`).sort());
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('AR-10 · AR-11 계약과 주인 표', () => {
  it('AR-10 SLICE_OWNERSHIP 에 다섯 주인', () => {
    expect(SLICE_OWNERSHIP).toMatchObject({
      colGeometry: 'ColumnGeometry',
      colWindow: 'ColumnWindowPolicy',
      renderRequest: 'RenderScheduler',
      sortRanks: 'SortKeyStore',
      drawnBody: 'BodyView',
    });
  });

  // 주석을 지우고(arch-check 와 같은 방식) 빈 줄·줄 끝 공백을 뺀 코드끼리 비교한다.
  // src 쪽 주석은 배포 파일이라 공정 낱말을 빼고 다시 썼으므로 주석은 비교하지 않는다.
  const code = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      .split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '').join('\n');
  // 공지한 계약 변경의 예외 표 — 비워 둔다(코드 검토 S0-1: 예외 표가 남으면 다음 차이도 같은 길로 덮인다).
  // 'window' → 'windowFirst' 는 정본 design/contracts/sortPorts.ts 가 맞춰졌고 아래 사본에도 반영됨.
  const ANNOUNCED: Record<string, readonly (readonly [string, string])[]> = {};
  // 계약 사본: 배포 밖 폴더(sessions/)에 기대지 않게 test/unit/__golden__/wg/contracts/ 를 읽는다(코드 검토 S0-2).
  // 정본(sessions/widegrid-perf-2026-11/design/contracts/)이 바뀌면 TEST 레인이 사본을 다시 복사하고 CHANGES.md 에 적는다.
  const DESIGN = join(ROOT, 'test/unit/__golden__/wg/contracts');

  it.each(CONTRACTS)('AR-11 %s = 설계 계약 %s (주석 뺀 코드)', (src, contract) => {
    expect(existsSync(join(DESIGN, contract))).toBe(true);
    let expected = code(readFileSync(join(DESIGN, contract), 'utf8'));
    for (const [from, to] of ANNOUNCED[contract] ?? []) {
      expect(expected).toContain(from);
      expected = expected.replace(from, to);
    }
    expect(code(readFileSync(join(ROOT, src), 'utf8'))).toBe(expected);
  });
});
