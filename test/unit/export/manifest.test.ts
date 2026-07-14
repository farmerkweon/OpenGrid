// ============================================================
// DD-15 §2.7·3.5 매니페스트 — 채널 손실 고지(REQ-T3-804). 발산 아님, 강등을 미리 알림.
// ============================================================
import { describe, it, expect } from 'vitest';
import { ExportManifest } from '../../../src/core/export/ExportManifest.js';
import { DEFAULT_CAPS } from '../../../src/core/export/channels/capabilities.js';

describe('DD-15 ExportManifest(손실 고지)', () => {
  const manifest = new ExportManifest(DEFAULT_CAPS);

  it('CSV 는 활성 CF·병합·틀고정을 손실로 고지', () => {
    const losses = manifest.losses('csv', { cf: true, merges: true, frozen: true });
    const items = losses.map(l => l.item).sort();
    expect(items).toEqual(['cf', 'frozen', 'merges']);
    expect(losses.every(l => l.reason.length > 0)).toBe(true);
  });

  it('xlsx 는 병합·CF·컬럼폭 손실 없음(표현 가능)', () => {
    const losses = manifest.losses('xlsx', { cf: true, merges: true, colWidths: true });
    expect(losses).toHaveLength(0);
  });

  it('xlsx 도 틀고정·필터는 손실 고지(표현 불가)', () => {
    const losses = manifest.losses('xlsx', { frozen: true, filters: true });
    expect(losses.map(l => l.item).sort()).toEqual(['filters', 'frozen']);
  });

  it('활성 상태가 없으면 손실 0', () => {
    expect(manifest.losses('csv', {})).toHaveLength(0);
  });

  it('matrix 는 채널×항목 불리언 매트릭스', () => {
    const m = manifest.matrix();
    expect(m.channels).toContain('csv');
    expect(m.channels).toContain('xlsx');
    expect(m.cells['csv']!['cf']).toBe(false);
    expect(m.cells['xlsx']!['cf']).toBe(true);
    expect(m.cells['xlsx']!['merges']).toBe(true);
  });
});
