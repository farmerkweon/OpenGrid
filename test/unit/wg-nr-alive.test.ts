/**
 * NR-L1~L3 — 계수기 살아 있음(테스트 설계서 §3 NR-L). jsdom 단위판.
 *
 * 세는 수단이 죽어 있으면 「0번」 단언은 영원히 초록이다. 그래서 일부러 그리게 한 조작에서
 * 각 계수기가 0 보다 큰 값을 내는지 먼저 증명한다. 하나라도 0 이면 같은 걸음의 NR 판정은 전부 무효.
 * 지금 값이 0 인 NR-07(머리글 다시 만들기)·NR-13(끄는 동안 렌더러)은 각각 NR-L2·NR-L3 과 짝이다.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { installResizeObserverStub } from './widegrid-helpers.js';
import { mkW, disposeW, frames, dragHandle } from './wg-helpers/counters.js';

// 다른 레인이 같은 PC 에서 테스트·빌드를 함께 돌리면 jsdom 그리기가 느려져 기본 5초를 넘는다(C0 때 NR-05 가 두 번 시간 초과).
// 단언은 그대로 두고 시간 한도만 넉넉히. 더 긴 한도를 따로 준 시험은 그 값이 이긴다.
vi.setConfig({ testTimeout: 30_000 });

// 증거 파일은 명시할 때만 쓴다(평소 실행이 T0 증거를 덮어쓰지 않게): WG_WRITE_EVIDENCE=1 또는 WG_T0_RECORD=1.
// 쓰는 곳은 WG_EVID_DIR(있으면) 아니면 T0 증거 폴더.
const WRITE_EVID = process.env.WG_WRITE_EVIDENCE === '1' || process.env.WG_T0_RECORD === '1';
const EVID = process.env.WG_EVID_DIR ? resolve(process.env.WG_EVID_DIR) : resolve(__dirname, '../../sessions/widegrid-perf-2026-11/steps/T0/L19/evidence');
const OUT: Record<string, any> = {};
beforeAll(() => installResizeObserverStub());

function save(): void {
  if (!WRITE_EVID) return;
  mkdirSync(EVID, { recursive: true });
  writeFileSync(resolve(EVID, 'nr-alive-jsdom.json'), JSON.stringify(OUT, null, 2), 'utf8');
}

describe('NR-L 계수기 살아 있음', () => {
  it('NR-L1 setData(같은 자료 복사본) 1번 → 본문 childList 추가 > 0 · 렌더러 호출 > 0 · renderBody 감싸기 ≥ 1', async () => {
    const s = await mkW();
    s.c.reset();
    s.grid.setData(s.grid.getData().map((r: any) => ({ ...r })));
    await frames(3);
    const n = s.c.read();
    OUT['NR-L1'] = { bodyAdded: n.bodyAdded, bodyAddedDeep: n.bodyAddedDeep, renderer: n.renderer, renderBody: n.renderBody };
    save();
    expect(n.bodyAdded).toBeGreaterThan(0);
    expect(n.renderer).toBeGreaterThan(0);
    expect(n.renderBody).toBeGreaterThanOrEqual(1);
    disposeW(s);
  });

  it('NR-L2 hideColumn → showColumn(공개 수단)으로 머리글을 다시 만들게 함 → th 전부 새 요소 · 머리글 childList > 0 · renderHeader ≥ 1', async () => {
    const s = await mkW();
    s.c.reset();
    s.grid.hideColumn('c1');
    s.grid.showColumn('c1');
    await frames(1);
    const n = s.c.read();
    const id = s.c.headerIdentity();
    OUT['NR-L2'] = { method: 'hideColumn+showColumn', thSame: id.same, thTotal: id.total, headerAdded: n.headerAdded, headerRemoved: n.headerRemoved, renderHeader: n.renderHeader };
    save();
    expect(id.total).toBeGreaterThan(0);
    expect(id.same).toBe(0);
    expect(n.headerAdded).toBeGreaterThan(0);
    expect(n.renderHeader).toBeGreaterThanOrEqual(1);
    disposeW(s);
  });

  it('NR-L3 (C10 전 대체) 렌더러 컬럼 c2 에 writeCell → 렌더러 호출 > 0 — 끄는 동안 0(NR-13)과 짝', async () => {
    const s = await mkW();
    // 끄는 계수기와 같은 렌더러가 살아 있는지: 끄는 중(0)과 같은 장면에서 쓰기 한 번(> 0)
    const d = dragHandle(s.container, 'H3', 120, 40);
    s.c.reset();
    s.grid.writeCell(2, 'c2', 'L3-MARK');
    await frames(1);
    const n = s.c.read();
    d.release();
    OUT['NR-L3'] = { method: 'writeCell(2,c2) during drag (C10 전 대체)', renderer: n.renderer };
    save();
    expect(n.renderer).toBeGreaterThan(0);
    disposeW(s);
  });

  it('NR-L 계수기 자기시험: 푸터 summaryOp 계수기는 정렬 1번에 > 0 (NR-05 「끄는 동안 0」과 짝)', async () => {
    const s = await mkW({ options: { footer: [{ field: 'c1', op: 'count' }] } });
    s.c.reset();
    s.grid.orderBy('c1', 'asc');
    await frames(3);
    const n = s.c.read();
    OUT['NR-L-footer'] = { summaryOp: n.summaryOp };
    save();
    expect(n.summaryOp).toBeGreaterThan(0);
    disposeW(s);
  });
});
