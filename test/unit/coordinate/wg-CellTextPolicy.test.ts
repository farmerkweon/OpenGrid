// @vitest-environment node
// 넓은 그리드 새 그물 — CellTextPolicy 단위 시험(테스트 설계서 §2-4 U-TXT-01~30, 걸음 R1).
//
// 기본 지표 M13 {fontPx 13, lineHeightPx 17.55, padX 16, padY 8} → 최소 글자 폭 g = 2.6px.
// 기본 칸 S180 {columnWidth 180, viewportWidth 1900, wrapRowHeight null} → 안쪽 폭 164.
// U-TXT-32(ResolvedAppearanceSnapshot 의 글꼴 지표, 환경 J)는 원천 파일을 고쳐야 하는 경우라 C10 으로 미룸(로그 WARN 경우변경).
import { describe, it, expect } from 'vitest';
import { CellTextPolicy } from '../../../src/core/coordinate/CellTextPolicy.js';
import type { TextSpec, TypeMetrics } from '../../../src/core/coordinate/geometryPorts.js';

const M13: TypeMetrics = { fontPx: 13, lineHeightPx: 17.55, padX: 16, padY: 8 };
const S180: TextSpec = { columnWidth: 180, viewportWidth: 1900, wrapRowHeight: null, metrics: M13, unlimited: false };
const spec = (p: Partial<TextSpec> = {}, m: Partial<TypeMetrics> = {}): TextSpec =>
  ({ ...S180, ...p, metrics: { ...M13, ...m } });

/** 씨앗 난수(test/unit/wg-helpers/random-ops.ts 와 같은 식 — 그 파일은 DOM 도우미를 끌어 node 에서 못 불러 복사). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);

/**
 * 시험 쪽 「폭 없는 글자」 판정 — 구현의 목록을 가져다 쓰지 않고, 생성기가 넣는 폭 없는 글자 여섯을 손으로 적은 대조
 * (결합 부호 U+0301 · 영폭 공백 · ZWJ · 방향 제어 U+202E · 변이 선택자 U+FE0F · 조합형 한글 중성 U+1161).
 * 구현과 같은 목록을 쓰면 시험이 자기 자신을 통과시킨다.
 */
const ZW_ORACLE = /[́​‍‮️ᅡ]/;
const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;

const p = new CellTextPolicy();

describe('CellTextPolicy — U-TXT limit (R1)', () => {
  it('U-TXT-01 한 줄 S180 → 747', () => {
    expect(p.limit(S180)).toBe(747);
  });
  it('U-TXT-02 넓은 컬럼 1,200 → W* 2,368 → 927', () => {
    expect(p.limit(spec({ columnWidth: 1200 }))).toBe(927);
  });
  it('U-TXT-03 보이는 폭 0(모름) → Infinity (Q-10)', () => {
    expect(p.limit(spec({ viewportWidth: 0 }))).toBe(Infinity);
    // 여러 줄 칸도 폭을 모르면 자르지 않는다(폭 모름 규칙과 같은 뜻)
    expect(p.limit(spec({ viewportWidth: 0, wrapRowHeight: 72 }))).toBe(Infinity);
    expect(p.limit(spec({ viewportWidth: -5 }))).toBe(Infinity);
  });
  it('U-TXT-04 글꼴 11px → 880', () => {
    expect(p.limit(spec({}, { fontPx: 11 }))).toBe(880);
  });
  it('U-TXT-05 글꼴 16px → 610', () => {
    expect(p.limit(spec({}, { fontPx: 16 }))).toBe(610);
  });
  it('U-TXT-06 여러 줄 행 72 → L 5 · K 715', () => {
    expect(p.limit(spec({ wrapRowHeight: 72 }))).toBe(715);
  });
  it('U-TXT-07 한 줄보다 낮은 행 20 → L 2 · K 286', () => {
    expect(p.limit(spec({ wrapRowHeight: 20 }))).toBe(286);
    // 행이 안쪽 여백보다도 낮아도 L 은 2 아래로 안 떨어진다(첫 줄을 못 채우는 일 없음)
    expect(p.limit(spec({ wrapRowHeight: 4 }))).toBe(286);
  });
  it('U-TXT-08 상한 없음(unlimited) → Infinity', () => {
    expect(p.limit(spec({ unlimited: true }))).toBe(Infinity);
    expect(p.limit(spec({ unlimited: true, wrapRowHeight: 72 }))).toBe(Infinity);
  });
  it('U-TXT-09 받은 lineHeightPx 를 쓴다(20, 행 100 → L 6 · K 858)', () => {
    expect(p.limit(spec({ wrapRowHeight: 100 }, { lineHeightPx: 20 }))).toBe(858);
    // 정책은 1.35 × fontPx 를 스스로 셈하지 않는다 — 같은 행 높이에 17.55 를 주면 다른 값
    expect(p.limit(spec({ wrapRowHeight: 100 }, { lineHeightPx: 17.55 }))).toBe(7 * 143);
  });
});

describe('CellTextPolicy — U-TXT coverWidth (R1)', () => {
  it('U-TXT-10 성질: coverWidth(limit(s), s) ≥ max(columnWidth, viewportWidth) — 씨앗 8 × 200', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const r = mulberry32(seed);
      for (let i = 0; i < 200; i++) {
        const s = spec(
          { columnWidth: between(r, 40, 3000), viewportWidth: between(r, 300, 4000) },
          { fontPx: between(r, 10, 20) },
        );
        const k = p.limit(s);
        expect(Number.isFinite(k)).toBe(true);
        expect(p.coverWidth(k, s)).toBeGreaterThanOrEqual(Math.max(s.columnWidth, s.viewportWidth));
        n++;
      }
    }
    expect(n).toBe(1600);
  });
  it('U-TXT-11 다시 채우기 문턱 S180, K 747 → (747−16)×2.6+16 = 1,916.6 (Q-12)', () => {
    expect(p.coverWidth(747, S180)).toBeCloseTo(1916.6, 2);
  });
  it('U-TXT-12 여러 줄 행 72, K 715 → ≥ 2×164+16 = 344', () => {
    const s = spec({ wrapRowHeight: 72 });
    expect(p.coverWidth(715, s)).toBeGreaterThanOrEqual(344);
    // 한 줄 몫 143자 → (143−16)×2.6+16 = 346.2
    expect(p.coverWidth(715, s)).toBeCloseTo(346.2, 6);
  });
  it('(덤) 상한 없음이면 coverWidth = Infinity — 다시 채우기 문턱이 없음', () => {
    expect(p.coverWidth(Infinity, S180)).toBe(Infinity);
  });
});

describe('CellTextPolicy — U-TXT fit (R1)', () => {
  const ascii4000 = Array.from({ length: 4000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
  const withAt = (base: string, pos: number, ins: string) => base.slice(0, pos) + ins + base.slice(pos);

  it('U-TXT-13 짧은 글은 그대로', () => {
    expect(p.fit('abc', 10)).toBe('abc');
  });
  it('U-TXT-14 ASCII 4,000자, 747 → 앞 747자', () => {
    const got = p.fit(ascii4000, 747);
    expect(got.length).toBe(747);
    expect(got).toBe(ascii4000.slice(0, 747));
  });
  it('U-TXT-15 상한 Infinity → 그대로', () => {
    expect(p.fit(ascii4000, Infinity)).toBe(ascii4000);
  });
  it('U-TXT-16 정확히 같은 길이 → 그대로', () => {
    const t = ascii4000.slice(0, 747);
    expect(p.fit(t, 747)).toBe(t);
  });
  it('U-TXT-17 서로게이트 쌍을 가르지 않음', () => {
    const t = 'a'.repeat(746) + '😀' + 'b'.repeat(10);
    const got = p.fit(t, 747);
    expect(t.startsWith(got)).toBe(true);
    expect(isHighSurrogate(got.charCodeAt(got.length - 1))).toBe(false);
    expect([746, 748]).toContain(got.length);
  });
  it('U-TXT-18 결합 문자(e + U+0301)를 가르지 않음', () => {
    const t = 'a'.repeat(746) + 'é' + 'b'.repeat(300);
    const got = p.fit(t, 747);
    expect(t.startsWith(got)).toBe(true);
    expect(got.endsWith('e')).toBe(false);
  });
  it('U-TXT-19 앞(100)에 영폭 공백 → 전문', () => {
    const t = withAt(ascii4000, 100, '​');
    expect(p.fit(t, 747)).toBe(t);
  });
  it('U-TXT-20 앞(50)에 ZWJ 이모지 → 전문', () => {
    const t = withAt(ascii4000, 50, '👨‍👩‍👧');
    expect(p.fit(t, 747)).toBe(t);
  });
  it('U-TXT-21 앞(10)에 방향 제어(U+202E) → 전문', () => {
    const t = withAt(ascii4000, 10, '‮');
    expect(p.fit(t, 747)).toBe(t);
  });
  it('U-TXT-22 앞(10)에 변이 선택자(U+FE0F) → 전문', () => {
    const t = withAt(ascii4000, 10, '️');
    expect(p.fit(t, 747)).toBe(t);
  });
  it('U-TXT-23 결합 부호 더미(5,100자) → 전문', () => {
    const t = ('a' + '́'.repeat(50)).repeat(100);
    expect(t.length).toBe(5100);
    expect(p.fit(t, 747)).toBe(t);
  });
  it('U-TXT-24 자를 자리 뒤(2,000)의 영폭 공백 → 자름(747)', () => {
    const t = withAt(ascii4000, 2000, '​');
    const got = p.fit(t, 747);
    expect(got.length).toBe(747);
    expect(got).toBe(t.slice(0, 747));
  });
  it('U-TXT-25 빈 글 → 빈 글', () => {
    expect(p.fit('', 747)).toBe('');
  });
  it('U-TXT-26 한글 음절 4,000자 → 앞 747자', () => {
    const t = Array.from({ length: 4000 }, (_, i) => String.fromCharCode(0xac00 + (i * 37) % 11172)).join('');
    const got = p.fit(t, 747);
    expect(got.length).toBe(747);
    expect(got).toBe(t.slice(0, 747));
  });
  it('U-TXT-27 줄바꿈 문자는 그대로 남김', () => {
    const t = ('첫줄\n' + '가나다라마바사 '.repeat(20) + '\n').repeat(30).slice(0, 4000);
    expect(t.length).toBe(4000);
    const got = p.fit(t, 715);
    expect(got).toBe(t.slice(0, 715));
    expect(got.includes('\n')).toBe(true);
    expect(got.startsWith('첫줄\n')).toBe(true);
  });

  // U-TXT-28 의 생성기와 성질 판정 — 자기시험(아래)이 같은 판정을 일부러 틀린 자르기에 건다.
  const pieces = ['a', 'l', '.', ' ', '가', '한', '😀', '👍', 'é', '́', '​', '‍', '‮', '️', '\n', 'ᅡ'];
  // 영폭 글자는 드물게(그래야 자르는 길도 많이 밟힘)
  const weights = [30, 10, 10, 10, 20, 10, 3, 3, 0.02, 0.005, 0.005, 0.005, 0.005, 0.005, 2, 0.005];
  const totalW = weights.reduce((a, b) => a + b, 0);
  const pick = (r: () => number) => {
    let x = r() * totalW;
    for (let i = 0; i < pieces.length; i++) { x -= weights[i]!; if (x <= 0) return pieces[i]!; }
    return pieces[0]!;
  };
  /** 성질 ①~④ 를 어긴 수를 센다(던지지 않음). */
  function propertyViolations(fit: (t: string, limit: number) => string, seeds: number[], perSeed: number) {
    let bad = 0, cut = 0, full = 0, n = 0;
    for (const seed of seeds) {
      const r = mulberry32(seed);
      for (let i = 0; i < perSeed; i++) {
        const targetLen = Math.floor(r() * 6001);
        let t = '';
        while (t.length < targetLen) t += pick(r);
        const limit = 1 + Math.floor(r() * 2000);
        const got = fit(t, limit);
        let ok = t.startsWith(got);                                                          // ① 원문 앞부분
        if (got !== t) { cut++; if (ZW_ORACLE.test(t.slice(0, got.length + 1))) ok = false; } // ② 폭 없는 글자 앞에서 자르지 않음
        else if (t.length > limit) full++;
        if (got.length > 0 && isHighSurrogate(got.charCodeAt(got.length - 1))) ok = false;  // ③ 짝 잃은 앞쪽 서로게이트 아님
        // ④ 길이 ≤ 상한 + 1 — 자른 결과에만 건다. 폭 없는 글자 때문에 전문을 돌려준 결과는 U-TXT-19~23 이 요구하는 것이라
        //    여기서 막으면 두 경우가 부딪힌다(NOTES 「정한 것」, 로그 WARN 경우변경).
        if (got !== t && got.length > limit + 1) ok = false;
        if (!ok) bad++;
        n++;
      }
    }
    return { bad, cut, full, n };
  }

  it('U-TXT-28 성질 무작위 — 씨앗 8 × 2,000(ASCII·한글·이모지·결합 부호·영폭 섞음, 길이 0~6,000, 상한 1~2,000)', () => {
    const r = propertyViolations((t, k) => p.fit(t, k), SEEDS, 2000);
    expect(r.n).toBe(16000);
    expect(r.bad).toBe(0);
    // 두 길(자름 · 폭 없는 글자 때문에 전문)을 다 밟았는지
    expect(r.cut).toBeGreaterThan(1000);
    expect(r.full).toBeGreaterThan(100);
  });

  it('U-TXT-28 자기시험 — 그냥 slice 로 자르는 가짜 구현이면 같은 판정이 빨개짐', () => {
    const naive = propertyViolations((t, k) => (t.length <= k ? t : t.slice(0, k)), SEEDS, 2000);
    expect(naive.bad).toBeGreaterThan(0);
  });

  it('U-TXT-29 단조성 — 폭↑·보이는 폭↑ 이면 줄지 않고, 글꼴↑ 이면 늘지 않음(씨앗 8 × 200)', () => {
    for (const seed of SEEDS) {
      const r = mulberry32(seed);
      for (let i = 0; i < 200; i++) {
        const wrap = r() < 0.5 ? null : between(r, 20, 200);
        const s = spec(
          { columnWidth: between(r, 40, 3000), viewportWidth: between(r, 300, 4000), wrapRowHeight: wrap },
          { fontPx: between(r, 10, 20) },
        );
        const k = p.limit(s);
        expect(p.limit({ ...s, columnWidth: s.columnWidth + between(r, 0, 500) })).toBeGreaterThanOrEqual(k);
        expect(p.limit({ ...s, viewportWidth: s.viewportWidth + between(r, 0, 500) })).toBeGreaterThanOrEqual(k);
        expect(p.limit({ ...s, metrics: { ...s.metrics, fontPx: s.metrics.fontPx + between(r, 0, 6) } })).toBeLessThanOrEqual(k);
      }
    }
  });

  it('U-TXT-30 200~260자 글 1,000개는 S180 에서 한 글자도 안 바뀜', () => {
    const r = mulberry32(30);
    const k = p.limit(S180);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz 가나다라마바사아자차카타파하0123456789.,';
    for (let i = 0; i < 1000; i++) {
      const len = 200 + Math.floor(r() * 61);
      let t = '';
      for (let j = 0; j < len; j++) t += alphabet[Math.floor(r() * alphabet.length)];
      expect(p.fit(t, k)).toBe(t);
    }
  });
});

describe('CellTextPolicy — 생성자 인자·이상 입력 (R1 덤)', () => {
  it('생성자 인자 minGlyphEm·headroom·slack 이 식에 들어감', () => {
    const q = new CellTextPolicy({ minGlyphEm: 0.25, headroom: 3, slack: 10 });
    // g = 3.25, W* = max(164×3, 1900) = 1900 → ceil(584.6)+10 = 595
    expect(q.limit(S180)).toBe(595);
    expect(q.coverWidth(595, S180)).toBeCloseTo((595 - 10) * 3.25 + 16, 6);
  });
  it('글꼴 px 가 0·NaN 이면 자르지 않음(Infinity) — 나눗셈 0 으로 0자 칸을 만들지 않음', () => {
    expect(p.limit(spec({}, { fontPx: 0 }))).toBe(Infinity);
    expect(p.limit(spec({}, { fontPx: NaN }))).toBe(Infinity);
    expect(p.limit(spec({ wrapRowHeight: 72 }, { lineHeightPx: 0 }))).toBe(Infinity);
  });
  it('컬럼이 안쪽 여백보다 좁아도 한 줄 상한은 보이는 폭 기준', () => {
    expect(p.limit(spec({ columnWidth: 10 }))).toBe(747);
  });
  it('fit 의 상한이 1 보다 작아도 빈 글을 만들지 않음', () => {
    expect(p.fit('abc', 0)).toBe('a');
  });
});
