// ============================================================
// DD-09 §2.2·§4(C1) CommandRegistry — 커스텀 커맨드 SPI + DTO 재수화(rehydrate)
// / DD-09 §2.2·§4(C1) CommandRegistry — custom-command SPI + DTO rehydrate.
// REQ: TX-892 · T8-896
// ------------------------------------------------------------
// kind → CommandSpec 등록점. 매크로/협업/undo 영속 재생 시 DTO 를 살아있는 ICommand 로 복원한다.
// 미등록 kind = 정의된 오류(조용한 무시 금지, 불변식 §5). DD-10 통일 IRegistry<V,K> 와 동형(C1):
// register/has 는 IRegistry 위임, rehydrate 는 resolve + payload 마이그레이션 조합.
// ============================================================

import { TypedRegistry, type IRegistry, type RegisterOptions } from '../extension/Registry.js';
import type { ICommand, CommandDTO } from './ICommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { CellWriteCommand, cellWriteFromPayload } from './commands/CellWriteCommand.js';
import { RowInsertCommand, RowDeleteCommand, rowInsertFromPayload, rowDeleteFromPayload } from './commands/RowCommands.js';

/** 커맨드 종류 등록 명세(payload 버저닝·복원). / Command-kind registration spec (payload versioning + restore). */
export interface CommandSpec<T = any> {
  /** payload 최신 스키마 버전(커맨드 단위). 봉투 schemaVersion 과 독립 진화. / Latest payload schema version. */
  readonly payloadVersion: number;
  /** 구버전 payload → 최신 payload 마이그레이션(없으면 동일버전만 허용). / Old payload → latest migration. */
  migratePayload?(payload: unknown, from: number): unknown;
  /** payload → 살아있는 커맨드. / payload → live command. */
  fromPayload(payload: unknown): ICommand<T>;
}

/** 미등록 kind / 미지 상위버전 재수화 실패(조용한 스킵 금지). / Rehydrate failure (never silent-skip). */
export class RehydrateError extends Error {
  constructor(
    readonly kind: string,
    reason: string,
  ) {
    super(`[OpenGrid] 커맨드 재수화 실패 kind='${kind}': ${reason}`);
    this.name = 'RehydrateError';
  }
}

/** kind → (DTO 역직렬화기). 커스텀 커맨드도 이 포트로 등록돼 매크로/협업 재생에 참여. / kind → DTO deserializer. */
export interface CommandRegistry<T = any> {
  register(kind: string, spec: CommandSpec<T>, opts?: RegisterOptions): void;
  /** DTO → ICommand 복원. 미등록 kind = 정의된 오류(throw). / DTO → ICommand; unknown kind throws. */
  rehydrate(dto: CommandDTO): ICommand<T>;
  has(kind: string): boolean;
}

/**
 * DD-10 IRegistry 동형 기본 구현(C1). 내장 커맨드(cell.write·row.insert·row.delete·composite)를
 * 부트스트랩하고, 커스텀 kind 를 register 로 확장한다. composite 는 자식 DTO 를 재귀 재수화한다.
 * / Default IRegistry-homomorphic implementation (C1). Bootstraps built-in commands and lets custom
 * kinds extend via register; composite recursively rehydrates its children.
 */
export class DefaultCommandRegistry<T = any> implements CommandRegistry<T> {
  private readonly _reg: IRegistry<CommandSpec<T>>;

  constructor(reg?: IRegistry<CommandSpec<T>>) {
    this._reg = reg ?? new TypedRegistry<CommandSpec<T>>({ spi: { name: 'ICommand', version: '1' } });
    this._registerBuiltins();
  }

  private _registerBuiltins(): void {
    this._reg.register('cell.write', { payloadVersion: 1, fromPayload: (p) => cellWriteFromPayload<T>(p) }, { origin: 'builtin' });
    this._reg.register('row.insert', { payloadVersion: 1, fromPayload: (p) => rowInsertFromPayload<T>(p) }, { origin: 'builtin' });
    this._reg.register('row.delete', { payloadVersion: 1, fromPayload: (p) => rowDeleteFromPayload<T>(p) }, { origin: 'builtin' });
    this._reg.register(
      'composite',
      {
        payloadVersion: 1,
        fromPayload: (p) => {
          const steps = Array.isArray(p) ? (p as CommandDTO[]) : [];
          const children = steps.map((s) => this.rehydrate(s));
          return new CompositeCommand<T>('cmd.macro', children);
        },
      },
      { origin: 'builtin' },
    );
  }

  register(kind: string, spec: CommandSpec<T>, opts: RegisterOptions = {}): void {
    this._reg.register(kind, spec, opts);
  }

  has(kind: string): boolean {
    return this._reg.has(kind);
  }

  rehydrate(dto: CommandDTO): ICommand<T> {
    if (dto == null || typeof dto.kind !== 'string') {
      throw new RehydrateError(String((dto as { kind?: unknown })?.kind ?? '?'), 'DTO 형식 오류');
    }
    const spec = this._reg.get(dto.kind);
    if (!spec) throw new RehydrateError(dto.kind, '미등록 kind(레지스트리에 없음)');

    let payload = dto.payload;
    // payload 에 __v 버전 태그가 있고 최신보다 낮으면 마이그레이션(§2.2). 없으면 최신으로 간주.
    const p = payload as { __v?: unknown } | null;
    const from = p != null && typeof p === 'object' && typeof p.__v === 'number' ? p.__v : spec.payloadVersion;
    if (from > spec.payloadVersion) {
      throw new RehydrateError(dto.kind, `미지 상위 payload 버전 v${from} > v${spec.payloadVersion}`);
    }
    if (from < spec.payloadVersion) {
      if (!spec.migratePayload) throw new RehydrateError(dto.kind, `payload v${from} 마이그레이션 단계 없음`);
      payload = spec.migratePayload(payload, from);
    }
    return spec.fromPayload(payload);
  }

  /** C1: 내부 IRegistry 노출(진단·override 표면 편입용). / C1: expose the inner IRegistry (diagnostics/override surface). */
  get registry(): IRegistry<CommandSpec<T>> {
    return this._reg;
  }
}

// 내장 커맨드 클래스 재노출(등록·타입 참조 편의). / Re-export built-in command classes for convenience.
export { CellWriteCommand, RowInsertCommand, RowDeleteCommand, CompositeCommand };
