// ============================================================
// DD-13 §2.2 계측 훅 표면 — 관찰 가능성 (REQ-TX-805)
// / DD-13 §2.2 Instrumentation hook surface — observability.
// 코어는 자신의 성능을 발신(emit)하고, 게이트·호스트·대시보드는 구독(subscribe)한다.
// 훅은 opt-in(콜백 미등록 시 오버헤드 0에 수렴). 순수·헤드리스.
// ============================================================

/** 렌더 1회의 실측 샘플 — 코어가 매 렌더 완료 시 발신. / One measured render sample. */
export interface RenderMetric {
  readonly renderMs: number;      // 이번 렌더 소요 / this render's duration
  readonly visibleRows: number;   // 가시행수 / visible row count
  readonly nodeCount: number;     // 라이브 DOM 노드수(TX-803 상한 대조) / live DOM node count
  readonly timestamp: number;     // 주입 clock 기준(결정론) / injected-clock timestamp (deterministic)
  readonly reason: 'mount' | 'scroll' | 'data' | 'theme' | 'resize';
}

/** 상호작용 지연 샘플 — 입력→다음 페인트. / Interaction latency sample — input→next paint. */
export interface InteractionSample {
  readonly type: 'edit' | 'scroll' | 'filter' | 'sort';
  readonly latencyMs: number;
  readonly timestamp: number;
}

/** 백분위 요약 — 원시 샘플에서 계산. / Percentile summary derived from raw samples. */
export interface LatencyStats {
  readonly type: InteractionSample['type'];
  readonly count: number;
  readonly p50: number;
  readonly p75: number;
  readonly p95: number;
}

/**
 * 계측 훅 옵션 — OpenGridOptions 에 additive 편입(semver 안전, opt-in).
 * / Instrumentation hook options — additive to OpenGridOptions (semver-safe, opt-in).
 */
export interface PerfHooks {
  /** 렌더마다 호출. dev 모드에서 예산 초과 시 [OpenGrid] 경고 동반. / Called per render. */
  onRenderMetrics?(m: RenderMetric): void;
  /** 상호작용 지연 수집기. 유형별 p75/p95 반환 API 제공. / Interaction latency sink. */
  onInteractionLatency?(s: InteractionSample): void;
}

/** 백분위(선형 보간) — 정렬된 오름차순 배열에서. / Percentile (linear interpolation) over a sorted ascending array. */
function percentile(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/**
 * 지연 수집기 — 훅 샘플을 순환 버퍼에 모아 백분위 노출.
 * CRC: 샘플 축적·백분위 계산 | 협력: PerfHooks(입력)·ReleaseGate/대시보드(출력).
 * 불변식: 메모리 상한(고정 버퍼 크기 N=1024, 오래된 샘플 드롭) — 계측이 누수 원인이 되면 안 됨.
 * / Latency collector — accumulates hook samples in a ring buffer and exposes percentiles.
 */
export class LatencyCollector {
  private readonly _capacity: number;
  private readonly _buf: InteractionSample[] = [];
  private _head = 0; // 다음 기록 위치(순환) / next write slot (circular)

  /** @param capacity 순환 버퍼 크기(기본 1024) / ring buffer size (default 1024) */
  constructor(capacity = 1024) {
    this._capacity = Math.max(1, Math.floor(capacity));
  }

  /** 샘플 기록(용량 초과 시 최오래된 것 덮어씀). / Record a sample (overwrites the oldest when full). */
  record(s: InteractionSample): void {
    if (this._buf.length < this._capacity) {
      this._buf.push(s);
    } else {
      this._buf[this._head] = s;
      this._head = (this._head + 1) % this._capacity;
    }
  }

  /** 현재 축적 샘플 수(용량 상한). / Current sample count (capped by capacity). */
  get size(): number {
    return this._buf.length;
  }

  /** 유형별 p50/p75/p95 통계. / Per-type p50/p75/p95 stats. */
  stats(type: InteractionSample['type']): LatencyStats {
    const vals = this._buf
      .filter(s => s.type === type)
      .map(s => s.latencyMs)
      .sort((a, b) => a - b);
    return {
      type,
      count: vals.length,
      p50: percentile(vals, 50),
      p75: percentile(vals, 75),
      p95: percentile(vals, 95),
    };
  }

  /** 전체 샘플 비움. / Clear all samples. */
  reset(): void {
    this._buf.length = 0;
    this._head = 0;
  }
}
