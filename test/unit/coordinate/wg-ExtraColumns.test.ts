// @vitest-environment node
// 넓은 그리드 새 그물 — ExtraColumns 단위 시험(테스트 설계서 §2-1 U-EXT-01~10, 걸음 R1).
// 대조군은 test/unit/wg-helpers/legacy-controls.ts (T0 사본, 읽기만).
import { describe, it, expect } from 'vitest';
import { ExtraColumns } from '../../../src/core/coordinate/ExtraColumns.js';
import type { ExtraColumnId } from '../../../src/core/coordinate/geometryPorts.js';
import {
  legacyExtraWidth,
} from '../wg-helpers/legacy-controls.js';

type Opts = { stateColumn?: boolean; draggable?: boolean; rowNumber?: boolean; checkColumn?: boolean; detailExpanderCol?: boolean };
const ORDER: ExtraColumnId[] = ['state', 'drag', 'rowNumber', 'check', 'detail'];
const W: Record<ExtraColumnId, number> = { state: 24, drag: 18, rowNumber: 44, check: 36, detail: 28 };

/** 다섯 옵션의 켬/끔 32조합. bit0 state · bit1 drag · bit2 rowNumber · bit3 check · bit4 detail. */
function combo(mask: number): Opts {
  return {
    stateColumn: !!(mask & 1), draggable: !!(mask & 2), rowNumber: !!(mask & 4),
    checkColumn: !!(mask & 8), detailExpanderCol: !!(mask & 16),
  };
}
const ALL: Opts = combo(31);

describe('ExtraColumns — U-EXT (R1)', () => {
  it('U-EXT-01 옵션 없음 → ids [] · width 0 · 디테일 뺀 폭을 내는 옛 접근자 없음(여분 폭은 하나)', () => {
    const e = ExtraColumns.fromOptions({});
    expect(e.ids).toEqual([]);
    expect(e.width()).toBe(0);
    expect('legacyWidthWithoutDetail' in e).toBe(false);
  });

  it('U-EXT-02 32조합 전수 — width = 켜진 폭 합, ids 는 state→drag→rowNumber→check→detail 중 켜진 것', () => {
    for (let m = 0; m < 32; m++) {
      const e = ExtraColumns.fromOptions(combo(m));
      const want = ORDER.filter((_, b) => m & (1 << b));
      expect(e.ids, `mask ${m}`).toEqual(want);
      expect(e.width(), `mask ${m}`).toBe(want.reduce((s, id) => s + W[id], 0));
    }
    // 옵션 객체 열거 순서를 거꾸로 줘도 순서는 같다
    const rev = ExtraColumns.fromOptions({ detailExpanderCol: true, checkColumn: true, rowNumber: true, draggable: true, stateColumn: true });
    expect(rev.ids).toEqual(ORDER);
  });

  it('U-EXT-03 다섯 개 다 켬 → leftOf 0/24/42/86/122 · width 150', () => {
    const e = ExtraColumns.fromOptions(ALL);
    expect(ORDER.map(id => e.leftOf(id))).toEqual([0, 24, 42, 86, 122]);
    expect(e.width()).toBe(150);
  });

  it('U-EXT-04 디테일만 → ids [detail] · leftOf 0 · width 28(디테일 토글도 여분 폭에 듦)', () => {
    const e = ExtraColumns.fromOptions({ detailExpanderCol: true });
    expect(e.ids).toEqual(['detail']);
    expect(e.leftOf('detail')).toBe(0);
    expect(e.width()).toBe(28);
  });

  it('U-EXT-05 다섯 개 다 켬 → 여분 폭 하나 = 150(디테일 28 포함 — 폭 배분·푸터도 이 값)', () => {
    expect(ExtraColumns.fromOptions(ALL).width()).toBe(150);
  });

  it('U-EXT-06 꺼진 id 에 묻기 → widthOf 0 · leftOf = width() (Q-04)', () => {
    const e = ExtraColumns.fromOptions({ rowNumber: true });
    expect(e.widthOf('check')).toBe(0);
    expect(e.leftOf('check')).toBe(44);
    expect(e.leftOf('check')).toBe(e.width());
    // 검토 G-7: 켜진 컬럼보다 **앞** 자리의 꺼진 id 도 width() — 「자기 자리 left(0)」를 내는 구현을 잡는다
    expect(e.leftOf('state')).toBe(44);
    expect(e.leftOf('drag')).toBe(44);
    for (let m = 0; m < 32; m++) {
      const x = ExtraColumns.fromOptions(combo(m));
      for (const id of ORDER) {
        expect(Number.isFinite(x.widthOf(id))).toBe(true);
        expect(Number.isFinite(x.leftOf(id))).toBe(true);
      }
    }
  });

  it('U-EXT-07 불변 값 — ids frozen · push 던짐 · 같은 옵션 두 번 같은 값', () => {
    'use strict';
    const e = ExtraColumns.fromOptions(ALL);
    expect(Object.isFrozen(e.ids)).toBe(true);
    expect(() => { (e.ids as ExtraColumnId[]).push('state'); }).toThrow();
    const e2 = ExtraColumns.fromOptions({ ...ALL });
    expect(e2.ids).toEqual(e.ids);
    expect(e2.width()).toBe(e.width());
  });

  it('U-EXT-08 참거짓 판정은 지금 코드(truthy) 그대로 — rowNumber·check 켬, width 80', () => {
    const raw = { rowNumber: 1, checkColumn: 'yes', stateColumn: 0, draggable: '' } as any;
    const e = ExtraColumns.fromOptions(raw);
    expect(e.ids).toEqual(['rowNumber', 'check']);
    expect(e.width()).toBe(80);
    expect(e.width()).toBe(legacyExtraWidth(raw, false));
  });

  it('U-EXT-09 대조 — 32조합 모두 옛 7벌(사본)과 같음', () => {
    for (let m = 0; m < 32; m++) {
      const o = combo(m);
      const e = ExtraColumns.fromOptions(o);
      const detail = !!o.detailExpanderCol;
      // GridRenderer 다섯 자리(머리글 _extraW · 머리글 고정 leftOff · 본문 _ew · 본문 고정 frozenLeftOff · 세로 병합 leftOff) 공통식
      expect(e.width(), `mask ${m}`).toBe(legacyExtraWidth(o, detail));
      // 여분 컬럼 머리글·본문 누적 left(extraHeaderLeft/extraBodyLeft) — 앞 켜진 폭의 합
      let acc = 0;
      for (const id of e.ids) { expect(e.leftOf(id)).toBe(acc); acc += e.widthOf(id); }
      expect(acc).toBe(e.width());
    }
  });

  it('U-EXT-10 fromOptions(undefined) → 던지지 않고 01 과 같음 (Q-04)', () => {
    expect(() => ExtraColumns.fromOptions(undefined as any)).not.toThrow();
    const e = ExtraColumns.fromOptions(undefined as any);
    expect(e.ids).toEqual([]);
    expect(e.width()).toBe(0);
  });
});
