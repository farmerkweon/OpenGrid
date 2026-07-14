import { describe, it, expect } from 'vitest';
import { buildProvenance, badgeText } from '../../../src/core/chart/provenance';
import type { ChartDataModelMeta } from '../../../src/core/chart/types';

function meta(patch: Partial<ChartDataModelMeta> = {}): ChartDataModelMeta {
  return { sourceKind: 'all', total: 10, sampled: false, a11yTable: { caption: '', colHeaders: [], rows: [] }, ...patch };
}

describe('provenance — 배지 SSOT(REQ-T6-810/811/812, §9.4)', () => {
  it('변형 없으면 clean=true, 배지 0(정상 차트는 배지 0 §9.3.4)', () => {
    const p = buildProvenance(meta());
    expect(p.clean).toBe(true);
    expect(p.badges.length).toBe(0);
  });

  it('sampled → M/N 정확(REQ-T6-810)', () => {
    const p = buildProvenance(meta({ sampled: true, sampledFrom: 1000, sampledTo: 50 }));
    const b = p.badges.find(x => x.kind === 'sampled')!;
    expect(b.m).toBe(50);
    expect(b.n).toBe(1000);
    expect(p.clean).toBe(false);
  });

  it('집계·pie 절댓값·pie 첫계열 배지', () => {
    const p = buildProvenance(meta({ aggregatedOp: 'sum', negativesAbsInPie: true, pieReducedToFirst: true }));
    const kinds = p.badges.map(b => b.kind).sort();
    expect(kinds).toEqual(['aggregated', 'negativesAbsInPie', 'pieReducedToFirst']);
  });

  it('절단축·엔진폴백·미지원타입(조용한 폴백 금지 REQ-T6-812)', () => {
    const p = buildProvenance(meta(), { truncatedAxis: true, engineFallback: true, unsupportedType: true });
    const kinds = p.badges.map(b => b.kind).sort();
    expect(kinds).toEqual(['engineFallback', 'truncatedAxis', 'unsupportedType']);
  });

  it('badgeText: 로케일 미주입 시 정직 영문 폴백', () => {
    const p = buildProvenance(meta({ sampled: true, sampledFrom: 100, sampledTo: 10 }));
    expect(badgeText(p.badges[0]!)).toContain('10 of 100');
  });

  it('badgeText: 로케일 t 주입 시 키·파라미터 위임', () => {
    const p = buildProvenance(meta({ engineFallback: false }), { engineFallback: true });
    const seen: string[] = [];
    const t = (k: string) => { seen.push(k); return `T:${k}`; };
    expect(badgeText(p.badges[0]!, t)).toBe('T:chart.badge.engineFallback');
    expect(seen).toContain('chart.badge.engineFallback');
  });
});
