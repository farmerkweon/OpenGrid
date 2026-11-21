// ============================================================
// 세로 보이는 높이 판정 — 컨테이너 높이가 정해졌나, 내용이 높이를 정하나 / Viewport height judge
// 기본 높이 '100%' 인 그리드를 높이가 없는 부모에 넣으면, 컨테이너가 내용만큼 부풀어 「보이는 높이 = 전 행 높이」가 되고
// 세로 가상 스크롤이 전 행을 그리다 멈춘다. 이 객체는 숫자 표본만 보고 그 상태를 알아낸다:
// 본문 상자가 배치돼 있고 · 스크롤할 것이 없고 · 컨테이너 높이 == 머리글류 + 푸터 + 전체 내용 + 가로 스크롤바(±2px) ·
// 내용이 화면에 보이는 구간보다 길면 「내용이 높이를 정함」이다. 그때는 컨테이너 높이를 자르지 않고
// 페이지에 실제로 보이는 구간(앞뒤 여유 포함)만 세로 창에 쓰라고 잘림(clip)을 낸다 — 화면 배치는 그대로, 그리는 행만 준다.
// 옵트인 안전장치(fallbackViewportHeight)를 준 사용자에게는 지금의 클램프를 그대로, 높이가 정해진 그리드에는 지금 값을 그대로 낸다.
// 가로 스크롤바 몫을 따로 받는 까닭: 컬럼이 많으면 본문 상자에 가로 스크롤바가 생겨 컨테이너가 그만큼 더 부푸는데,
// 운영체제·브라우저마다 두께가 다르다(스크롤바를 숨긴 헤드리스 브라우저에서는 0).
//
// Decides from a numeric sample whether the container height is fixed or driven by content (a
// height:100% grid inside a parent without height). Content-driven means: the body box has layout,
// nothing scrolls, container height equals chrome + content + horizontal scrollbar (±2px), and the
// content is taller than the visible part of the page. Then it returns a clip (visible part plus
// overscan) instead of clamping the container, so layout stays and only visible rows are drawn.
// Opt-in fallbackViewportHeight users keep today's clamp; fixed-height grids keep today's value.
// ============================================================
import type { IViewportHeightJudge, ViewportSample, ViewportVerdict } from './geometryPorts.js';

export interface ViewportHeightJudgeOptions {
  /** 보이는 구간 앞뒤로 더 그릴 높이 px(기본 200). / Extra px drawn above and below the visible part. */
  overscanPx?: number;
}

/** 컨테이너 높이 맞대기 허용 오차(테두리 1~2px). / Tolerance for container-height equality (borders). */
const TOLERANCE_PX = 2;

const finite = (n: number) => Number.isFinite(n);

/**
 * 컨테이너 높이가 정해졌는지·내용이 높이를 정하는지 판정하고 세로 창에 쓸 높이·잘림을 내는 유일한 곳.
 * 상태가 없다(표본만 읽고 고치지 않음).
 * 불변: 높이가 정해진 컨테이너엔 지금과 같은 값 · 옵트인 사용자엔 지금 클램프 값 · 배치 높이 0(jsdom)엔 bounded ·
 * 이상한 표본엔 bounded · clip ⊂ [0, 전체 내용 높이].
 *
 * Sole owner of the viewport-height verdict. Stateless; never mutates the sample.
 */
export class ViewportHeightJudge implements IViewportHeightJudge {
  private readonly _overscan: number;

  constructor(opts?: ViewportHeightJudgeOptions) {
    this._overscan = opts?.overscanPx ?? 200;
  }

  judge(sample: ViewportSample): ViewportVerdict {
    const { containerH, chromeH, contentH } = sample;
    // 높이를 셈할 수 없는 표본(숨은 컨테이너·떼어 낸 그리드 등) — 지금 코드는 컨테이너 높이가 없으면 아무것도 하지 않는다.
    if (!(containerH > 0) || !finite(containerH) || !finite(chromeH) || !finite(contentH) || contentH < 0) {
      return { kind: 'bounded', viewportH: 0 };
    }
    // 지금 식: 컨테이너 − (머리글 + 페이지 나누기). 푸터는 빼지 않는다(지금 동작).
    const legacyH = containerH - chromeH;

    // 옵트인 안전장치를 준 사용자는 지금 동작 그대로(내용이 다 들어가는 「부푼」 상태일 때만 폴백 높이로 자름).
    const fallback = sample.fallbackViewportHeight;
    if (fallback !== undefined && fallback > 0) {
      return legacyH >= contentH && legacyH > fallback
        ? { kind: 'legacyClamp', viewportH: fallback }
        : { kind: 'bounded', viewportH: legacyH };
    }

    if (!sample.pageVirtualization || !this._isContentDriven(sample)) {
      return { kind: 'bounded', viewportH: legacyH };
    }
    return this._clip(sample);
  }

  /** 「내용이 높이를 정함」 조건. 표본 값이 이상하면 false(지금 동작 쪽). / Content-driven test; odd samples give false. */
  private _isContentDriven(s: ViewportSample): boolean {
    const { bodyLayoutH, bodyTop, visibleTop, visibleBottom, hScrollbarH } = s;
    if (!(bodyLayoutH > 0) || !finite(bodyLayoutH)) return false;   // 배치 없음(jsdom 등)
    if (!finite(bodyTop) || !finite(visibleTop) || !finite(visibleBottom) || visibleBottom < visibleTop) return false;
    if (!(hScrollbarH >= 0) || !finite(hScrollbarH)) return false;
    if (!(s.footerH >= 0) || !finite(s.footerH)) return false;
    if (s.bodyScrollable) return false;                               // 본문이 스스로 스크롤함 = 높이 정해짐
    if (Math.abs(s.containerH - (s.chromeH + s.footerH + s.contentH + hScrollbarH)) > TOLERANCE_PX) return false;
    return s.contentH > visibleBottom - visibleTop;                   // 화면보다 짧은 그리드는 지금 그대로
  }

  /**
   * 보이는 구간을 본문 좌표로 옮겨 내용 범위로 자르고 앞뒤 여유를 더한다.
   * 그리드가 화면 아래에 있으면 맨 위 여유만큼, 이미 지나쳤으면 맨 끝 여유만큼을 낸다(빈 구간을 내지 않음).
   *
   * Visible part in body coordinates, clamped to content, plus overscan. Below the screen: the
   * first overscan px; scrolled past: the last overscan px.
   */
  private _clip(s: ViewportSample): ViewportVerdict {
    const content = s.contentH;
    const pad = this._overscan;
    const visStart = s.visibleTop - s.bodyTop;
    const visEnd = s.visibleBottom - s.bodyTop;
    let top: number;
    let bottom: number;
    if (visEnd <= 0) {
      top = 0;
      bottom = Math.min(pad, content);
    } else if (visStart >= content) {
      top = Math.max(0, content - pad);
      bottom = content;
    } else {
      top = Math.max(0, visStart - pad);
      bottom = Math.min(content, visEnd + pad);
    }
    return { kind: 'contentDriven', viewportH: bottom - top, clipTop: top, clipBottom: bottom };
  }
}
