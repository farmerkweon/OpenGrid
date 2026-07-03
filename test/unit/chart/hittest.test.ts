import { describe, it, expect } from 'vitest';
import { hitTest, type PointGeom } from '../../../src/core/chart/hittest';

function bar(si: number, ci: number, x: number, y: number, w: number, h: number): PointGeom {
  return { seriesIndex: si, categoryIndex: ci, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}
function marker(si: number, ci: number, cx: number, cy: number): PointGeom {
  return { seriesIndex: si, categoryIndex: ci, x: cx - 3, y: cy - 3, w: 6, h: 6, cx, cy };
}

describe('hittest — bar (사각형 contains, §8.3)', () => {
  const geoms = [
    bar(0, 0, 10, 100, 20, 50),  // x∈[10,30], y∈[100,150]
    bar(0, 1, 40, 80, 20, 70),   // x∈[40,60], y∈[80,150]
    bar(1, 0, 30, 120, 20, 30),  // x∈[30,50], y∈[120,150]
  ];
  it('사각형 내부 좌표 → 해당 포인트', () => {
    const h = hitTest(geoms, 20, 130, 'bar');
    expect(h).not.toBeNull();
    expect(h!.seriesIndex).toBe(0);
    expect(h!.categoryIndex).toBe(0);
  });
  it('두 번째 막대 내부', () => {
    const h = hitTest(geoms, 50, 100, 'bar');
    expect(h!.categoryIndex).toBe(1);
  });
  it('어떤 막대에도 없으면 null(툴팁 숨김)', () => {
    expect(hitTest(geoms, 200, 200, 'bar')).toBeNull();
    expect(hitTest(geoms, 35, 90, 'bar')).toBeNull();
  });
});

describe('hittest — line (최근접 x → 최근접 y, §8.3)', () => {
  // 라인차트: x=category 위치를 series 가 공유. cat0=x15, cat1=x115, cat2=x215. series 0/1.
  const geoms = [
    marker(0, 0, 15, 100),  marker(1, 0, 15, 180),   // cat0
    marker(0, 1, 115, 60),  marker(1, 1, 115, 160),  // cat1
    marker(0, 2, 215, 20),  marker(1, 2, 215, 140),  // cat2
  ];
  it('포인터 x 가 category1 근처면 그 열에서 최근접 y 선택', () => {
    const h = hitTest(geoms, 110, 65, 'line');
    expect(h!.categoryIndex).toBe(1);
    expect(h!.seriesIndex).toBe(0); // cy=60 이 py=65 에 최근접
  });
  it('같은 x, 아래쪽 py → series1 선택', () => {
    const h = hitTest(geoms, 118, 155, 'line');
    expect(h!.categoryIndex).toBe(1);
    expect(h!.seriesIndex).toBe(1); // cy=160 최근접
  });
  it('line 은 미스 개념 없이 항상 하나 반환', () => {
    const h = hitTest(geoms, 9999, 9999, 'line');
    expect(h).not.toBeNull();
    expect(h!.categoryIndex).toBe(2); // x 최근접(215)
  });
  it('빈 geoms → null', () => {
    expect(hitTest([], 0, 0, 'line')).toBeNull();
    expect(hitTest([], 0, 0, 'bar')).toBeNull();
  });
});
