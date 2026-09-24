// ============================================================
// 단축키 표 / keyboard shortcut table
// ------------------------------------------------------------
// 무엇을 하나: 키 입력을 받아 그 키가 뜻하는 명령 이름을 돌려준다. 모드(이동·편집·범위 넓히기)마다
//   다른 단축키를 둘 수 있고, 한글·일본어 입력기로 글자를 조합하는 중의 Enter 는 명령으로 보내지 않는다.
// 왜 이렇게: 명령 이름만 돌려주고 실제 동작은 부르는 쪽이 하게 해, 이 표가 그리드 상태를 바꾸지 않는다
//   (단방향). 마우스로 할 수 있는 명령을 알려 두면 키보드로 못 하는 것이 무엇인지도 셀 수 있다.
// / What: returns the command a key press means; per-mode shortcuts; Enter during IME composition is ignored.
//   Why: it only names the command and the caller acts, so the table never mutates grid state (one-way).
//   Declaring mouse-reachable commands lets you count which ones lack a keyboard way.
// ============================================================

/**
 * 지금 그리드가 어떤 상태로 키를 받는지. `nav`=셀 사이 이동, `edit`=셀 편집 중, `selectExtend`=범위 넓히기.
 *
 * What state the grid is in when it receives a key. `nav` = moving between cells, `edit` = editing a cell, `selectExtend` = extending a range.
 *
 * グリッドがいまどの状態でキーを受けているか。`nav`=セル間の移動、`edit`=セル編集中、`selectExtend`=範囲の拡張。
 *
 * 表格当前以什么状态接收按键。`nav`=在单元格之间移动,`edit`=正在编辑单元格,`selectExtend`=扩展范围。
 */
export type InteractionMode = 'nav' | 'edit' | 'selectExtend';

/**
 * 키 입력 한 번. DOM 의 `KeyboardEvent` 를 몰라도 되게 필요한 것만 담았다. `KeyboardEvent` 에서 만들 때는 `strokeFromEvent(e)` 를 쓴다.
 *
 * One key press, holding only what is needed so the model does not depend on the DOM `KeyboardEvent`. Build it from a `KeyboardEvent` with `strokeFromEvent(e)`.
 *
 * キー入力 1 回。DOM の `KeyboardEvent` を知らなくてよいよう、必要なものだけを持ちます。`KeyboardEvent` から作るときは `strokeFromEvent(e)` を使います。
 *
 * 一次按键。只包含需要的内容,使模型不依赖 DOM 的 `KeyboardEvent`。从 `KeyboardEvent` 构造时请用 `strokeFromEvent(e)`。
 */
export interface KeyStroke {
  /**
   * 눌린 키 이름(`KeyboardEvent.key` 와 같다). 예: 'ArrowDown'·'Enter'·'F2'·'a'.
   *
   * The key name (same as `KeyboardEvent.key`), e.g. 'ArrowDown', 'Enter', 'F2', 'a'.
   *
   * 押されたキーの名前(`KeyboardEvent.key` と同じ)。例: 'ArrowDown'・'Enter'・'F2'・'a'。
   *
   * 按下的键名(与 `KeyboardEvent.key` 相同)。例如 'ArrowDown'、'Enter'、'F2'、'a'。
   */
  readonly key: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
  /**
   * 한글·일본어 입력기로 글자를 조합하는 중인지. 조합 중의 Enter 는 확정용이라 명령으로 보내지 않는다.
   *
   * Whether an IME (Korean, Japanese, …) is still composing. Enter during composition confirms the text, so it is not routed to a command.
   *
   * IME で文字を組み立てている最中かどうか。組み立て中の Enter は確定用なので、コマンドには送りません。
   *
   * 是否正在用输入法组字。组字中的 Enter 用于确认文字,因此不会转给命令。
   */
  readonly isComposing: boolean;
}

/**
 * 단축키 하나: 어떤 모드에서 어떤 키를 누르면 어떤 명령을 뜻하는지.
 *
 * One shortcut: in which mode, which key, means which command.
 *
 * ショートカット 1 つ: どのモードでどのキーを押すと、どのコマンドを意味するか。
 *
 * 一个快捷键:在哪种模式下按哪个键,表示哪个命令。
 */
export interface KeyBinding {
  /**
   * 이 단축키가 먹는 모드. `'*'` 면 모든 모드.
   *
   * The mode this shortcut applies in; `'*'` for every mode.
   *
   * このショートカットが効くモード。`'*'` ならすべてのモード。
   *
   * 该快捷键生效的模式;`'*'` 表示所有模式。
   */
  readonly mode: InteractionMode | '*';
  /**
   * 키 모양. 예: 'Ctrl+C'·'ArrowDown'·'Shift+ArrowDown'. 수정자 순서·대소문자는 상관없다.
   *
   * The key pattern, e.g. 'Ctrl+C', 'ArrowDown', 'Shift+ArrowDown'. Modifier order and case do not matter.
   *
   * キーの形。例: 'Ctrl+C'・'ArrowDown'・'Shift+ArrowDown'。修飾キーの順番や大文字小文字は問いません。
   *
   * 按键的形式,例如 'Ctrl+C'、'ArrowDown'、'Shift+ArrowDown'。修饰键顺序和大小写无关。
   */
  readonly pattern: string;
  /**
   * 이 키가 뜻하는 명령 이름. 모델은 이름만 돌려주고, 실제 동작은 호출하는 쪽이 한다.
   *
   * The name of the command this key means. The model only returns the name; the caller performs the action.
   *
   * このキーが意味するコマンドの名前。モデルは名前を返すだけで、実際の動作は呼び出し側が行います。
   *
   * 该键表示的命令名称。模型只返回名称,实际动作由调用方执行。
   */
  readonly commandId: string;
  /**
   * 도움말에 보일 설명(메시지 키 또는 글).
   *
   * A description to show in help (a message key or text).
   *
   * ヘルプに表示する説明(メッセージキーまたは文)。
   *
   * 显示在帮助中的说明(消息键或文字)。
   */
  readonly label?: string;
}

/** IME 조합 중 소거되는 커밋 계열 키. / Commit-family keys suppressed during IME composition. */
const COMMIT_KEYS = new Set(['Enter']);

/**
 * 키 모양 글을 한 가지 표기로 맞춘다(수정자 순서 Ctrl+Alt+Shift+Meta, 키는 소문자). 두 표기가 같은 키인지 비교할 때 쓴다.
 *
 * Normalizes a key-pattern string to one spelling (modifiers in Ctrl+Alt+Shift+Meta order, key in lower case). Use it to compare whether two spellings mean the same key.
 *
 * キーの形の文字列を一つの表記にそろえます(修飾キーは Ctrl+Alt+Shift+Meta の順、キーは小文字)。二つの表記が同じキーかを比べるときに使います。
 *
 * 把按键形式的字符串统一成一种写法(修饰键按 Ctrl+Alt+Shift+Meta 顺序,键为小写)。用于比较两种写法是否是同一个键。
 *
 * @param pattern - 키 모양 글(예: `shift+ctrl+c`)
 *
 * Key-pattern string (e.g. `shift+ctrl+c`)
 *
 * キーの形の文字列(例: `shift+ctrl+c`)
 *
 * 按键形式字符串(例如 `shift+ctrl+c`)
 *
 * @returns 맞춘 글(예: `Ctrl+Shift+c`)
 *
 * The normalized string (e.g. `Ctrl+Shift+c`)
 *
 * そろえた文字列(例: `Ctrl+Shift+c`)
 *
 * 统一后的字符串(例如 `Ctrl+Shift+c`)
 */
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

/**
 * 키 입력 한 번을 `normalizePattern` 과 같은 표기로 바꾼다.
 *
 * Converts one key press into the same spelling `normalizePattern` produces.
 *
 * キー入力 1 回を `normalizePattern` と同じ表記に変えます。
 *
 * 把一次按键转换成与 `normalizePattern` 相同的写法。
 *
 * @param k - 키 입력
 *
 * The key press
 *
 * キー入力
 *
 * 按键
 *
 * @returns 맞춘 글
 *
 * The normalized string
 *
 * そろえた文字列
 *
 * 统一后的字符串
 */
export function strokeToPattern(k: KeyStroke): string {
  return canon(k.key, k.ctrl, k.alt, k.shift, k.meta);
}

/**
 * `strokeFromEvent` 가 받는 키 이벤트 모양. DOM `KeyboardEvent` 가 그대로 맞는다.
 *
 * The key-event shape `strokeFromEvent` accepts; a DOM `KeyboardEvent` fits as is.
 *
 * `strokeFromEvent` が受け取るキーイベントの形。DOM の `KeyboardEvent` がそのまま当てはまります。
 *
 * `strokeFromEvent` 接收的按键事件形状;DOM 的 `KeyboardEvent` 可直接使用。
 */
export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing?: boolean;
}

/**
 * 키보드 이벤트(`KeyboardEvent`)를 모델이 받는 `KeyStroke` 로 바꾼다.
 *
 * Converts a keyboard event (`KeyboardEvent`) into the `KeyStroke` the model takes.
 *
 * キーボードイベント(`KeyboardEvent`)を、モデルが受け取る `KeyStroke` に変えます。
 *
 * 把键盘事件(`KeyboardEvent`)转换成模型接收的 `KeyStroke`。
 *
 * @param e - 키보드 이벤트
 *
 * The keyboard event
 *
 * キーボードイベント
 *
 * 键盘事件
 *
 * @returns 키 입력
 *
 * The key press
 *
 * キー入力
 *
 * 按键
 *
 * @example
 * gridHost.addEventListener('keydown', (e) => {
 *   const command = keys.resolve(keys.mode(), strokeFromEvent(e));
 *   if (command) run(command);
 * });
 */
export function strokeFromEvent(e: KeyEventLike): KeyStroke {
  return {
    key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey,
    isComposing: e.isComposing ?? false,
  };
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
 * 단축키 표. 키 입력을 받아 그 키가 뜻하는 명령 이름을 돌려준다(모드별 단축키·모든 모드 단축키·IME 조합 중 Enter 무시).
 * 마우스로 할 수 있는 명령을 선언해 두면 키보드로 못 하는 명령이 무엇인지도 알려 준다.
 *
 * A shortcut table. Given a key press it returns the name of the command that key means (per-mode shortcuts, all-mode shortcuts, Enter ignored while an IME is composing).
 * If you declare the commands reachable by mouse, it also tells you which ones have no keyboard way.
 *
 * ショートカット表。キー入力を受け取り、そのキーが意味するコマンド名を返します(モード別ショートカット・全モード共通ショートカット・IME 組み立て中の Enter は無視)。
 * マウスでできるコマンドを宣言しておけば、キーボードでできないコマンドが何かも教えてくれます。
 *
 * 快捷键表。接收按键并返回该键表示的命令名称(按模式的快捷键、所有模式通用的快捷键、输入法组字中的 Enter 会被忽略)。
 * 如果声明了鼠标可以执行的命令,它还会告诉你哪些命令无法用键盘完成。
 *
 * @example
 * const keys = new KeyboardInteractionModel();
 * keys.register({ mode: 'nav', pattern: 'S', commandId: 'sort' });
 * keys.register({ mode: '*', pattern: 'Ctrl+C', commandId: 'copy' });
 * keys.resolve('nav', strokeFromEvent(event)); // 'sort' | 'copy' | null
 */
export class KeyboardInteractionModel {
  /** 저장 키 = `${mode}|${normalizedPattern}`. / Storage key = `${mode}|${normalizedPattern}`. */
  private _bindings = new Map<string, KeyBinding>();
  /** 마우스로 할 수 있다고 알린 명령들(parityReport 의 전체 수). / Commands declared as mouse-reachable (the total in parityReport). */
  private _mouseCommands = new Set<string>();
  private _mode: InteractionMode = 'nav';

  /**
   * 단축키를 등록한다. 같은 모드·같은 키가 이미 있으면 덮어쓰지 않고 그 기존 것을 `conflict` 로 돌려준다.
   *
   * Registers a shortcut. If the same mode and key already exist it does not overwrite; it returns the existing one as `conflict`.
   *
   * ショートカットを登録します。同じモード・同じキーがすでにあれば上書きせず、その既存のものを `conflict` として返します。
   *
   * 注册快捷键。如果已有相同模式、相同键,不会覆盖,而是把已有的作为 `conflict` 返回。
   *
   * @param b - 단축키
   *
   * The shortcut
   *
   * ショートカット
   *
   * 快捷键
   *
   * @returns 충돌이 없으면 `{}`, 있으면 `{ conflict }`
   *
   * `{}` when there is no conflict, otherwise `{ conflict }`
   *
   * 衝突がなければ `{}`、あれば `{ conflict }`
   *
   * 没有冲突时为 `{}`,否则为 `{ conflict }`
   */
  register(b: KeyBinding): { conflict?: KeyBinding } {
    const k = this._storeKey(b.mode, normalizePattern(b.pattern));
    const existing = this._bindings.get(k);
    if (existing) return { conflict: existing };
    this._bindings.set(k, b);
    return {};
  }

  /**
   * 마우스로 할 수 있는 명령을 알려 둔다. `parityReport()` 가 키보드로 못 하는 명령을 찾을 때 이 목록과 비교한다.
   *
   * Declares a command that can be done with the mouse. `parityReport()` compares against this list to find commands with no keyboard way.
   *
   * マウスでできるコマンドを知らせておきます。`parityReport()` はキーボードでできないコマンドを探すとき、この一覧と比べます。
   *
   * 声明一个可以用鼠标执行的命令。`parityReport()` 查找无法用键盘完成的命令时会与这个列表比较。
   *
   * @param commandId - 명령 이름
   *
   * Command name
   *
   * コマンド名
   *
   * 命令名称
   */
  declareMouseCommand(commandId: string): void {
    this._mouseCommands.add(commandId);
  }

  /**
   * 키 입력이 뜻하는 명령 이름을 찾는다. 그 모드 전용 단축키를 먼저 보고, 없으면 모든 모드(`'*'`) 단축키를 본다. IME 조합 중의 Enter 는 `null`.
   *
   * Finds the command a key press means. It checks shortcuts for that mode first, then all-mode (`'*'`) shortcuts. Enter while an IME is composing gives `null`.
   *
   * キー入力が意味するコマンド名を探します。そのモード専用のショートカットを先に見て、なければ全モード(`'*'`)のショートカットを見ます。IME 組み立て中の Enter は `null`。
   *
   * 查找按键表示的命令名称。先看该模式专用的快捷键,没有再看所有模式(`'*'`)的快捷键。输入法组字中的 Enter 返回 `null`。
   *
   * @param mode - 지금 모드
   *
   * The current mode
   *
   * 現在のモード
   *
   * 当前模式
   *
   * @param k - 키 입력(`strokeFromEvent(e)` 로 만든다)
   *
   * The key press (build it with `strokeFromEvent(e)`)
   *
   * キー入力(`strokeFromEvent(e)` で作ります)
   *
   * 按键(用 `strokeFromEvent(e)` 构造)
   *
   * @returns 명령 이름, 없으면 `null`
   *
   * The command name, or `null`
   *
   * コマンド名、なければ `null`
   *
   * 命令名称,没有则为 `null`
   */
  resolve(mode: InteractionMode, k: KeyStroke): string | null {
    if (this._guardIme(k)) return null;
    const pat = strokeToPattern(k);
    const hit = this._bindings.get(this._storeKey(mode, pat)) ?? this._bindings.get(this._storeKey('*', pat));
    return hit ? hit.commandId : null;
  }

  /**
   * 지금 모드를 돌려준다.
   *
   * Returns the current mode.
   *
   * 現在のモードを返します。
   *
   * 返回当前模式。
   */
  mode(): InteractionMode { return this._mode; }
  /**
   * 모드를 바꾼다(예: 편집을 시작하면 `edit`).
   *
   * Changes the mode (e.g. `edit` when editing starts).
   *
   * モードを変えます(例: 編集を始めたら `edit`)。
   *
   * 切换模式(例如开始编辑时设为 `edit`)。
   *
   * @param m - 새 모드
   *
   * The new mode
   *
   * 新しいモード
   *
   * 新模式
   */
  setMode(m: InteractionMode): void { this._mode = m; }

  /**
   * `declareMouseCommand` 로 알린 명령 가운데 단축키가 없는 것을 알려 준다. 「마우스 없이 모든 기능을 쓸 수 있나」를 재는 데 쓴다.
   *
   * Reports which commands declared with `declareMouseCommand` have no shortcut — a measure of whether everything can be done without a mouse.
   *
   * `declareMouseCommand` で知らせたコマンドのうち、ショートカットがないものを教えます。「マウスなしですべての機能を使えるか」を測るのに使います。
   *
   * 报告用 `declareMouseCommand` 声明的命令中哪些没有快捷键,用来衡量「不用鼠标能否使用全部功能」。
   *
   * @returns `mouseOnly`=단축키 없는 명령, `covered`/`total`=단축키 있는 수/전체 수
   *
   * `mouseOnly` = commands without a shortcut; `covered`/`total` = count with a shortcut / all
   *
   * `mouseOnly`=ショートカットのないコマンド、`covered`/`total`=ショートカットのある数/全体の数
   *
   * `mouseOnly`=没有快捷键的命令;`covered`/`total`=有快捷键的数量/总数
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

  /**
   * 등록된 단축키 수.
   *
   * Number of registered shortcuts.
   *
   * 登録されたショートカットの数。
   *
   * 已注册的快捷键数量。
   */
  size(): number { return this._bindings.size; }

  private _guardIme(k: KeyStroke): boolean {
    return k.isComposing && COMMIT_KEYS.has(k.key);
  }

  private _storeKey(mode: InteractionMode | '*', pattern: string): string {
    return `${mode}|${pattern}`;
  }
}
