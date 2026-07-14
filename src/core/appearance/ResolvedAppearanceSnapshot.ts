// ============================================================
// DD-11 §2.4 ResolvedAppearanceSnapshot + AppearanceSnapshotBridge — CSS→JS 스냅샷 브리지(비-DOM 표면용)
// / DD-11 §2.4 the CSS→JS snapshot bridge for non-DOM surfaces. Single owner = DD-11 (§R.2).
// ------------------------------------------------------------
// 설계 근거(Why, §2.4·불변식 4·REQ-T6-813):
//   캔버스/오프스크린은 CSS custom property 를 상속·조회할 수 없다 → 렌더 직전 **getComputedStyle
//   1회** 로 필요한 토큰·폰트 메트릭을 해소해 순수 JS 객체로 투영한다. setTheme/setSkin/setDensity/
//   setLocale 변경 시 무효화(dirty) → 다음 get() 이 재해소. 유일 경로 = 이 브리지(캔버스가 렌더
//   루프에서 CSS var 를 직접 조회하는 코드는 0).
//   **소유권(§R.2)**: 이 파일이 단일 정본. DD-03(스냅샷 파일 신설 취소)·DD-06(`ChartTheme` = 이
//   스냅샷 alias)은 여기 export 를 import·소비만 한다.
//   Bridge 는 Humble Object: DOM 조회(getComputedStyle)는 **주입된 resolve 함수** 안에만 있고,
//   브리지 자신은 캐시·무효화만 소유한다(헤드리스·테스트 가능). getComputedStyle 은 **그리드
//   컨테이너**에만 호출(호스트 오염 조회 금지, §7).
// ============================================================

import type { Appearance } from './Appearance.js';

/** 캔버스/오프스크린이 소비하는 해소된 외관값(색은 리터럴로 확정). / Resolved appearance for canvas (colors as literals). */
export interface ResolvedAppearanceSnapshot {
  /** 본문 잉크(전경). / Body ink (foreground). */
  readonly ink: string;
  /** 표면(배경). / Surface (background). */
  readonly surface: string;
  /** 보더/구획선 색. / Line/divider color. */
  readonly line: string;
  /** 강조(프라이머리). / Accent (primary). */
  readonly accent: string;
  /** 격자선. / Grid line. */
  readonly gridLine: string;
  /** 오버레이 스크림. / Overlay scrim. */
  readonly overlayScrim: string;
  /** 그림자 잉크(rgb 채널). / Shadow ink (rgb channels). */
  readonly shadowInk: string;
  /** 데이터색 램프(시리즈/히트맵 공유 키 기반). / Data-color ramp (shared key-based). */
  readonly seriesColors: readonly string[];
  /** 폰트 메트릭(캔버스 measureText 대체용 해소값). / Font metrics (resolved for canvas). */
  readonly font: { readonly family: string; readonly size: number; readonly lineHeight: number };
  /** 이 스냅샷을 만든 외관 + 로케일(무효화 키). / The appearance + locale that produced this (invalidation key). */
  readonly key: { readonly appearance: Appearance; readonly locale: string };
}

/** 스냅샷 해소 함수(DOM 조회를 격리하는 주입 지점). / Snapshot-resolve function (the injected DOM-read boundary). */
export type SnapshotResolveFn = () => ResolvedAppearanceSnapshot;

/**
 * AppearanceSnapshotBridge — 주입된 resolve 로 스냅샷을 만들고 무효화까지 캐시한다(Humble Object).
 * DOM 조회는 resolve 안에만 — 브리지는 순수 캐시·무효화 로직이라 결정론·테스트 가능.
 * / AppearanceSnapshotBridge — caches the snapshot from an injected resolve until invalidated.
 *
 * @example
 * const bridge = new AppearanceSnapshotBridge(() => snapshotFromComputedStyle(container, ctx));
 * bridge.get();        // 1회 해소 후 캐시
 * bridge.invalidate(); // 외관/로케일 변경 시
 * bridge.get();        // 재해소
 */
export class AppearanceSnapshotBridge {
  private _cache: ResolvedAppearanceSnapshot | null = null;

  constructor(private readonly _resolve: SnapshotResolveFn) {}

  /** 유효 스냅샷 반환(dirty/미캐시면 재계산 후 캐시). / Return a valid snapshot (recompute if dirty). */
  get(): ResolvedAppearanceSnapshot {
    if (this._cache === null) this._cache = this._resolve();
    return this._cache;
  }

  /** 무효화 — 외관/로케일 변경 시 호출. 다음 get() 이 재해소. / Invalidate; next get() re-resolves. */
  invalidate(): void {
    this._cache = null;
  }

  /** 현재 캐시가 유효한가(테스트/진단). / Whether a valid cache is present (test/diagnostics). */
  get isValid(): boolean {
    return this._cache !== null;
  }
}

/** 스냅샷 토큰 매핑(컨테이너 계산 스타일 → 스냅샷 필드). / Token map (container computed style → snapshot fields). */
export interface SnapshotTokenMap {
  readonly ink: string;
  readonly surface: string;
  readonly line: string;
  readonly accent: string;
  readonly gridLine: string;
  readonly overlayScrim: string;
  readonly shadowInk: string;
  readonly fontFamily: string;
  readonly fontSize: string;
}

/** 기본 토큰 매핑(현 og 토큰 이름). / Default token map (current og token names). */
export const DEFAULT_SNAPSHOT_TOKEN_MAP: SnapshotTokenMap = {
  ink: '--og-input-color',
  surface: '--og-row-bg',
  line: '--og-border-color',
  accent: '--og-primary',
  gridLine: '--og-border-color',
  overlayScrim: '--og-header-bg',
  shadowInk: '--og-shadow-ink',
  fontFamily: '--og-font-family',
  fontSize: '--og-font-size',
};

/**
 * snapshotFromComputedStyle — **유일한 DOM 조회 지점**: 컨테이너 계산 스타일 1회로 스냅샷 투영.
 * document/window 없으면(헤드리스) 폴백 스냅샷 반환(never-throw). getComputedStyle 은 컨테이너에만.
 * / snapshotFromComputedStyle — the single DOM-read site: one computed-style read → snapshot projection.
 *
 * @param container - 그리드 컨테이너(호스트 아님) / The grid container (not the host)
 * @param ctx - 외관/로케일 키 + seriesColors + 토큰 매핑(선택) / Appearance/locale key + series colors + token map
 * @returns 해소된 스냅샷 / A resolved snapshot
 */
export function snapshotFromComputedStyle(
  container: Element | null,
  ctx: {
    appearance: Appearance;
    locale: string;
    seriesColors?: readonly string[];
    map?: SnapshotTokenMap;
  },
): ResolvedAppearanceSnapshot {
  const map = ctx.map ?? DEFAULT_SNAPSHOT_TOKEN_MAP;
  const seriesColors = ctx.seriesColors ?? [];
  const key = { appearance: ctx.appearance, locale: ctx.locale };

  const canRead =
    container != null &&
    typeof window !== 'undefined' &&
    typeof window.getComputedStyle === 'function';

  if (!canRead) {
    // 헤드리스 폴백 — 빈 문자열 토큰(캔버스가 자체 기본색 사용). never-throw.
    return {
      ink: '', surface: '', line: '', accent: '', gridLine: '', overlayScrim: '', shadowInk: '',
      seriesColors, font: { family: '', size: 13, lineHeight: 1.4 }, key,
    };
  }

  const cs = window.getComputedStyle(container as Element);
  const read = (name: string): string => cs.getPropertyValue(name).trim();
  const sizePx = parseFloat(read(map.fontSize)) || 13;

  return {
    ink: read(map.ink),
    surface: read(map.surface),
    line: read(map.line),
    accent: read(map.accent),
    gridLine: read(map.gridLine),
    overlayScrim: read(map.overlayScrim),
    shadowInk: read(map.shadowInk),
    seriesColors,
    font: { family: read(map.fontFamily), size: sizePx, lineHeight: 1.4 },
    key,
  };
}
