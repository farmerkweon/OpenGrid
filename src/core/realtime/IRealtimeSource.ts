// ============================================================
// DD-07 §2.1 실시간 소스 계약 + 페이로드 값객체 / DD-07 §2.1 realtime source contract + payload value objects.
// 설계: sessions/design-uxui-2026-07/detailed-design/DD-07_realtime.md
// REQ: REQ-RT-801 (폴링+스트리밍 이중 어댑터) · REQ-RT-806 (연결/신선도/오류 UX)
// ------------------------------------------------------------
// 코어 진입은 이 파일의 **타입뿐**(런타임 0). 어댑터/컨트롤러/스케줄러는 별도 opt-in 엔트리.
// 불변식: 전송 프로토콜 무지(DI) · onData 는 seq 단조 증가 순으로만 전달(역전=드롭+경고, 무언 삼킴 0).
// ============================================================

/** 서버 페이로드 — 두 형태(전체 스냅샷 / 부분 델타). 전송 프로토콜 무관(코어가 소비하는 정규형). */
export type RtPayload<T> = SnapshotPayload<T> | DeltaPayload<T>;

/** 전체 스냅샷: 데이터셋 통째 교체. seq/serverTime 은 신선도·순서 판정용. */
export interface SnapshotPayload<T> {
  readonly kind: 'snapshot';
  readonly rows: readonly T[];
  /** 단조 증가 시퀀스(순서 역전 방지). / Monotonic sequence. */
  readonly seq: number;
  /** 서버 발신 epoch(ms) — 신선도 계산 입력. / Server-emit epoch(ms). */
  readonly serverTime?: number;
}

/** 부분 델타: 행/셀 단위 변경 집합(전체 리로드 없이 증분 적용). */
export interface DeltaPayload<T> {
  readonly kind: 'delta';
  readonly seq: number;
  readonly serverTime?: number;
  /** 행 upsert(존재 시 병합, 없으면 추가) — rowId(안정키) 기준. */
  readonly upserts?: ReadonlyArray<{ readonly rowId: string; readonly row: Partial<T> }>;
  /** 셀 단위 패치 — 최소 단위 변경(영향 셀만). */
  readonly cells?: ReadonlyArray<{ readonly rowId: string; readonly field: keyof T & string; readonly value: unknown }>;
  /** 행 제거 — rowId 기준. */
  readonly removes?: readonly string[];
}

/** 연결 상태 전이 상수. / Connection-status transition constants. */
export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error';

/** 무언 삼킴 금지 — 오류는 상태에 남는다. / Never swallowed — errors persist in state. */
export interface RtError {
  readonly code: string;
  readonly message: string;
  readonly at: number;
}

/**
 * 연결 상태 값객체(불변). stale 은 신선도 시계(FreshnessClock)에서 파생 — 여기엔 원자 연결 사실만.
 * / Immutable connection-state value object; staleness is derived by FreshnessClock.
 */
export interface ConnectionState {
  readonly status: ConnectionStatus;
  /** 마지막 성공 수신 epoch(ms). / Last successful receive epoch(ms). */
  readonly lastReceivedAt?: number;
  /** 무언 삼킴 금지 — 마지막 오류 노출. / Last error, surfaced (never swallowed). */
  readonly lastError?: RtError;
  /** 현재 backoff 회차(0=정상). / Current backoff attempt (0 = healthy). */
  readonly retryAttempt: number;
  /** 다음 재연결 예정 시각. / Next scheduled reconnect time. */
  readonly nextRetryAt?: number;
}

/** 지수 backoff(+jitter) 정책 — 재연결. 상한/최대 시도 후 error 표면화(무언 삼킴 0). */
export interface BackoffPolicy {
  readonly baseMs: number;
  readonly factor: number;
  readonly maxMs: number;
  /** 미지정=무한(단, 상태는 항상 reconnecting 노출). / Absent = infinite. */
  readonly maxAttempts?: number;
  readonly jitter?: boolean;
}

/**
 * 실시간 데이터 소스 — **단일 push 인터페이스**. 코어는 이것만 안다(DI).
 * 어댑터(폴링/스트리밍/제3자)는 이 계약만 구현. 코어↔전송 완전 분리(REQ-RT-801).
 * 불변식: onData 는 seq 단조 증가 순으로만 관측자에게 전달(역전은 소스가 삼키지 말고 드롭+경고).
 * / Single push interface; the core knows only this (transport injected via DI).
 */
export interface IRealtimeSource<T> {
  /** 수신 시작. 연결 수립까지 포함(스트리밍) 또는 첫 폴 예약(폴링). */
  start(): void;
  /** 수신 중단. 타이머/소켓 정리(멱등). */
  stop(): void;
  /** 정규화된 페이로드 1건 도착. 다중 구독 가능. 반환=해제 함수. */
  onData(listener: (payload: RtPayload<T>) => void): () => void;
  /** 연결 상태 전이 관측(연결/재연결/끊김/오류). 반환=해제 함수. */
  onStatus(listener: (s: ConnectionState) => void): () => void;
  /** 현재 연결 상태 스냅샷. */
  readonly status: ConnectionState;
}

/** seq 단조성 판정(순수) — 역전/중복 드롭 근거. / Monotonic-seq guard (pure). */
export function isSeqNewer(prevSeq: number | undefined, incoming: number): boolean {
  return prevSeq === undefined || incoming > prevSeq;
}
