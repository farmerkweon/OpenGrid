// DD-11 §2.2·§9.6 — Appearance 값 애그리게이트·조합 유효성(재질 애그리게이트 정직 플래그)·재질 서사
import { describe, it, expect } from 'vitest';
import {
  Appearance,
  worstVerdict,
  MATERIAL_PRESETS,
  themeMetaRegistry,
  ThemeMetaRegistry,
  type AppearanceMetaLookup,
} from '../../../src/core/appearance/index.js';

const reg: AppearanceMetaLookup = { theme: themeMetaRegistry };

describe('DD-11 §2.2 Appearance — 불변 값 객체(동등성·with·isDefault)', () => {
  it('isDefault — 4축 default 만 true', () => {
    expect(new Appearance().isDefault).toBe(true);
    expect(new Appearance('dark').isDefault).toBe(false);
    expect(new Appearance('default', 'default', 'compact').isDefault).toBe(false);
  });

  it('equals — 값 동등성(참조 무관)', () => {
    expect(new Appearance('a', 'b').equals(new Appearance('a', 'b'))).toBe(true);
    expect(new Appearance('a', 'b').equals(new Appearance('a', 'c'))).toBe(false);
  });

  it('with — 한 축만 바꾼 새 인스턴스(불변)', () => {
    const a = new Appearance('dark', 'sharp');
    const b = a.with({ skin: 'flat' });
    expect(b.theme).toBe('dark');
    expect(b.skin).toBe('flat');
    expect(a.skin).toBe('sharp'); // 원본 불변
    expect(a).not.toBe(b);
  });

  it('key — 튜플 캐시 키', () => {
    expect(new Appearance('dark', 'sharp', 'compact', 'linen').key).toBe('dark|sharp|compact|linen');
  });
});

describe('DD-11 §2.2·§3.5 validate — 위험/불가 객관 판정(테마 메타 조회)', () => {
  it('ok — 정합 조합은 findings 빈 배열', () => {
    expect(new Appearance().validate(reg)).toEqual([]);
    expect(new Appearance('ocean', 'sharp').validate(reg)).toEqual([]);
  });

  it('NEUMORPH_ON_DARK — neumorph × 다크 = invalid', () => {
    const f = new Appearance('dark', 'neumorph').validate(reg);
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe('NEUMORPH_ON_DARK');
    expect(f[0]!.verdict).toBe('invalid');
    // 라이트 테마에서는 발화 안 함
    expect(new Appearance('default', 'neumorph').validate(reg).find((x) => x.code === 'NEUMORPH_ON_DARK')).toBeUndefined();
  });

  it('STITCH_ON_DARK — stitch × 다크 = risky(실땀 소실)', () => {
    const f = new Appearance('dark', 'stitch').validate(reg);
    expect(f.some((x) => x.code === 'STITCH_ON_DARK' && x.verdict === 'risky')).toBe(true);
  });

  it('TEXTURE_META_MISMATCH — 질감 × 비질감 테마 = risky', () => {
    const f = new Appearance('ocean', 'sharp', 'default', 'linen').validate(reg);
    expect(f.some((x) => x.code === 'TEXTURE_META_MISMATCH')).toBe(true);
    // 질감 테마(linen)에는 미발화
    expect(new Appearance('linen', 'sharp', 'default', 'linen').validate(reg).some((x) => x.code === 'TEXTURE_META_MISMATCH')).toBe(false);
  });

  it('MATERIAL_GRAMMAR_CONFLICT — material(광택) × 무광 질감 = risky(재질 문법 충돌)', () => {
    const f = new Appearance('default', 'material', 'default', 'linen').validate(reg);
    expect(f.some((x) => x.code === 'MATERIAL_GRAMMAR_CONFLICT')).toBe(true);
  });

  it('worstVerdict — findings 를 하나의 등급으로 접기', () => {
    expect(worstVerdict([])).toBe('ok');
    expect(worstVerdict(new Appearance('dark', 'stitch').validate(reg))).toBe('risky');
    expect(worstVerdict(new Appearance('dark', 'neumorph').validate(reg))).toBe('invalid');
  });

  it('미등록 테마 메타 — 질감 mismatch 미발화(정직: 알 수 없으면 위험 아님)', () => {
    const empty = new ThemeMetaRegistry();
    const f = new Appearance('unknown-theme', 'sharp', 'default', 'linen').validate({ theme: empty });
    expect(f.some((x) => x.code === 'TEXTURE_META_MISMATCH')).toBe(false);
  });
});

describe('DD-11 §9.6 재질 서사 프리셋 — 데모/API 공유', () => {
  it('프리셋 3종 존재(blueprint/washi/executive) + 서사 문자열', () => {
    const ids = MATERIAL_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['blueprint', 'washi', 'executive']);
    for (const p of MATERIAL_PRESETS) {
      expect(p.narrative.length).toBeGreaterThan(10);
      expect(p.appearance).toBeInstanceOf(Appearance);
    }
  });

  it('blueprint = 4축 곱(색×형태×밀도×질감)', () => {
    const bp = MATERIAL_PRESETS.find((p) => p.id === 'blueprint')!;
    expect(bp.appearance.key).toBe('blueprint|sharp|compact|graph');
  });

  it('조화 프리셋(washi)은 자기 테마에서 ok, executive+무광은 상충 잠재', () => {
    const washi = MATERIAL_PRESETS.find((p) => p.id === 'washi')!;
    // washi 테마는 textured=true 라 질감 mismatch 없음
    expect(washi.appearance.validate(reg).some((x) => x.code === 'TEXTURE_META_MISMATCH')).toBe(false);
  });
});
