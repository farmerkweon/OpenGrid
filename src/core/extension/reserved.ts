// ============================================================
// DD-10 §2.4 예약 네임스페이스 가드 / reserved-namespace guard
// og:* 코어 예약 대역. 코어 내장은 origin:'builtin' 로 정당 점유하고,
// 사용자/플러그인의 og:* 등록은 거부+경고(TX-883). 헤드리스·순수.
// ============================================================

/** 코어가 예약하는 접두사 — 이 대역은 origin:'builtin' 만 점유할 수 있다.
 *  / Prefixes reserved by the core — only origin:'builtin' may occupy this band. */
export const RESERVED_PREFIXES = ['og:', 'og-'] as const;

/**
 * 키가 코어 예약 네임스페이스에 속하는지 판정. / Whether a key falls in the core-reserved namespace.
 *
 * @param key - 검사할 등록 키 / Registration key to inspect
 * @returns 예약 접두사로 시작하면 true / true if it starts with a reserved prefix
 */
export function isReserved(key: string): boolean {
  return RESERVED_PREFIXES.some((p) => key.startsWith(p));
}
