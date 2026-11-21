// @vitest-environment node
/**
 * 넓은 그리드 T0 — 구조 목록(AR-12 이음새 · AR-13 파일 주인 · AR-20 공개 API 더하기만).
 *
 * 목록 파일(test/unit/__golden__/wg/seams.txt · owners.json · public_api_extra.txt)은 T0 의 지금 값이다.
 * AR-12·AR-20 은 매 걸음 초록이어야 한다(이름이 사라지면 빨강). AR-13 은 설계서 표를 매번 다시 읽어 맞댄다.
 *
 * Wide-grid T0 — structural inventories (AR-12 seams, AR-13 file owners, AR-20 additive-only public API).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO, GOLDEN_DIR, DESIGN_MD, readGoldenLines, stripComments, git,
  computeOwnerCheck, extractOwnerTable, extractStepFiles, ownersOf, splitRow,
  indexExports, interfaceKeys, classPublicNonMethods,
} from './wg-helpers/inventory';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

// ── AR-12 ─────────────────────────────────────────────────────────────────────────────────
interface Seam { kind: string; file: string; name: string; origin: string }
const SEAMS: Seam[] = readGoldenLines('seams.txt').map(l => {
  const [kind, file, name, origin] = l.split('\t');
  return { kind: kind!, file: file!, name: name!, origin: origin! };
});

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 그 파일에 이름의 「선언」(필드·메서드·게터·생성자 매개변수 속성)이 있는가 — 쓰는 자리(`this.x(`)는 세지 않는다. */
export function declares(src: string, name: string): boolean {
  const re = new RegExp(
    `(?:^|[\\s;{},(])(?:(?:private|protected|public|readonly|static|override|async|get|set)\\s+)*${esc(name)}\\s*[?!]?\\s*[:=(<]`,
    'm',
  );
  return re.test(src);
}

function interfaceBlock(src: string, name: string): string {
  const i = src.indexOf(`interface ${name}`);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(open, j + 1);
  }
  return '';
}

const srcCache = new Map<string, string>();
function srcOf(rel: string): string {
  if (!srcCache.has(rel)) srcCache.set(rel, stripComments(readFileSync(join(REPO, rel), 'utf8')));
  return srcCache.get(rel)!;
}
function treeText(prefix: string): string {
  return git(`ls-files ${prefix}`).trim().split('\n').filter(f => /\.(ts|css)$/.test(f)).map(f => readFileSync(join(REPO, f), 'utf8')).join('\n');
}

function seamPresent(s: Seam): boolean {
  switch (s.kind) {
    case 'member': return declares(srcOf(s.file), s.name);
    case 'cbkey': return new RegExp(`(?:^|[\\s;{])${esc(s.name)}\\s*\\??\\s*:`, 'm').test(interfaceBlock(srcOf(s.file), 'RendererCallbacks'));
    case 'deps': return new RegExp(`\\b${esc(s.name)}\\s*:\\s*\\(`).test(srcOf(s.file));
    case 'css': case 'aria': case 'rowmeta':
      return new RegExp(`(?<![\\w-])${esc(s.name)}(?![\\w-])`).test(treeText(s.file));
    // 소스 글자 이음새(S1 검토 찾은 것 5 ①): 기존 시험이 그 파일의 **날 소스 글자**를 읽는다(주석 안 지움 — 그 시험과 같게).
    // srctext = 글자 그대로 있어야 함. srcre = 정규식의 **첫 일치**가 같은 파일 바로 앞 srctext 줄 뒤 20줄 안에 있어야 함
    // (detail-expander-hit-target 이 첫 번째 min-width:Npx;min-height:Npx 를 펼침 단추 크기로 읽기 때문).
    case 'srctext': return readFileSync(join(REPO, s.file), 'utf8').includes(s.name);
    case 'srcre': {
      const raw = readFileSync(join(REPO, s.file), 'utf8');
      const anchor = SEAMS.slice(0, SEAMS.indexOf(s)).reverse().find(x => x.kind === 'srctext' && x.file === s.file);
      const m = new RegExp(s.name).exec(raw);
      if (!m || !anchor) return false;
      const a = raw.indexOf(anchor.name);
      if (a < 0 || m.index < a) return false;
      return raw.slice(a, m.index).split('\n').length - 1 <= 20;
    }
    default: throw new Error(`모르는 종류 ${s.kind}`);
  }
}

describe('AR-12 지킬 이음새 이름', () => {
  it('AR-12 목록이 비어 있지 않고 §3-6 몫과 T0+ 몫이 둘 다 있다', () => {
    expect(SEAMS.filter(s => s.origin === '§3-6').length).toBeGreaterThanOrEqual(40);
    expect(SEAMS.filter(s => s.origin === 'T0+').length).toBeGreaterThan(0);
  });

  it.each(SEAMS.map(s => [`${s.kind} ${s.file} ${s.name} (${s.origin})`, s] as const))('AR-12 %s 가 src 에 그 꼴로 있다', (_label, s) => {
    expect(seamPresent(s)).toBe(true);
  });

  it('AR-12 §3-6 의 RendererCallbacks 「기존 키 전부」 = seams.txt 의 cbkey 목록(키가 늘면 목록에 더하고, 줄면 빨강)', () => {
    const block = interfaceBlock(srcOf('src/core/GridRenderer.ts'), 'RendererCallbacks');
    const keys = [...block.matchAll(/^\s*(\w+)\s*\??\s*:/gm)].map(m => m[1]!).sort();
    const listed = SEAMS.filter(s => s.kind === 'cbkey').map(s => s.name).sort();
    expect(listed.filter(k => !keys.includes(k))).toEqual([]); // 사라진 키 0
    expect(keys.length).toBeGreaterThanOrEqual(listed.length);
  });

  it('AR-12 대조군: 선언 검사는 없는 이름·쓰는 자리만 있는 이름을 「있음」으로 치지 않는다', () => {
    expect(declares(srcOf('src/core/OpenGrid.ts'), '_noSuchSeamForControl')).toBe(false);
    expect(declares('  foo() { this._visRange(); }\n', '_visRange')).toBe(false);
    expect(declares('  private _visRange(): [number, number] { return x; }\n', '_visRange')).toBe(true);
    expect(declares('  get bodyWrapper() { return this._b; }\n', 'bodyWrapper')).toBe(true);
    expect(declares('    private _rowHeight: number,\n', '_rowHeight')).toBe(true);
  });

  it('AR-12 다시 셈: 기존 그물이 OpenGrid 인스턴스에서 부르는 밑줄 이름 가운데 seams.txt 에 없는 것 0', () => {
    // 기준 그물만(새 wg-* 제외). `(x as any)._name` 과 `g._name`(g = any 그리드) 꼴을 모은 뒤, OpenGrid.ts 가 선언하는 것만 남긴다.
    const files = git('ls-files -o -c --exclude-standard -- test/').trim().split('\n')
      .filter(f => /\.(ts|js)$/.test(f) && !f.split('/').some(s => s.startsWith('wg-')) && !f.includes('__golden__'));
    const used = new Set<string>();
    for (const f of files) {
      const t = readFileSync(join(REPO, f), 'utf8');
      for (const m of t.matchAll(/(?:as any\)|\bg|\bgrid|Grid)\??\._([A-Za-z]\w*)/g)) used.add('_' + m[1]);
    }
    const og = srcOf('src/core/OpenGrid.ts');
    const onOpenGrid = [...used].filter(n => declares(og, n)).sort();
    const listed = new Set(SEAMS.filter(s => s.file === 'src/core/OpenGrid.ts').map(s => s.name));
    expect(onOpenGrid.length).toBeGreaterThan(10); // 대조군: 검색어가 죽지 않았다(_doRender·_renderer 등이 걸려야 함)
    expect(onOpenGrid).toContain('_doRender');
    expect(onOpenGrid.filter(n => !listed.has(n))).toEqual([]);
  });

  it('AR-12 다시 셈: 기존 그물이 _renderer.X · _vs.X 로 부르는 이름이 모두 seams.txt 에 있다', () => {
    const files = git('ls-files -o -c --exclude-standard -- test/').trim().split('\n')
      .filter(f => /\.(ts|js)$/.test(f) && !f.split('/').some(s => s.startsWith('wg-')) && !f.includes('__golden__'));
    const ren = new Set<string>(); const vs = new Set<string>();
    for (const f of files) {
      const t = readFileSync(join(REPO, f), 'utf8');
      for (const m of t.matchAll(/_renderer\??\.(\w+)/g)) ren.add(m[1]!);
      for (const m of t.matchAll(/_vs\??\.(\w+)/g)) vs.add(m[1]!);
    }
    expect(ren.has('getCellEl')).toBe(true); // 대조군
    const gr = new Set(SEAMS.filter(s => s.file === 'src/core/GridRenderer.ts').map(s => s.name));
    const vsl = new Set(SEAMS.filter(s => s.file === 'src/core/VirtualScroll.ts').map(s => s.name));
    expect([...ren].filter(n => !gr.has(n))).toEqual([]);
    expect([...vs].filter(n => !vsl.has(n))).toEqual([]);
  });
});

// ── AR-13 ─────────────────────────────────────────────────────────────────────────────────
describe('AR-13 파일 주인 기계 확인(설계서 §5-가 · §5-나 · §3-2/3-3 에서 뽑음 — 손으로 적은 목록 아님)', () => {
  const md = readFileSync(DESIGN_MD, 'utf8');
  const now = computeOwnerCheck(md);

  it('AR-13 칸 자르기는 백틱 속 `|` 를 경계로 보지 않는다(S0 줄 실제 사례) · 모든 칸의 백틱이 짝을 이룬다', () => {
    expect(splitRow('| a | `x|y` | b |')).toEqual(['a', '`x|y`', 'b']);
    const lines = md.split('\n');
    const head = lines.findIndex(l => l.startsWith('### 5-가.'));
    const end = lines.findIndex((l, i) => i > head && l.startsWith('### 5-다.'));
    for (const l of lines.slice(head, end).filter(x => x.startsWith('| '))) {
      for (const cell of splitRow(l)) expect((cell.match(/`/g) ?? []).length % 2, cell.slice(0, 60)).toBe(0);
    }
  });

  it('AR-13 뽑기가 살아 있다: 레인 9개 · 걸음 칸 경로 수십 개 · git src 파일 수백 개', () => {
    expect(new Set(extractOwnerTable(md).map(e => e.lane)).size).toBe(9);
    expect(extractStepFiles(md).length).toBeGreaterThan(100);
    expect(now.touchedExisting.map(t => t.path)).toEqual(expect.arrayContaining(['src/core/OpenGrid.ts', 'src/core/GridRenderer.ts', 'src/core/FlatRowModel.ts']));
    expect(now.gitSrcFiles).toBeGreaterThan(250);
  });

  it('AR-13 주인 둘 이상인 파일 0(「S1 동안만」 몫은 시간으로 갈라 뺌 — 설계서 §5-가 1번)', () => {
    expect(now.duplicateOwners).toEqual([]);
  });

  it('AR-13 걸음 표가 건드리는 기존 파일 가운데 주인 없음 0(언급만 하는 파일은 설계서 문구로 확인된 것만 뺌)', () => {
    expect(now.touchedExistingWithoutOwner).toEqual([]);
    expect([...now.mentionOnly].sort()).toEqual([
      'src/core/appearance/AppearanceProvider.ts', 'src/core/chart/types.ts', 'src/core/formula/FormulaStore.ts',
    ]);
  });

  it('AR-13 새로 만들 파일(걸음 표·클래스 카드) 가운데 주인 없음 0', () => {
    expect(now.plannedWithoutOwner).toEqual([]);
  });

  it('AR-13 rev2 K5 의 다섯 파일 + Pagination 이 주인 하나씩', () => {
    const entries = extractOwnerTable(md);
    for (const f of ['CFRenderBridge.ts', 'appearance/ResolvedAppearanceSnapshot.ts', 'coordinate/ColumnMetrics.ts', 'coordinate/FrozenPanes.ts', 'FindBarManager.ts', 'Pagination.ts']) {
      expect(ownersOf(`src/core/${f}`, entries), f).toHaveLength(1);
    }
  });

  it('AR-13 doRender·doRenderFull 을 부르는 src/core 파일 전부 주인이 있다', () => {
    const entries = extractOwnerTable(md);
    const callers = git('grep -l -E "doRender(Full)?\\b" -- src/core').trim().split('\n').filter(Boolean);
    // T0 대조군 「≥ 10 파일(R7 전이라 살아 있음)」은 걸음 R7(직접 그리기 호출 → 요청 통로)이 호출처를 옮겨 의도대로 7 이 됨.
    // 남은 7 파일은 정의(OpenGrid._doRender · RenderController.doRender)·지킬 이음새(GridComposer paintRows)·주석·지역 함수 이름뿐
    // (L19 R7 대조군 확인, steps/R7/TEST/evidence). 줄어드는 것만 허용 — 「검색어가 살아 있다」는 아래 고정 글 시험으로.
    expect(callers.length).toBeGreaterThan(0);
    expect(callers.length).toBeLessThanOrEqual(7);
    expect(callers.filter(f => ownersOf(f, entries).length === 0)).toEqual([]);
  });

  it('AR-13 자기시험 — doRender(Full)? 검색어가 옛 호출 꼴을 잡고 새 요청 꼴은 안 잡는다(고정 글)', () => {
    const re = /doRender(Full)?\b/;
    expect(['    this._d.doRender();', '      doRenderFull: (n) => this._doRender(0, n - 1),', '    this._d.doRenderFull(n);'].every(l => re.test(l))).toBe(true);
    expect(['    this._deps.submitRender(RenderRequest.of(Change.All, { sync: true }));', '    this._scheduler.submit(RENDER_WINDOW);'].some(l => re.test(l))).toBe(false);
  });

  it('AR-13 결과가 T0 기록(owners.json)과 같다 — 설계서 표가 바뀌면 여기서 드러난다', () => {
    const saved = JSON.parse(readFileSync(join(GOLDEN_DIR, 'owners.json'), 'utf8'));
    expect({ dup: now.duplicateOwners, none: now.touchedExistingWithoutOwner, planned: now.plannedWithoutOwner })
      .toEqual({ dup: saved.duplicateOwners, none: saved.touchedExistingWithoutOwner, planned: saved.plannedWithoutOwner });
  });

  it('AR-13 대조군: 한 파일을 두 레인에 적은 표 · 주인 없는 파일을 건드리는 걸음은 잡힌다', () => {
    const bad = md
      .replace('| **WIN** 창·그리기 계획 | R1·R7·C1·C7·C9(창)·C11 | ', '| **WIN** 창·그리기 계획 | R1·R7·C1·C7·C9(창)·C11 | `src/core/DataLayer.ts` · ')
      .replace('| **C1** | 변경 | ', '| **C1** | 변경 | `src/core/i18n/LocaleRegistry.ts` ');
    expect(bad).not.toBe(md);
    const r = computeOwnerCheck(bad);
    expect(r.duplicateOwners.map(d => d.path)).toContain('src/core/DataLayer.ts');
    expect(r.touchedExistingWithoutOwner).toContain('src/core/i18n/LocaleRegistry.ts');
  });
});

// ── AR-20 ─────────────────────────────────────────────────────────────────────────────────
const ALLOWED_ADDITIONS = new Set([
  'GridOptions\tvirtualColumns', 'GridOptions\tcellTextLimit', 'GridOptions\tpageVirtualization', 'RenderContext\tmaxChars',
  'export\tXlsxCellStyleSpec\tinterface', // 1.7.1 엑셀 셀 스타일 입력 타입(더하기만)
  'export\tXlsxRichTextRun\tinterface', 'ColumnDef\tcellRuns', // 1.7.1 엑셀 셀 안 낱말 서식(더하기만)
]);

function currentApi(): string[] {
  return [
    ...indexExports().map(e => `export\t${e}`),
    ...interfaceKeys('src/core/types.ts', 'GridOptions').map(k => `GridOptions\t${k}`),
    ...interfaceKeys('src/core/types.ts', 'ColumnDef').map(k => `ColumnDef\t${k}`),
    ...interfaceKeys('src/core/types.ts', 'GridEventMap').map(k => `GridEventMap\t${k}`),
    ...interfaceKeys('src/core/renderers/CellRenderer.ts', 'RenderContext').map(k => `RenderContext\t${k}`),
    ...classPublicNonMethods('src/core/OpenGrid.ts', 'OpenGrid').map(k => `OpenGrid\t${k}`),
  ];
}

export function apiDiff(saved: string[], now: string[]): { removed: string[]; added: string[] } {
  const s = new Set(saved); const n = new Set(now);
  return { removed: saved.filter(x => !n.has(x)), added: now.filter(x => !s.has(x)) };
}

describe('AR-20 공개 API 는 더하기만(기존 public_api_surface.txt 가 못 지키는 몫: 내보낸 이름·옵션 키·컬럼 키·이벤트 이름·RenderContext·게터/정적)', () => {
  const saved = readGoldenLines('public_api_extra.txt');
  const now = currentApi();

  it('AR-20 목록이 살아 있다: 잘 아는 이름들이 걸린다', () => {
    expect(saved).toEqual(expect.arrayContaining([
      'export\tOpenGrid\tclass', 'GridOptions\tcolumns', 'GridOptions\trowHeight', 'ColumnDef\twidth',
      'GridEventMap\tcellClick', 'GridEventMap\tsortChange', 'RenderContext\tvalue',
    ]));
    expect(saved.length).toBeGreaterThan(250);
  });

  it('AR-20 T0 목록에서 사라진 이름 0', () => {
    expect(apiDiff(saved, now).removed).toEqual([]);
  });

  it('AR-20 더해진 이름은 virtualColumns·cellTextLimit·pageVirtualization·maxChars 안에서만', () => {
    expect(apiDiff(saved, now).added.filter(a => !ALLOWED_ADDITIONS.has(a))).toEqual([]);
  });

  it('AR-20 대조군: 한 줄을 지운 목록은 「사라짐」으로 잡힌다', () => {
    const cut = now.filter(x => x !== 'GridEventMap\tcellClick');
    expect(apiDiff(saved, cut).removed).toEqual(['GridEventMap\tcellClick']);
    expect(apiDiff(saved, [...now, 'GridOptions\tsneaky']).added).toContain('GridOptions\tsneaky');
  });
});
