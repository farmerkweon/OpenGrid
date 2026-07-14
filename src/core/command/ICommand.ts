// ============================================================
// DD-09 §2.1 커맨드 원자 계약 — 단일 쓰기 이음새(ICommand seam) / DD-09 §2.1 command atom contracts.
// 설계: sessions/design-uxui-2026-07/detailed-design/DD-09_command-state.md
// REQ: T8-895 · TX-892
// ------------------------------------------------------------
// 모든 모델 변이는 do/undo/coalesce/serialize 4대 계약을 구현하는 ICommand 로만 흐른다(단일 쓰기 정본).
// UI 무의존(헤드리스): DOM/이벤트를 모르고 도메인 좌표·값만 안다. do/undo 는 MutationServiceFacade
// (기존 MutationService 초크포인트)를 위임 호출할 뿐 직접 렌더/emit 하지 않는다.
// ============================================================

/**
 * dirty·부분저장·협업 병합용 변경 지문. 커맨드가 만지는 범위를 데이터로 신고한다.
 * / Change footprint for dirty tracking / partial save / collaboration merge.
 */
export type CommandFootprint =
  | { readonly scope: 'cell'; readonly rowId: string; readonly field: string }
  | { readonly scope: 'row'; readonly rowIds: readonly string[] }
  | { readonly scope: 'range'; readonly rowIds: readonly string[]; readonly fields: readonly string[] }
  | { readonly scope: 'structure' }
  | { readonly scope: 'meta' };

/**
 * 직렬화 커맨드(매크로 스텝·협업 op·감사 레코드 공통). 값·좌표는 stable rowId 로 최소 재구성 정보만.
 * / Serialized command (shared by macro step / collaboration op / audit record).
 */
export interface CommandDTO {
  readonly kind: string;
  readonly payload: unknown;
  /** 동결 시각(재생 결정론). / Frozen timestamp (replay determinism). */
  readonly at: number;
  /** 협업 actorId(옵션). / Collaboration actor id (optional). */
  readonly actor?: string;
}

/**
 * 커맨드가 모델을 만지는 유일한 표면 — 기존 MutationService(mutate→render→emit)를 1:1 위임(회귀 0).
 * DD-09 는 이 파사드로만 위임하며 렌더/emit 내부를 모른다(§2.9).
 * / The only surface a command uses to touch the model — delegates 1:1 to the existing
 * MutationService (mutate→render→emit); DD-09 has no knowledge of render/emit internals.
 */
export interface MutationServiceFacade<T = any> {
  writeCell(rowIndex: number, field: string, value: unknown): void;
  writeCells(patches: ReadonlyArray<{ rowIndex: number; field: string; value: unknown }>): number;
  insertRow(item: Partial<T>, position?: number | 'first' | 'last' | 'before' | 'after'): void;
  deleteRows(indices: readonly number[]): void;
  beginBatch(): void;
  endBatch(): void;
}

/**
 * 도메인 좌표 해석(flat index ⇄ stable rowId) + 값/스냅샷 읽기. undo 안정성의 근간(§3.2):
 * 커맨드는 좌표를 rowId 로만 앵커하고 실행 시점에 index 로 해소한다(구조 변경에 안전).
 * / Domain coordinate resolution (flat index ⇄ stable rowId) plus value/snapshot reads.
 */
export interface CoordResolver {
  rowCount(): number;
  rowIdAt(index: number): string | undefined;
  /** 미존재 → -1. / Absent → -1. */
  indexOf(rowId: string): number;
  getCellValue(rowId: string, field: string): unknown;
  getRowSnapshot(rowId: string): Record<string, unknown> | undefined;
}

/** 값 객체 동치성(DD-01 위임) — coalesce/oldValue 비교. / Value-object equality (delegated to DD-01). */
export interface ValueEquality {
  equals(a: unknown, b: unknown): boolean;
}

/** 재생 결정론용 동결 시계(do 시 캡처, undo/replay 는 캡처값 사용). / Frozen clock for replay determinism. */
export interface FrozenClock {
  now(): number;
}

/**
 * 커맨드 실행 문맥 — do/undo 가 받는 협력자 묶음. / Command execution context passed to do/undo.
 */
export interface ICommandCtx<T = any> {
  readonly mutation: MutationServiceFacade<T>;
  readonly coords: CoordResolver;
  readonly values: ValueEquality;
  readonly clock: FrozenClock;
}

/**
 * 모든 모델 변이의 원자. do/undo/coalesce/serialize 4대 계약(§2.1).
 * DD-10 `IExtension` 정합: `kind` 가 확장 식별자(=IExtension.id 역할), `spi` 표식이 확장 계약군 소속을 나타냄.
 * / The atom of every model mutation (do/undo/coalesce/serialize). Aligns with DD-10 IExtension:
 * `kind` acts as the extension id and `spi` marks membership in the extension-contract family.
 */
export interface ICommand<T = any> {
  /** DD-10 IExtension 정합 표식(SPI). / DD-10 IExtension alignment marker. */
  readonly spi?: 'command';
  /** 안정 커맨드 종류 id(레지스트리 키·직렬화 태그). 예: 'cell.write'. / Stable command-kind id. */
  readonly kind: string;
  /** 사람이 읽는 라벨(undo 메뉴/감사) — i18n 키. / Human-readable label (i18n key). */
  readonly label: string;
  /** 이 커맨드가 만지는 dirty 범위. / Dirty footprint this command touches. */
  readonly footprint: CommandFootprint;

  /** 정방향 적용. 되돌림에 필요한 역정보(inverse)를 do 시점에 포획(불변식 §2). / Apply forward; capture inverse at do-time. */
  do(ctx: ICommandCtx<T>): void;
  /** 역방향 적용. do 가 포획한 inverse 로 관측 상태를 do 직전으로 복원. / Apply inverse to restore pre-do state. */
  undo(ctx: ICommandCtx<T>): void;
  /** 인접 병합(선택). 하나의 undo 단위로 접을 수 있으면 병합 커맨드 반환, 아니면 null. / Optional adjacent coalesce. */
  coalesce?(next: ICommand<T>): ICommand<T> | null;
  /** 직렬화(매크로·감사·협업). schemaVersion 은 봉투의 몫 — 여기선 payload 만. / Serialize (payload only). */
  serialize(): CommandDTO;
}

/**
 * 기본 값 동치성 — 참조/Object.is + 값객체 `equals` 존재 시 위임(DD-01). / Default value equality.
 */
export const defaultValueEquality: ValueEquality = {
  equals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a != null && typeof a === 'object' && typeof (a as { equals?: unknown }).equals === 'function') {
      return (a as { equals(x: unknown): boolean }).equals(b);
    }
    return Object.is(a, b);
  },
};

/** 실제 시스템 시계(비테스트 기본). / Real system clock (default outside tests). */
export const systemClock: FrozenClock = { now: () => Date.now() };
