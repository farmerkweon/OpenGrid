// ============================================================
// DD-09 커맨드층 배럴 / DD-09 command-layer barrel.
// additive 신설 — 기존 MutationService/CellEditManager/OpenGrid 배선을 교란하지 않는다(스트랭글러).
// 헤드리스·순수 TS. 통합 배선(OpenGrid.ts)은 오케스트레이터가 병합 후 수행(DD-09 통합 TODO).
// ============================================================

// ── 원자 계약 ──
export type {
  ICommand,
  ICommandCtx,
  CommandDTO,
  CommandFootprint,
  MutationServiceFacade,
  CoordResolver,
  ValueEquality,
  FrozenClock,
} from './ICommand.js';
export { defaultValueEquality, systemClock } from './ICommand.js';

// ── 스택·버스 ──
export { CommandStack, type CommandStackConfig } from './CommandStack.js';
export { CommandBus, type CommandBusDeps } from './CommandBus.js';

// ── 감사·더티·가드 ──
export {
  DefaultAuditLog,
  DirtyTracker,
  MutationGuard,
  type AuditLog,
  type MutationViolationSink,
} from './support.js';

// ── 레지스트리(SPI·rehydrate) ──
export {
  DefaultCommandRegistry,
  RehydrateError,
  type CommandRegistry,
  type CommandSpec,
} from './CommandRegistry.js';

// ── 구체 커맨드 ──
export { CellWriteCommand, cellWriteFromPayload } from './commands/CellWriteCommand.js';
export {
  RowInsertCommand,
  RowDeleteCommand,
  rowInsertFromPayload,
  rowDeleteFromPayload,
} from './commands/RowCommands.js';
export { CompositeCommand } from './commands/CompositeCommand.js';
