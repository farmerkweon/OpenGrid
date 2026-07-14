// ============================================================
// DD-15 Export·인쇄 서브시스템 배럴 — 신설 모듈 공개 표면(additive, 코어 통합배선은 통합 TODO)
// / DD-15 export/print subsystem barrel — public surface of the new module (additive).
// ============================================================

// 계약·값객체 / contracts & value objects
export type {
  ChannelId, DataState, CellAlign, CellArtifact, RowArtifact, HeaderArtifact,
  RowRange, RowChunk, ProjectOptions, IArtifactSource, IByteSink, ChannelCapabilities,
  ActiveStateFlags, StateLoss, ChannelStateMatrix, ExportRunCtx, ExportResult, IExportChannel,
  TransformProvenance, ProvenanceBadge, ProvenanceBlock, IArtifactProvenance,
} from './types.js';

// provenance / manifest
export { ArtifactProvenance, buildProvenance } from './Provenance.js';
export type { ArtifactProvenanceOptions } from './Provenance.js';
export { ExportManifest } from './ExportManifest.js';

// 스트리밍·싱크 / streaming & sinks
export { StreamPump, STREAM_DEFAULTS, shouldStream } from './StreamPump.js';
export { MemoryByteSink, DownloadByteSink } from './sinks.js';

// 소스 seam / source seam
export { GridArtifactSource } from './GridArtifactSource.js';
export type {
  GridArtifactSourceDeps, ArtifactColumn, PlacementFn, CfFn,
} from './GridArtifactSource.js';

// 레지스트리 / registry
export { ChannelRegistry } from './ChannelRegistry.js';

// 채널 / channels
export { CsvChannel } from './channels/CsvChannel.js';
export type { CsvChannelOptions } from './channels/CsvChannel.js';
export { JsonChannel } from './channels/JsonChannel.js';
export type { JsonChannelOptions } from './channels/JsonChannel.js';
export { XmlChannel } from './channels/XmlChannel.js';
export type { XmlChannelOptions } from './channels/XmlChannel.js';
export { XlsxChannel } from './channels/XlsxChannel.js';
export type {
  XlsxChannelOptions, SheetModel, SheetCell, MergeRegion, IWorkbookWriter,
} from './channels/XlsxChannel.js';
export {
  CSV_CAPS, JSON_CAPS, XML_CAPS, XLSX_CAPS, PRINT_CAPS, DEFAULT_CAPS,
} from './channels/capabilities.js';

// 인쇄 / print
export {
  ScreenAdapter, GrayscaleAdapter, createOutputAdapter,
} from './print/OutputChannelAdapter.js';
export type {
  IOutputChannelAdapter, InkDecision, BorderSpec,
} from './print/OutputChannelAdapter.js';
export { Paginator } from './print/Paginator.js';
export type { IPaginator, PrintPage, PaginatorOptions } from './print/Paginator.js';
export { PrintRenderTarget } from './print/PrintRenderTarget.js';
export type { PrintRenderDeps, PrintRenderOptions } from './print/PrintRenderTarget.js';
