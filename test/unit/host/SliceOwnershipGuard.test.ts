// REQ-TX-841 강제 등록 검증 — 좌표 슬라이스 직접변이 차단(런타임 가드).
// DD-02 가 선언만 하고 DD-14 로 이연한 "비소유자 직접변이 dev throw" 를 실제로 집행하는지 확인.
import { describe, it, expect } from 'vitest';
import {
  sealSlice,
  assertSliceOwner,
  ownerOf,
  SliceOwnershipViolation,
  SLICE_KEYS,
} from '../../../src/core/host/SliceOwnershipGuard.js';
import { SLICE_OWNERSHIP } from '../../../src/core/coordinate/ports.js';

describe('DD-14 SliceOwnershipGuard (REQ-TX-841)', () => {
  it('exposes a key for every SLICE_OWNERSHIP entry', () => {
    expect(SLICE_KEYS.sort()).toEqual(Object.keys(SLICE_OWNERSHIP).sort());
  });

  it('ownerOf returns the declared single owner', () => {
    expect(ownerOf('viewport')).toBe('ViewportController');
    expect(ownerOf('totalRows')).toBe('DataLayer');
    expect(ownerOf('selection')).toBe('SelectionModel');
  });

  describe('assertSliceOwner', () => {
    it('passes silently for the declared owner', () => {
      expect(() => assertSliceOwner('scroll', 'ViewportController')).not.toThrow();
    });
    it('throws SliceOwnershipViolation for a non-owner actor', () => {
      expect(() => assertSliceOwner('scroll', 'GridRenderer')).toThrow(SliceOwnershipViolation);
    });
    it('violation carries slice + owner metadata', () => {
      try {
        assertSliceOwner('rowHeight', 'SortFilterManager');
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(SliceOwnershipViolation);
        const v = e as SliceOwnershipViolation;
        expect(v.slice).toBe('rowHeight');
        expect(v.owner).toBe('AppearanceResolver');
        expect(v.message).toContain('REQ-TX-841');
      }
    });
  });

  describe('sealSlice — direct mutation detection', () => {
    it('blocks property assignment on a sealed object slice', () => {
      const scroll = sealSlice('scroll', { top: 0, left: 0 });
      expect(() => {
        (scroll as any).top = 999;
      }).toThrow(SliceOwnershipViolation);
    });

    it('blocks delete on a sealed object slice', () => {
      const vp = sealSlice('viewport', { height: 640, width: 800 });
      expect(() => {
        delete (vp as any).height;
      }).toThrow(SliceOwnershipViolation);
    });

    it('blocks array mutation methods (push/splice/sort) on a sealed array slice', () => {
      const viewOrder = sealSlice('viewOrder', [0, 1, 2, 3]);
      expect(() => (viewOrder as any).push(4)).toThrow(SliceOwnershipViolation);
      expect(() => (viewOrder as any).splice(0, 1)).toThrow(SliceOwnershipViolation);
      expect(() => (viewOrder as any).sort()).toThrow(SliceOwnershipViolation);
    });

    it('blocks index assignment on a sealed array slice', () => {
      const viewOrder = sealSlice('viewOrder', [0, 1, 2]);
      expect(() => {
        (viewOrder as any)[0] = 9;
      }).toThrow(SliceOwnershipViolation);
    });

    it('still allows read access (non-owner may read, never write)', () => {
      const sel = sealSlice('selection', { anchor: 5, focus: 7 });
      expect(sel.anchor).toBe(5);
      expect(sel.focus).toBe(7);
      const viewOrder = sealSlice('viewOrder', [10, 20, 30]);
      expect(viewOrder[1]).toBe(20);
      expect(viewOrder.map((x) => x * 2)).toEqual([20, 40, 60]);
      expect(viewOrder.length).toBe(3);
    });

    it('owner bypass: the declared owner receives the raw (mutable) slice', () => {
      const raw = { top: 0 };
      const owned = sealSlice('scroll', raw, 'ViewportController');
      expect(owned).toBe(raw); // 동일 참조 — 프록시 미적용.
      owned.top = 5; // 소유자는 변이 허용.
      expect(owned.top).toBe(5);
    });

    it('non-matching owner still gets the sealed proxy', () => {
      const guarded = sealSlice('scroll', { top: 0 }, 'GridRenderer');
      expect(() => {
        (guarded as any).top = 1;
      }).toThrow(SliceOwnershipViolation);
    });
  });
});
