// ============================================================
// DD-09 §2.5 SchemaMigrator — 버전 간 변환 체인(major 단위 승격, 단계 누락 = 명확한 거부)
// / DD-09 §2.5 SchemaMigrator — inter-version migration chain (major-step promotion; missing step = reject).
// REQ: TX-892 · T9-807
// ------------------------------------------------------------
// 구 major 봉투를 등록된 major 단계들로 순차 승격한다. 단계 누락 시 조용한 승격 금지 → rejected.
// 파싱 불가/미래 major 도 거부(오해석 위험). Strategy(GoF) — 단계 체인 교체 가능.
// ============================================================

import { DefaultSemVerPolicy, type SemVerPolicy } from './SemVerPolicy.js';
import type { StateEnvelope } from './StateCodec.js';

export interface MigrationNote {
  readonly fromMajor: number;
  readonly toMajor: number;
  readonly note: string;
}

/** 한 major 단계 변환기(fromMajor → fromMajor+1). / A single major-step migrator. */
export interface MigrationStep {
  readonly fromMajor: number;
  migrate(env: StateEnvelope): StateEnvelope;
}

export type MigrateResult =
  | { readonly env: StateEnvelope; readonly notes: MigrationNote[] }
  | { readonly rejected: true; readonly reason: string };

/** 버전 간 변환 체인 계약. / Inter-version migration chain contract. */
export interface SchemaMigrator {
  migrate(env: unknown): MigrateResult;
}

function isEnvelope(x: unknown): x is StateEnvelope {
  return (
    x != null &&
    typeof x === 'object' &&
    typeof (x as StateEnvelope).schemaVersion === 'string' &&
    typeof (x as StateEnvelope).sections === 'object'
  );
}

/** 등록된 major 단계들을 순차 적용하는 기본 마이그레이터. / Default migrator applying registered major steps in sequence. */
export class DefaultSchemaMigrator implements SchemaMigrator {
  private readonly _steps = new Map<number, MigrationStep>();
  private readonly _current: string;
  private readonly _policy: SemVerPolicy;

  constructor(current: string, policy: SemVerPolicy = new DefaultSemVerPolicy()) {
    this._current = current;
    this._policy = policy;
  }

  /** major 승격 단계 등록(Strategy 확장점). / Register a major-promotion step (Strategy extension point). */
  register(step: MigrationStep): this {
    this._steps.set(step.fromMajor, step);
    return this;
  }

  migrate(env: unknown): MigrateResult {
    if (!isEnvelope(env)) return { rejected: true, reason: '봉투 형식 오류' };
    const L = this._policy.parse(env.schemaVersion);
    const C = this._policy.parse(this._current);
    if (!L) return { rejected: true, reason: `schemaVersion 형식 오류: '${env.schemaVersion}'` };
    if (!C) return { rejected: true, reason: `CURRENT 형식 오류: '${this._current}'` };
    if (L.major > C.major) {
      return { rejected: true, reason: `미래 major(${L.major}) — 승격 불가` };
    }

    let cur: StateEnvelope = env;
    const notes: MigrationNote[] = [];
    let major = L.major;
    while (major < C.major) {
      const step = this._steps.get(major);
      if (!step) {
        return { rejected: true, reason: `마이그레이션 단계 누락: major ${major}→${major + 1}` };
      }
      cur = step.migrate(cur);
      notes.push({ fromMajor: major, toMajor: major + 1, note: `major ${major}→${major + 1} 승격` });
      major++;
    }
    return { env: cur, notes };
  }
}
