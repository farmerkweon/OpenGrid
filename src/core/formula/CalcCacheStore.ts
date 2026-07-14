// ============================================================
// DD-08 §2.7 — 계산 캐시 (value-hash 메모 + LRU 축출 + 직렬화)
// 레이어: Algorithm (헤드리스, 순수)
// 설계 SSOT: DD-08 §2.7 — 히트 판정은 참조가 아니라 **선행값 구조해시(inputsHash)**(REQ-T8-845).
//   LRU 상한 축출(REQ-T8-846), export/import 직렬화(REQ-T5-049). import 시 해시 재검증 필수
//   (스테일 캐시 신뢰 금지). volatile 함수 참조 셀은 소비자(CalcService)가 캐시 제외.
// additive: 신설. 기존 코어 무수정. RecalcCoordinator 핫패스와 분리(파사드가 조립).
// ============================================================

import { OGDecimal } from '../OGDecimal.js';
import type { CellKey, CellValue } from './types.js';
import type { EvalOutcome } from './FormulaEvaluator.js';

/** 캐시 엔트리 1건(직렬화 단위). / One cache entry (serialization unit). */
export interface CalcCacheEntry {
  /** 마지막 평가 결과. / Last evaluation outcome. */
  readonly outcome: EvalOutcome;
  /** 선행값 구조해시(히트 판정 기준, REQ-T8-845). / Structural hash of precedent inputs (hit criterion). */
  readonly inputsHash: string;
}

/** 캐시 직렬화 스냅샷(§2.7 export/import, REQ-T5-049). / Serialized cache snapshot (§2.7). */
export interface CalcCacheSnapshot {
  /** 스키마 버전 태그(미지 버전은 import 시 skip). / Schema version tag (unknown → skipped on import). */
  readonly version: 1;
  /** (cellKey, value, error, approx, inputsHash) 목록. / List of serialized entries. */
  readonly entries: ReadonlyArray<{
    key: CellKey;
    value: SerializedValue;
    error: EvalOutcome['error'];
    approx: boolean;
    inputsHash: string;
  }>;
}

/** 직렬화 값 표현(OGDecimal 은 10진 문자열로). / Serialized value form (OGDecimal as decimal string). */
type SerializedValue =
  | { t: 'dec'; v: string }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' };

/**
 * 선행값 배열의 구조해시(§2.7 방어선, REQ-T8-845). 참조가 아니라 값 기준 — 오탐/누락 0 지향.
 * 값 객체(OGDecimal)는 정규 10진 문자열(`toString`)로 구조 동등을 표현한다(DD-01 소유 정의 소비).
 * / Structural hash of a precedent-value array (§2.7). Value-based, not reference-based.
 *
 * @param values - 선행 셀 값 배열(그래프 precedents 순서) / Precedent cell values (graph precedents order)
 * @returns 결정론 해시 문자열 / Deterministic hash string
 */
export function hashInputs(values: readonly CellValue[]): string {
  const parts: string[] = [];
  for (const v of values) {
    if (v == null) parts.push('n');
    else if (v instanceof OGDecimal) parts.push('d:' + v.toString());
    else if (typeof v === 'boolean') parts.push('b:' + (v ? '1' : '0'));
    else parts.push('s:' + String(v));
  }
  return parts.join('|');
}

function serializeValue(v: CellValue): SerializedValue {
  if (v == null) return { t: 'null' };
  if (v instanceof OGDecimal) return { t: 'dec', v: v.toString() };
  if (typeof v === 'boolean') return { t: 'bool', v };
  return { t: 'str', v: String(v) };
}

function deserializeValue(s: SerializedValue): CellValue {
  switch (s.t) {
    case 'dec': return OGDecimal.from(s.v);
    case 'str': return s.v;
    case 'bool': return s.v;
    case 'null': return null;
  }
}

/**
 * (cellKey → EvalOutcome) 캐시. 정밀 무효화·LRU 축출·직렬화(§2.7).
 * / (cellKey → EvalOutcome) cache with precise invalidation, LRU eviction, serialization (§2.7).
 */
export interface CalcCacheStore {
  /** inputsHash 일치 시에만 히트로 간주할 것 — 저장된 (outcome, inputsHash) 반환. / Returns the stored entry; caller checks inputsHash. */
  get(key: CellKey): CalcCacheEntry | undefined;
  /** 캐시 기록(inputsHash 동반). LRU 최신화. / Record into cache (with inputsHash). Marks most-recently-used. */
  set(key: CellKey, outcome: EvalOutcome, inputsHash: string): void;
  /** 종속 폐포 정밀 무효화. / Precise invalidation of a dependents closure. */
  invalidate(keys: Iterable<CellKey>): void;
  /** 전체 비우기. / Clear everything. */
  clear(): void;
  /** 현재 크기. / Current size. */
  readonly size: number;
  /** LRU 상한. / LRU capacity. */
  readonly capacity: number;
  /** 직렬화(includeCalcModelCache). / Serialize (includeCalcModelCache). */
  export(): CalcCacheSnapshot;
  /** 재로드 재계산 회피 — verify(key, hash) 통과 항목만 신뢰(스테일 캐시 거부). / Import; trust only entries passing verify(key, hash). */
  import(snap: CalcCacheSnapshot, verify: (key: CellKey, inputsHash: string) => boolean): void;
}

/**
 * LRU 캐시 기본 구현(Map 삽입순 = 접근순). 상한 초과 시 가장 오래된 키 축출(§2.7, REQ-T8-846).
 * / Default LRU cache (Map insertion order = recency). Evicts the oldest key past capacity (§2.7).
 *
 * @example
 * const cache = new LruCalcCacheStore(1000);
 * cache.set('r1:total', outcome, hashInputs([price, qty]));
 * const hit = cache.get('r1:total');
 * if (hit && hit.inputsHash === hashInputs([price, qty])) use(hit.outcome);
 */
export class LruCalcCacheStore implements CalcCacheStore {
  private readonly _map = new Map<CellKey, CalcCacheEntry>();
  readonly capacity: number;

  constructor(capacity = 5000) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  get size(): number {
    return this._map.size;
  }

  get(key: CellKey): CalcCacheEntry | undefined {
    const e = this._map.get(key);
    if (e === undefined) return undefined;
    // LRU 최신화: 삭제 후 재삽입으로 최근 사용 표시. / LRU touch: delete+reinsert marks recency.
    this._map.delete(key);
    this._map.set(key, e);
    return e;
  }

  set(key: CellKey, outcome: EvalOutcome, inputsHash: string): void {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, { outcome, inputsHash });
    // 상한 초과 축출(단조증가 금지). / Evict past capacity (never grows unbounded).
    while (this._map.size > this.capacity) {
      const oldest = this._map.keys().next().value as CellKey | undefined;
      if (oldest === undefined) break;
      this._map.delete(oldest);
    }
  }

  invalidate(keys: Iterable<CellKey>): void {
    for (const k of keys) this._map.delete(k);
  }

  clear(): void {
    this._map.clear();
  }

  export(): CalcCacheSnapshot {
    const entries = [...this._map.entries()].map(([key, e]) => ({
      key,
      value: serializeValue(e.outcome.value),
      error: e.outcome.error,
      approx: e.outcome.approx,
      inputsHash: e.inputsHash,
    }));
    return { version: 1, entries };
  }

  import(snap: CalcCacheSnapshot, verify: (key: CellKey, inputsHash: string) => boolean): void {
    if (!snap || snap.version !== 1) return; // 미지 버전 skip(하위호환·안전)
    for (const rec of snap.entries) {
      if (!verify(rec.key, rec.inputsHash)) continue; // 스테일 캐시 거부(REQ-T8-845)
      const outcome: EvalOutcome = {
        value: deserializeValue(rec.value),
        error: rec.error,
        approx: rec.approx,
        touched: new Set<CellKey>(), // touched 는 재평가 시 복원(직렬화 제외 — 그래프가 SSOT)
      };
      this.set(rec.key, outcome, rec.inputsHash);
    }
  }
}
