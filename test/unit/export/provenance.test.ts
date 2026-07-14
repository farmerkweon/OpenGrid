// ============================================================
// DD-15 §2.3·3.4 provenance 동행 — 흐름 끝까지 소실0(REQ-T6-811). 흑백 픽토 생존.
// ============================================================
import { describe, it, expect } from 'vitest';
import { ArtifactProvenance, buildProvenance } from '../../../src/core/export/Provenance.js';
import type { TransformProvenance, ChannelId } from '../../../src/core/export/types.js';

const TRANSFORMS: TransformProvenance[] = [
  { source: 'chart', kind: 'downsample', detail: '10,000→500점 다운샘플(LTTB)' },
  { source: 'format', kind: 'abbreviate', detail: '큰수 축약(K/M/B)' },
  { source: 'cf', kind: 'clamp', detail: '범위 초과 클램프' },
];

const ALL_CHANNELS: ChannelId[] = ['csv', 'xlsx', 'json', 'xml', 'pdf', 'html', 'print'];

describe('DD-15 provenance 동행(소실0)', () => {
  it('모든 변환이 배지로 승격(중복 kind dedup)', () => {
    const p = new ArtifactProvenance({ transforms: [...TRANSFORMS, TRANSFORMS[0]!], generatedAt: 1000 });
    expect(p.badges).toHaveLength(3); // 중복 downsample 은 1배지.
    expect(p.badges.map(b => b.code).sort()).toEqual(['abbreviate', 'clamp', 'downsample']);
  });

  it('모든 배지에 흑백 픽토(monochromeGlyph) — 흑백 인쇄 생존', () => {
    const p = new ArtifactProvenance({ transforms: TRANSFORMS });
    for (const b of p.badges) {
      expect(b.monochromeGlyph).toBeTruthy();
      expect(b.monochromeGlyph.length).toBeGreaterThan(0);
    }
  });

  it('★소실0: 모든 채널 render 가 동일 배지 집합을 표현(고지 누락 0)', () => {
    const p = new ArtifactProvenance({ transforms: TRANSFORMS });
    const expectCodes = p.badges.map(b => b.code).sort();
    for (const ch of ALL_CHANNELS) {
      const block = p.render(ch);
      expect(block.channel).toBe(ch);
      expect(block.badges.map(b => b.code).sort()).toEqual(expectCodes);
      expect(block.text.length).toBeGreaterThan(0);
    }
  });

  it('CSV/XML render 는 주석 프리픽스(파서 무시)', () => {
    const p = new ArtifactProvenance({ transforms: TRANSFORMS, rangeNote: '전체 12,300행' });
    expect(p.render('csv').text.split('\n').every(l => l.startsWith('# '))).toBe(true);
    expect(p.render('xml').text.split('\n').every(l => l.startsWith('# '))).toBe(true);
  });

  it('JSON render 는 파싱 가능한 구조(transforms/badges/rangeNote)', () => {
    const p = new ArtifactProvenance({ transforms: TRANSFORMS, rangeNote: '전체 3행', generatedAt: 42 });
    const parsed = JSON.parse(p.render('json').text);
    expect(parsed.transforms).toHaveLength(3);
    expect(parsed.badges).toHaveLength(3);
    expect(parsed.rangeNote).toBe('전체 3행');
    expect(parsed.generatedAt).toBe(42);
  });

  it('정상(변환 없음)이면 배지 0(호들갑 금지)', () => {
    const p = buildProvenance({ transforms: [] });
    expect(p.badges).toHaveLength(0);
    expect(p.render('pdf').text).toBe('');
  });

  it('로케일 t 주입 시 라벨 위임, 미주입 시 폴백', () => {
    const t = (k: string) => (k === 'export.provenance.downsample' ? '샘플축소' : k);
    const p = new ArtifactProvenance({ transforms: [TRANSFORMS[0]!], t });
    expect(p.badges[0]!.label).toBe('샘플축소');
    const pf = new ArtifactProvenance({ transforms: [TRANSFORMS[0]!] });
    expect(pf.badges[0]!.label).toBe('다운샘플');
  });
});
