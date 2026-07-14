// DD-13 §2.6 대비 AA 자동 스위트 — ContrastAuditor (REQ-TX-814·830)
import { describe, it, expect } from 'vitest';
import {
  ContrastAuditor, CONTRAST_MIN, type AppearanceSnapshotLike,
} from '../../../src/core/quality/ContrastAuditor.js';

const auditor = new ContrastAuditor();

describe('ContrastAuditor — WCAG 대비 계산(palette 위임)', () => {
  it('흑/백 최대 대비 21:1', () => {
    expect(auditor.ratio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('동색 대비 1:1', () => {
    expect(auditor.ratio('#777777', '#777777')).toBeCloseTo(1, 6);
  });

  it('CONTRAST_MIN 표준 고정(bodyText 4.5, 나머지 3.0)', () => {
    expect(CONTRAST_MIN.bodyText).toBe(4.5);
    expect(CONTRAST_MIN.largeText).toBe(3.0);
    expect(CONTRAST_MIN.uiComponent).toBe(3.0);
    expect(CONTRAST_MIN.graphic).toBe(3.0);
  });
});

describe('ContrastAuditor — 전수 인벤토리·판정', () => {
  const snapshots: AppearanceSnapshotLike[] = [
    {
      theme: 'light', skin: 'default', state: 'default',
      colors: { text: '#111111', bg: '#ffffff', muted: '#999999' },
      pairs: [
        { fgToken: 'text', bgToken: 'bg', kind: 'bodyText' },   // 통과(고대비)
        { fgToken: 'muted', bgToken: 'bg', kind: 'bodyText' },  // 미달(#999 on #fff ≈ 2.85)
      ],
    },
  ];

  it('enumeratePairs: 스냅샷 선언 쌍을 전개(컨텍스트 보존)', () => {
    const pairs = auditor.enumeratePairs(snapshots);
    expect(pairs.length).toBe(2);
    expect(pairs[0]!.context).toEqual({ theme: 'light', skin: 'default', state: 'default', tokenId: 'text' });
  });

  it('audit: 미달 1건이라도 실패로 포착', () => {
    const verdicts = auditor.audit(auditor.enumeratePairs(snapshots));
    const failures = auditor.failures(verdicts);
    expect(verdicts.length).toBe(2);
    expect(failures.length).toBe(1);
    expect(failures[0]!.pair.context.tokenId).toBe('muted');
    expect(failures[0]!.required).toBe(4.5);
    expect(failures[0]!.ratio).toBeLessThan(4.5);
  });

  it('largeText 완화 임계(3.0) 적용', () => {
    const s: AppearanceSnapshotLike[] = [{
      theme: 't', skin: 's', state: 'default',
      colors: { fg: '#767676', bg: '#ffffff' }, // ≈4.54:1
      pairs: [{ fgToken: 'fg', bgToken: 'bg', kind: 'largeText' }],
    }];
    expect(auditor.audit(auditor.enumeratePairs(s))[0]!.status).toBe('pass');
  });
});

describe('ContrastAuditor — 토큰 완결성(TX-830)', () => {
  it('누락 토큰 → coverageGaps 지목, 인벤토리에선 제외', () => {
    const snapshots: AppearanceSnapshotLike[] = [{
      theme: 'light', skin: 'default', state: 'default',
      colors: { text: '#111111' }, // bg 누락
      pairs: [{ fgToken: 'text', bgToken: 'bg', kind: 'bodyText' }],
    }];
    expect(auditor.enumeratePairs(snapshots).length).toBe(0);
    expect(auditor.coverageGaps(snapshots)).toContain('light/default/default:bg');
  });
});
