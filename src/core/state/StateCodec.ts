// ============================================================
// DD-09 §2.5 StateCodec — 상태 스냅샷·버전드 직렬화 봉투(합성·버전권위·왕복보증)
// / DD-09 §2.5 StateCodec — state snapshot / versioned serialization envelope.
// REQ: T9-808 · TX-892 · T9-807
// ------------------------------------------------------------
// getState/setState 정본. 각 서브시스템의 toState()/fromState() 를 합성만 하고 조각 스키마는 위임(§1
// does-NOT-own). 로드는 SemVerPolicy 로 라우팅: 미지(future minor) 섹션은 opaque 보존(round-trip 무손실),
// 구 major 는 SchemaMigrator 위임, 미래 major/파싱실패는 명확한 거부(조용한 손실 0).
// ============================================================

import { DefaultSemVerPolicy, type SemVerPolicy } from './SemVerPolicy.js';
import type { SchemaMigrator } from './SchemaMigrator.js';

/** 저장 봉투 — 전 서브시스템 조각의 합성 + 단일 버전 권위. / Save envelope — composition of all sections + single version authority. */
export interface StateEnvelope {
  readonly schemaVersion: string;
  readonly savedAt: number;
  /** 커맨드 리비전(멀티탭 충돌 감지 키). / Command revision (multi-tab conflict key). */
  readonly revision: number;
  readonly sections: Record<string, unknown>;
}

/** 조각 로드 결과 — 부분실패는 값으로 신고(조용한 실패 0). / Section load result — partial failure reported as a value. */
export interface SectionLoadResult {
  readonly restored?: boolean;
  readonly partial?: { readonly reason: string };
}

/**
 * 봉투에 담기는 한 조각의 소유 계약(해당 DD 소유). 봉투는 이 계약을 호출만 하고 내부 스키마를 모른다.
 * / Ownership contract for one section (owned by its DD). The envelope only calls it, never knows its schema.
 */
export interface ISectionCodec {
  readonly key: string;
  toState(): unknown;
  fromState(raw: unknown): SectionLoadResult;
}

/** 로드 결과 — 무엇이 복원/일부실패/거부됐는지 표면화(조용한 실패 금지). / Load result — surfaces restored/partial/rejected. */
export interface LoadResult {
  readonly ok: boolean;
  readonly restored: string[];
  readonly partial: { section: string; reason: string }[];
  readonly rejected?: string;
}

export interface StateCodecConfig {
  /** 런타임이 아는 현재 봉투 버전. / Current envelope version known to the runtime. */
  readonly current: string;
  readonly sections: ISectionCodec[];
  readonly policy?: SemVerPolicy;
  readonly migrator?: SchemaMigrator;
  /** 봉투에 심을 리비전 소스(CommandBus dirty/audit 연동). / Revision source stamped into the envelope. */
  readonly revision?: () => number;
  readonly now?: () => number;
}

function isEnvelope(x: unknown): x is StateEnvelope {
  return (
    x != null &&
    typeof x === 'object' &&
    typeof (x as StateEnvelope).schemaVersion === 'string' &&
    typeof (x as StateEnvelope).sections === 'object' &&
    (x as StateEnvelope).sections != null
  );
}

/** getState/setState 정본 + 버전 마이그레이션 파사드. / Canonical getState/setState + version migration facade. */
export class StateCodec {
  private readonly _current: string;
  private readonly _sections: ISectionCodec[];
  private readonly _policy: SemVerPolicy;
  private readonly _migrator: SchemaMigrator | undefined;
  private readonly _rev: () => number;
  private readonly _now: () => number;
  /** future-minor 로드 시 보존한 미지 섹션(round-trip 무손실 재방출). / Opaque unknown sections preserved for lossless round-trip. */
  private _opaque: Record<string, unknown> = {};

  constructor(cfg: StateCodecConfig) {
    this._current = cfg.current;
    this._sections = cfg.sections;
    this._policy = cfg.policy ?? new DefaultSemVerPolicy();
    this._migrator = cfg.migrator;
    this._rev = cfg.revision ?? (() => 0);
    this._now = cfg.now ?? (() => Date.now());
  }

  /** 살아있는 그리드 → 봉투. 각 조각의 toState() 합성 + 보존된 opaque 섹션 병합(무손실). / Live grid → envelope. */
  getState(): StateEnvelope {
    const sections: Record<string, unknown> = { ...this._opaque };
    for (const s of this._sections) sections[s.key] = s.toState();
    return { schemaVersion: this._current, savedAt: this._now(), revision: this._rev(), sections };
  }

  /**
   * 봉투 → 살아있는 그리드. schemaVersion 라우팅(§2.5.1) → 마이그레이션/관용/거부 → 조각 fromState.
   * 로드는 CommandBus 를 거치지 않는 초기화 경로(undo 스택 clear 는 호출자 책임).
   * / envelope → live grid; routes by schemaVersion, then applies section fromState.
   */
  setState(env: unknown): LoadResult {
    if (!isEnvelope(env)) {
      return { ok: false, restored: [], partial: [], rejected: '봉투 형식 오류(schemaVersion/sections 없음)' };
    }
    const known = this._sections.map((s) => s.key);
    const cls = this._policy.classify(env.schemaVersion, this._current, {
      loadedSections: Object.keys(env.sections),
      knownSections: known,
    });

    if (cls.kind === 'reject') {
      return { ok: false, restored: [], partial: [], rejected: cls.reason };
    }

    let working: StateEnvelope = env;
    const partial: { section: string; reason: string }[] = [];

    if (cls.kind === 'migrate') {
      if (!this._migrator) {
        return { ok: false, restored: [], partial: [], rejected: `구 major(${cls.fromMajor}) 문서 — 마이그레이터 미주입` };
      }
      const m = this._migrator.migrate(env);
      if ('rejected' in m) return { ok: false, restored: [], partial: [], rejected: m.reason };
      working = m.env;
    }

    // 미지(future-minor) 섹션 opaque 보존 → getState 재방출로 왕복 무손실(REQ-T9-808).
    this._opaque = {};
    if (cls.kind === 'tolerant') {
      for (const k of cls.unknownSections) {
        this._opaque[k] = working.sections[k];
        partial.push({ section: k, reason: '미지 섹션 보존(opaque passthrough)' });
      }
    }

    const restored: string[] = [];
    for (const s of this._sections) {
      if (!(s.key in working.sections)) continue;
      const r = s.fromState(working.sections[s.key]);
      if (r.partial) partial.push({ section: s.key, reason: r.partial.reason });
      else restored.push(s.key);
    }

    return { ok: true, restored, partial };
  }

  /**
   * 왕복 자기검사(골든 하니스용): 두 봉투의 섹션 동일성. 조각 소유 DD 값객체 equals 를 못 부르는
   * DD-09 층에서는 구조(JSON) 동일성으로 판정하고, 손실경계는 diffs 로 표면화한다.
   * / Round-trip self-check: section equality between two envelopes (structural JSON compare here).
   */
  roundTripEquals(a: StateEnvelope, b: StateEnvelope): { equal: boolean; diffs: string[] } {
    const diffs: string[] = [];
    const keys = new Set<string>([...Object.keys(a.sections), ...Object.keys(b.sections)]);
    for (const k of keys) {
      const av = JSON.stringify(a.sections[k]);
      const bv = JSON.stringify(b.sections[k]);
      if (av !== bv) diffs.push(k);
    }
    return { equal: diffs.length === 0, diffs };
  }
}
