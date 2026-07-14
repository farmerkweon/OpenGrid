// ============================================================
// DD-07 §2.4 지수 backoff 계산(순수) — 재연결 지연. / DD-07 §2.4 exponential backoff (pure).
// REQ: REQ-RT-806 (연결 UX — 무언 삼킴 0)
// ------------------------------------------------------------
// 상한/최대 시도는 소스가 error 상태로 표면화. 여기선 지연값만 계산(부작용 0).
// jitter 는 [0.5, 1.0] 배 범위 균등(주입 random 으로 결정론 테스트).
// ============================================================

import type { BackoffPolicy } from './IRealtimeSource.js';

/**
 * attempt(0-base) 회차의 재연결 지연(ms) 계산. base·factor^attempt, maxMs 상한, 선택적 jitter.
 * / Reconnect delay(ms) for a 0-based attempt: base·factor^attempt, capped at maxMs, optional jitter.
 *
 * @param policy - backoff 정책 / backoff policy
 * @param attempt - 0-base 재시도 회차 / 0-based retry attempt
 * @param random - [0,1) 난수 주입(테스트 결정론) / injected [0,1) RNG for determinism
 */
export function nextBackoffDelay(
  policy: BackoffPolicy,
  attempt: number,
  random: () => number = Math.random,
): number {
  const raw = policy.baseMs * Math.pow(policy.factor, Math.max(0, attempt));
  const capped = Math.min(raw, policy.maxMs);
  if (!policy.jitter) return capped;
  // [0.5, 1.0] 배 — 동시 재연결 폭주 분산. / Spread reconnect storms.
  const factor = 0.5 + random() * 0.5;
  return Math.round(capped * factor);
}

/** maxAttempts 도달(초과) 여부 — error 상태 표면화 판정. / Whether attempts are exhausted. */
export function backoffExhausted(policy: BackoffPolicy, attempt: number): boolean {
  return policy.maxAttempts !== undefined && attempt >= policy.maxAttempts;
}
