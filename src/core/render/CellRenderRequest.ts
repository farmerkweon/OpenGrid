// ============================================================
// DD-03 렌더 파이프라인 — 계약 타입 정본 / DD-03 render pipeline — contract types
// 설계: DD-03 §2 (MARTIN, 교차구현 YOURDON). 헤드리스·순수(DOM 접근 0).
// 이 파일은 파이프라인 입력(CellRenderRequest)·단계 SPI(ICellStage)·값 렌더러 SPI
// (ICellRenderer)·페인트 지시(StagePaint/PaintAccumulator) 계약을 소유한다.
//   * CellRect  = DD-02 소유 → import(재선언 금지, 소비만).
//   * Delta     = DD-01 소유 → import.
//   * RuleVerdict/ValidationVerdict = DD-05(FOWLER) 소유 예정 → 미구현이므로 구조적 최소 계약을
//     ★임시 정의(PROVISIONAL). DD-05 착지 시 아래 블록을 `import type … from '../cf'` 로 교체.
//   * AppearanceResolver = DD-11 소유 → import(형태 값 질의 초크포인트).
// ============================================================

import type { CellRect } from '../coordinate/index.js';
import type { Delta } from '../domain/Delta.js';
import type { AppearanceResolver } from '../AppearanceResolver.js';
import type { ColumnDef } from '../types.js';

// ── Disposable(경량) — 등록 해제 토큰. TS 전역 Disposable(Symbol.dispose)과 별개의 얇은 계약. ──
/** 등록 해제 토큰. / A registration-disposal token. */
export interface Disposable {
  dispose(): void;
}

// ── ★PROVISIONAL(DD-05 미구현) — RuleVerdict/ValidationVerdict 구조적 최소 계약 ────────────
// DD-05(조건부서식, FOWLER)이 착지하면 이 두 블록을 삭제하고 `import type { RuleVerdict } from '../cf'`
// 로 교체한다(§R 중복소유권 정리). 파이프라인은 판정을 '적용'만 하므로 소비 형상만 필요하다.
/** DD-05 조건부서식 규칙 판정(임시 최소형). 배경/데코 단계가 페인트로 옮긴다. */
export interface RuleVerdict {
  /** 판정이 겨냥하는 시각 채널. / Visual channel the verdict targets. */
  readonly kind: 'background' | 'text' | 'databar' | 'icon' | 'marker';
  /** 색(배경/텍스트/아이콘). / Color (background/text/icon). */
  readonly color?: string;
  /** 데이터바 채움 비율 0..1(클램프 고지는 상류 소유). / Data-bar fill ratio 0..1. */
  readonly ratio?: number;
  /** 아이콘 role/key. / Icon role/key. */
  readonly icon?: string;
  /** Stop-If-True 승자 표식(병합은 DD-05 상류 확정). / Stop-If-True winner marker. */
  readonly stopIfTrue?: boolean;
}
/** DD-05/T5-810 검증 판정(임시 최소형) — 데코 단계 마커. */
export interface ValidationVerdict {
  /** 검증 통과 여부. / Whether validation passed. */
  readonly ok: boolean;
  /** 검증기 식별자. / Validator identifier. */
  readonly validatorId: string;
  /** 실패 메시지(로케일 인지, 접근성 쌍둥이). / Failure message. */
  readonly message?: string;
}
// ── /PROVISIONAL ──────────────────────────────────────────────────────────────────────────

/**
 * 상류 서브시스템(DD-04/05/08)이 이미 평가해 넣는 판정. 파이프라인은 '적용'만(평가 로직 0).
 * / Upstream verdicts already evaluated by DD-04/05/08; the pipeline only applies them.
 */
export interface CellVerdicts {
  /** DD-05 조건부서식 판정 — 배열 순서대로 적용만(승자 병합은 상류 확정). / CF verdicts, applied in order. */
  readonly cf?: readonly RuleVerdict[];
  /** DD-05/T5-810 검증 판정 — 데코 단계 마커. / Validation verdict — decorator marker. */
  readonly validation?: ValidationVerdict | null;
  /** DD-01 Delta 값 객체(T5-813) — 값/데코 단계 부호·방향·크기. / DD-01 Delta value object. */
  readonly delta?: Delta | null;
  /** DD-04 표시 문자열(displayFormatter 결과) — 값 단계 소비. null=기본 포맷 폴백. / DD-04 display string. */
  readonly display?: string | null;
}

/**
 * 파이프라인 입력(읽기 전용 투영). 모든 필드 readonly = 순수성·결정론 보증(불변식 §1.2).
 * 파이프라인은 자기 좌표를 계산하지 않는다 — DD-02 rect + 상류 판정을 주입받는다.
 * / Pipeline input (read-only projection). All fields readonly → purity & determinism.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface CellRenderRequest<T = any> {
  /** flat 행 인덱스(DD-02 model→view 확정치). / Flat row index. */
  readonly ri: number;
  /** 리프 컬럼 인덱스. / Leaf column index. */
  readonly ci: number;
  /** DD-02 계산 사각형(merge span·frozen 반영 완료). / DD-02 rect (merge/frozen applied). */
  readonly rect: CellRect;
  /** 원시 값(DD-01 3계층 중 raw). / Raw value. */
  readonly value: unknown;
  /** 행 데이터. / Row data. */
  readonly row: T;
  /** 컬럼 정의. / Column definition. */
  readonly column: ColumnDef<T>;
  /** 행 변경 상태. / Row mutation state. */
  readonly rowState: 'none' | 'added' | 'edited' | 'removed';
  /** 선택 여부. / Selected. */
  readonly isSelected: boolean;
  /** 포커스 여부. / Focused. */
  readonly isFocused: boolean;
  /** 편집 가능 여부. / Editable. */
  readonly isEditable: boolean;
  /** merge 스팬(없으면 null). / Merge span (null if none). */
  readonly merge: { readonly rowSpan: number; readonly colSpan: number; readonly hidden: boolean } | null;
  /** 상류 판정(있을 때만). / Upstream verdicts (when present). */
  readonly verdicts?: CellVerdicts;
  /** 형태 값 질의 초크포인트(DD-11). / Shape-value chokepoint (DD-11). */
  readonly appearance: AppearanceResolver;
  /** i18n 로케일 해석기. / i18n locale resolver. */
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

// ── 단계 SPI ────────────────────────────────────────────────
/** 4레인 식별. / The four lane identifiers. */
export type StageKind = 'background' | 'value' | 'decorator' | 'overlay';

/**
 * 단계 계약(Stage SPI, 순수 변환). DOM 을 만들지 않고 페인트 지시(StagePaint)만 반환.
 * / Stage SPI (pure transform). Returns paint instructions only; never touches DOM.
 */
export interface ICellStage {
  /** 등록 식별자(중복 거부 — 우회 금지, REQ-T6-823). / Registration id (dedup-rejected). */
  readonly id: string;
  /** 어느 레인에 기여하는가. / Which lane this contributes to. */
  readonly kind: StageKind;
  /** 같은 레인 내 정렬(작을수록 먼저). 미지정=100. / Order within lane (lower first). Default 100. */
  readonly order?: number;
  /** O(1) 게이트 — false 면 contribute 미호출(제로코스트). / O(1) gate — no contribute when false. */
  appliesTo(req: CellRenderRequest): boolean;
  /** 순수 변환: 외부 상태 읽기/쓰기·DOM 접근 0. null=기여 없음. acc=앞 레인 누적(읽기전용). / Pure transform. */
  contribute(req: CellRenderRequest, acc: Readonly<PaintAccumulator>): StagePaint | null;
}

/**
 * 값 렌더러 SPI(값 레인). DOM 을 만들지 않고 값 노드 '팩토리'만 반환 = 순수·헤드리스 테스트가능.
 * DD-10 §2.5 는 이를 import 해 `extends IExtension` 만 부여(정본 소유 = DD-03).
 * / Value renderer SPI (value lane). Returns a node factory, not DOM — pure & headless-testable.
 *
 * @typeParam T - 행 데이터 타입 / Row data type
 */
export interface ICellRenderer<T = any> {
  /** 등록 식별자(레거시 renderer type 과 동일 키공간). / Registration id (shares legacy renderer keyspace). */
  readonly type: string;
  /** CellView=CellRenderRequest, RenderOutput=()=>Node 정합. null=기여 없음. / Returns a node factory or null. */
  render(req: CellRenderRequest<T>): (() => Node) | null;
}

// ── 페인트 지시(DOM 아님, 순수 데이터) ──────────────────────
/** 배경 레이어 역할. / Background layer role. */
export type BgRole = 'base' | 'zebra' | 'state' | 'selection' | 'databar' | 'heatmap' | 'texture';
/** 배경 레이어(데이터바·히트맵·텍스처 등). z 는 배경 팬 내부 상대순서. / Background layer. */
export interface BgLayer {
  readonly fill: string;
  readonly z: number;
  readonly role: BgRole;
}

/** 절대배치 자식 팩토리(데코/값 노드). Applier 가 호출해 DOM 물질화. / Absolutely-placed child factory. */
export interface PaintNode {
  readonly build: () => Node;
  readonly z: number;
  readonly role: string;
}

/** 오버레이 역할(z 는 compositor 가 role→rank 로 배정, 하드코딩 0). / Overlay role. */
export type OverlayRole =
  | 'databar-fill' | 'heatmap' | 'validation-marker'
  | 'selection' | 'range' | 'edit-border' | 'marching-ants' | 'annotation' | 'floating';

/** 오버레이 레이어 — z 는 compositor 가 role 로 배정(REQ-T5-806). / Overlay layer. */
export interface OverlayLayer {
  readonly role: OverlayRole;
  readonly build: () => Node;
  readonly ownsHit: boolean;
}

/** 단계 1개의 산출(병합적). 미지정 필드는 '기여 없음'. / A single stage's (mergeable) output. */
export interface StagePaint {
  /** 셀 컨테이너 배경 단일값(base/zebra/state). / Single container background. */
  readonly background?: string;
  /** 다중 배경(데이터바/히트맵/텍스처). / Multi-layer backgrounds. */
  readonly bgLayers?: readonly BgLayer[];
  /** 값 노드 팩토리(값 레인 전용, 단일). / Value node factory (value lane only). */
  readonly content?: () => Node;
  /** 데코 노드(코너폴드/마커/스파크). / Decorator nodes. */
  readonly decorations?: readonly PaintNode[];
  /** 오버레이(선택/포커스/마칭앤츠). / Overlays. */
  readonly overlays?: readonly OverlayLayer[];
  /** 컨테이너 스타일 기여(병합). / Container style contribution (merged). */
  readonly cellStyle?: Readonly<Record<string, string>>;
  /** 클래스 기여(병합). / Class contribution (merged). */
  readonly classes?: readonly string[];
  /** aria 기여(병합, 접근성 쌍둥이). / aria contribution (merged). */
  readonly aria?: Readonly<Record<string, string>>;
  /** 값 단계에 넘길 AA-safe 텍스트 색 힌트. / AA-safe text color hint for the value stage. */
  readonly contentColorHint?: string;
}

/** 단계 진단·계보 항목(T5-809 계보 조회 토대). / Stage trace entry. */
export interface StageTraceEntry {
  readonly stageId: string;
  readonly kind: StageKind;
  readonly contributed: boolean;
  readonly ms: number;
  /** 이 단계가 격리된 예외로 실패했는가. / Whether the stage failed via an isolated exception. */
  readonly failed?: boolean;
}

/**
 * 레인 간 합성 상태(읽기전용 전달). 값 단계가 배경 명도를 읽어 AA 텍스트색을 선택하는 이음새.
 * / Cross-lane composition state (passed read-only). The seam where the value stage reads background
 * luminance to pick an AA text color.
 */
export interface PaintAccumulator {
  /** 배경 레인 합성 결과(값 단계 대비계산 입력). / Composed background (contrast input for value stage). */
  readonly background: string | null;
  readonly bgLayers: readonly BgLayer[];
  readonly content: (() => Node) | null;
  readonly decorations: readonly PaintNode[];
  readonly overlays: readonly OverlayLayer[];
  readonly cellStyle: Readonly<Record<string, string>>;
  readonly classes: ReadonlySet<string>;
  readonly aria: Readonly<Record<string, string>>;
  /** AA-safe 텍스트 색 힌트(배경 명도 유도). / AA-safe text color hint (derived from background). */
  readonly contentColorHint?: string;
  /** 어느 단계가 무엇을 기여했나(결정론 스냅샷·계보). / Which stage contributed what. */
  readonly trace: readonly StageTraceEntry[];
}

/**
 * 렌더 인터셉터(before/after). 예산 안에서만 실행·계측(REQ-TX-889). 가시행 한정.
 * / Render interceptor (before/after). Runs within the budget; visible-rows only.
 */
export interface RenderInterceptor {
  readonly id: string;
  beforeRow?(ri: number): void;
  beforeCell?(req: CellRenderRequest): void;
  afterCell?(req: CellRenderRequest, el: HTMLElement): void;
  afterRow?(ri: number): void;
}

/**
 * buildRequest — DD-02 rect + 상류 판정을 CellRenderRequest 로 조립하는 경계 어댑터(§5).
 * 경계에서 1회만 조립하고 이후는 읽기 전용으로 흐른다(내부 좌표 재산술 금지, DD-02 §4.4).
 * / buildRequest — the boundary adapter that assembles a CellRenderRequest from a DD-02 rect and
 * upstream verdicts. Assembled once at the boundary; flows read-only thereafter.
 *
 * @param init - 조립 입력 / Assembly input
 * @returns 동결된 읽기 전용 요청 / A frozen read-only request
 */
export function buildRequest<T = any>(init: CellRenderRequest<T>): CellRenderRequest<T> {
  return Object.freeze({ ...init });
}
