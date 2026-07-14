// ============================================================
// DD-07 실시간(RT) 서브시스템 배럴 / DD-07 realtime subsystem barrel.
// 설계: sessions/design-uxui-2026-07/detailed-design/DD-07_realtime.md
// additive opt-in — 코어 진입점 미참조(미로드 시 코어 gzip 증분 0). 헤드리스·순수(전송/타이머/rAF 주입).
// ============================================================

// ── 소스 계약·페이로드 값객체(코어 진입 가능·런타임 0) ──
export type {
  RtPayload,
  SnapshotPayload,
  DeltaPayload,
  IRealtimeSource,
  ConnectionStatus,
  ConnectionState,
  RtError,
  BackoffPolicy,
} from './IRealtimeSource.js';
export { isSeqNewer } from './IRealtimeSource.js';

// ── 어댑터 두 종(1급) + 전송 SPI ──
export { PollingSource, type PollingConfig } from './PollingSource.js';
export { StreamingSource, type StreamingConfig, type StreamTransport } from './StreamingSource.js';

// ── backoff(순수) ──
export { nextBackoffDelay, backoffExhausted } from './backoff.js';

// ── 백프레셔 스케줄러 ──
export {
  BackpressureScheduler,
  type NormalizedBatch,
  type BackpressureStats,
  type BackpressureConfig,
} from './BackpressureScheduler.js';

// ── 상태보존 증분 반영 ──
export { RealtimeController, type RealtimeControllerDeps } from './RealtimeController.js';
export { RtApplyCommand } from './RtApplyCommand.js';
export { LiveStateGuard, type EditConflict } from './LiveStateGuard.js';

// ── 신선도 ──
export {
  FreshnessClock,
  type FreshnessState,
  type FreshnessSnapshot,
  type FreshnessConfig,
} from './FreshnessClock.js';

// ── 접근성 게이트 ──
export {
  RtAnnouncePolicy,
  type RtAnnouncePolicyConfig,
  type RtAnnounceSummary,
  type AppliedDelta,
} from './RtAnnouncePolicy.js';

// ── 차트 타깃 트리거(DD-06 소비) ──
export {
  DefaultRtChartTargetTrigger,
  type RtChartTargetTrigger,
  type RenderTargetKind,
} from './RtChartTargetTrigger.js';

// ── DI 포트 + 기본 스케줄러 ──
export {
  defaultTimerScheduler,
  defaultFrameScheduler,
  type RtCommandSink,
  type RtCoords,
  type LiveStateSource,
  type LiveUserState,
  type SelectionAnchor,
  type ScrollAnchor,
  type EditingState,
  type TimerHandle,
  type TimerScheduler,
  type FrameScheduler,
} from './ports.js';
