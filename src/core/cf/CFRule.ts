// ============================================================
// DD-05 §2.1·§2.2 조건부서식(CF) 선언 스키마 — Rule 애그리게이트(직렬화 SSOT)
// / DD-05 §2.1·§2.2 conditional-formatting declarative schema — Rule aggregate (serialization SSOT).
// 설계: sessions/design-uxui-2026-07/detailed-design/DD-05_conditional-formatting.md
// REQ: T5-001 · T5-808 · T5-042 · T5-007 · T5-010 · T5-012 · T5-013 · T5-019
// ------------------------------------------------------------
// CFRule 은 함수를 담지 않는 순수 데이터 값객체다(직렬화 SSOT). 콜백 커스텀은 when.type:'custom'
// + 레지스트리 등록 술어 id 참조로 표현한다(코드가 아니라 참조를 직렬화). style 은 hex 직접보다
// named style 참조 우선(색조정자 단일관리). 헤드리스·DOM 미참조.
// ============================================================

/**
 * 통계가 필요 없는 값 비교/텍스트/날짜 조건과, 열 전역 통계가 필요한 조건(topN·stdBand·duplicate)을
 * 1급으로 담는 조건 카탈로그(REQ-T5-042). 각 조건은 순수 판정 술어로 해석된다.
 * / First-class condition catalog (REQ-T5-042). Stat-free comparisons plus column-wide stat
 * conditions (topN/stdBand/duplicate). Each is interpreted by a pure predicate.
 */
export type CFCondition =
  | { readonly type: 'compare'; readonly op: '>' | '>=' | '<' | '<=' | '=' | '!=' | 'between'; readonly a: number; readonly b?: number }
  | { readonly type: 'textContains'; readonly text: string; readonly ci?: boolean }
  | { readonly type: 'dateOccurring'; readonly rel: 'today' | 'yesterday' | 'tomorrow' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'next7d' | 'last7d' }
  | { readonly type: 'topN'; readonly n: number; readonly bottom?: boolean }
  | { readonly type: 'topNpct'; readonly pct: number; readonly bottom?: boolean }
  | { readonly type: 'aboveAvg'; readonly below?: boolean }
  | { readonly type: 'stdBand'; readonly k: 1 | 2 | 3; readonly outside?: boolean }
  | { readonly type: 'duplicate'; readonly unique?: boolean }
  | { readonly type: 'custom'; readonly predicateId: string; readonly params?: Readonly<Record<string, unknown>> };

/**
 * encode 슬롯 — 4종 시각 인코딩의 판별 유니온. 정직성 파라미터를 각자 소유(§2.1).
 * bar: 0기준·음수 양방향·클램프·로그. scale: 이산 기본·연속 옵트인·발산 중립. icon: 이중부호화.
 * / encode slot — discriminated union of the 4 visual encodings; each owns its honesty params.
 */
export type CFEncodeSpec =
  | { readonly kind: 'bar'; readonly axis?: 'zero' | 'min'; readonly negative?: 'bidirectional' | 'none'; readonly clamp?: boolean; readonly log?: boolean; readonly fill?: 'solid' | 'gradient'; readonly seed?: 'primary' | 'graphite' }
  | { readonly kind: 'scale'; readonly mode?: 'discrete' | 'continuous'; readonly bands?: number; readonly ramp?: string; readonly diverging?: boolean; readonly midpoint?: 'zero' | 'mean' | number; readonly seed?: 'primary' | 'graphite' }
  | { readonly kind: 'icon'; readonly setId: string; readonly steps?: 3 | 4 | 5; readonly reverse?: boolean; readonly iconOnly?: boolean }
  | { readonly kind: 'sparkline'; readonly chart?: 'bar' | 'line' | 'area'; readonly normalize?: 'row' | 'column' };

/** 적용 스코프 — 어느 셀 집합에 거는가. columnId 필수 + 선택적 행범위·행상태 술어. / Application scope. */
export interface CFScope {
  readonly columnId: string;
  /** 반열림 행 범위 [startRow, endRow). 미지정=열 전체. / Half-open row range; absent = whole column. */
  readonly range?: { readonly startRow: number; readonly endRow: number };
  /** 행상태 제한(예: 'added'|'edited'|'removed'). / Row-state gate. */
  readonly rowState?: 'added' | 'edited' | 'removed';
}

/** 이름붙인 재사용 스타일 참조(색조정자 단일관리, MCD-DB014). / Named reusable style reference. */
export interface CFStyleRef {
  readonly ref: string;
}

/** 인라인 스타일(공용 프리미티브). named style 이 없을 때의 직접 지정. / Inline style primitives. */
export interface CFInlineStyle {
  readonly color?: string;
  readonly background?: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

/** style 슬롯이 참조형인지 판별(직렬화·해석 분기). / Discriminate a style ref from an inline style. */
export function isStyleRef(s: CFStyleRef | CFInlineStyle | undefined): s is CFStyleRef {
  return !!s && typeof (s as CFStyleRef).ref === 'string';
}

/**
 * 조건부서식 규칙 — 직렬화 가능한 선언 값 객체(순수 데이터, DOM·함수 참조 없음). REQ-T5-001/808.
 * / A conditional-formatting rule — a serializable declarative value object (pure data).
 */
export interface CFRule {
  /** 안정 식별자(직렬화·계보·우선순위 tie-break 결정론). / Stable id (serialization/lineage/tie-break). */
  readonly id: string;
  /** 발화 조건(1급 카탈로그 중 하나, REQ-T5-042). / Firing condition. */
  readonly when: CFCondition;
  /** 시각 인코딩 종류(4종 공유 스키마). / Visual encoding (4 kinds share one schema). */
  readonly encode: CFEncodeSpec;
  /** named style 참조 또는 인라인 스타일. / Named-style ref or inline style. */
  readonly style?: CFStyleRef | CFInlineStyle;
  /** 적용 스코프. / Application scope. */
  readonly scope: CFScope;
  /** 우선순위(작을수록 먼저 평가·낮은 층). 동값이면 id 로 결정론 tie-break. / Priority (smaller = earlier/lower). */
  readonly priority: number;
  /** 참이면 이 규칙 뒤 규칙 평가 중단(엑셀 Stop-If-True). 기본 false. / Stop-If-True (Excel). */
  readonly stopIfTrue?: boolean;
  /** 직렬화 스키마 버전(하위호환 진화). / Serialization schema version. */
  readonly v?: number;
}

/** 현재 직렬화 스키마 버전. 로더가 미래(더 큰) 버전 규칙을 안전 skip 하는 기준. / Current schema version. */
export const CF_SCHEMA_VERSION = 1;

/**
 * 규칙 값객체 동일성(직렬화 SSOT 비교) — 얕은 구조 비교. 계보·통계는 파생물이라 제외.
 * / Rule value-object equality (serialization SSOT) — structural compare; derived data excluded.
 */
export function cfRuleEquals(a: CFRule, b: CFRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
