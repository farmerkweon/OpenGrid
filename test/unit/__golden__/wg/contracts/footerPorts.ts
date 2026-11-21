// ============================================================
// 넓은 그리드 성능(2026-11) — 푸터 합계 계약(헤드리스) / Footer summary contracts (headless). rev2 → 계약 변경 v2 footer
// 복사 위치 / copy to: src/core/domain/footer/ports.ts
// rev2 K4: 캐시·판 번호를 두지 않는다. H-5(매 그리기마다 재계산)는 「부르는 때」를 계획 표가 줄여서 푼다
//          (RenderPlan.footer 가 'values' 인 것은 RowSet·CellValue·All 뿐). 「자료가 바뀌었나」의 주인을 하나 더 만들지 않는다.
// 계약 변경 v2 footer(2026-11-21, R1 L30 요청): values(defs{field,kind}) → FooterValue[] 로는 지킬 이음새
//          { _field, _value, _formatted } 를 못 냄(형식 글자 빠짐 · field·op 없는 정의가 빠져 길이 다름 · 실제 필드는 op).
//          → IFooterValues.compute(defs: FooterDefLike{field?,op?,format?,label?,colspan?}) → FooterResultLike[] 로.
// ============================================================

/** 합계 계산 입력. */
export interface FooterSource {
  /** 합계 대상 행(표시 순서 — 순서는 합계에 무관). */
  rows(): readonly unknown[];
}

/**
 * 푸터 정의 한 줄 — 옵션 `footer` 의 원소(`types.ts` 의 `FooterDef`)를 구조로 받는다.
 * 집계 칸은 `field`·`op` 가 둘 다 있는 정의뿐이다(어느 하나가 없으면 결과에 나오지 않는다 — 지금 동작).
 */
export interface FooterDefLike {
  readonly field?: string;
  readonly op?: string;
  readonly format?: string;
  readonly label?: string;
  readonly colspan?: number;
}

/** 집계 값(값 없음은 null). */
export type FooterValue = number | null;

/** 정의 하나의 결과. 모양은 지금 `FooterManager.computeValues()`·공개 `getFooterData()` 가 돌려주는 그대로. */
export interface FooterResultLike {
  readonly _field: string;
  readonly _value: FooterValue;
  readonly _formatted: string;
}

/**
 * 푸터 합계 값 계산의 유일한 주인(순수 함수 객체). 값은 지금 FooterManager.computeValues 와 같다.
 * 결과는 집계 칸 정의 순서대로 하나씩(정의가 없거나 비면 원천을 읽지 않고 빈 배열). summaryOp 사용자 전략도 지금처럼 매번 부른다.
 */
export interface IFooterValues {
  compute(defs: readonly FooterDefLike[] | null | undefined, src: FooterSource): readonly FooterResultLike[];
}
