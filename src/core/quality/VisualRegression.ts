// ============================================================
// DD-13 §2.5 시각회귀 하니스 — VisualRegressionHarness (REQ-TX-826·827·828·830)
// / DD-13 §2.5 Visual regression harness.
// 정성 AC("흰 섬 없음"·"형광 발광 없음"·"육안 확인")를 결정론 렌더 위 픽셀 diff 임계로 자동 판정.
// 실제 픽셀 캡처는 주입 계약(ICapturer) — 로직·임계 중심, 헤드리스. 픽셀 산식은 pixelMetrics 재사용.
// ============================================================

import type { DeterminismKernel } from './DeterminismKernel.js';
import type { ImageLike } from './pixelMetrics.js';
import { changedPixelRatio, ssim, maxDeltaE } from './pixelMetrics.js';

/** 스냅샷 대상 좌표 — 매트릭스 한 점. / A snapshot target coordinate — one matrix point. */
export interface SnapshotSpec {
  readonly component: 'header' | 'cell' | 'widgetCell' | 'contextMenu'
                     | 'emptyState' | 'chart' | 'filterPanel' | 'editor';
  readonly theme: string;   // 15테마 / 15 themes
  readonly skin: string;
  readonly state?: 'default' | 'hover' | 'selected' | 'focus' | 'disabled' | 'zebra';
  readonly fixtureId: string; // 결정론 픽스처(고정 데이터) / deterministic fixture
}

/**
 * 비교 임계 — 판정 루브릭(육안 대체). 전부 주입값(생성자 DI) — 하드코딩 상수 아님(§4.1 오버라이딩).
 * / Comparison thresholds — the verdict rubric replacing human eyeballing. All injectable.
 */
export interface DiffThreshold {
  readonly maxChangedPixelRatio: number; // ≤0.001 (0.1%)
  readonly minSsim: number;              // ≥0.98
  readonly maxDeltaE: number;            // ≤2.0 (색차 상한 — 차트 3타깃 파리티가 인용, DD-06 소비)
  readonly maxFlakyRate: number;         // ≤0.005 (0.5%)
}

/** 기본 임계(§2.5 브리프 값). / Default thresholds (§2.5 brief values). */
export const DEFAULT_DIFF_THRESHOLD: DiffThreshold = Object.freeze({
  maxChangedPixelRatio: 0.001,
  minSsim: 0.98,
  maxDeltaE: 2.0,
  maxFlakyRate: 0.005,
});

/** 단일 스냅샷 비교 결과. / A single snapshot comparison result. */
export interface DiffResult {
  readonly spec: SnapshotSpec;
  readonly changedPixelRatio: number;
  readonly ssim: number;
  readonly maxDeltaE: number;
  readonly status: 'pass' | 'fail' | 'new-golden';
  readonly diffImagePath?: string;
}

/** 실 픽셀 캡처 계약(실브라우저/스텁 주입). / Real-pixel capture contract (real browser / stub). */
export interface ICapturer {
  capture(spec: SnapshotSpec): Promise<ImageLike>;
}

/** 골든 스냅샷 저장소 계약. / Golden snapshot store contract. */
export interface IGoldenStore {
  get(spec: SnapshotSpec): ImageLike | null;
}

/** 매트릭스 전개 정의(컴포넌트×테마×스킨×상태). / Matrix definition for enumeration. */
export interface MatrixConfig {
  readonly components: readonly SnapshotSpec['component'][];
  readonly themes: readonly string[];
  readonly skins: readonly string[];
  readonly states: readonly NonNullable<SnapshotSpec['state']>[];
  readonly fixtureId: string;
}

/** 스냅샷 spec 의 안정 키(골든 대조·flaky 추적). / Stable key for a snapshot spec. */
export function snapshotKey(s: SnapshotSpec): string {
  return `${s.component}|${s.theme}|${s.skin}|${s.state ?? 'default'}|${s.fixtureId}`;
}

/**
 * 시각회귀 하니스 — 골든 캡처·비교·flaky 추적.
 * CRC: 결정론 렌더→캡처→골든 대조 | 협력: DeterminismKernel(whenIdle)·ICapturer(실픽셀)·pixelMetrics.
 * 불변식: 캡처 전 반드시 kernel.whenIdle() await(경쟁 제거).
 * / Visual regression harness — golden capture, compare, flaky tracking.
 */
export class VisualRegressionHarness {
  constructor(
    private readonly kernel: DeterminismKernel,
    private readonly threshold: DiffThreshold,
    private readonly capturer: ICapturer,
    private readonly goldens: IGoldenStore,
    private readonly matrix: MatrixConfig,
  ) {}

  /** 매트릭스 전개: 컴포넌트×테마×스킨×상태 조합 생성(누락 조합=미커버 리포트). */
  enumerate(): SnapshotSpec[] {
    const out: SnapshotSpec[] = [];
    for (const component of this.matrix.components) {
      for (const theme of this.matrix.themes) {
        for (const skin of this.matrix.skins) {
          for (const state of this.matrix.states) {
            out.push({ component, theme, skin, state, fixtureId: this.matrix.fixtureId });
          }
        }
      }
    }
    return out;
  }

  /** 단일 스냅샷 캡처(whenIdle 후 실픽셀). / Capture one snapshot (after whenIdle). */
  async capture(spec: SnapshotSpec): Promise<ImageLike> {
    await this.kernel.whenIdle();
    return this.capturer.capture(spec);
  }

  /** 골든 대조. SSIM+픽셀 diff+ΔE 동시 판정(§2.5 커널 재사용). / Compare against golden. */
  compare(spec: SnapshotSpec, actual: ImageLike): DiffResult {
    const golden = this.goldens.get(spec);
    if (!golden) {
      return { spec, changedPixelRatio: 0, ssim: 1, maxDeltaE: 0, status: 'new-golden' };
    }
    const cpr = changedPixelRatio(golden, actual);
    const structural = ssim(golden, actual);
    const dE = maxDeltaE(golden, actual);
    const fail =
      cpr > this.threshold.maxChangedPixelRatio ||
      structural < this.threshold.minSsim ||
      dE > this.threshold.maxDeltaE;
    return {
      spec,
      changedPixelRatio: cpr,
      ssim: structural,
      maxDeltaE: dE,
      status: fail ? 'fail' : 'pass',
      ...(fail ? { diffImagePath: `${snapshotKey(spec)}.diff.png` } : {}),
    };
  }

  /**
   * flaky 감지: 동일 spec N회 캡처→첫 캡처 대비 불일치율 반환. 임계 초과는 호출측이 판정.
   * / Flaky detection: capture the same spec N times → mismatch ratio vs the first capture.
   */
  async measureFlaky(spec: SnapshotSpec, runs: number): Promise<number> {
    const n = Math.max(1, Math.floor(runs));
    const first = await this.capture(spec);
    let mismatches = 0;
    for (let i = 1; i < n; i++) {
      const shot = await this.capture(spec);
      if (changedPixelRatio(first, shot) > 0) mismatches++;
    }
    return n <= 1 ? 0 : mismatches / n;
  }
}
