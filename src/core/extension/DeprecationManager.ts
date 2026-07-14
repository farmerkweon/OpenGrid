// ============================================================
// DD-10 §2.8 DeprecationManager — 경고 dedup·매니페스트·removeIn 게이트
// ------------------------------------------------------------
// 예고 없는 제거 금지의 데이터화(UC-7). 세션 1회 dedup 경고([OpenGrid] 프리픽스) +
// 기계판독 매니페스트(빌드 JSON 산출) + removeIn 이전 제거 차단 게이트(CI). 헤드리스·순수.
// ============================================================

import type { DeprecationInfo } from './Registry.js';
import { compareSemver } from './IExtension.js';

/** 매니페스트 1건 — 폐기 정보 + 식별자. / One manifest record — deprecation info + id. */
export interface DeprecationRecord extends DeprecationInfo {
  readonly id: string;
}

/**
 * 폐기 경고 dedup + 매니페스트 + removeIn 게이트.
 * / Deprecation warning dedup + manifest + removeIn gate.
 *
 * @example
 * const dm = new DeprecationManager();
 * dm.warn('defineSkin', { since: '2.1', removeIn: '3.0', replacement: 'registerSkin' });
 * dm.warn('defineSkin', { since: '2.1', removeIn: '3.0' }); // dedup — no second warning
 * dm.gateRemoval('defineSkin', '2.9'); // 'blocked' (removeIn 3.0 이전)
 */
export class DeprecationManager {
  private _warned = new Set<string>();
  private _records = new Map<string, DeprecationRecord>();
  private readonly _sink: (msg: string) => void;

  constructor(sink?: (msg: string) => void) {
    this._sink =
      sink ??
      ((m: string) => {
        if (typeof console !== 'undefined') console.warn(m);
      });
  }

  /**
   * 폐기 경고 방출 — 동일 id 반복 시 1회만(dedup). 매니페스트에 기록.
   * / Emit a deprecation warning — once per id (dedup). Also records for the manifest.
   *
   * @param id - 폐기 대상 식별자(API/키 이름) / Deprecated identifier (API/key name)
   * @param info - 폐기 정보(since/removeIn/replacement) / Deprecation info
   */
  warn(id: string, info: DeprecationInfo): void {
    this._record(id, info);
    if (this._warned.has(id)) return;
    this._warned.add(id);
    const rep = info.replacement ? ` → 대체: ${info.replacement}` : '';
    const note = info.note ? ` (${info.note})` : '';
    this._sink(`[OpenGrid] deprecated '${id}' (since ${info.since}, removeIn ${info.removeIn})${rep}${note}`);
  }

  /** 경고 없이 매니페스트에만 기록(빌드타임 등록). / Record for the manifest without emitting a warning. */
  private _record(id: string, info: DeprecationInfo): void {
    if (this._records.has(id)) return;
    const rec: { id: string; since: string; removeIn: string; replacement?: string; note?: string } = {
      id,
      since: info.since,
      removeIn: info.removeIn,
    };
    if (info.replacement !== undefined) rec.replacement = info.replacement;
    if (info.note !== undefined) rec.note = info.note;
    this._records.set(id, rec);
  }

  /** 빌드가 JSON 으로 산출하는 기계판독 매니페스트. / Machine-readable manifest the build emits as JSON. */
  manifest(): DeprecationRecord[] {
    return [...this._records.values()];
  }

  /**
   * removeIn 이전 제거 차단(CI 게이트, UC-7). currentVersion < removeIn → 'blocked'.
   * / Block removal before removeIn (CI gate). currentVersion < removeIn → 'blocked'.
   *
   * @param id - 폐기 대상 식별자 / Deprecated identifier
   * @param currentVersion - 제거를 시도하는 현재 버전 / Current version attempting removal
   * @returns 미등록/유예창 경과 시 'ok', 유예창 내 제거는 'blocked' / 'ok' if allowed, 'blocked' if premature
   */
  gateRemoval(id: string, currentVersion: string): 'ok' | 'blocked' {
    const rec = this._records.get(id);
    if (!rec) return 'ok';
    return compareSemver(currentVersion, rec.removeIn) < 0 ? 'blocked' : 'ok';
  }
}
