// ============================================================
// DD-15 §2.1·2.2·2.4 Export·인쇄 끝단 계약 정본 — 값객체 + 포트(seam)
// / DD-15 export/print end-stage contracts — value objects + ports (seam).
// REQ: T3-803(충실도=화면 진실) · T3-804(매니페스트) · T3-805(전량 순회) · T9-810(스트리밍/백프레셔)
// ------------------------------------------------------------
// 끝단은 순수 변환기다: raw 를 재조회·재계산하지 않고 화면과 '동일 소스'의 아티팩트만 직렬화한다.
// CellArtifact.text = DD-04 DisplayFormatter.format(...) 동일 결과, cf = DD-05 CFEncoder VisualSpec 동일.
// 채널은 이 파일의 값객체 필드만 읽는다(raw 접근 API 부재 = REQ-T3-803 물리 담보). 헤드리스·순수.
// ============================================================

import type { Sign, StageId, DomainKind } from '../format/types.js';
import type { VisualSpec } from '../cf/encoders.js';
import type { LocaleMeta } from '../i18n/types.js';

/** 직렬화 채널 식별자. / Serialization channel id. */
export type ChannelId = 'csv' | 'xlsx' | 'json' | 'xml' | 'pdf' | 'html' | 'print';

/** 데이터 상태 — 빈/로딩/에러 시 출력 처우 판정(REQ-T9-846). / Data state for output disposition. */
export type DataState = 'ready' | 'loading' | 'error' | 'empty';

/** 셀 정렬. / Cell alignment. */
export type CellAlign = 'left' | 'right' | 'center';

/**
 * 채널 중립 셀 아티팩트(§2.1). DD-04 FormatResult + DD-05 VisualSpec + DD-02 CellPlacement 합성 =
 * 화면 렌더러(DD-03)가 소비하는 RenderModel 과 '동일 계보'. 불변. export/인쇄는 이 객체만 직렬화한다.
 * / Channel-neutral cell artifact; the same lineage the on-screen renderer consumes. Immutable.
 */
export interface CellArtifact {
  /** 화면 표시 문자열(마스킹·축약·부호 적용 후) = DisplayFormatter.format(...).text. / Display string. */
  readonly text: string;
  /** 축약/마스킹 원값(CSV '값 보존'·xlsx 원값 셀). / Preserved raw value under abbrev/mask. */
  readonly rawText?: string;
  /** 낭독 대체(인쇄 대체텍스트·PDF/UA 태깅). / Accessible alt text. */
  readonly aria?: string;
  /** 부호 클래스. / Sign class. */
  readonly sign?: Sign;
  /** DD-04 provenance(어느 단계가 걸렸나). / Applied pipeline stages. */
  readonly applied: ReadonlyArray<StageId>;
  /** DD-05 소유 VisualSpec(있을 때만). 재선언 금지 — import 소비만. / DD-05 VisualSpec (consume-only). */
  readonly cf?: VisualSpec;
  /** DD-04 색코드([Red] 등) — 형태/부호 병기로만 소비(색 단독 금지). / AST color hint (never color-alone). */
  readonly colorHint?: string;
  /** 병합 세로 스팬. / Merge row-span. */
  readonly rowSpan: number;
  /** 병합 가로 스팬. / Merge col-span. */
  readonly colSpan: number;
  /** 병합에 삼켜진 셀(직렬화 생략). / Swallowed by a merge (skip serialization). */
  readonly hidden: boolean;
  /** 정렬. / Alignment. */
  readonly align: CellAlign;
  /** 채널별 셀 타입 매핑용(xlsx number vs string). / Domain kind for per-channel typing. */
  readonly type: DomainKind;
}

/** 한 논리 행의 아티팩트. 화면 밖 행도 동일 구조(전량 순회, REQ-T3-805). / One logical row's artifact. */
export interface RowArtifact {
  /** 정렬/필터 후 논리 순서 index. / Logical index after sort/filter. */
  readonly modelIndex: number;
  /** visibleLeaves 순서, exceptFields 제외 반영. / Cells in visible-leaf order. */
  readonly cells: ReadonlyArray<CellArtifact>;
  /** 마스터/디테일·소계행 구분. / Master/detail / subtotal row kind. */
  readonly rowState?: 'normal' | 'group' | 'summary' | 'detail';
  /** 그룹 들여쓰기 깊이. / Group indent depth. */
  readonly depth?: number;
}

/** 컬럼 헤더 아티팩트(다단 헤더·병합 반영). / Column header artifact. */
export interface HeaderArtifact {
  readonly text: string;
  readonly field: string;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly widthPx: number;
  readonly align: CellAlign;
}

/** 반열림 행 범위 [start,end). / Half-open row range. */
export interface RowRange {
  readonly start: number;
  readonly end: number;
}

/** 청크(청크 단위 async 스트림 단위). / Streaming chunk unit. */
export interface RowChunk {
  readonly rows: ReadonlyArray<RowArtifact>;
  readonly done: boolean;
}

/** 투영 옵션(§2.2). / Projection options. */
export interface ProjectOptions {
  /** 미지정 = 전 모델행. / Undefined = all model rows. */
  readonly range?: RowRange;
  /** 제외 필드. / Excluded fields. */
  readonly exceptFields?: ReadonlyArray<string>;
  /** DD-04 마스킹 단계 포함 여부 지시(재구현 아님). / Whether the mask stage is applied upstream. */
  readonly maskOnExport?: boolean;
  /** cf 시각 계층 투영 여부(CSV=false, PDF=true 기본). / Whether to project the cf visual layer. */
  readonly includeCF?: boolean;
  /** 스트리밍 청크 행수. / Chunk row count for streaming. */
  readonly chunkSize?: number;
}

/**
 * export/인쇄가 화면과 '같은 파이프라인'에서 파생됨을 강제하는 단일 포트(§2.2, REQ-T3-803).
 * 채널이 raw 를 볼 방법 자체가 API 에 없다 = WYSIWYG 불변식의 강제 장치.
 * / The single port forcing export/print to derive from the same pipeline as the screen.
 */
export interface IArtifactSource {
  /** 헤더 투영(병합 반영). / Header projection (merges reflected). */
  projectHeader(opts?: ProjectOptions): ReadonlyArray<ReadonlyArray<HeaderArtifact>>;
  /** 전 모델행(또는 지정 범위)을 청크 단위 async 스트림으로 투영. / Project all model rows as an async stream. */
  projectRows(opts?: ProjectOptions): AsyncIterable<RowChunk>;
  /** 전체 행수(진행률 분모). / Total rows (progress denominator). */
  totalRows(range?: RowRange): number;
  /** 데이터 상태 — 빈/로딩/에러 처우(REQ-T9-846). / Data state for output disposition. */
  dataState(): DataState;
}

/**
 * 바이트 소비처(백프레셔의 소비 측, §2.4). 반환 Promise 로 생산자를 눌러 OOM 방지(REQ-T9-810).
 * / Byte sink (consumer side of backpressure); its Promise throttles the producer to avoid OOM.
 */
export interface IByteSink {
  /** 청크 소비. 버퍼가 highWaterMark 초과면 drain 될 때까지 지연된 Promise. / Consume a chunk. */
  write(chunk: Uint8Array | string): Promise<void>;
  close(): Promise<void>;
  abort(reason?: string): void;
  /** 남은 버퍼 여유(음수면 생산 일시정지 신호). / Remaining buffer headroom (negative ⇒ pause). */
  readonly desiredSize: number;
}

/** 채널 × 상태항목 포함/제외 선언 — 손실 고지의 SSOT(REQ-T3-804). / Channel capability matrix (loss SSOT). */
export interface ChannelCapabilities {
  readonly merges: boolean;
  readonly frozen: boolean;
  readonly colWidths: boolean;
  readonly cf: boolean;
  readonly filters: boolean;
  readonly sort: boolean;
  readonly hiddenCols: boolean;
  readonly groupCollapse: boolean;
  readonly charts: boolean;
  readonly styling: boolean;
  readonly provenance: boolean;
}

/** 현 그리드에서 활성인 상태 플래그(손실 판정 입력). / Active state flags for loss computation. */
export interface ActiveStateFlags {
  readonly merges?: boolean;
  readonly frozen?: boolean;
  readonly colWidths?: boolean;
  readonly cf?: boolean;
  readonly filters?: boolean;
  readonly sort?: boolean;
  readonly hiddenCols?: boolean;
  readonly groupCollapse?: boolean;
  readonly charts?: boolean;
  readonly styling?: boolean;
}

/** 손실 항목 고지 레코드. / A single declared state loss. */
export interface StateLoss {
  readonly item: string;
  readonly reason: string;
}

/** 채널×상태항목 포함/제외 매트릭스(UI/문서용). / Channel×state inclusion matrix. */
export interface ChannelStateMatrix {
  readonly channels: ReadonlyArray<ChannelId>;
  readonly items: ReadonlyArray<string>;
  readonly cells: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
}

/** 실행 컨텍스트(§2.4). / Export run context. */
export interface ExportRunCtx {
  /** 취소 신호. / Cancellation signal. */
  readonly signal?: AbortSignal;
  /** 진행률(청크마다). / Progress (per chunk). */
  onProgress?: (done: number, total: number) => void;
  /** 변환 provenance(산출물 동행). / Transform provenance (travels to the artifact). */
  readonly provenance?: IArtifactProvenance;
  /** 인쇄 lang·날짜·Excel 폰트 — DD-12 소유 LocaleMeta import(재선언 금지). / Locale meta (DD-12). */
  readonly locale?: LocaleMeta;
  /** 이 실행의 손실 항목 스냅샷. / This run's declared losses. */
  readonly losses?: ReadonlyArray<StateLoss>;
}

/** 채널 실행 결과. / Channel run result. */
export interface ExportResult {
  readonly bytesWritten: number;
  readonly rowsWritten: number;
  readonly aborted: boolean;
}

/**
 * 채널 직렬화 전략(Strategy, §2.4). 모든 포맷이 동일 계약 — 소스·싱크는 주입, 채널은 매핑만.
 * / Channel serialization strategy; source/sink injected, the channel only maps.
 */
export interface IExportChannel {
  readonly id: ChannelId;
  /** 이 채널이 표현 가능한 상태항목(매니페스트 SSOT). / Representable state items (manifest SSOT). */
  readonly capabilities: ChannelCapabilities;
  /** 아티팩트 스트림 → 바이트. 청크마다 sink.write 를 await(백프레셔). / Artifact stream → bytes. */
  write(source: IArtifactSource, sink: IByteSink, ctx?: ExportRunCtx): Promise<ExportResult>;
}

// ─────────────────────────────────────────────────────────────
// provenance 동행(§2.3) — 순환 import 회피 위해 포트만 선언(구현은 Provenance.ts).
// ─────────────────────────────────────────────────────────────

/** 파이프라인 변환 고지 레코드(REQ-T6-811). / Pipeline transform disclosure record. */
export interface TransformProvenance {
  readonly source: 'format' | 'cf' | 'chart';
  readonly kind:
    | 'downsample' | 'aggregate' | 'normalize' | 'log'
    | 'truncatedAxis' | 'mask' | 'abbreviate' | 'clamp';
  readonly detail: string;
  readonly affected?: { rows?: number; cols?: ReadonlyArray<string> };
}

/** 무결성 배지(흑백 생존 픽토 병기). / Integrity badge (monochrome-surviving glyph). */
export interface ProvenanceBadge {
  readonly code: string;
  readonly label: string;
  readonly monochromeGlyph: string;
}

/** 채널별 provenance 렌더 산출(꼬리말/시트메모/주석행/푸터). / Channel-rendered provenance block. */
export interface ProvenanceBlock {
  readonly channel: ChannelId;
  /** 채널 표현 문자열(CSV 주석행·PDF 꼬리말·print 푸터 등). / Channel representation string. */
  readonly text: string;
  /** 배지(흑백 픽토 포함). / Badges. */
  readonly badges: ReadonlyArray<ProvenanceBadge>;
}

/** 산출물 단위 provenance 집계 포트(§2.3). / Per-artifact provenance aggregate port. */
export interface IArtifactProvenance {
  readonly transforms: ReadonlyArray<TransformProvenance>;
  readonly badges: ReadonlyArray<ProvenanceBadge>;
  readonly generatedAt: number;
  readonly rangeNote: string;
  /** 배지/캡션을 채널 표현으로 렌더. / Render badges/caption for a channel. */
  render(channel: ChannelId): ProvenanceBlock;
}
