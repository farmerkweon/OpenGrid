// DD-13 §2.5 픽셀 계량 커널 + 시각회귀 하니스 (REQ-TX-826·827)
import { describe, it, expect } from 'vitest';
import {
  changedPixelRatio, ssim, maxDeltaE, type ImageLike,
} from '../../../src/core/quality/pixelMetrics.js';
import {
  VisualRegressionHarness, DEFAULT_DIFF_THRESHOLD, snapshotKey,
  type ICapturer, type IGoldenStore, type MatrixConfig, type SnapshotSpec,
} from '../../../src/core/quality/VisualRegression.js';
import { DeterminismKernel, FakeClock, SeededRandom } from '../../../src/core/quality/DeterminismKernel.js';

/** 단색 이미지 생성기. / Solid-color image factory. */
function solid(w: number, h: number, rgba: [number, number, number, number]): ImageLike {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0]; data[i * 4 + 1] = rgba[1]; data[i * 4 + 2] = rgba[2]; data[i * 4 + 3] = rgba[3];
  }
  return { width: w, height: h, data };
}

describe('pixelMetrics — 동일/상이 이미지', () => {
  const a = solid(4, 4, [10, 20, 30, 255]);

  it('동일 이미지: changedPixelRatio=0·ssim=1·ΔE=0', () => {
    const b = solid(4, 4, [10, 20, 30, 255]);
    expect(changedPixelRatio(a, b)).toBe(0);
    expect(ssim(a, b)).toBeCloseTo(1, 10);
    expect(maxDeltaE(a, b)).toBe(0);
  });

  it('전면 변경: changedPixelRatio=1·ssim<1·ΔE>0', () => {
    const b = solid(4, 4, [200, 200, 200, 255]);
    expect(changedPixelRatio(a, b)).toBe(1);
    expect(ssim(a, b)).toBeLessThan(1);
    expect(maxDeltaE(a, b)).toBeGreaterThan(0);
  });

  it('규격 불일치: 안전 최악값(변경1·ssim0·ΔE441)', () => {
    const b = solid(2, 2, [10, 20, 30, 255]);
    expect(changedPixelRatio(a, b)).toBe(1);
    expect(ssim(a, b)).toBe(0);
    expect(maxDeltaE(a, b)).toBe(441);
  });

  it('tolerance: 미세 채널차 무시', () => {
    const b = solid(4, 4, [11, 21, 31, 255]); // 각 +1
    expect(changedPixelRatio(a, b, 0)).toBe(1);
    expect(changedPixelRatio(a, b, 1)).toBe(0); // 허용오차 1 → 변경 없음
  });
});

describe('VisualRegressionHarness — 매트릭스·비교·flaky', () => {
  const kernel = new DeterminismKernel(new FakeClock(), new SeededRandom(1));
  const matrix: MatrixConfig = {
    components: ['header', 'cell'],
    themes: ['light', 'dark'],
    skins: ['default'],
    states: ['default', 'hover'],
    fixtureId: 'fx1',
  };
  const golden = solid(4, 4, [10, 20, 30, 255]);
  const goldenStore: IGoldenStore = { get: () => golden };

  function harnessWith(capture: (s: SnapshotSpec) => ImageLike): VisualRegressionHarness {
    const capturer: ICapturer = { capture: async s => capture(s) };
    return new VisualRegressionHarness(kernel, DEFAULT_DIFF_THRESHOLD, capturer, goldenStore, matrix);
  }

  it('enumerate: 2×2×1×2 = 8 조합 전개', () => {
    const specs = harnessWith(() => golden).enumerate();
    expect(specs.length).toBe(8);
    expect(new Set(specs.map(snapshotKey)).size).toBe(8); // 중복 없음
  });

  it('compare: 골든 동일(byte-identical) → pass(diff 0px, TX-827)', () => {
    const h = harnessWith(() => golden);
    const spec = h.enumerate()[0]!;
    const r = h.compare(spec, solid(4, 4, [10, 20, 30, 255]));
    expect(r.status).toBe('pass');
    expect(r.changedPixelRatio).toBe(0);
    expect(r.diffImagePath).toBeUndefined();
  });

  it('compare: 임계 초과 → fail + 차분 이미지 경로', () => {
    const h = harnessWith(() => golden);
    const spec = h.enumerate()[0]!;
    const r = h.compare(spec, solid(4, 4, [200, 60, 60, 255]));
    expect(r.status).toBe('fail');
    expect(r.diffImagePath).toBe(`${snapshotKey(spec)}.diff.png`);
  });

  it('compare: 골든 없음 → new-golden', () => {
    const capturer: ICapturer = { capture: async () => golden };
    const h = new VisualRegressionHarness(
      kernel, DEFAULT_DIFF_THRESHOLD, capturer, { get: () => null }, matrix,
    );
    const spec = h.enumerate()[0]!;
    expect(h.compare(spec, golden).status).toBe('new-golden');
  });

  it('measureFlaky: 결정론 캡처 → flaky 0', async () => {
    const h = harnessWith(() => solid(4, 4, [10, 20, 30, 255]));
    const spec = h.enumerate()[0]!;
    const rate = await h.measureFlaky(spec, 10);
    expect(rate).toBe(0);
    expect(rate).toBeLessThanOrEqual(DEFAULT_DIFF_THRESHOLD.maxFlakyRate);
  });

  it('measureFlaky: 비결정론 캡처 → flaky>임계 감지', async () => {
    let n = 0;
    const h = harnessWith(() => solid(4, 4, [10 + (n++ % 2) * 50, 20, 30, 255]));
    const spec = h.enumerate()[0]!;
    const rate = await h.measureFlaky(spec, 10);
    expect(rate).toBeGreaterThan(DEFAULT_DIFF_THRESHOLD.maxFlakyRate);
  });

  it('capture: whenIdle 경유(보류 flush 후 캡처)', async () => {
    const h = harnessWith(() => golden);
    const spec = h.enumerate()[0]!;
    await expect(h.capture(spec)).resolves.toBe(golden);
  });
});
