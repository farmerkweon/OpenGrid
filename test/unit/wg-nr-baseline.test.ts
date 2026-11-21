/**
 * NR-01~NR-15 「다시 그리지 않는다」 방지선 — T0 기준선(지금 코드에서 몇 번 그리나). jsdom 단위판(u).
 * 테스트 설계서 TEST_DESIGN_NEW.md §3 · §0-5 · TR-03(판정은 ②렌더러 호출 ③childList 노드 ④th 동일성).
 *
 * 이 파일의 숫자는 「지금 값」이다. 걸음이 진행되면 TEST 레인이 목표 값 쪽으로 **줄이기만** 한다(늘리면 회귀).
 * 지금 값이 0 인 줄(NR-07·NR-13 등)은 wg-nr-alive.test.ts 의 NR-L1~L3(계수기 살아 있음)과 짝이다.
 *
 * jsdom 은 배치가 없다: 가로 가상화가 없는 지금 코드에서는 모든 컬럼이 그려지므로 jsdom 값이 곧 지금 값이다.
 * 실제 배치가 필요한 줄(가로 스크롤 범위·노드 수의 실제 화면)은 test/e2e/wg-nr-baseline.spec.ts(C) 가 잰다.
 *
 * 기록 모드: WG_T0_RECORD=1 이면 단언 없이 잰 값만 evidence 로 쓴다.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { installResizeObserverStub } from './widegrid-helpers.js';
import { DataLayer } from '../../src/core/DataLayer.js';
import {
  mkW, disposeW, dragHandle, th, fire, bodyCell, bodyNodeCount, frames, wColumns, wRows,
} from './wg-helpers/counters.js';

// 다른 레인이 같은 PC 에서 테스트·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다(C0 때 NR-05 가 두 번 시간 초과).
// 단언은 그대로 두고 시간 한도만 넉넉히. 더 긴 한도를 따로 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

const RECORD = process.env.WG_T0_RECORD === '1';
const MEASURED: Record<string, any> = {};
// 증거 파일은 명시할 때만 쓴다(평소 실행이 T0 증거를 덮어쓰지 않게): WG_WRITE_EVIDENCE=1 또는 WG_T0_RECORD=1.
// 쓰는 곳은 WG_EVID_DIR(있으면) 아니면 T0 증거 폴더.
const WRITE_EVID = process.env.WG_WRITE_EVIDENCE === '1' || process.env.WG_T0_RECORD === '1';
const EVID = process.env.WG_EVID_DIR ? resolve(process.env.WG_EVID_DIR) : resolve(__dirname, '../../sessions/widegrid-perf-2026-11/steps/T0/L19/evidence');

beforeAll(() => installResizeObserverStub());
afterAll(() => {
  if (!WRITE_EVID) return;
  mkdirSync(EVID, { recursive: true });
  writeFileSync(resolve(EVID, RECORD ? 'nr-jsdom.record.json' : 'nr-jsdom.json'), JSON.stringify(MEASURED, null, 2), 'utf8');
});

/** 지금 값 단언(기록 모드면 기록만). */
function base(id: string, got: Record<string, any>, want: Record<string, any>): void {
  MEASURED[id] = got;
  if (RECORD) return;
  expect(got).toEqual(want);
}

// ─── 지금 값(2026-11-21 T0, jsdom, W 장면 1,000행 × 50컬럼, 짝수 컬럼 사용자 렌더러) ─────────────
// 칸 수: 그린 행 R × 50, 렌더러 칸 = R × 25. R 은 그리는 길에 따라 다르다(잼): 조작이 _doRender(...visRange) 를
// 부르면 59행(visRange 가 endIndex + visCount + 5 까지), 스크롤 rAF(VirtualScroll.onRender)로 그리면 30행.
// bodyAdded 는 childList 기록의 붙은 노드 수(조각으로 붙이므로 = 행 수), bodyAddedDeep 은 자손까지 센 수.
const B = {
  // NR-01: T0 renderBody 2·렌더러 2,225 → C1(같은 높이 예약 안 함·요청 합치기) 뒤 1·1,475. 목표 0 은 C8(놓을 때 다시 그리지 않음) — 아직 목표 아님, 남은 몫 = 놓기 뒤 통째 한 번(C8 몫).
  // C7(그리는 범위를 세로 창 하나로): 놓은 뒤 그리기 1번의 범위가 59행 → 30행(렌더러 1,475 → 750). 본문 그리기 1번은 그대로 — 목표 0 은 C8.
  // C8(실시간 너비 조절): 놓은 뒤 본문 그리기 1 → 0 · 렌더러 750 → 0 · 본문 붙음 0 = 설계 NR-01 목표 「손 뗀 뒤 본문 그리기 0」 닿음.
  //   bodyAttr 1 → 91 은 느는 칸이지만 다시 그리기가 아니라 등록한 폭 자리에 쓰기: 끈 컬럼(c3) 칸 30개 × 폭 속성 셋(width·min-width·max-width)
  //   = 90 + 본문 min-width 1 (잼 2026-11-21: 놓는 순간 동기로 91 기록, 모두 style 속성 · childList 0).
  'NR-01': {"renderBody":0,"renderer":0,"rendererMaxPerCell":0,"bodyAdded":0,"bodyRemoved":0,"bodyAddedDeep":0,"bodyAttr":91},
  // C8: 놓은 뒤 머리글 다시 만들기 1 → 0 · th 0/50 → 50/50 같음 = NR-01b 목표 닿음.
  'NR-01b': {"renderHeader":0,"thSame":50,"thTotal":50,"headerAdded":0,"headerRemoved":0},
  // C7(스크롤 「같으면 안 그림」): 가로 스크롤 100px × 10 — 걸음마다 본문 그리기 1 → 0 = 설계 NR-02 목표 닿음(C7).
  'NR-02': {"perStep":{"renderBody":0,"renderer":0,"bodyAdded":0,"bodyRemoved":0,"bodyAddedDeep":0},"allStepsEqual":true,"total":{"renderBody":0,"renderer":0,"bodyAdded":0,"bodyRemoved":0,"bodyAddedDeep":0}},
  // C7: 가로 +1,000 도 세로 범위가 같아 그리기 0(창 경계 「끝 칸만」은 가로 창이 생기는 C9 몫).
  'NR-02b': {"renderBody":0,"renderer":0,"bodyAdded":0,"bodyRemoved":0,"bodyAddedDeep":0},
  // NR-03a: 머리글 click T0 2 → C1 뒤 1 = 설계 목표(NR-03 「정렬 1번 = 본문 1번」) 닿음.
  // C4(정렬 때 머리글을 다시 만들지 않고 표시만): renderHeader 1 → 0.
  // C7: 그리기 1번의 범위 59 → 30행(렌더러 1,475 → 750).
  'NR-03a': {"renderBody":1,"renderHeader":0,"renderer":750,"rendererMaxPerCell":1},
  // NR-03b: orderBy T0 3 → C1(요청 합치기 + 바뀐 수식 없으면 수식 재계산이 다시 안 그림) 뒤 1 = 설계 목표(NR-03 「정렬 1번 = 본문 1번」) 닿음.
  // C4: renderHeader 1 → 0.
  // C7: 그리기 1번의 범위 59 → 30행(렌더러 1,475 → 750).
  'NR-03b': {"renderBody":1,"renderHeader":0,"renderer":750,"rendererMaxPerCell":1},
  // C7: 세로 +10px(한 행 안) 그리기 1 → 0 = 설계 NR-04 목표 닿음.
  'NR-04': {"renderBody":0,"renderer":0,"bodyAdded":0,"bodyRemoved":0,"bodyAddedDeep":0},
  // C7: 세로 세 행(+96px)이 위아래 여유(5행) 안이라 그리기 0. (여유를 넘는 세로 이동의 「들어온 행만」은 C11 몫 — NR-04b 목표.)
  'NR-04b': {"renderBody":0,"renderer":0,"bodyAdded":0,"bodyRemoved":0,"bodyAddedDeep":0},
  // NR-05: 푸터 summaryOp — 세로 10·가로 10 = T0 10 → C5(계획 표가 부를 때만) 뒤 0 = 목표. sort1 T0 3 → 1(C1·C5): **아직 목표(0) 아님** — 남은 1 은 정렬 1번에 푸터를 다시 계산하는 몫(설계 NR-05 의 정렬 칸은 C4·EDGE 몫). C4 에서 0 이 되면 wg-nr-alive 의 NR-L-footer(정렬로 계수기 살아 있음 증명)는 다른 조작(setData)으로 옮겨야 함. drag40 0 그대로.
  'NR-05': {"vScroll10":0,"hScroll10":0,"sort1":1,"drag40":0},
  // NR-06: T0 th 0/50 같음·renderHeader 1·머리글 붙음 1/뗌 1(표 통째) → C4 뒤 th 50/50 같음(설계 NR-06 목표 닿음)·renderHeader 0·뗌 0.
  //   headerAdded 1 → 2 는 느는 칸이지만 th 를 다시 만드는 것이 아니다 — 붙는 것은 정렬한 th 안의 화살표 span.og-sort-icon 과
  //   그 글자 노드 두 개뿐(잼: MutationObserver 기록 「SPAN.og-sort-icon「 ↑」 in TH…og-sorted」 + 「#text「 ↑」 in SPAN.og-sort-icon」, 뗀 노드 0).
  'NR-06': {"thSame":50,"thTotal":50,"renderHeader":0,"headerAdded":2,"headerRemoved":0},
  'NR-07': {"renderHeader":0,"headerAdded":0,"headerRemoved":0,"thSame":50,"thTotal":50,"renderBody":0},
  // C7: 행 click — 그리기 2번 그대로(목표 0 은 C12), 범위만 59 → 30행.
  'NR-08': {"renderBody":2,"renderer":1500,"bodyAdded":60,"bodyRemoved":60,"bodyAddedDeep":6060},
  // C7: 범위 끌기 동기 그리기 10번 그대로(목표 0 은 C12), 범위만 59 → 30행.
  'NR-09': {"renderBodySync":10,"renderer":7500,"bodyAdded":300,"bodyAddedDeep":30300},
  // C7: → 키 그리기 1번 그대로(목표 0 은 C12), 범위만 59 → 30행.
  'NR-10': {"renderBody":1,"renderer":750,"bodyAdded":30,"bodyAddedDeep":3030},
  // C7: writeCell 그리기 1번 그대로(목표 0 은 C12), 범위만 59 → 30행.
  'NR-11': {"renderBody":1,"renderer":750,"bodyAdded":30,"bodyAddedDeep":3030},
  'NR-12': {"rows":30,"all":3030,"withoutRenderer":2280,"cells":1500},
  'NR-13': {"renderer":0,"bodyAdded":0},
  // NR-14: T0 값 getData 300 · getDataIndexByRowId 300 · getRowByIndex 60 · getRowState 30 → 걸음 C0(전 행 복사 제거) 뒤 getData·getDataIndexByRowId 0 (줄기만 함, 설계서 NR-14 목표 「0 · 둘이 같은 수」). CHANGES.md 참조.
  // 걸음 CE(행 차분): 세로 320px(10행) — 그린 행 0~29 → 5~34. getRowByIndex 60(30행 × 2) → 35 = 남는 행 5~29 한 번씩 25 + 들어온 행 30~34 두 번씩 10(잼 2026-11-21).
  // getRowState 30 그대로(행 5~34 한 번씩). 줄어든 쪽.
  'NR-14': {"30000":{"renderBody":1,"dataLayerCalls":{"getRowByIndex":35,"getRowState":30}},"100000":{"renderBody":1,"dataLayerCalls":{"getRowByIndex":35,"getRowState":30}}},
  'NR-15': {"setData200":30,"clearData":0,"groupCollapsed":0,"groupCollapsedRoleRows":3,"groupExpandAll":29,"groupExpandAllRoleRows":30,"detailBefore":30,"detailExpanded":23},
} as Record<string, any>;

describe('NR 기준선 — 끌기·놓기', () => {
  it('NR-01u 손잡이 +80 끌고 놓은 뒤(3프레임) 본문을 몇 번 그리나 — 지금 값(C8 뒤: 다시 그리기 0, 폭 자리 쓰기만 = 끈 컬럼 칸 × 폭 속성 3 + 본문 폭 1)', async () => {
    const s = await mkW();
    const d = dragHandle(s.container, 'H3', 80, 1);
    s.c.reset();
    d.release();
    await frames(3);
    const n = s.c.read();
    base('NR-01', {
      renderBody: n.renderBody, renderer: n.renderer, rendererMaxPerCell: n.rendererMaxPerCell,
      bodyAdded: n.bodyAdded, bodyRemoved: n.bodyRemoved, bodyAddedDeep: n.bodyAddedDeep, bodyAttr: n.bodyAttr,
    }, B['NR-01']);
    disposeW(s);
  });

  it('NR-01b 놓은 뒤 머리글 th 가 같은 요소인가 · 머리글을 몇 번 다시 만드나 — 지금 값', async () => {
    const s = await mkW();
    const d = dragHandle(s.container, 'H3', 80, 1);
    s.c.reset();
    d.release();
    await frames(3);
    const n = s.c.read();
    const id = s.c.headerIdentity();
    base('NR-01b', { renderHeader: n.renderHeader, thSame: id.same, thTotal: id.total, headerAdded: n.headerAdded, headerRemoved: n.headerRemoved }, B['NR-01b']);
    disposeW(s);
  });

  it('NR-07 끄는 동안(40걸음, 놓기 전) 머리글을 다시 만들지 않는다 — 지금 값 0 (NR-L2 와 짝)', async () => {
    const s = await mkW();
    s.c.reset();
    dragHandle(s.container, 'H3', 120, 40);
    await frames(1);
    const n = s.c.read();
    const id = s.c.headerIdentity();
    base('NR-07', { renderHeader: n.renderHeader, headerAdded: n.headerAdded, headerRemoved: n.headerRemoved, thSame: id.same, thTotal: id.total, renderBody: n.renderBody }, B['NR-07']);
    disposeW(s);
  });

  it('NR-13 렌더러 컬럼(c2) 이웃(c3)을 40걸음 끄는 동안 사용자 렌더러 호출 — 지금 값 0 (NR-L3 와 짝)', async () => {
    const s = await mkW();
    s.c.reset();
    dragHandle(s.container, 'H3', 120, 40);
    await frames(1);
    const n = s.c.read();
    base('NR-13', { renderer: n.renderer, bodyAdded: n.bodyAdded }, B['NR-13']);
    disposeW(s);
  });
});

describe('NR 기준선 — 스크롤', () => {
  it('NR-02u 가로 scrollLeft 100px × 10걸음(걸음마다 1프레임) — 지금 값', async () => {
    const s = await mkW();
    const steps: any[] = [];
    for (let i = 1; i <= 10; i++) {
      s.c.reset();
      s.wrap.scrollTo(null, i * 100);
      await frames(1);
      const n = s.c.read();
      steps.push({ renderBody: n.renderBody, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyRemoved: n.bodyRemoved, bodyAddedDeep: n.bodyAddedDeep });
    }
    const sum = (k: string) => steps.reduce((a, x) => a + x[k], 0);
    base('NR-02', {
      perStep: steps[0], allStepsEqual: steps.every(x => JSON.stringify(x) === JSON.stringify(steps[0])),
      total: { renderBody: sum('renderBody'), renderer: sum('renderer'), bodyAdded: sum('bodyAdded'), bodyRemoved: sum('bodyRemoved'), bodyAddedDeep: sum('bodyAddedDeep') },
    }, B['NR-02']);
    disposeW(s);
  });

  it('NR-02b 가로 scrollLeft +1,000 한 번 — 지금 값(창 없음: 통째)', async () => {
    const s = await mkW();
    s.c.reset();
    s.wrap.scrollTo(null, 1000);
    await frames(1);
    const n = s.c.read();
    base('NR-02b', { renderBody: n.renderBody, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyRemoved: n.bodyRemoved, bodyAddedDeep: n.bodyAddedDeep }, B['NR-02b']);
    disposeW(s);
  });

  it('NR-04u 세로 scrollTop +10px(한 행 안) — 지금 값', async () => {
    const s = await mkW();
    s.c.reset();
    s.wrap.scrollTo(10, null);
    await frames(1);
    const n = s.c.read();
    base('NR-04', { renderBody: n.renderBody, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyRemoved: n.bodyRemoved, bodyAddedDeep: n.bodyAddedDeep }, B['NR-04']);
    disposeW(s);
  });

  it('NR-04b 세로 세 행(scrollTop +96) — 지금 값(통째)', async () => {
    const s = await mkW();
    s.c.reset();
    s.wrap.scrollTo(96, null);
    await frames(1);
    const n = s.c.read();
    base('NR-04b', { renderBody: n.renderBody, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyRemoved: n.bodyRemoved, bodyAddedDeep: n.bodyAddedDeep }, B['NR-04b']);
    disposeW(s);
  });
});

describe('NR 기준선 — 정렬', () => {
  it('NR-03a 머리글 click 정렬 1번 — 본문 그리기 수 · 칸마다 렌더러 호출 — 지금 값', async () => {
    const s = await mkW();
    s.c.reset();
    fire(th(s.container, 'H1'), 'click');
    await frames(3);
    const n = s.c.read();
    base('NR-03a', { renderBody: n.renderBody, renderHeader: n.renderHeader, renderer: n.renderer, rendererMaxPerCell: n.rendererMaxPerCell }, B['NR-03a']);
    disposeW(s);
  });

  it('NR-03b orderBy() 1번 — 지금 값', async () => {
    const s = await mkW();
    s.c.reset();
    s.grid.orderBy('c1', 'desc');
    await frames(3);
    const n = s.c.read();
    base('NR-03b', { renderBody: n.renderBody, renderHeader: n.renderHeader, renderer: n.renderer, rendererMaxPerCell: n.rendererMaxPerCell }, B['NR-03b']);
    disposeW(s);
  });

  it('NR-06 머리글 click 정렬 뒤 머리글 th 가 같은 요소인가 — 지금 값(C4 뒤: th 는 그대로, 바뀌는 것은 정렬 표시 요소만)', async () => {
    const s = await mkW();
    s.c.reset();
    fire(th(s.container, 'H1'), 'click');
    await frames(3);
    const n = s.c.read();
    const id = s.c.headerIdentity();
    base('NR-06', { thSame: id.same, thTotal: id.total, renderHeader: n.renderHeader, headerAdded: n.headerAdded, headerRemoved: n.headerRemoved }, B['NR-06']);
    disposeW(s);
  });
});

describe('NR 기준선 — 푸터', () => {
  it('NR-05 세로 10 · 가로 10 · 정렬 1 · 끌기 40걸음 동안 푸터 사용자 summaryOp 호출 — 지금 값', async () => {
    const s = await mkW({ options: { footer: [{ label: '건수', colspan: 1 }, { field: 'c1', op: 'count' }] } });
    const out: Record<string, number> = {};
    s.c.reset();
    for (let i = 1; i <= 10; i++) { s.wrap.scrollTo(i * 40, null); await frames(1); }
    out.vScroll10 = s.c.read().summaryOp;
    s.c.reset();
    for (let i = 1; i <= 10; i++) { s.wrap.scrollTo(null, i * 100); await frames(1); }
    out.hScroll10 = s.c.read().summaryOp;
    s.c.reset();
    s.grid.orderBy('c1', 'asc');
    await frames(3);
    out.sort1 = s.c.read().summaryOp;
    s.c.reset();
    const d = dragHandle(s.container, 'H3', 120, 40);
    await frames(1);
    out.drag40 = s.c.read().summaryOp;
    d.release();
    base('NR-05', out, B['NR-05']);
    disposeW(s);
  });
});

describe('NR 기준선 — 선택·범위·포커스·쓰기', () => {
  it('NR-08 행 click 선택 — 본문 다시 만들기 — 지금 값', async () => {
    const s = await mkW();
    s.c.reset();
    fire(bodyCell(s.container, 2, 1), 'click');
    await frames(1);
    const n = s.c.read();
    base('NR-08', { renderBody: n.renderBody, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyRemoved: n.bodyRemoved, bodyAddedDeep: n.bodyAddedDeep }, B['NR-08']);
    disposeW(s);
  });

  it('NR-09 범위 끌기 mousemove 10번 동안 동기 그리기 — 지금 값', async () => {
    const s = await mkW({ options: { selection: 'cells' } });
    fire(bodyCell(s.container, 1, 1), 'mousedown', { button: 0 });
    s.c.reset();
    let sync = 0;
    for (let i = 0; i < 10; i++) {
      // 매 이동은 그 순간 화면에 있는 칸에 낸다(앞 이동이 본문을 다시 만들었을 수 있으므로 다시 찾는다).
      fire(bodyCell(s.container, 1 + (i % 5), 1 + Math.floor(i / 2)), 'mousemove', { button: 0 });
      sync = s.c.read().renderBody;
    }
    const n = s.c.read();
    fire(document, 'mouseup');
    base('NR-09', { renderBodySync: sync, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyAddedDeep: n.bodyAddedDeep }, B['NR-09']);
    disposeW(s);
  });

  it('NR-10 → 키 포커스 이동 — 지금 값', async () => {
    const s = await mkW();
    fire(bodyCell(s.container, 2, 1), 'click');
    await frames(1);
    s.c.reset();
    const target = bodyCell(s.container, 2, 1);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await frames(1);
    const n = s.c.read();
    base('NR-10', { renderBody: n.renderBody, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyAddedDeep: n.bodyAddedDeep }, B['NR-10']);
    disposeW(s);
  });

  it('NR-11 writeCell 한 칸 — 지금 값', async () => {
    const s = await mkW();
    s.c.reset();
    s.grid.writeCell(2, 'c1', 'X');
    await frames(1);
    const n = s.c.read();
    base('NR-11', { renderBody: n.renderBody, renderer: n.renderer, bodyAdded: n.bodyAdded, bodyAddedDeep: n.bodyAddedDeep }, B['NR-11']);
    disposeW(s);
  });
});

describe('NR 기준선 — 노드 수·행 수 무관·묶음/디테일 행 수', () => {
  it('NR-12u 본문 노드 수(jsdom — 가로 창 없음, 전 컬럼) — 지금 값', async () => {
    const s = await mkW();
    const rows = s.container.querySelectorAll('.og-body [role="row"]').length;
    base('NR-12', { rows, ...bodyNodeCount(s.c.body) }, B['NR-12']);
    disposeW(s);
  });

  it('NR-14u 3만 행 / 10만 행(10컬럼) 같은 화면 한 번 그리기 동안 DataLayer 접근 수 — 지금 값', async () => {
    const out: Record<string, any> = {};
    for (const rows of [30000, 100000]) {
      const s = await mkW({ rows, cols: 10 });
      const names = Object.getOwnPropertyNames(DataLayer.prototype)
        .filter(k => k !== 'constructor' && typeof (Object.getOwnPropertyDescriptor(DataLayer.prototype, k)!.value) === 'function');
      const spies = names.map(k => [k, vi.spyOn(DataLayer.prototype as any, k)] as const);
      s.c.reset();
      s.wrap.scrollTo(320, null);
      await frames(1);
      const calls: Record<string, number> = {};
      for (const [k, sp] of spies) { if (sp.mock.calls.length) calls[k] = sp.mock.calls.length; sp.mockRestore(); }
      out[String(rows)] = { renderBody: s.c.read().renderBody, dataLayerCalls: calls };
      disposeW(s);
    }
    base('NR-14', out, B['NR-14']);
  }, 120000);

  it('NR-15 묶음 펼침 · 디테일 펼침 · setData · clearData 뒤 .og-row 수 — 지금 값', async () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ g: `G${i % 3}`, c1: `r${i}`, c2: i }));
    const cols = [{ field: 'g', header: 'G' }, { field: 'c1', header: 'C1' }, { field: 'c2', header: 'C2' }];
    const out: Record<string, number> = {};
    const count = (s: any) => s.container.querySelectorAll('.og-row').length;
    const roleRows = (s: any) => s.container.querySelectorAll('.og-body [role="row"]').length;
    // setData 뒤(평범한 그리드, 200행)
    let s = await mkW({ columns: cols, data: rows(200) });
    out.setData200 = count(s);
    s.grid.clearData();
    await frames(2);
    out.clearData = count(s);
    disposeW(s);
    // 묶음: groupBy(['g']) → 접힌 상태 · expandAll 뒤
    s = await mkW({ columns: cols, data: rows(200) });
    s.grid.groupBy(['g']);
    await frames(2);
    out.groupCollapsed = count(s);
    out.groupCollapsedRoleRows = roleRows(s);
    s.grid.expandAll();
    await frames(2);
    out.groupExpandAll = count(s);
    out.groupExpandAllRoleRows = roleRows(s);
    disposeW(s);
    // 디테일: masterDetail + expandRow(1)
    s = await mkW({ columns: cols, data: rows(200), options: { masterDetail: { enabled: true, renderer: (_r: any, h: HTMLElement) => { h.textContent = 'D'; } } } });
    out.detailBefore = count(s);
    s.grid.expandRow(1);
    await frames(2);
    out.detailExpanded = count(s);
    disposeW(s);
    base('NR-15', out, B['NR-15']);
  });
});

// 쓰지 않는 import 경고 방지(장면 만들기 도우미 일부는 기록 모드 진단에만 씀)
void wColumns; void wRows;
