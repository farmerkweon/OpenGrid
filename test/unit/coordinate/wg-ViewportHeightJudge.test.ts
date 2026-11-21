// @vitest-environment node
// 넓은 그리드 새 그물 — ViewportHeightJudge 단위 시험(테스트 설계서 §2-6 U-VHJ-01~14, §14 U-VHJ-15, 걸음 R1).
//
// 기본 표본 B: containerH 1040, chromeH 40, contentH 3,200,000(10만×32), bodyLayoutH 1000, bodyTop 100,
// visible [0, 1080], bodyScrollable true, pageVirtualization true. 기본 여유 overscanPx 200.
// 대조군 = test/unit/wg-helpers/legacy-controls.ts 의 legacyViewportHeight(RenderController.syncHeaderLayout 클램프 식 사본).
// 표본의 chromeH 를 옛 식의 머리글 높이 자리에 넣는다(페이지 나누기 0) — 옛 식 값 = containerH − chromeH.
// clip 은 판정기가 여유를 넣은 값(설계 Q-14 답 — TR-10 의 「여유는 VS 몫」 가정은 취소됨).
import { describe, it, expect } from 'vitest';
import { ViewportHeightJudge } from '../../../src/core/coordinate/ViewportHeightJudge.js';
import type { ViewportSample, ViewportVerdict } from '../../../src/core/coordinate/geometryPorts.js';
import { legacyViewportHeight } from '../wg-helpers/legacy-controls.js';

const CONTENT = 3_200_000;
const B: ViewportSample = {
  containerH: 1040, chromeH: 40, footerH: 0, contentH: CONTENT, bodyLayoutH: 1000, bodyTop: 100,
  visibleTop: 0, visibleBottom: 1080, bodyScrollable: true, hScrollbarH: 0, pageVirtualization: true,
};
/** U-VHJ-02 의 「내용이 높이를 정함」 표본. */
const D02: ViewportSample = { ...B, containerH: CONTENT + 40, bodyLayoutH: CONTENT, bodyScrollable: false };

/** 옛 식이 같은 표본에 내는 뷰포트 높이. */
function legacyVp(s: ViewportSample): number {
  const r = legacyViewportHeight({
    containerHeight: s.containerH, measuredHeaderHeight: s.chromeH, headerHeight: s.chromeH, pagination: false,
    ...(s.fallbackViewportHeight !== undefined ? { fallbackViewportHeight: s.fallbackViewportHeight } : {}),
    totalContentHeight: s.contentH,
  });
  if (!r) throw new Error('legacy early return');
  return r.viewportHeight;
}

const j = new ViewportHeightJudge();
const clipOf = (v: ViewportVerdict) => {
  if (v.kind !== 'contentDriven') throw new Error(`not contentDriven: ${v.kind}`);
  return [v.clipTop, v.clipBottom] as const;
};

describe('ViewportHeightJudge — U-VHJ (R1)', () => {
  it('U-VHJ-01 높이 정해짐 → bounded, 옛 식 값(1000)', () => {
    const v = j.judge(B);
    expect(v).toEqual({ kind: 'bounded', viewportH: legacyVp(B) });
    expect(v.viewportH).toBe(1000);
  });

  it('U-VHJ-02 내용이 높이를 정함 → contentDriven, clip [0, 1,180], viewportH 1,180', () => {
    const v = j.judge(D02);
    expect(v).toEqual({ kind: 'contentDriven', viewportH: 1180, clipTop: 0, clipBottom: 1180 });
  });

  it('U-VHJ-03 페이지를 내림(bodyTop −50,000) → clip [49,800, 51,280]', () => {
    const v = j.judge({ ...D02, bodyTop: -50_000 });
    expect(clipOf(v)).toEqual([49_800, 51_280]);
    expect(v.viewportH).toBe(51_280 - 49_800);
  });

  it('U-VHJ-04 ±2px 안(chrome + content + 2) → contentDriven', () => {
    expect(j.judge({ ...D02, containerH: 40 + CONTENT + 2 }).kind).toBe('contentDriven');
    expect(j.judge({ ...D02, containerH: 40 + CONTENT - 2 }).kind).toBe('contentDriven');
  });

  it('U-VHJ-05 ±2px 밖(chrome + content + 3, 스크롤 없음) → bounded, 옛 식 값', () => {
    for (const d of [3, -3]) {
      const s = { ...D02, containerH: 40 + CONTENT + d };
      expect(j.judge(s)).toEqual({ kind: 'bounded', viewportH: legacyVp(s) });
    }
  });

  it('U-VHJ-06 작은 그리드(20행 640, 컨테이너 680, 보이는 구간 1,080) → bounded(내용 ≤ 보이는 구간)', () => {
    const s: ViewportSample = { ...B, contentH: 640, containerH: 680, bodyLayoutH: 640, bodyScrollable: false };
    expect(j.judge(s)).toEqual({ kind: 'bounded', viewportH: legacyVp(s) });
  });

  it('U-VHJ-07 jsdom(본문 배치 높이 0) → bounded, 옛 식 값(viewport-safety (b): 전 행)', () => {
    // viewport-safety (b) 처럼 컨테이너가 머리글 + 전 내용만큼 부푼 상태
    const s: ViewportSample = { ...D02, bodyLayoutH: 0, visibleTop: 0, visibleBottom: 0, bodyTop: 0 };
    const v = j.judge(s);
    expect(v).toEqual({ kind: 'bounded', viewportH: legacyVp(s) });
    expect(v.viewportH).toBe(CONTENT);
  });

  it('U-VHJ-07 덤 — viewport-safety (a)(c)(d) 의 옵트인 값도 jsdom 표본에서 옛 식과 같음', () => {
    // (a) 언바운드 + 옵션 800 → 800 / (c) 바운드 646 컨테이너 → 606 / (d) 소량 5행, 컨테이너 406 → 366
    const a: ViewportSample = { ...D02, bodyLayoutH: 0, fallbackViewportHeight: 800 };
    expect(j.judge(a)).toEqual({ kind: 'legacyClamp', viewportH: 800 });
    const c: ViewportSample = { ...B, containerH: 646, bodyLayoutH: 0, fallbackViewportHeight: 800 };
    expect(j.judge(c)).toEqual({ kind: 'bounded', viewportH: legacyVp(c) });
    expect(j.judge(c).viewportH).toBe(606);
    const d: ViewportSample = { ...B, containerH: 406, contentH: 5 * 32, bodyLayoutH: 0, fallbackViewportHeight: 800 };
    expect(j.judge(d)).toEqual({ kind: 'bounded', viewportH: legacyVp(d) });
    expect(j.judge(d).viewportH).toBe(366);
  });

  it('U-VHJ-08 옵트인 클램프(02 + fallback 500) → legacyClamp 500, 옛 식 대조', () => {
    const s = { ...D02, fallbackViewportHeight: 500 };
    expect(j.judge(s)).toEqual({ kind: 'legacyClamp', viewportH: 500 });
    expect(legacyVp(s)).toBe(500);
  });

  it('U-VHJ-09 옵트인인데 높이 정해짐(B + fallback 500) → 옛 식 값 그대로(1000)', () => {
    const s = { ...B, fallbackViewportHeight: 500 };
    const v = j.judge(s);
    expect(v.viewportH).toBe(legacyVp(s));
    expect(v).toEqual({ kind: 'bounded', viewportH: 1000 });
  });

  it('U-VHJ-10 끄는 스위치(02 + pageVirtualization:false) → bounded, 옛 식 값(= 전 행)', () => {
    const s = { ...D02, pageVirtualization: false };
    expect(j.judge(s)).toEqual({ kind: 'bounded', viewportH: legacyVp(s) });
    expect(j.judge(s).viewportH).toBe(CONTENT);
  });

  it('U-VHJ-11 그리드가 화면 아래(bodyTop 2,000) → contentDriven, clip [0, 200]', () => {
    const v = j.judge({ ...D02, bodyTop: 2000 });
    expect(clipOf(v)).toEqual([0, 200]);
    expect(v.viewportH).toBe(200);
  });

  it('U-VHJ-12 그리드를 지나침(bodyTop −3,300,000) → contentDriven, clip 이 내용 끝에 붙고 clipBottom ≤ contentH', () => {
    const v = j.judge({ ...D02, bodyTop: -3_300_000 });
    const [top, bottom] = clipOf(v);
    expect(bottom).toBeLessThanOrEqual(CONTENT);
    expect(bottom).toBe(CONTENT);
    expect(top).toBe(CONTENT - 200);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it('U-VHJ-13 이상한 표본(NaN·음수·높이 0) → bounded, 던지지 않음', () => {
    const odd: ViewportSample[] = [
      { ...D02, containerH: NaN },
      { ...D02, bodyLayoutH: -5 },
      { ...D02, containerH: 0 },
      { ...D02, containerH: -10 },
      { ...D02, contentH: NaN },
      { ...D02, chromeH: NaN },
      { ...D02, bodyTop: NaN },
      { ...D02, visibleBottom: NaN },
      { ...D02, hScrollbarH: NaN },
      { ...D02, hScrollbarH: -17 },
      { ...D02, footerH: NaN },
      { ...D02, footerH: -1 },
      { ...D02, bodyLayoutH: Infinity },
      { ...D02, visibleTop: 500, visibleBottom: 100 },   // 거꾸로 된 보이는 구간
    ];
    for (const s of odd) {
      let v: ViewportVerdict | undefined;
      expect(() => { v = j.judge(s); }).not.toThrow();
      expect(v!.kind).toBe('bounded');
      expect(Number.isFinite(v!.viewportH)).toBe(true);
    }
    // 본문 배치 높이만 이상하면 높이는 옛 식 값(지금처럼)
    expect(j.judge({ ...D02, bodyLayoutH: -5 }).viewportH).toBe(legacyVp(D02));
  });

  it('U-VHJ-14 순수 함수 — 같은 표본 두 번 같은 결과, 얼린 표본도 안 고치고 안 던짐, 두 판정기가 서로 영향 없음', () => {
    const frozen = Object.freeze({ ...D02, bodyTop: -50_000 });
    const before = JSON.stringify(frozen);
    const a = j.judge(frozen);
    const b = j.judge(frozen);
    expect(a).toEqual(b);
    expect(JSON.stringify(frozen)).toBe(before);
    const other = new ViewportHeightJudge();
    other.judge(B);
    expect(j.judge(frozen)).toEqual(a);
  });

  it('U-VHJ-15 가로 스크롤바 몫(17px) — chrome + content + 17 이면 contentDriven, 스크롤바 몫을 0 으로 주면 bounded 로 빗나감', () => {
    const withBar = { ...D02, containerH: 40 + CONTENT + 17, hScrollbarH: 17 };
    expect(j.judge(withBar).kind).toBe('contentDriven');
    expect(clipOf(j.judge(withBar))).toEqual([0, 1180]);
    // 대조: 같은 컨테이너인데 스크롤바 몫을 모르면 ±2 밖이라 bounded
    expect(j.judge({ ...withBar, hScrollbarH: 0 }).kind).toBe('bounded');
  });

  it('U-VHJ-15 덤 — 헤드리스 측정 범위: 스크롤바 숨김(0px) · 스크롤바 켠 헤드리스(8px, T0 L20 실측)', () => {
    // Playwright 헤드리스는 --hide-scrollbars 로 떠서 스크롤바 몫 0 — 컨테이너도 0 만큼만 부풂
    expect(j.judge({ ...D02, hScrollbarH: 0 }).kind).toBe('contentDriven');
    // 스크롤바를 켠 헤드리스(8px)
    const eight = { ...D02, containerH: 40 + CONTENT + 8, hScrollbarH: 8 };
    expect(j.judge(eight).kind).toBe('contentDriven');
    // 8px 몫을 빼먹으면 빗나감(±2 밖)
    expect(j.judge({ ...eight, hScrollbarH: 0 }).kind).toBe('bounded');
    // 스크롤바 몫이 있어도 본문이 스크롤되면(높이 정해짐) bounded
    expect(j.judge({ ...eight, bodyScrollable: true }).kind).toBe('bounded');
  });

  // 계약 v3(ViewportSample.footerH — chromeH 는 푸터를 뺌)에 맞춰 더함(R3 검토 반영 때, VP 요청).
  it('(덤) 푸터 높이 — 「내용이 높이를 정함」 등식에만 들고, 높이 정해진 값(containerH − chromeH)에는 안 듦', () => {
    const withFooter = { ...D02, footerH: 32, containerH: 40 + 32 + CONTENT };
    expect(j.judge(withFooter).kind).toBe('contentDriven');
    expect(clipOf(j.judge(withFooter))).toEqual([0, 1180]);
    // 푸터 몫을 모르면(0) ±2 밖이라 bounded
    expect(j.judge({ ...withFooter, footerH: 0 }).kind).toBe('bounded');
    // 높이가 정해진 그리드: 푸터가 있어도 값은 옛 식(컨테이너 − 머리글)
    const fixed = { ...B, footerH: 32 };
    expect(j.judge(fixed)).toEqual({ kind: 'bounded', viewportH: legacyVp(fixed) });
    expect(j.judge(fixed).viewportH).toBe(1000);
  });

  it('(덤) 여유 생성자 인자 — overscanPx 64 면 02 의 clip [0, 1,044]', () => {
    const k = new ViewportHeightJudge({ overscanPx: 64 });
    expect(clipOf(k.judge(D02))).toEqual([0, 1044]);
  });

  it('(덤) 성질 — 씨앗 8 × 200 무작위 bodyTop·보이는 구간: clip ⊂ [0, contentH], top ≤ bottom, viewportH = bottom − top, 보이는 부분 ⊂ clip', () => {
    let seed = 1;
    for (let s = 1; s <= 8; s++) {
      let a = s >>> 0;
      const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      for (let i = 0; i < 200; i++) {
        const visTop = Math.round(r() * 300);
        const sample: ViewportSample = {
          ...D02, bodyTop: Math.round(r() * 3_600_000 - 3_400_000),
          visibleTop: visTop, visibleBottom: visTop + 200 + Math.round(r() * 1500),
        };
        const v = j.judge(sample);
        const [top, bottom] = clipOf(v);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(bottom).toBeLessThanOrEqual(CONTENT);
        expect(top).toBeLessThanOrEqual(bottom);
        expect(v.viewportH).toBe(bottom - top);
        const vs = Math.max(0, sample.visibleTop - sample.bodyTop);
        const ve = Math.min(CONTENT, sample.visibleBottom - sample.bodyTop);
        if (vs < ve) { expect(top).toBeLessThanOrEqual(vs); expect(bottom).toBeGreaterThanOrEqual(ve); }
        seed++;
      }
    }
    expect(seed).toBe(1601);
  });
});
