// ============================================================
// DD-05 §2.6 직렬화 로더 — CFRuleLoader(버전 진화·미지 규칙 skip) / DD-05 §2.6 rule loader.
// REQ: T5-001 · T5-808
// ------------------------------------------------------------
// 미지 when.type / encode.kind / style 참조는 로드 시 skip(경고) 하고 나머지 규칙은 정상 로드한다
// (하위호환 진화 §1-inv6). v 버전 태그로 미래 규칙을 안전 무시한다. never-throw(값으로 신고). 순수·헤드리스.
// ============================================================

import type { CFRule } from './CFRule.js';
import { CF_SCHEMA_VERSION, isStyleRef } from './CFRule.js';
import type { CFRuleTypeRegistry } from './predicates.js';
import type { CFEncoderRegistry } from './encoders.js';
import type { IRegistry } from '../extension/Registry.js';
import type { CFInlineStyle } from './CFRule.js';
import { TypedRegistry } from '../extension/Registry.js';

/** named style 레지스트리(DD-10 IRegistry 동형). / Named-style registry (IRegistry-homomorphic). */
export type CFNamedStyleRegistry = IRegistry<CFInlineStyle>;

/**
 * named style 레지스트리 생성 — 재사용 셀 스타일 프리셋 등록점(색조정자 단일관리). 동일 name 재등록=교체.
 * / Create the named-style registry — a registration point for reusable cell-style presets.
 *
 * @returns 빈 IRegistry(프리셋 번들이 채운다) / An empty IRegistry (populated by preset bundles)
 */
export function createNamedStyleRegistry(): CFNamedStyleRegistry {
  return new TypedRegistry<CFInlineStyle>({ spi: { name: 'CFNamedStyle', version: '1' } });
}

/** skip 사유. / Reason a rule/reference was skipped. */
export type SkipReason = 'unknown-condition' | 'unknown-encoder' | 'unknown-style' | 'future-version' | 'malformed';

/** skip 신고 1건. / A single skip report. */
export interface SkipReport {
  readonly ruleId: string;
  readonly reason: SkipReason;
  readonly detail: string;
}

/** 로드 결과 — 유효 규칙 + skip 신고(경고는 값으로). / Load result — valid rules plus skip reports. */
export interface LoadResult {
  readonly rules: CFRule[];
  readonly skipped: SkipReport[];
}

/** 로더가 참조하는 레지스트리 3종. / The three registries the loader consults. */
export interface LoaderRegistries {
  readonly types: CFRuleTypeRegistry;
  readonly encoders: CFEncoderRegistry;
  readonly styles: CFNamedStyleRegistry;
}

/** 로더 계약. / Loader contract. */
export interface CFRuleLoader {
  load(json: unknown, reg: LoaderRegistries): LoadResult;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * 규칙 배열(JSON)을 로드한다 — 미지 조건/인코더/스타일 참조·미래 버전·비정형은 skip + SkipReport,
 * 나머지는 정상 규칙으로 반환한다(그리드가 죽지 않는다).
 * / Load a JSON rule array; unknown/future/malformed entries skip with a report, the rest load.
 */
export class DefaultCFRuleLoader implements CFRuleLoader {
  load(json: unknown, reg: LoaderRegistries): LoadResult {
    const rules: CFRule[] = [];
    const skipped: SkipReport[] = [];
    const arr: unknown[] = Array.isArray(json) ? json : isObj(json) && Array.isArray(json.rules) ? (json.rules as unknown[]) : [];

    for (const raw of arr) {
      if (!isObj(raw)) {
        skipped.push({ ruleId: '?', reason: 'malformed', detail: 'not an object' });
        continue;
      }
      const id = typeof raw.id === 'string' ? raw.id : '?';
      const when = raw.when;
      const encode = raw.encode;
      const scope = raw.scope;

      if (typeof raw.v === 'number' && raw.v > CF_SCHEMA_VERSION) {
        skipped.push({ ruleId: id, reason: 'future-version', detail: `v${raw.v} > ${CF_SCHEMA_VERSION}` });
        continue;
      }
      if (!isObj(when) || typeof when.type !== 'string' || !isObj(encode) || typeof encode.kind !== 'string' || !isObj(scope) || typeof scope.columnId !== 'string') {
        skipped.push({ ruleId: id, reason: 'malformed', detail: 'missing when/encode/scope' });
        continue;
      }
      if (!reg.types.has(when.type)) {
        skipped.push({ ruleId: id, reason: 'unknown-condition', detail: String(when.type) });
        continue;
      }
      if (!reg.encoders.has(encode.kind)) {
        skipped.push({ ruleId: id, reason: 'unknown-encoder', detail: String(encode.kind) });
        continue;
      }
      const style = raw.style as CFRule['style'];
      if (isStyleRef(style) && !reg.styles.has(style.ref)) {
        skipped.push({ ruleId: id, reason: 'unknown-style', detail: style.ref });
        continue;
      }
      rules.push(raw as unknown as CFRule);
    }
    return { rules, skipped };
  }
}

/** 규칙 배열을 직렬화(값객체라 순수 JSON). 계보·통계는 파생물이라 제외. / Serialize rules (pure JSON). */
export function serializeRules(rules: readonly CFRule[]): string {
  return JSON.stringify({ v: CF_SCHEMA_VERSION, rules });
}
