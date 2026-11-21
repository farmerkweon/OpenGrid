/**
 * DF-01 대조 시험 틀(T0) · ST-20 비교기 자기시험 (테스트 설계서 §4-1 DF-01 · §17-4 · §4-3 ST-20).
 *
 * DF-01: 그리드 하나에서 「무작위 조작 1개 → flush → 사진 A → 통째 수단 → 사진 B」, 매 조작 A == B.
 *   통째 수단(T0~R6): `grid._doRender(...grid._visRange())` (설계서 §3-6 이음새). R7 부터는 스케줄러 통째 요청으로 바꾼다.
 *   T0 에서는 A 쪽도 지금 코드의 통째 그리기라 같은 것이 당연하다 — 그래서 ST-20 이 「비교기가 살아 있음」을 따로 증명한다.
 *   정규화는 §17-4(행만 aria-rowindex 순, 행 안 칸은 DOM 순서, 클래스 이름순, 모든 속성, style 선언 이름순,
 *   입력 value, activeElement, 스크롤 위치) — wg-helpers/dom-snapshot.ts.
 *   씨앗 8 × 60 조작(설계서 값). 줄이려면 WG_DF_SEEDS / WG_DF_OPS 환경 변수(기록용 — 걸음 판정은 기본값으로).
 *   대조군 C(새 그리드)는 C9 전 몫(TR-19) — 아직 없음.
 *
 * ST-20: 같은 그리드에서 사진 A 를 찍기 전에 다섯 가지를 몰래 바꾸고 → 통째 수단 → 사진 B. 다섯 판 모두 A ≠ B 여야 통과.
 *   지금 코드에서 og-selected·aria-selected 는 칸이 아니라 행(.og-row)에 붙는다 → ⓑⓓ 는 선택된 행 요소에 하고,
 *   칸(gridcell) 판(클래스 하나 지움·aria-label 하나 바꿈)을 덧붙였다(로그 WARN 경우변경).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { OpenGrid } from '../../src/core/OpenGrid.js';
import { installSceneEnv, makeSceneContainer, tick, disposeScene, cols, rows, sceneStats } from './wg-helpers/scenes.js';
import { dfSnapshot, compareSnapshots } from './wg-helpers/dom-snapshot.js';
import { RenderRequest } from '../../src/core/domain/render/RenderRequest.js';
import { genOps } from './wg-helpers/random-ops.js';
import { genOpsC9, runOpC9, c9Context, C9_OP_KINDS } from './wg-helpers/random-ops-c9.js';

// 같은 PC 에서 다른 레인이 측정·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다 — 단언은 그대로, 한도만 넉넉히.
// 따로 더 긴 한도를 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

const N_ROWS = 1000;
const N_COLS = 50;
const SEEDS = Number(process.env.WG_DF_SEEDS ?? 8);
const OPS = Number(process.env.WG_DF_OPS ?? 60);
/** 대조군 C(새 그리드)를 찍는 간격 — 조작마다 새 1,000×50 그리드를 만들면 무거워 6조작마다 + 마지막 조작(씨앗당 11번). 0 이면 끔. */
const C_EVERY = Number(process.env.WG_DF_C_EVERY ?? 6);
/** T0 은 'viewport'(dom-snapshot.ts RowScope 주석 — 지금 코드의 두 통째 길이 화면 밖 여분 행 수만 다름). R7 뒤 'all'. */
// 걸음 C7(그리는 범위를 세로 창 하나로) 뒤 'all' — 설계 §17-6 · 테스트 설계서 §19(P-05). T0~C6 은 두 통째 길의 화면 밖 행 수가 달라 'viewport'.
// 바꾸기 전 C7 판에서 「화면밖범위차이 ops 0」(8씨앗) 을 확인함(steps/C7/TEST/evidence/wg_before.txt).
const ROW_SCOPE = 'all' as const;
/** 씨앗별 「화면 밖 여분 행 범위가 달랐던 조작 수」 — T0_FACTS 로 남김. */
const rangeMismatch: Record<number, { ops: number; kinds: Record<string, number> }> = {};

let restoreEnv: () => void;
beforeAll(() => { restoreEnv = installSceneEnv(); });
afterAll(() => { restoreEnv(); });

/** DF-01 그리드 — 1,000행 × 50컬럼, 편집·체크·범위 선택 켬(조작 꾸러미가 닿게). */
async function makeDfGrid(): Promise<{ grid: OpenGrid<any>; container: HTMLElement; fields: string[] }> {
  const container = makeSceneContainer();
  const grid = new OpenGrid<any>(container, {
    columns: cols(N_COLS), rowHeight: 32, headerHeight: 40,
    editable: true, checkColumn: true, rangeSelection: { enabled: true },
  } as any);
  grid.setData(rows(N_ROWS, N_COLS));
  await tick();
  return { grid, container, fields: Array.from({ length: N_COLS }, (_, i) => `c${i}`) };
}

/** 지금 본문에 그려 둔 가로 창(C9). 창을 안 쓰면 null 또는 전 컬럼 창. */
function drawnWindow(grid: OpenGrid<any>): any {
  return (grid as any)._renderer?.bodyView?.drawn?.columns ?? null;
}
/** 창의 칸 수(전 컬럼이면 컬럼 수). */
function windowColumnCount(w: any, n: number): number {
  if (!w || w.full) return n;
  let k = 0; for (const s of w.segments) k += s.to - s.from + 1; return k;
}

/**
 * 통째 수단. T0~C8: `_doRender(...visRange())` = 전 컬럼. 걸음 C9(가로 창 켬) 뒤: 같은 행 범위 + **지금 그려 둔 가로 창**으로
 * 통째로 다시 그린다(STR 요청 13:29 · 설계 C9 줄 「계획대로 고친 화면 == 통째로 그린 화면」 — 창은 같고 그리는 길만 다름).
 * 창이 옳은지(보이는 상자·꼭 넣을 컬럼을 덮나)는 이 비교가 못 보므로 DF-01 이 조작마다 따로 단언한다(windowCovers).
 */
function fullRender(grid: OpenGrid<any>): void {
  const g = grid as any;
  const w = drawnWindow(grid);
  if (w && !w.full) g._doRender(...g._visRange(), w);
  else g._doRender(...g._visRange());
}

/**
 * 대조군 C(테스트 설계서 §17-4 ③ · 검토 R-09): **새 그리드**를 같은 옵션으로 만들고 A 와 같은 상태로 맞춘 뒤 처음부터 그린 사진.
 * 공유 상태(칸 지도·창·행 열쇠 …)가 낡아 A·B 가 함께 틀리는 것을 잡는다 — B 는 같은 그리드의 통째라 그 낡음을 같이 쓴다.
 * 맞추는 것: 컬럼 순서·숨김·폭 · 자료(행 모델 — 원본 순서의 전 행·행 상태·표시 순서·정렬·필터 상태) · 선택·체크 행 · 범위 선택 ·
 * 포커스 칸 · 세로·가로 스크롤. 공개 API 가 없는 것(행 상태·표시 순서·선택/체크 집합·포커스)은 이음새로 옮긴다 —
 * 행 모델은 그리기 쪽이 아니라 이 대조의 대상이 아니므로 그대로 옮기고, C 의 그리기 쪽(렌더러·본문·창·칸 지도)만 새것이다.
 * A 의 포커스 요소(document.activeElement)는 C 사진을 찍는 동안 C 로 옮겼다가 되돌린다(다음 조작이 그것에 기대므로).
 */
async function snapshotC(s: { grid: OpenGrid<any>; container: HTMLElement }, ctx: { order: string[]; hidden: Set<string> }): Promise<string> {
  const A = s.grid as any;
  const leaves = A._colLayout.visibleLeaves as Array<{ field: string }>;
  const wOf = new Map(leaves.map((l, i) => [l.field, A._colWidths[i] as number]));
  const userW = new Map(A._userWidths as Map<string, number>);
  const container = makeSceneContainer();
  const C = new OpenGrid<any>(container, {
    columns: ctx.order.map(f => ({ field: f, header: `H${f.slice(1)}`, width: userW.get(f) ?? 120 })), rowHeight: 32, headerHeight: 40,
    editable: true, checkColumn: true, rangeSelection: { enabled: true },
  } as any) as any;
  try {
    if (ctx.hidden.size) C.hideColumn([...ctx.hidden]);
    for (const [f, w] of userW) C._userWidths.set(f, w);
    // 행 모델: 원본 순서의 전 행(지운 행 포함) → 새 id 로 넣고, 같은 자리 행에 같은 상태·같은 표시 순서.
    const Ad = A._data, idF = Ad._idField as string;
    C.setData(Ad._data.map((r: any) => { const o = { ...r }; delete o[idF]; return o; }));
    await tick(1);
    const Cd = C._data;
    Ad._data.forEach((r: any, i: number) => {
      const st = Ad._meta.get(r[idF])?.state ?? 'none';
      const cid = Cd._data[i][idF];
      Cd._meta.set(cid, { ...(Cd._meta.get(cid) ?? { rowId: cid }), state: st });
    });
    if (A._sfMgr.sortList.length) C.orderBy(A._sfMgr.sortList.map((x: any) => ({ ...x })));
    const fs = A.getFilterState();
    if (Object.keys(fs).length) C.restoreFilter(JSON.parse(JSON.stringify(fs)));
    Cd._displayIndexes = [...Ad._displayIndexes];
    Cd._rebuildIdMap?.();
    Cd._structureVersion++;
    C._vs.setTotalRows(Cd._displayIndexes.length);      // 표시 행 수(지운 행 뺌) — setData 때의 전 행 수가 아니라
    C._recalcWidths?.(container.getBoundingClientRect().width);
    for (const [i, f] of leaves.entries()) { const ci = (C._colLayout.visibleLeaves as any[]).findIndex(l => l.field === f.field); if (ci >= 0 && wOf.get(f.field) != null) C._colWidths[ci] = wOf.get(f.field)!; void i; }
    C._renderHeader?.();
    const ranges = A.getRangeSelection();
    if (ranges.length) C.setRangeSelection(ranges.map((x: any) => ({ ...x })));
    const fc = A._editMgr.focusCell;
    if (fc) C._editMgr.setFocusCell(fc.ri, fc.ci);
    // 선택·체크 집합은 범위 선택·포커스를 맞춘 뒤에(앞의 둘이 행 선택을 건드릴 수 있음) 그대로 옮긴다.
    C._rowMgr.selectedRows.clear(); C._rowMgr.checkedRows.clear();
    for (const r of A._rowMgr.selectedRows) C._rowMgr.selectedRows.add(r);
    for (const r of A._rowMgr.checkedRows) C._rowMgr.checkedRows.add(r);
    const aw = s.container.querySelector<HTMLElement>('.og-body-wrapper')!;
    const cw = container.querySelector<HTMLElement>('.og-body-wrapper')!;
    cw.scrollTop = aw.scrollTop; cw.scrollLeft = aw.scrollLeft;
    cw.dispatchEvent(new Event('scroll'));
    C._scheduler.submit(RenderRequest.REPAINT_VISIBLE);
    await tick(3);
    // 가로 창의 넓이는 지나온 스크롤 이력(나아가는 쪽 여유)에 따라 달라 새 그리드와 같을 까닭이 없다 → C 도 A 가 그려 둔 창으로 처음부터 그린다.
    // (창이 옳은지는 DF-01 이 조작마다 windowCovers 로 따로 단언.)
    const aw0 = drawnWindow(s.grid);
    if (aw0 && !aw0.full) { C._doRender(...C._visRange(), aw0); await tick(1); }
    // 포커스: A 의 활성 칸과 같은 (행, 컬럼) 칸이 C 에 있으면 그리로 옮겨 찍고, A 로 되돌린다.
    const ae = document.activeElement as HTMLElement | null;
    let moved = false;
    if (ae && s.container.contains(ae)) {
      const ri = ae.closest('[aria-rowindex]')?.getAttribute('aria-rowindex'), ci = ae.getAttribute('aria-colindex');
      // 칸이면 같은 (행, 컬럼) 칸, 칸이 아니면(그리드 상자·본문 상자 등) 같은 클래스의 요소, 컨테이너 자신이면 C 의 컨테이너.
      const sameClass = () => {
        if (ae === s.container) return container;
        const cls = Array.from(ae.classList).map(c => `.${CSS.escape(c)}`).join('');
        return cls ? container.querySelector<HTMLElement>(`${ae.tagName.toLowerCase()}${cls}`) : null;
      };
      const twin = ri && ci ? container.querySelector<HTMLElement>(`[aria-rowindex="${ri}"] [aria-colindex="${ci}"]`) : sameClass();
      if (twin) { twin.focus(); moved = true; }
    }
    const snap = dfSnapshot(container, { rowScope: ROW_SCOPE });
    if (moved) ae!.focus();
    return snap;
  } finally { disposeScene({ grid: C, container }); }
}

/** 그려 둔 창이 지금 보이는 상자와 꼭 넣을 컬럼(편집·포커스)을 덮는가 — 창 정책의 covers 로(같은 입력에 늘 같은 답). */
function windowCovers(grid: OpenGrid<any>): boolean {
  const g = grid as any;
  const w = drawnWindow(grid);
  if (!w || w.full) return true;
  const box = g._render.scroll.box;
  const pinned = g._editMgr.pinnedColumns?.() ?? [];
  return g._render.windowPolicy.covers(w, { box, pinned });
}

describe('DF-01 계획대로 고친 화면 == 통째로 그린 화면 (T0 틀 — 둘 다 통째)', () => {
  it('DF-01 준비: 그리드가 실제로 그려졌다(빈 DOM 아님)', async () => {
    const s = await makeDfGrid();
    try {
      const st = sceneStats(s.container);
      // 걸음 C9 뒤: 칸은 가로 창(보이는 컬럼 + 여유)만 — 준비 단언의 칸 수를 창 기준으로(STR 요청 13:29). 창이 실제로 켜졌는지도(< 전 컬럼).
      const wc = windowColumnCount(drawnWindow(s.grid), N_COLS);
      expect(wc, '가로 창이 켜져 있다(칸 < 전 컬럼)').toBeLessThan(N_COLS);
      expect(wc, '창이 보이는 폭(1,200px ÷ 120px = 10칸)보다 좁지 않다').toBeGreaterThanOrEqual(10);
      expect(st.rows).toBeGreaterThanOrEqual(15);
      expect(st.cells).toBeGreaterThanOrEqual(15 * wc);
      expect(dfSnapshot(s.container).split('\n').length).toBeGreaterThan(15 * wc);
    } finally { disposeScene(s); }
  });

  it('DF-01 조작 열은 씨앗이 같으면 같다', () => {
    expect(genOps(1, 60)).toEqual(genOps(1, 60));
    expect(genOps(1, 60)).not.toEqual(genOps(2, 60));
    expect(genOpsC9(1, 60)).toEqual(genOpsC9(1, 60));
    expect(genOpsC9(1, 60)).not.toEqual(genOpsC9(2, 60));
  });

  it('DF-01 C9 꾸러미가 씨앗 전체에서 모든 조작 종류를 한 번 이상 낸다(종류를 줄이지 않음)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= SEEDS; seed++) for (const o of genOpsC9(seed, OPS)) seen.add(o.kind);
    expect([...C9_OP_KINDS].filter(k => !seen.has(k))).toEqual([]);
  });

  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`DF-01 씨앗 ${seed} × ${OPS}조작: 매 조작 뒤 사진 A == 통째 그린 사진 B`, async () => {
      const s = await makeDfGrid();
      const ctx = c9Context(s);
      const log: string[] = [];
      let windowMoves = 0;
      let cChecks = 0;
      let lastScroll: [number, number] = [0, 0];
      let knownVsStale = 0;
      try {
        const ops = genOpsC9(seed, OPS);
        for (let i = 0; i < ops.length; i++) {
          const before = drawnWindow(s.grid);
          const desc = await runOpC9(ctx, ops[i]!);
          // jsdom 은 코드가 scrollLeft/Top 을 바꿔도(포커스 가로 따라가기 등) scroll 이벤트를 안 낸다 — 브라우저는 위치가 바뀌면 낸다.
          // 바뀌었으면 브라우저처럼 scroll 이벤트 하나를 내 준다(대조군 C 가 이것 없이 「머리글 scroll 1,356 · 본문 36」 을 잡았다 — 잼 2026-11-21, 하니스 몫).
          {
            const bw = s.container.querySelector<HTMLElement>('.og-body-wrapper')!;
            if (bw.scrollLeft !== lastScroll[0] || bw.scrollTop !== lastScroll[1]) { bw.dispatchEvent(new Event('scroll')); await tick(3); }
            lastScroll = [bw.scrollLeft, bw.scrollTop];
          }
          log.push(`${i}:${desc}`);
          if (drawnWindow(s.grid) !== before) windowMoves++;
          if (!windowCovers(s.grid)) {
            throw new Error(`DF-01 씨앗 ${seed} 조작 ${i}(${desc}) 뒤 그려 둔 가로 창이 보이는 상자·꼭 넣을 컬럼을 덮지 않음\n앞선 조작: ${log.slice(-10).join(' | ')}`);
          }
          const a = dfSnapshot(s.container, { rowScope: ROW_SCOPE });
          const aAll = dfSnapshot(s.container, { rowScope: 'all' });
          fullRender(s.grid);
          const b = dfSnapshot(s.container, { rowScope: ROW_SCOPE });
          if (!compareSnapshots(aAll, dfSnapshot(s.container, { rowScope: 'all' })).same) {
            const m = (rangeMismatch[seed] ??= { ops: 0, kinds: {} });
            m.ops++;
            const k = ops[i]!.kind; m.kinds[k] = (m.kinds[k] ?? 0) + 1;
          }
          const d = compareSnapshots(a, b);
          if (!d.same) {
            throw new Error(`DF-01 씨앗 ${seed} 조작 ${i}(${desc}) 뒤 A ≠ B — ${d.line} 째 줄\n${d.context}\n앞선 조작: ${log.slice(-10).join(' | ')}`);
          }
          if (C_EVERY > 0 && ((i + 1) % C_EVERY === 0 || i === ops.length - 1)) {
            const cSnap = await snapshotC(s, ctx);
            cChecks++;
            let dc = compareSnapshots(a, cSnap);
            // 알려진 옛 결함(판 시작 HEAD 에서도 같음 — steps/CE/TEST/evidence/known_vs_stale.txt): 필터가 걸린 채 행을 지우거나 넣은 뒤 정렬하면
            // 표시 행 수는 줄어드는데 세로 스크롤 전체 높이(VS totalRows)가 그대로라 본문 높이만 몇 행 크다. C(새 그리드)는 옳은 높이.
            // 그 경우(A 의 VS 행 수 ≠ A 의 표시 행 수)에만 본문 높이 한 줄을 빼고 다시 대조하고, 나머지가 같으면 셈만 한다(WARN 발견으로 알림).
            const Ag = s.grid as any;
            if (!dc.same && Math.round(Ag._vs.getTotalHeight() / 32) !== Ag._data.rowCount) {
              const strip = (x: string) => x.replace(/(<body-self class=\[og-body\] style=\{height:)\d+px/, '$1?px');
              const d2 = compareSnapshots(strip(a), strip(cSnap));
              if (d2.same) { knownVsStale++; dc = d2; }
            }
            if (!dc.same) {
              throw new Error(`DF-01 씨앗 ${seed} 조작 ${i}(${desc}) 뒤 A ≠ C(새 그리드) — ${dc.line} 째 줄\n${dc.context}\n앞선 조작: ${log.slice(-10).join(' | ')}`);
            }
          }
        }
        // eslint-disable-next-line no-console
        console.log(`[DF-01] seed=${seed} ops=${OPS} scope=${ROW_SCOPE} 창옮김=${windowMoves} C대조=${cChecks}(옛결함 VS높이 ${knownVsStale}) 전부 A==B==C · 화면밖범위차이=${JSON.stringify(rangeMismatch[seed] ?? { ops: 0, kinds: {} })} :: ${log.join(' | ')}`);
      } finally { disposeScene(s); }
    }, 600_000);
  }
});

describe('ST-20 비교기 살아 있음 — 몰래 바꾼 다섯 판에서 A ≠ B', () => {
  let s: Awaited<ReturnType<typeof makeDfGrid>>;
  const verdicts: string[] = [];

  beforeAll(async () => {
    s = await makeDfGrid();
    // 선택된 행·포커스 칸이 있게 — 칸 하나를 누른다(지금 코드: 행 선택 + og-selected/aria-selected="true").
    const cell = s.container.querySelector<HTMLElement>('.og-row[aria-rowindex="3"] [role="gridcell"][aria-colindex="2"]')!;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 10, clientY: 10 }));
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
    await tick();
    fullRender(s.grid);
  }, 120_000);
  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[ST-20] 판정\n${verdicts.join('\n')}`);
    disposeScene(s);
  });

  /** 몰래 바꿈 → A → 통째 → B. 다르다고 판정돼야 한다. */
  function judge(label: string, tamper: () => void): void {
    // DF-01 과 같은 정규화(같은 행 범위)로 판정한다 — 비교기 그 자체를 시험하는 것이므로.
    const snap = () => dfSnapshot(s.container, { rowScope: ROW_SCOPE });
    fullRender(s.grid);
    const before = snap();
    fullRender(s.grid);
    // 대조: 아무것도 안 바꾸면 같다고 판정(비교기가 늘 「다르다」만 내는 고장도 잡음).
    expect(compareSnapshots(before, snap()).same, `${label} 대조(안 바꿈)가 같지 않다`).toBe(true);
    tamper();
    const a = snap();
    fullRender(s.grid);
    const b = snap();
    const d = compareSnapshots(a, b);
    verdicts.push(`${label}: ${d.same ? 'A == B (놓침)' : `A ≠ B (잡음) line ${d.line}\n    A| ${d.a.slice(0, 300)}\n    B| ${d.b.slice(0, 300)}`}`);
    expect(d.same, `${label}: 비교기가 바뀐 것을 못 잡았다`).toBe(false);
  }

  const row = (ri: number) => s.container.querySelector<HTMLElement>(`.og-row[aria-rowindex="${ri}"]`)!;
  const cell = (ri: number, ci: number) => row(ri).querySelector<HTMLElement>(`[role="gridcell"][aria-colindex="${ci}"]`)!;

  it('ST-20 ⓐ getData()[3].c5 = "ST20-MARK" (그리지 않음) → 다르다', () => {
    judge('ⓐ 자료만 바꿈', () => { (s.grid.getData() as any[])[3].c5 = 'ST20-MARK'; });
  });

  it('ST-20 ⓑ og-selected 클래스 하나만 지움(선택된 행) → 다르다', () => {
    const sel = s.container.querySelector<HTMLElement>('.og-row.og-selected');
    expect(sel, '선택된 행(og-selected)이 없다 — 준비 실패').not.toBeNull();
    judge('ⓑ og-selected 지움(행)', () => { s.container.querySelector<HTMLElement>('.og-row.og-selected')!.classList.remove('og-selected'); });
  });

  it('ST-20 ⓑ\' 칸 하나의 클래스 하나만 지움(og-cell--editable) → 다르다', () => {
    judge('ⓑ\' 칸 클래스 지움', () => { cell(5, 4).classList.remove('og-cell--editable'); });
  });

  it('ST-20 ⓒ 칸 하나의 style.width 만 1px 바꿈 → 다르다', () => {
    judge('ⓒ 칸 폭 +1px', () => {
      const c = cell(4, 3);
      c.style.width = `${parseFloat(c.style.width) + 1}px`;
    });
  });

  it('ST-20 ⓓ aria-selected 하나만 바꿈(선택된 행) → 다르다', () => {
    judge('ⓓ aria-selected 바꿈(행)', () => {
      const r = s.container.querySelector<HTMLElement>('.og-row[aria-selected="true"]')!;
      r.setAttribute('aria-selected', 'false');
    });
  });

  it('ST-20 ⓓ\' 칸 하나의 aria-label 만 바꿈 → 다르다', () => {
    judge('ⓓ\' 칸 aria-label 바꿈', () => { cell(6, 2).setAttribute('aria-label', 'H1: 바뀜'); });
  });

  it('ST-20 ⓔ 한 행 안 칸 두 개의 DOM 순서만 맞바꿈 → 다르다', () => {
    judge('ⓔ 칸 순서 맞바꿈', () => {
      const r = row(7);
      const c1 = cell(7, 1), c2 = cell(7, 2);
      r.insertBefore(c2, c1);
    });
  });
});
