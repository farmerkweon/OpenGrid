// @vitest-environment node
/**
 * ST-30 (T0) — AR-01·02·03·05 정규식을 **지금 코드**에 돌려 위반이 0 이 아님을 확인(0 이면 그 정규식은 죽은 것).
 * R4 뒤(2026-11-21): AR-01·02·03 은 설계서 기대 「0건」으로 뒤집고, 살아 있음 증명은 고정 글 자기시험으로 옮김.
 * 정규식·범위는 테스트 설계서 §9 AR-01·02·03·05 글자 그대로. 건수는 evidence/st30.json → T0_FACTS.ST-30. L19.
 * (L20 NOTES: ST-30 은 L18·L19 몫 — L18 이 안 재서 L19 가 잼.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const CORE = resolve(ROOT, 'src/core');
// 증거 파일은 명시할 때만 쓴다(평소 실행이 T0 증거를 덮어쓰지 않게): WG_WRITE_EVIDENCE=1 또는 WG_T0_RECORD=1.
// 쓰는 곳은 WG_EVID_DIR(있으면) 아니면 T0 증거 폴더.
const WRITE_EVID = process.env.WG_WRITE_EVIDENCE === '1' || process.env.WG_T0_RECORD === '1';
const EVID = process.env.WG_EVID_DIR ? resolve(process.env.WG_EVID_DIR) : resolve(ROOT, 'sessions/widegrid-perf-2026-11/steps/T0/L19/evidence');
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = resolve(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const rel = (p: string) => relative(ROOT, p).split(sep).join('/');
const all = walk(CORE);
const renderScope = all.filter(p => rel(p).startsWith('src/core/render/') || rel(p) === 'src/core/GridRenderer.ts' || rel(p) === 'src/core/FooterManager.ts');

function count(files: string[], res: RegExp[]): { total: number; byFile: Record<string, number> } {
  const byFile: Record<string, number> = {};
  let total = 0;
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    let n = 0;
    for (const l of lines) for (const re of res) { const g = new RegExp(re.source, 'g'); n += (l.match(g) ?? []).length; }
    if (n) { byFile[rel(f)] = n; total += n; }
  }
  return { total, byFile };
}

const OUT: Record<string, any> = {};
function save(): void {
  if (!WRITE_EVID) return;
  mkdirSync(EVID, { recursive: true });
  writeFileSync(resolve(EVID, 'st30.json'), JSON.stringify(OUT, null, 2), 'utf8');
}

const AR01 = [/(?:\+=|\+)\s*(?:24|18|44|36|28)\b/, /stateColumn\s*\?\s*\d+/, /rowNumber\s*\?\s*\d+/];
const AR02 = [/left\s*\+=\s*[^;]*(?:width|Width)/, /frozenLeft|stickyLeft\s*\+=/];
const AR03 = [/\bwidths\s*\[/];
/** 글 한 덩이에 정규식 일치 수. */
function countText(text: string, res: RegExp[]): number {
  let n = 0;
  for (const l of text.split('\n')) for (const re of res) n += (l.match(new RegExp(re.source, 'g')) ?? []).length;
  return n;
}

// 걸음 R4(폭 계산을 기하 질문으로) 뒤: AR-01·02·03 은 테스트 설계서 기대 「0건」으로 뒤집었다(T0 의 「> 0」 은 지금 코드에
// 위반이 있던 때 정규식이 살아 있음을 보이던 것 — R4 가 의도대로 지워 0 이 됨). 「정규식이 살아 있다」는 증명은 아래
// 고정 글(일부러 어긴 줄) 자기시험으로 옮겼다. AR-05 는 R7 몫이라 그대로.
// AR-01 의 남은 1건 src/core/chart/scene.ts 의 `box.x + 18` 은 여분 폭과 무관한 그림 좌표 — 설계서 정규식이 잡는 오탐이라
// 그 한 자리만 이름으로 빼고 셈(로그 WARN 으로 설계에 정규식·범위 다듬기 요청). 오탐 자리가 늘거나 줄면 빨강.
const AR01_FALSE_POSITIVE: Record<string, number> = { 'src/core/chart/scene.ts': 1 };

describe('ST-30 AR 규칙 — 지금 코드(R4 뒤)', () => {
  it('ST-30 AR-01 여분 폭 상수 — src/core/**(coordinate/ExtraColumns.ts 제외) 0건(이름 붙인 오탐 1자리만 남음)', () => {
    const files = all.filter(p => rel(p) !== 'src/core/coordinate/ExtraColumns.ts');
    const r = count(files, AR01);
    OUT['AR-01'] = r; save();
    expect(r.byFile).toEqual(AR01_FALSE_POSITIVE);
  });
  it('ST-30 AR-02 고정 left 누적 — render/**·GridRenderer·FooterManager 0건', () => {
    const r = count(renderScope, AR02);
    OUT['AR-02'] = r; save();
    expect(r.byFile).toEqual({});
  });
  it('ST-30 AR-03 widths[ — render/**·GridRenderer·FooterManager 0건', () => {
    const r = count(renderScope, AR03);
    OUT['AR-03'] = r; save();
    expect(r.byFile).toEqual({});
  });
  // 걸음 R7(직접 그리기 호출 → 그리기 요청 통로) 뒤: 설계서 AR-05 기대 「정의 1곳 + 맡기는 자리 ≤ 1 · 관리자 파일의 doRender(|doRenderWindow( 0」.
  // `._doRender(` 정규식은 정의(`private _doRender(`)는 안 잡으므로 남는 것은 맡기는 자리 — GridComposer 의 paintRows 하나.
  it('ST-30 AR-05 ._doRender( 호출 자리 — 맡기는 자리 1곳(GridComposer paintRows)뿐(R7 뒤)', () => {
    const r = count(all, [/\._doRender\s*\(/]);
    OUT['AR-05'] = { ...r, renderDirExists: existsSync(resolve(CORE, 'render')) };
    save();
    expect(r.total).toBeLessThanOrEqual(1);
    expect(r.byFile).toEqual({ 'src/core/GridComposer.ts': 1 });
  });
  // 관리자 파일(…Manager · …Handler · MutationService · FormulaController)에서 주석을 뺀 코드의 doRender( · doRenderWindow( — 0.
  // 단 MutationService 의 지역 함수 이름 `doRender`(안에서 submitRender 로 요청만 냄 — 직접 그리기 아님)는 이름이 같아 잡히는 오탐이라
  // 그 파일의 2곳(부르는 줄 둘)만 이름으로 빼고 셈. 늘거나 줄면 빨강.
  it('ST-30 AR-05 관리자 파일 doRender(·doRenderWindow( 0건(MutationService 지역 함수 이름 오탐 2만 남음)', () => {
    const mgr = all.filter(p => /\/(\w+Manager|\w+Handler|MutationService|FormulaController)\.ts$/.test(rel(p)));
    expect(mgr.length).toBeGreaterThan(3);
    const byFile: Record<string, number> = {};
    for (const f of mgr) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      const n = countText(code, [/\bdoRender\(|\bdoRenderWindow\(/]);
      if (n) byFile[rel(f)] = n;
    }
    OUT['AR-05-managers'] = byFile; save();
    expect(byFile).toEqual({ 'src/core/MutationService.ts': 2 });
  });
});

describe('ST-30 자기시험 — 정규식이 살아 있음(일부러 어긴 고정 글)', () => {
  // T0 지금 코드에서 잡히던 실제 줄 꼴을 그대로 옮김(GridRenderer·RenderController, 2026-11-21 T0).
  const BAD01 = [
    '    if (opts.stateColumn) _extraW += 24;',
    '    if (opts.rowNumber)   leftOff += 44;',
    '        - (options.rowNumber   ? 44 : 0)',
    '    if (detailColOn)      _ew += 28;',
  ].join('\n');
  const BAD02 = [
    '    for (let k = 0; k < i; k++) left += widths[k] ?? opts.defaultColumnWidth;', // 고정 left 누적의 옛 꼴(legacy-controls 사본과 같은 식)
    '        let frozenLeftOff = 0;',
  ].join('\n');
  const BAD03 = '          const w = leafIdx >= 0 ? (widths[leafIdx] ?? opts.defaultColumnWidth) : col.width;';
  const CLEAN = [
    '    const w = this._geo.widthOf(ci);',
    '    const left = this._geo.leftOf(i);',
    '    const total = this._geo.totalWidth();',
  ].join('\n');
  it('ST-30 자기시험 AR-01 — 어긴 줄 4개를 모두 잡고(≥ 4), 깨끗한 줄은 0', () => {
    expect(countText(BAD01, AR01)).toBeGreaterThanOrEqual(4);
    expect(countText(CLEAN, AR01)).toBe(0);
  });
  it('ST-30 자기시험 AR-02 — 고정 left 누적 두 꼴을 잡고, 깨끗한 줄은 0', () => {
    expect(countText(BAD02, AR02)).toBe(2);
    expect(countText(CLEAN, AR02)).toBe(0);
  });
  const BAD05 = [
    '    this._doRender(...this._visRange());',
    '  freeze(n: number): void { this._colLayout.setFrozen(n); this._renderHeader(); this._doRender(...this._visRange()); }',
  ].join('\n');
  const CLEAN05 = '    this._scheduler.submit(RENDER_WINDOW);';
  const AR05 = [/\._doRender\s*\(/];
  const AR05M = [/\bdoRender\(|\bdoRenderWindow\(/];
  it('ST-30 자기시험 AR-05 — 옛 직접 호출 두 꼴을 잡고(2), 요청 통로 줄은 0 · 정의 줄은 안 잡음', () => {
    expect(countText(BAD05, AR05)).toBe(2);
    expect(countText(CLEAN05, AR05)).toBe(0);
    expect(countText('  private _doRender(startIndex: number, endIndex: number): void {', AR05)).toBe(0);
    expect(countText('    this._d.doRender();\n    this._d.doRenderWindow();', AR05M)).toBe(2);
    expect(countText(CLEAN05, AR05M)).toBe(0);
  });
  it('ST-30 자기시험 AR-03 — widths[ 를 잡고, 깨끗한 줄은 0', () => {
    expect(countText(BAD03, AR03)).toBe(1);
    expect(countText(CLEAN, AR03)).toBe(0);
  });
});
