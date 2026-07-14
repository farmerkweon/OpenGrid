// ============================================================
// DD-08 §2.6 — 계보 조회 (CalcProvenance, REQ-T4-030)
// 레이어: Algorithm (헤드리스, 순수)
// 설계 SSOT: DD-08 §2.6 — "왜 이 값/에러인가"의 도메인 모델. 기계코드(#REF)+계보(precedent/
//   순환경로)를 제공하고, 자연어 번역은 DD-12 몫(여기선 모델만). 추적 SPI(REQ-T4-030) 데이터원.
// additive: 신설. FormulaGraph/FormulaStore(재사용) 만 읽는다(무수정).
// ============================================================

import { cellKey, type CellKey, type FormulaErrorCode } from './types.js';
import type { FormulaGraph } from './FormulaGraph.js';
import type { FormulaStore } from './FormulaStore.js';
import type { BrokenRef } from './ReferenceRewriter.js';

/**
 * 셀 값/에러의 계보(§2.6). 툴팁/자연어번역 이전의 도메인 모델.
 * / Provenance of a cell value/error (§2.6): the domain model before tooltip/NL translation.
 */
export interface CalcProvenance {
  /** 대상 셀 키. / Target cell key. */
  readonly cell: CellKey;
  /** 상태 분류. / State classification. */
  readonly kind: 'ok' | 'error' | 'cycle' | 'pending';
  /** 에러 코드(있으면). / Error code (when present). */
  readonly error?: FormulaErrorCode;
  /** #REF: 어느 참조가 왜 깨졌나. / #REF: which refs broke and why. */
  readonly brokenRefs?: BrokenRef[];
  /** #CYCLE: 고리 경로(A→B→A, §2.6 고리 지목). / #CYCLE: loop path. */
  readonly cyclePath?: CellKey[];
  /** 직접 선행 셀(수식 추적 트리 데이터원). / Direct precedents (formula-trace tree source). */
  readonly precedents: CellKey[];
}

/** buildProvenance 협력자. / Collaborators for buildProvenance. */
export interface ProvenanceSources {
  /** 의존성 그래프. / Dependency graph. */
  graph: FormulaGraph;
  /** 수식 사이드카 저장소. / Formula sidecar store. */
  store: FormulaStore;
  /** (선택) #CYCLE 시 고리 경로. / (optional) loop path when #CYCLE. */
  cyclePath?: CellKey[];
  /** (선택) #REF 시 깨진 참조 목록. / (optional) broken refs when #REF. */
  brokenRefs?: BrokenRef[];
}

/**
 * (rowId, field) 셀의 계보를 조립한다(§2.6). error/value 는 store 에서, precedents 는 graph 에서.
 * / Assemble the provenance of the (rowId, field) cell (§2.6): error/value from `store`,
 *   precedents from `graph`.
 *
 * @param rowId - 대상 행 stable id / Target row stable id
 * @param field - 대상 컬럼 field / Target column field
 * @param src - 협력자(graph/store + 선택 경로/깨진참조) / Collaborators (graph/store + optional path/broken refs)
 * @returns 계보 모델 / Provenance model
 */
export function buildProvenance(rowId: string, field: string, src: ProvenanceSources): CalcProvenance {
  const key = cellKey(rowId, field);
  const cell = src.store.getFormula(rowId, field);
  const precedents = src.graph.getPrecedents(key);
  const error = cell?.error ?? null;

  let kind: CalcProvenance['kind'] = 'ok';
  if (error === '#CYCLE') kind = 'cycle';
  else if (error) kind = 'error';

  const out: CalcProvenance = { cell: key, kind, precedents };
  const mutable = out as { error?: FormulaErrorCode; cyclePath?: CellKey[]; brokenRefs?: BrokenRef[] };
  if (error) mutable.error = error;
  if (kind === 'cycle' && src.cyclePath && src.cyclePath.length > 0) mutable.cyclePath = src.cyclePath;
  if (error === '#REF' && src.brokenRefs && src.brokenRefs.length > 0) mutable.brokenRefs = src.brokenRefs;
  return out;
}
