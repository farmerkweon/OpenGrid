// ============================================================
// 컬럼 창(불변 값) / Column window (immutable value)
// 본문 DOM 으로 둘 표시 잎 컬럼의 구간 목록. 그리는 쪽은 이 값만 보고 「어느 칸을 만들고 어느 자리를 빈칸으로 채울지」
// 정한다. 구간을 여럿 낼 수 있는 모양으로 두어, 정책이 나중에 구간을 여럿 내도 그리는 쪽을 고치지 않게 한다.
//
// List of visible leaf-column segments kept in the body DOM. Painters iterate segments and gaps only,
// so a policy that later emits several segments needs no painter change.
// ============================================================
import { leafColIndex, type LeafColIndex } from './types.js';
import type { IColumnWindow, WindowSegment } from './geometryPorts.js';

const EMPTY: readonly WindowSegment[] = Object.freeze([]);

function segment(from: number, to: number): WindowSegment {
  return Object.freeze({ from: leafColIndex(from), to: leafColIndex(to) });
}

/**
 * DOM 으로 둘 컬럼 집합. 구간은 정규형(오름차순·안 겹침·붙은 구간은 하나로 합침)으로만 들고 있어서,
 * 같은 컬럼 집합이면 늘 같은 구간 목록이다 — `equals` 가 구간을 그대로 견주면 된다.
 * 전 컬럼을 덮으면 `full` 이고 빈칸이 없다(가상화를 안 한 지금 DOM 과 같은 모양).
 *
 * The segments are kept canonical (ascending, disjoint, adjacent ones merged), so equal column sets
 * always have equal segment lists. A window covering every column is `full` and has no gaps.
 */
export class ColumnWindow implements IColumnWindow {
  readonly full: boolean;
  readonly segments: readonly WindowSegment[];
  /** 표시 잎 컬럼 수(창이 어떤 컬럼 구성에서 계산됐나 — 구성이 바뀌면 낡은 창). */
  readonly count: number;
  private readonly _gaps: readonly WindowSegment[];

  private constructor(segments: readonly WindowSegment[], count: number) {
    this.segments = segments;
    this.count = count;
    const first = segments[0];
    this.full = segments.length === 0 ? count === 0 : segments.length === 1 && first!.from === 0 && first!.to === count - 1;
    this._gaps = this.full ? EMPTY : ColumnWindow._gapsOf(segments, count);
    Object.freeze(this);
  }

  /** 전 컬럼 창. / Window covering every column. */
  static full(count: number): ColumnWindow {
    ColumnWindow._checkCount(count);
    return new ColumnWindow(count === 0 ? EMPTY : Object.freeze([segment(0, count - 1)]), count);
  }

  /**
   * 구간 목록으로 만든다. 겹치거나 거꾸로 놓였거나 범위 밖이면 RangeError — 그리는 쪽이 같은 칸을 두 번 만들거나
   * 없는 컬럼 정의를 읽는 일을 여기서 막는다. 붙은 구간은 합치고, 넘겨준 배열은 복사해 든다.
   *
   * Throws RangeError on overlap, wrong order or out-of-range indices; adjacent segments are merged
   * and the input array is copied.
   */
  static of(segments: readonly WindowSegment[], count: number): ColumnWindow {
    ColumnWindow._checkCount(count);
    const out: WindowSegment[] = [];
    let prevTo = -1;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!;
      const from = s.from;
      const to = s.to;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to >= count || from > to) {
        throw new RangeError(`ColumnWindow: segment [${from}, ${to}] is outside 0..${count - 1}`);
      }
      if (from <= prevTo) throw new RangeError(`ColumnWindow: segment [${from}, ${to}] overlaps or is out of order`);
      const last = out[out.length - 1];
      if (last !== undefined && from === prevTo + 1) out[out.length - 1] = segment(last.from, to);
      else out.push(segment(from, to));
      prevTo = to;
    }
    return new ColumnWindow(out.length === 0 ? EMPTY : Object.freeze(out), count);
  }

  contains(ci: LeafColIndex): boolean {
    const segs = this.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      if (ci < s.from) return false;
      if (ci <= s.to) return true;
    }
    return false;
  }

  forEachColumn(fn: (ci: LeafColIndex) => void): void {
    const segs = this.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      for (let c = s.from; c <= s.to; c++) fn(leafColIndex(c));
    }
  }

  /**
   * 빈칸이 덮을 구간: 첫 구간 앞 · 구간 사이 · 마지막 구간 뒤. 첫 구간 앞도 내야 고정 컬럼 없는 그리드에서
   * 가로로 옮긴 창이 왼쪽 0 에 붙어 그려지지 않는다.
   *
   * Gaps before the first segment, between segments and after the last one.
   */
  gaps(): readonly WindowSegment[] {
    return this._gaps;
  }

  equals(other: IColumnWindow): boolean {
    if (other === this) return true;
    if (other.full !== this.full) return false;
    const a = this.segments;
    const b = other.segments;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]!.from !== b[i]!.from || a[i]!.to !== b[i]!.to) return false;
    }
    return true;
  }

  private static _checkCount(count: number): void {
    if (!Number.isInteger(count) || count < 0) throw new RangeError(`ColumnWindow: column count ${count} is invalid`);
  }

  private static _gapsOf(segments: readonly WindowSegment[], count: number): readonly WindowSegment[] {
    const out: WindowSegment[] = [];
    let next = 0;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i]!;
      if (s.from > next) out.push(segment(next, s.from - 1));
      next = s.to + 1;
    }
    if (next < count) out.push(segment(next, count - 1));
    return out.length === 0 ? EMPTY : Object.freeze(out);
  }
}
