// ============================================================
// DD-01 셀 좌표 값 객체 / DD-01 cell coordinate value objects
// 설계: DD-01 §2.6 · REQ-T8-808 · T3-826
// 논리 좌표의 정규화 불변식(역방향/클램프/비중첩)·A1↔R1C1 동치를 값 수준에서 보증.
// ※ 화면 투영·픽셀 CellRect 은 DD-02 소유(여기서 정의·import 하지 않음).
// ============================================================

import type { DomainValue, DomainValueDTO } from './DomainValue.js';
import { compareByRankAndKind } from './DomainValue.js';
import type { ValueType } from './ValueType.js';
import { SIGN_NON_NEGATIVE, MISSING_EXCLUDE, AGG_NONE } from './strategies.js';
import { HALF_UP } from './rounding.js';

/** 열 인덱스(0-based) → A1 열 문자. / Column index (0-based) → A1 column letters. */
function colToA1(col: number): string {
  let n = col + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A1 열 문자 → 열 인덱스(0-based). / A1 column letters → column index (0-based). */
function a1ToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 음수·비정수 클램프. / Clamp to a non-negative integer. */
function clampIdx(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * 셀 주소 값 객체(REQ-T8-808). / Cell address value object.
 */
export class CellAddress implements DomainValue {
  readonly kind = 'cellAddress';
  private constructor(readonly row: number, readonly col: number) { Object.freeze(this); }

  /** 논리 주소 생성(음수 → 0 클램프). / Construct a logical address (negatives clamp to 0). */
  static of(row: number, col: number): CellAddress { return new CellAddress(clampIdx(row), clampIdx(col)); }

  /** "B3" → (row=2, col=1). / Parse an A1 reference. */
  static parseA1(a1: string): CellAddress {
    const m = /^([A-Za-z]+)(\d+)$/.exec(a1.trim());
    if (!m) return new CellAddress(0, 0);
    return new CellAddress(clampIdx(parseInt(m[2]!, 10) - 1), clampIdx(a1ToCol(m[1]!)));
  }

  /** A1 표기(예: "B3"). / A1 notation. */
  toA1(): string { return `${colToA1(this.col)}${this.row + 1}`; }
  /** R1C1 표기(예: "R3C2"). / R1C1 notation. */
  toR1C1(): string { return `R${this.row + 1}C${this.col + 1}`; }

  get type(): ValueType { return cellAddressType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  equals(other: DomainValue): boolean {
    return other instanceof CellAddress && other.row === this.row && other.col === this.col;
  }
  hashKey(): string { return `cellAddress:${this.row}:${this.col}`; }

  /** 행 우선, 그다음 열. / Row-major then column. */
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as CellAddress;
    if (this.row !== o.row) return this.row < o.row ? -1 : 1;
    return this.col === o.col ? 0 : this.col < o.col ? -1 : 1;
  }
  textEquivalent(_locale?: string): string { return this.toA1(); }
  toJSON(): DomainValueDTO { return { kind: 'cellAddress', v: null, meta: { row: this.row, col: this.col } }; }
}

/**
 * 셀 범위 값 객체(REQ-T8-808) — 정규화 불변식 보증(항상 start≤end).
 * / Cell range value object; always normalized so start ≤ end.
 */
export class CellRange implements DomainValue {
  readonly kind = 'cellRange';
  private constructor(readonly start: CellAddress, readonly end: CellAddress) { Object.freeze(this); }

  /** 역방향 드래그를 (min→max)로 자동 정규화. / Normalize a reversed drag to (min→max). */
  static of(a: CellAddress, b: CellAddress): CellRange {
    const start = CellAddress.of(Math.min(a.row, b.row), Math.min(a.col, b.col));
    const end = CellAddress.of(Math.max(a.row, b.row), Math.max(a.col, b.col));
    return new CellRange(start, end);
  }

  get type(): ValueType { return cellRangeType; }
  isMissing(): boolean { return false; }
  isError(): boolean { return false; }
  isBlank(): boolean { return false; }

  /** 주소 포함 여부. / Whether an address lies within the range. */
  contains(addr: CellAddress): boolean {
    return addr.row >= this.start.row && addr.row <= this.end.row
      && addr.col >= this.start.col && addr.col <= this.end.col;
  }

  /** 범위 교차 여부(병합 비중첩 검사용). / Whether two ranges intersect. */
  intersects(other: CellRange): boolean {
    return this.start.row <= other.end.row && this.end.row >= other.start.row
      && this.start.col <= other.end.col && this.end.col >= other.start.col;
  }

  /** 중첩/인접 범위 집합을 정규형(정렬된 비중첩 집합)으로 환원(REQ-T3-826). / Reduce to a sorted, non-overlapping set. */
  static normalizeSet(ranges: CellRange[]): CellRange[] {
    if (ranges.length <= 1) return ranges.slice();
    const sorted = ranges.slice().sort((a, b) => a.compareTo(b));
    const out: CellRange[] = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && (last.intersects(r) || CellRange._touching(last, r))) {
        out[out.length - 1] = CellRange.of(
          CellAddress.of(Math.min(last.start.row, r.start.row), Math.min(last.start.col, r.start.col)),
          CellAddress.of(Math.max(last.end.row, r.end.row), Math.max(last.end.col, r.end.col)),
        );
      } else {
        out.push(r);
      }
    }
    return out;
  }

  private static _touching(a: CellRange, b: CellRange): boolean {
    // 열 범위가 같고 행이 맞닿음 / same columns, rows adjacent
    const sameCols = a.start.col === b.start.col && a.end.col === b.end.col;
    const rowsAdjacent = b.start.row <= a.end.row + 1 && b.end.row >= a.start.row - 1;
    return sameCols && rowsAdjacent;
  }

  equals(other: DomainValue): boolean {
    return other instanceof CellRange && other.start.equals(this.start) && other.end.equals(this.end);
  }
  hashKey(): string { return `cellRange:${this.start.hashKey()}:${this.end.hashKey()}`; }
  compareTo(other: DomainValue): number {
    const pre = compareByRankAndKind(this, other);
    if (pre !== null) return pre;
    const o = other as CellRange;
    const s = this.start.compareTo(o.start);
    return s !== 0 ? s : this.end.compareTo(o.end);
  }
  textEquivalent(_locale?: string): string { return `${this.start.toA1()}:${this.end.toA1()}`; }
  toJSON(): DomainValueDTO {
    return { kind: 'cellRange', v: null, meta: { start: this.start.toJSON(), end: this.end.toJSON() } };
  }
}

/** CellAddress 값 타입. / ValueType for cellAddress. */
export const cellAddressType: ValueType = {
  kind: 'cellAddress', dimension: 'none', rounding: HALF_UP, sign: SIGN_NON_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NONE,
  parse: (raw) => CellAddress.parseA1(String(raw)),
};
/** CellRange 값 타입. / ValueType for cellRange. */
export const cellRangeType: ValueType = {
  kind: 'cellRange', dimension: 'none', rounding: HALF_UP, sign: SIGN_NON_NEGATIVE,
  missing: MISSING_EXCLUDE, aggregation: AGG_NONE,
  parse: (raw) => {
    const s = String(raw);
    const [a, b] = s.split(':');
    const addrA = CellAddress.parseA1(a ?? 'A1');
    const addrB = CellAddress.parseA1(b ?? a ?? 'A1');
    return CellRange.of(addrA, addrB);
  },
};
