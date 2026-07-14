// ============================================================
// DD-09 §2.8 감사·더티·우회감지 지원부 / DD-09 §2.8 audit · dirty · mutation-guard support.
// REQ: T8-895
// ------------------------------------------------------------
// 커맨드 스트림에서 파생되는 순수 append 감사 로그, 마지막 저장 이후 변경 footprint 집합(dirty),
// dev 우회 변이 감지 가드. 전부 헤드리스·순수.
// ============================================================

import type { CommandDTO, CommandFootprint } from './ICommand.js';

/** 커맨드 스트림 → 감사 로그(협업/디버그/재생). 순수 append. / Command stream → audit log (append-only). */
export interface AuditLog {
  record(dto: CommandDTO): void;
  /** 리비전(로그 인덱스) 이후 레코드. / Records since a revision (log index). */
  since(rev: number): CommandDTO[];
  all(): CommandDTO[];
  readonly length: number;
}

/** 기본 인메모리 감사 로그. / Default in-memory audit log. */
export class DefaultAuditLog implements AuditLog {
  private _log: CommandDTO[] = [];

  record(dto: CommandDTO): void {
    this._log.push(dto);
  }

  since(rev: number): CommandDTO[] {
    return this._log.slice(Math.max(0, rev));
  }

  all(): CommandDTO[] {
    return [...this._log];
  }

  get length(): number {
    return this._log.length;
  }
}

/**
 * 마지막 저장 이후 변경 footprint 집합. RPO/부분저장/저장버튼 활성화 근거.
 * / Set of change footprints since the last save. Basis for RPO / partial save / save-button state.
 */
export class DirtyTracker {
  private _fps: CommandFootprint[] = [];
  private _dirty = false;

  mark(fp: CommandFootprint): void {
    this._fps.push(fp);
    this._dirty = true;
  }

  isDirty(): boolean {
    return this._dirty;
  }

  /** 저장 완료 후 dirty 해제(rev 인자는 MVP 미사용 — 전량 클리어). / Clear dirty after save (rev unused in MVP). */
  clearTo(_rev?: number): void {
    this._fps = [];
    this._dirty = false;
  }

  snapshot(): CommandFootprint[] {
    return [...this._fps];
  }
}

/** dev 우회변이 감지 위반 싱크. / Dev bypass-mutation violation sink. */
export type MutationViolationSink = (op: string) => void;

const defaultViolationSink: MutationViolationSink = (op) => {
  if (typeof console !== 'undefined') console.warn(`[OpenGrid] 우회 변이 감지: '${op}' 는 CommandBus.dispatch 밖에서 모델을 변경합니다(단일 쓰기 경로 위반).`);
};

/**
 * dev 모드: dispatch 구간 밖에서 모델 변이가 일어나면 경고(불변식 §1 단일 쓰기 경로).
 * enter/leave 로 dispatch 구간을 표시하고, assertInside 로 우회를 감지한다.
 * / Dev mode: warns when a mutation happens outside a dispatch window (invariant §1, single write path).
 */
export class MutationGuard {
  private _depth = 0;
  private readonly _sink: MutationViolationSink;
  private readonly _dev: boolean;

  constructor(opts: { onViolation?: MutationViolationSink; dev?: boolean } = {}) {
    this._sink = opts.onViolation ?? defaultViolationSink;
    this._dev = opts.dev ?? true;
  }

  enter(): void {
    this._depth++;
  }

  leave(): void {
    if (this._depth > 0) this._depth--;
  }

  get inside(): boolean {
    return this._depth > 0;
  }

  /** dispatch 구간 밖에서 호출되면 위반 신고. / Reports a violation if called outside a dispatch window. */
  assertInside(op: string): void {
    if (this._dev && this._depth === 0) this._sink(op);
  }
}
