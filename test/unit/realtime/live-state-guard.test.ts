// DD-07 §2.3 LiveStateGuard — 상태 캡처/복원(rowId 앵커)·S-1 편집충돌 정책. / DD-07 §2.3.
import { describe, it, expect } from 'vitest';
import { LiveStateGuard } from '../../../src/core/realtime/index.js';
import type { AppliedDelta } from '../../../src/core/realtime/index.js';
import { FakeModel, FakeStateSource } from './_helpers.js';

const applied = (a: Partial<AppliedDelta>): AppliedDelta => ({
  changedCells: [],
  insertedRowIds: [],
  removedRowIds: [],
  userInitiated: false,
  ...a,
});

describe('DD-07 LiveStateGuard — 전환 보존(rowId 앵커)', () => {
  it('capture 는 선택/스크롤/편집/서명 스냅샷', () => {
    const m = new FakeModel([{ id: 'r1' }]);
    const src = new FakeStateSource();
    src.selection = [{ rowId: 'r1', field: 'qty' }];
    src.scroll = { anchorRowId: 'r1', pixelWithinRow: 12, scrollLeft: 4 };
    src.editing = { rowId: 'r1', field: 'qty', draftValue: 'typing' };
    const g = new LiveStateGuard(src, m.asCoords());
    const cap = g.capture();
    expect(cap.selection).toEqual([{ rowId: 'r1', field: 'qty' }]);
    expect(cap.scroll.anchorRowId).toBe('r1');
    expect(cap.editing?.draftValue).toBe('typing');
  });

  it('restore — 제거된 rowId 선택 해제, 생존 선택 유지', () => {
    const m = new FakeModel([{ id: 'r1' }, { id: 'r3' }]);
    const src = new FakeStateSource();
    const g = new LiveStateGuard(src, m.asCoords());
    const cap = {
      selection: [
        { rowId: 'r1' },
        { rowId: 'r2' }, // 델타로 제거됨
      ],
      scroll: { pixelWithinRow: 0, scrollLeft: 0 },
      sortFilterSig: 'sig0',
    };
    g.restore(cap, applied({ removedRowIds: ['r2'] }));
    expect(src.selection).toEqual([{ rowId: 'r1' }]);
  });

  it('restore — 스크롤 앵커 제거 시 앵커만 해제(scrollLeft 보존)', () => {
    const m = new FakeModel([{ id: 'r1' }]);
    const src = new FakeStateSource();
    const g = new LiveStateGuard(src, m.asCoords());
    g.restore(
      { selection: [], scroll: { anchorRowId: 'gone', pixelWithinRow: 30, scrollLeft: 8 }, sortFilterSig: 's' },
      applied({ removedRowIds: ['gone'] }),
    );
    expect(src.scroll.anchorRowId).toBeUndefined();
    expect(src.scroll.scrollLeft).toBe(8);
  });

  it('S-1 (a) — 편집 중 셀을 서버가 바꿔도 draft 우선 + 충돌 힌트 기록(비방해)', () => {
    const m = new FakeModel([{ id: 'r1' }]);
    const src = new FakeStateSource();
    const g = new LiveStateGuard(src, m.asCoords());
    g.restore(
      {
        selection: [],
        scroll: { pixelWithinRow: 0, scrollLeft: 0 },
        editing: { rowId: 'r1', field: 'qty', draftValue: 'user-typing' },
        sortFilterSig: 's',
      },
      applied({ changedCells: [{ rowId: 'r1', field: 'qty' }] }),
    );
    expect(src.editing?.draftValue).toBe('user-typing'); // draft 우선
    expect(g.lastConflicts).toEqual([{ rowId: 'r1', field: 'qty' }]); // 힌트만
  });

  it('편집 중 행이 삭제되면 편집 해제', () => {
    const m = new FakeModel([]); // r1 없음
    const src = new FakeStateSource();
    src.editing = { rowId: 'r1', field: 'qty', draftValue: 'x' };
    const g = new LiveStateGuard(src, m.asCoords());
    g.restore(
      {
        selection: [],
        scroll: { pixelWithinRow: 0, scrollLeft: 0 },
        editing: { rowId: 'r1', field: 'qty', draftValue: 'x' },
        sortFilterSig: 's',
      },
      applied({ removedRowIds: ['r1'] }),
    );
    expect(src.editing).toBeUndefined();
  });
});
