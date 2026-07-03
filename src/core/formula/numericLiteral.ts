// ============================================================
// numericLiteral — 수식 숫자 리터럴/텍스트 숫자 판별·정규화 유틸
// 레이어: Algorithm
// 계약 참조: 11_design_F3_v2.md §2.2(number 문법, 소수점='.' 고정, REQ-06)·
//           §2.4/F3-R20/F3-R34(OGDecimal 정확 산술 — IEEE float 치팅 금지)
//
// 발주자 추가 요구(부동소수점 완전 지원) 반영:
//  - 정수/소수(선행 0 생략 `.5` 포함) + 과학표기(`1e-5`,`2.5E3`) 모두 인식.
//  - 과학표기 → 10진 문자열로 "정확히"(BigInt/문자열 시프트, Number() 왕복 없이) 변환한 뒤
//    OGDecimal.from()에 넘겨 정밀도 손실을 만들지 않는다.
// ============================================================

/** 수식 리터럴/셀 텍스트가 산술 가능한 숫자 형태인지 판별(정수/소수/과학표기). */
export const NUMERIC_LITERAL_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * 과학표기(`1e-5`, `2.5E3`)를 정확한 10진 문자열로 변환한다(부호/자릿수 이동만 사용,
 * 부동소수점 경유 없음). 과학표기가 아니면 trim만 하여 그대로 반환.
 */
export function normalizeNumericLiteral(raw: string): string {
  const s = raw.trim();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(s);
  if (!m) return s;

  const [, sign, intPartRaw, fracPartRaw = '', expStr] = m;
  const intPart = intPartRaw || '0';
  const exp = parseInt(expStr, 10);

  let digits = intPart + fracPartRaw;
  let pointPos = intPart.length + exp; // 새 소수점 위치(digits 문자열 기준, 왼쪽부터)

  if (digits === '') digits = '0';
  if (pointPos <= 0) {
    digits = '0'.repeat(-pointPos + 1) + digits;
    pointPos = 1;
  } else if (pointPos > digits.length) {
    digits = digits + '0'.repeat(pointPos - digits.length);
  }

  const ip = digits.slice(0, pointPos) || '0';
  const fp = digits.slice(pointPos);
  return sign + ip + (fp ? '.' + fp : '');
}
