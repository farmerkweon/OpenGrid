// ============================================================
// DD-12 §2.5 키보드 인터랙션 모델 / keyboard interaction model
// ------------------------------------------------------------
// 설계 근거(Why): 모드 상태·키 라우팅·단축키 등록소·충돌 해소·IME 가드의 SSOT. 마우스로 가능한
//   전 기능의 키보드 대체 경로를 인벤토리화해 파리티 100% 게이트를 계측한다(REQ-T9-829). 키 →
//   `commandId`(DD-09) 로만 라우팅하고 직접 변이는 하지 않는다(단방향). IME 조합 중 커밋 소거.
// / Design: SSOT for interaction mode, key routing, a keybinding registry, conflict resolution, and
//   an IME guard. Inventories every mouse-reachable command's keyboard alternative to measure the
//   parity gate (REQ-T9-829). Routes keys to `commandId` (DD-09) only. Suppresses commit during IME.
// ============================================================

/** 상호작용 모드(단일 모델). 키 라우팅이 모드에 따라 분기. / Interaction mode; routing branches on it. */
export type InteractionMode = 'nav' | 'edit' | 'selectExtend';

/** 정규화 키 이벤트(헤드리스 — DOM KeyboardEvent 아님). 호스트 어댑터가 어댑팅. / Normalized key event (headless). */
export interface KeyStroke {
  /** 'ArrowDown' | 'Enter' | 'F2' | 'a' … (DOM `KeyboardEvent.key`). */
  readonly key: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  /** IME 조합 중(가드 — 조합 중 커밋 금지). / Mid-IME-composition (guard: no commit while composing). */
  readonly isComposing: boolean;
}

/** 키 바인딩 = (모드, 키패턴) → 커맨드 의도. 등록소가 충돌을 감지. / A keybinding; the registry detects conflicts. */
export interface KeyBinding {
  readonly mode: InteractionMode | '*';
  /** 'Ctrl+C' | 'ArrowDown' | 'Shift+ArrowDown'(수정자 순서 무관 — 정규화됨). / Pattern (modifier order-independent). */
  readonly pattern: string;
  /** DD-09 ICommand 로 라우팅(직접 변이 금지). / Routed to a DD-09 ICommand. */
  readonly commandId: string;
  /** 단축키 힌트/도움말(i18n 메시지 키). / Shortcut hint/help (i18n message key). */
  readonly label?: string;
}

/** IME 조합 중 소거되는 커밋 계열 키. / Commit-family keys suppressed during IME composition. */
const COMMIT_KEYS = new Set(['Enter']);

/** 수정자를 고정 순서(Ctrl+Alt+Shift+Meta)로 정렬해 정규 패턴 문자열 생성. / Canonicalize a pattern string. */
export function normalizePattern(pattern: string): string {
  const parts = pattern.split('+').map((p) => p.trim()).filter(Boolean);
  let ctrl = false, alt = false, shift = false, meta = false;
  let key = '';
  for (const p of parts) {
    const lo = p.toLowerCase();
    if (lo === 'ctrl' || lo === 'control') ctrl = true;
    else if (lo === 'alt' || lo === 'option') alt = true;
    else if (lo === 'shift') shift = true;
    else if (lo === 'meta' || lo === 'cmd' || lo === 'command' || lo === 'super') meta = true;
    else key = p;
  }
  return canon(key, ctrl, alt, shift, meta);
}

/** KeyStroke → 정규 패턴 문자열. / KeyStroke → canonical pattern string. */
export function strokeToPattern(k: KeyStroke): string {
  return canon(k.key, k.ctrl, k.alt, k.shift, k.meta);
}

function canon(key: string, ctrl: boolean, alt: boolean, shift: boolean, meta: boolean): string {
  const mods: string[] = [];
  if (ctrl) mods.push('Ctrl');
  if (alt) mods.push('Alt');
  if (shift) mods.push('Shift');
  if (meta) mods.push('Meta');
  // 키는 소문자로 통일(대소문자·명명키 표기 무관 매칭: 'c'/'C'·'arrowdown'/'ArrowDown').
  // / Key lowercased for case-insensitive matching ('c'/'C', 'arrowdown'/'ArrowDown').
  const nk = key.toLowerCase();
  return [...mods, nk].join('+');
}

/**
 * 키보드 인터랙션 모델 — 모드·등록소·충돌·IME 가드·파리티 계측(REQ-T9-829).
 * / Keyboard interaction model — mode, registry, conflicts, IME guard, parity metrics.
 */
export class KeyboardInteractionModel {
  /** 저장 키 = `${mode}|${normalizedPattern}`. / Storage key = `${mode}|${normalizedPattern}`. */
  private _bindings = new Map<string, KeyBinding>();
  /** 마우스로 도달 가능한 커맨드 인벤토리(파리티 분모). / Mouse-reachable command inventory (parity denominator). */
  private _mouseCommands = new Set<string>();
  private _mode: InteractionMode = 'nav';

  /** 바인딩 등록. 같은 (mode,pattern) 충돌 시 기존을 정직 반환(덮어쓰지 않음). / Register; returns any conflict. */
  register(b: KeyBinding): { conflict?: KeyBinding } {
    const k = this._storeKey(b.mode, normalizePattern(b.pattern));
    const existing = this._bindings.get(k);
    if (existing) return { conflict: existing };
    this._bindings.set(k, b);
    return {};
  }

  /** 마우스로 도달 가능한 커맨드를 파리티 인벤토리에 선언. / Declare a mouse-reachable command for the parity inventory. */
  declareMouseCommand(commandId: string): void {
    this._mouseCommands.add(commandId);
  }

  /**
   * 키 → commandId 라우팅. 모드 전용 바인딩 우선, 없으면 `'*'`(전 모드). IME 조합 중 커밋 소거.
   * / Route a key to a commandId. Mode-specific first, then `'*'`. Suppress commit during IME.
   */
  resolve(mode: InteractionMode, k: KeyStroke): string | null {
    if (this._guardIme(k)) return null;
    const pat = strokeToPattern(k);
    const hit = this._bindings.get(this._storeKey(mode, pat)) ?? this._bindings.get(this._storeKey('*', pat));
    return hit ? hit.commandId : null;
  }

  mode(): InteractionMode { return this._mode; }
  setMode(m: InteractionMode): void { this._mode = m; }

  /**
   * 마우스 인벤토리 대비 키보드 도달 커버리지(파리티 게이트 계측, REQ-T9-829 AC).
   * / Keyboard-reach coverage vs the mouse inventory (parity gate; REQ-T9-829 AC).
   */
  parityReport(): { mouseOnly: string[]; covered: number; total: number } {
    const covered = new Set<string>();
    for (const b of this._bindings.values()) covered.add(b.commandId);
    const mouseOnly: string[] = [];
    for (const cmd of this._mouseCommands) if (!covered.has(cmd)) mouseOnly.push(cmd);
    mouseOnly.sort();
    return {
      mouseOnly,
      covered: this._mouseCommands.size - mouseOnly.length,
      total: this._mouseCommands.size,
    };
  }

  /** 등록된 바인딩 수. / Number of registered bindings. */
  size(): number { return this._bindings.size; }

  private _guardIme(k: KeyStroke): boolean {
    return k.isComposing && COMMIT_KEYS.has(k.key);
  }

  private _storeKey(mode: InteractionMode | '*', pattern: string): string {
    return `${mode}|${pattern}`;
  }
}
