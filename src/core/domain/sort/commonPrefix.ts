// ============================================================
// 두 글의 공통 머리말 길이 / Common prefix length of two strings
//
// 머리말을 기억하는 정렬과, 그 정렬을 쓸지 고르는 표본 판정이 같이 쓴다(같은 셈을 두 곳에 두지 않으려고).
// 남은 글이 길면 덩이(256자) 단위 === 로 먼저 건너뛴다 — 엔진의 빠른 글자열 비교를 쓰려는 것.
//
// Shared by the prefix-aware sort and by the sample check that decides whether to use it. Long remainders
// are skipped in 256-char blocks with === first, to use the engine's fast string comparison.
// ============================================================

const BLOCK = 256;

/**
 * a, b 의 공통 머리말 길이. h 글자까지는 같다고 이미 안다(그 다음부터 센다).
 * Common prefix length of a and b, counting from h (the first h characters are known equal).
 */
export function commonPrefix(a: string, b: string, h: number): number {
  const m = a.length < b.length ? a.length : b.length;
  let k = h;
  if (m - k > 64) {
    while (k + BLOCK <= m && a.substring(k, k + BLOCK) === b.substring(k, k + BLOCK)) k += BLOCK;
  }
  while (k < m && a.charCodeAt(k) === b.charCodeAt(k)) k++;
  return k;
}
