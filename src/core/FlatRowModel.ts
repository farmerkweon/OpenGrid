/**
 * FlatRowModel — flat/visual index ↔ data 리졸버 (baseline 공통 인프라, Phase 0).
 *
 * 계약: docs/design/grid-features-2026-07/15_cross_contracts.md §C0.3
 *  - "F2 산출물"이 아니라 baseline 공통 인프라다. 어떤 기능도 켜지지 않아도 존재하며,
 *    OpenGrid 가 항상 소유·수명 관리하고 grid.getFlatRowModel() 로 공개된다.
 *  - 기본 backing = plain rows(DataLayer 표시 순서). group/tree 활성 시 GroupTreeManager
 *    가 자기 flat 배열(`_groupFlatRows`/`_treeFlatRows`)을 setBacking() 으로 등록해
 *    backing 을 통째로 교체한다. F2 활성 시 DetailManager 가 registerSplice() 로 합성
 *    후단에 detail head/filler 의사행을 끼워 넣는다(Phase 0 시점엔 소비자 없음 = inert).
 *  - 합성 체인은 단방향: plain → group/tree(backing 교체) → detail splice.
 *  - F1/F3/F4 는 반드시 이 모델을 경유하고 DataLayer._displayIndexes/getRowByIndex 를
 *    직접 만지지 않는다(C0.3 "쓰기 안전" 포함).
 */

import type { DataLayer } from './DataLayer.js';
import { _isGroup } from './GroupEngine.js';
import { isTreeNode } from './TreeEngine.js';

/**
 * flat 한 행이 무엇을 가리키는지 판별하는 참조 정보(C0.3).
 * / Reference info identifying what a flat row points to (C0.3).
 */
export interface FlatRowRef {
  /** 행 종류(데이터/그룹/트리/디테일 헤드·필러). / Row kind (data/group/tree/detail head·filler). */
  kind: 'data' | 'group' | 'tree' | 'detailHead' | 'detailFiller';
  /** kind==='data'|'tree' 일 때 stable id(DataLayer 가 부여한 rowId 필드값). / Stable id when kind is 'data'|'tree' (the rowId field value assigned by DataLayer). */
  rowId?: string;
  /** kind==='data' 일 때 DataLayer 원본(_data) 인덱스. / DataLayer source (_data) index when kind is 'data'. */
  dataIndex?: number;
  /** 정렬/필터 반영된 논리 순서. plain 모드(backing 미교체)에서만 flatIndex 와 1:1 대응. / Logical order after sort/filter; equals flatIndex 1:1 only in plain mode (backing not replaced). */
  displayIndex?: number;
}

/** flat 배열을 구성하는 원소(실데이터 행 T, GroupRow, 또는 TreeNode) — 내부 전용. */
type FlatItem = any;

/** group/tree 등이 baseline backing 을 통째로 교체할 때 쓰는 provider. null = plain 으로 복귀. / Provider used by group/tree to replace the baseline backing wholesale; null = revert to plain. */
export type FlatBackingProvider = (() => FlatItem[]) | null;

/** 합성 후단에서 flat 배열을 변형하는 훅 — F2 detail splice 용. / Hook that transforms the flat array at the tail of composition — for F2 detail splice. */
export type FlatSpliceFn = (flat: FlatItem[]) => FlatItem[];

/** splice 가 지금 끼워 넣을 것이 실제로 있는지 알리는 술어. / Predicate telling whether a splice currently has anything to insert. */
type FlatSpliceActiveFn = () => boolean;

/** 등록된 splice 한 칸 — 변환기, 활성 술어, 판 번호(없으면 null). / One registered splice — the transformer, its activity predicate and its version (null when absent). */
interface FlatSpliceEntry {
  fn: FlatSpliceFn;
  isActive: FlatSpliceActiveFn;
  version: (() => number) | null;
}

/**
 * 합성 결과가 아직 맞는지 가리는 열쇠. 합성의 입력이 바뀌었는지만 본다:
 * 자료 계층(인스턴스와 구조 판 번호 — 행 집합·표시 순서가 바뀔 때만 오름), backing(공급 함수와
 * 그것이 돌려주는 배열), splice 마다의 판 번호. 행 값이 바뀌어도 합성은 행 자리만 기억하므로
 * 열쇠에 넣지 않는다. 판 번호를 알리지 않는 splice 가 하나라도 있으면 언제 낡는지 알 수 없으므로
 * 담아 두지 않는다(매번 합성 — 예전 동작).
 *
 * 부를 때마다(칸마다) 비교하므로 객체·배열을 새로 만들지 않는다.
 *
 * The key that tells whether a composed result is still valid. It only looks at the inputs of the
 * composition: the data layer (instance and structure version — bumped only when the row set or display
 * order changes), the backing (provider and the array it returns) and each splice's version. Row values
 * are left out because the composition only remembers row positions. If any splice does not report a
 * version we cannot know when it goes stale, so nothing is kept (compose every time — the old behaviour).
 *
 * It is compared on every call (per cell), so it allocates no objects or arrays.
 */
class CompositionKey {
  private _dl: DataLayer<any> | null = null;
  private _structure = -1;
  private _backing: FlatBackingProvider = null;
  private _base: FlatItem[] | null = null;
  private _versions: number[] = [];

  constructor(
    private readonly _readDl: () => DataLayer<any>,
    private readonly _readBacking: () => FlatBackingProvider,
    private readonly _readSplices: () => readonly FlatSpliceEntry[],
  ) {}

  /**
   * 마지막으로 잡아 둔 뒤 입력이 그대로인가. 담아 둔 결과가 있을 때만 불린다(그때는 반드시 잡아 둔 뒤이고,
   * splice 등록이 바뀌면 결과를 버리므로 splice 개수는 같다).
   * / Whether the inputs are unchanged since the last capture. Only called while a result is kept (so a capture
   * exists, and since registering a splice drops the result the splice count is the same).
   */
  same(): boolean {
    const dl = this._readDl();
    if (dl !== this._dl || dl.structureVersion !== this._structure) return false;
    const backing = this._readBacking();
    if (backing !== this._backing) return false;
    if (backing && backing() !== this._base) return false;
    const splices = this._readSplices();
    for (let i = 0; i < splices.length; i++) {
      if (splices[i]!.version!() !== this._versions[i]) return false;
    }
    return true;
  }

  /**
   * 지금 입력을 잡아 둔다. 판 번호 없는 splice 가 있으면 잡지 않고 false(담아 두면 안 됨).
   * / Capture the current inputs. Returns false without capturing when a splice has no version (must not cache).
   */
  take(): boolean {
    const splices = this._readSplices();
    for (let i = 0; i < splices.length; i++) {
      const version = splices[i]!.version;
      if (version === null) return false; // 반쯤 적힌 판 번호는 결과를 안 담으므로 쓰이지 않는다 / never used: nothing is kept
      this._versions[i] = version();
    }
    const dl = this._readDl();
    this._dl = dl;
    this._structure = dl.structureVersion;
    this._backing = this._readBacking();
    this._base = this._backing ? this._backing() : null;
    return true;
  }
}

/**
 * flat 행을 내주는 원천. FlatRowModel 은 지금 상태에 맞는 원천 하나를 골라 맡기기만 한다.
 *
 * 원천이 둘인 까닭: 합성할 것이 없는 평범한 그리드에서 칸 하나를 그릴 때마다 전 행 배열을
 * 새로 만들면 행 수에 비례한 일이 칸마다 생긴다. 그래서 합성이 없으면 DataLayer 에 바로
 * 묻는 원천을, 합성이 있으면 합성하는 원천(입력이 그대로면 담아 둔 결과)을 쓴다. 두 원천이 내주는 행 객체는
 * 같은 참조다(감싸거나 새로 만들지 않는다).
 *
 * The source that hands out flat rows. FlatRowModel only picks the source that fits the current
 * state and delegates to it.
 *
 * Why two sources: if a plain grid with nothing to compose rebuilt the whole row array for every
 * cell it paints, every cell would cost work proportional to the row count. So when nothing is
 * composed we ask DataLayer directly, and when something is we compose (reusing the kept result while the inputs are unchanged).
 * Both sources hand out the very same row objects (never wrapped or recreated).
 */
interface FlatRowSource {
  /** 합성된 flat 행 수. / Number of composed flat rows. */
  count(): number;
  /** flat index 의 항목(범위 밖이면 undefined). / The item at a flat index (undefined when out of range). */
  itemAt(flatIndex: number): FlatItem | undefined;
  /** 합성된 flat 배열 전체(새 배열일 수 있다 — 변경 금지). / The whole composed flat array (may be a fresh array — do not mutate). */
  array(): FlatItem[];
}

/**
 * 직통 원천 — backing 도 활성 splice 도 없을 때 DataLayer 표시 순서에 O(1) 로 묻는다.
 *
 * `DataLayer.getData()` 는 표시 순서대로 새 배열을 만들어 돌려주므로 `getData()[i]` 와
 * `getRowByIndex(i)` 는 같은 행 객체다. 배열을 만들지 않고 그 한 행만 꺼낸다.
 *
 * Direct source — with no backing and no active splice, asks DataLayer's display order in O(1).
 *
 * `DataLayer.getData()` builds and returns a fresh array in display order, so `getData()[i]` and
 * `getRowByIndex(i)` are the same row object. We fetch just that one row without building the array.
 */
class DirectFlatSource implements FlatRowSource {
  /** 이 원천이 행 하나를 내준 횟수(진단용). / How many times this source handed out a row (diagnostic). */
  private _hits = 0;

  constructor(private readonly _dl: () => DataLayer<any>) {}

  /** 행을 내준 누적 횟수 — 바깥은 읽기만 한다. / Cumulative rows handed out — read-only from outside. */
  get hits(): number {
    return this._hits;
  }

  count(): number {
    return this._dl().rowCount;
  }

  itemAt(flatIndex: number): FlatItem | undefined {
    this._hits++;
    return this._dl().getRowByIndex(flatIndex);
  }

  array(): FlatItem[] {
    return this._dl().getData();
  }
}

/**
 * 합성 원천 — backing(group/tree) 이나 활성 splice(디테일 펼침)가 있을 때 `backing → splice…` 를
 * 합성하고, 그 결과를 열쇠(합성의 입력)가 같은 동안 다시 쓴다.
 *
 * 칸 하나를 그릴 때마다 전 행을 다시 합성하면 묶음·나무·디테일 그리드에서 행 수에 비례한 일이
 * 칸마다 생긴다. 입력이 그대로면 결과도 같으므로 한 번 합성한 배열을 돌려준다. 입력이 하나라도
 * 바뀌면 그 자리에서 다시 합성한다(미루지 않으므로 낡은 결과가 화면에 나갈 틈이 없다).
 *
 * Composed source — when a backing (group/tree) or an active splice (expanded detail) exists, it
 * composes `backing → splice…` and reuses the result while the key (the composition's inputs) stays the same.
 *
 * Recomposing every row for every painted cell would cost work proportional to the row count per cell
 * in group/tree/detail grids. Same inputs give the same result, so the array composed once is handed
 * back. When any input changes it recomposes on the spot (nothing is deferred, so a stale result never
 * reaches the screen).
 */
class ComposedFlatSource implements FlatRowSource {
  private _cache: FlatItem[] | null = null;
  private _builds = 0;

  constructor(
    private readonly _compose: () => FlatItem[],
    private readonly _key: CompositionKey,
  ) {}

  /** 합성한 누적 횟수(진단용). / Cumulative number of compositions (diagnostic). */
  get builds(): number {
    return this._builds;
  }

  count(): number {
    return this._current().length;
  }

  itemAt(flatIndex: number): FlatItem | undefined {
    return this._current()[flatIndex];
  }

  array(): FlatItem[] {
    return this._current();
  }

  /** 담아 둔 결과를 버린다(backing·splice 등록이 바뀔 때). / Drop the kept result (when backing or splice registration changes). */
  invalidate(): void {
    this._cache = null;
  }

  private _current(): FlatItem[] {
    if (this._cache !== null && this._key.same()) return this._cache;
    const keep = this._key.take();
    const flat = this._compose();
    this._builds++;
    this._cache = keep ? flat : null;
    return flat;
  }
}

// 참고: FlatRowRef 는 전부 원시 타입(string|number|undefined)만 노출하므로 FlatRowModel 은
// 행 데이터 타입 T 에 의존하지 않는다(비제네릭). OpenGridInstance<T> 는 언바운드 제네릭이라
// DataLayer<T extends Record<string, any>> 제약과 직접 맞물리면 타입 에러가 나므로 의도적으로
// DataLayer<any> 를 받는다 — 실제 사용처(OpenGrid)는 항상 구체 T 의 DataLayer 를 넘긴다.
/** FlatRowModel 의존성 주입. / FlatRowModel dependency injection. */
export interface FlatRowModelDeps {
  /** 현재 DataLayer 를 반환하는 getter. / Getter returning the current DataLayer. */
  getDataLayer: () => DataLayer<any>;
  /** DataLayer 가 각 행에 부여하는 안정 rowId 필드명(OpenGrid 의 ROW_ID_FIELD, 기본 '_ogRowId'). / Stable rowId field name assigned by DataLayer (OpenGrid's ROW_ID_FIELD, default '_ogRowId'). */
  rowIdField: string;
}

/**
 * flat/visual index ↔ data 리졸버(baseline 공통 인프라). / flat/visual index ↔ data resolver (baseline shared infra).
 *
 * plain rows 를 기본 backing 으로 두고, group/tree 는 setBacking 으로 backing 을 교체하며,
 * F2 는 registerSplice 로 합성 후단에 detail 의사행을 끼워 넣는다(합성 체인은 단방향).
 * / Uses plain rows as the default backing; group/tree replace the backing via setBacking, and F2 inserts
 * detail pseudo-rows at the tail of composition via registerSplice (the composition chain is one-directional).
 */
export class FlatRowModel {
  private _d: FlatRowModelDeps;
  /** group/tree 가 등록한 backing override. null 이면 plain(DataLayer.getData()). */
  private _backing: FlatBackingProvider = null;
  /** F2 detail splice 등록 슬롯(변환기 + 활성 술어). */
  private _splices: FlatSpliceEntry[] = [];
  /** 합성할 것이 없을 때 쓰는 원천. / Source used when there is nothing to compose. */
  private readonly _direct: DirectFlatSource;
  /** 합성할 것이 있을 때 쓰는 원천. / Source used when there is something to compose. */
  private readonly _composed: ComposedFlatSource;

  // 지연 빌드 역인덱스(rowId → flatIndex). 마지막으로 인덱싱한 flat 배열 참조와 비교해 무효화한다.
  // plain 모드는 DataLayer.getData()가 매번 새 배열을 반환하므로 호출마다 자연 재빌드된다.
  // group/tree 모드는 backing 배열이 rebuild 시점에만 교체되므로 그 사이엔 O(1) 재사용된다.
  private _revIndex: Map<string, number> | null = null;
  private _revIndexSrc: FlatItem[] | null = null;

  constructor(deps: FlatRowModelDeps) {
    this._d = deps;
    this._direct = new DirectFlatSource(() => this._d.getDataLayer());
    this._composed = new ComposedFlatSource(
      () => this._compose(),
      new CompositionKey(() => this._d.getDataLayer(), () => this._backing, () => this._splices),
    );
  }

  /**
   * 진단용: 합성 없이 DataLayer 에서 바로 행을 읽은 누적 횟수. 빠른 길을 실제로 탔는지 시험이 확인하려고 둔다.
   * 값의 뜻·증가 시점은 보장하지 않으며 버전 사이에 바뀔 수 있다 — 응용 코드에서 기대지 말 것.
   *
   * Diagnostic: cumulative count of rows read straight from DataLayer without composing, kept so tests
   * can confirm the fast path is really taken. Its meaning and when it increments are not guaranteed
   * and may change between versions — do not rely on it in application code.
   *
   * 診断用: 合成せずに DataLayer から直接行を読んだ累積回数。高速経路を実際に通ったかをテストが確かめるために置く。
   * 値の意味・増える時点は保証せず、バージョン間で変わりうる — アプリケーションコードで頼らないこと。
   *
   * 诊断用: 不经合成、直接从 DataLayer 读取行的累计次数。用于让测试确认确实走了快速路径。
   * 其含义和递增时机不作保证,版本之间可能变化 — 请勿在应用代码中依赖。
   *
   * @internal
   */
  get directHits(): number {
    return this._direct.hits;
  }

  /**
   * 내부용: 자료 계층의 구조 판 번호(행 집합·표시 순서가 바뀔 때만 오름). splice 등록자가 「지금 자료 기준」
   * 판정을 같은 판 동안 다시 하지 않으려고 묻는다. 값의 뜻은 보장하지 않으며 버전 사이에 바뀔 수 있다.
   *
   * Internal: the data layer's structure version (bumped only when the row set or display order changes).
   * Splice registrants ask it so they need not redo a "against the current data" check within the same
   * version. Its meaning is not guaranteed and may change between versions.
   *
   * 内部用: データ層の構造バージョン(行の集合・表示順が変わるときだけ増える)。splice の登録者が
   * 「今のデータ基準」の判定を同じバージョンの間に繰り返さないために問い合わせる。値の意味は保証せず、バージョン間で変わりうる。
   *
   * 内部用: 数据层的结构版本号(仅在行集合或显示顺序变化时递增)。splice 的注册者借此避免在同一版本内重复
   * 「以当前数据为准」的判断。其含义不作保证,版本之间可能变化。
   *
   * @internal
   */
  get dataStructureVersion(): number {
    return this._d.getDataLayer().structureVersion;
  }

  /**
   * group/tree 등 baseline backing 을 통째로 교체하는 등록점. provider=null 이면 plain(DataLayer 표시 순서)으로 복귀.
   * / Registration point that replaces the baseline backing wholesale (group/tree); provider=null reverts to plain (DataLayer display order).
   *
   * @param provider - backing 공급 함수 또는 null / Backing provider function or null
   */
  setBacking(provider: FlatBackingProvider): void {
    this._backing = provider;
    this._invalidate();
  }

  /**
   * F2 DetailManager 가 합성 후단에 detail head/filler pseudo-row 를 끼워 넣을 변환기를 등록한다. 등록 순서대로 순차 적용.
   * / Register a transformer that F2 DetailManager uses to insert detail head/filler pseudo-rows at the tail of composition; applied in registration order.
   *
   * 「등록되어 있다」와 「지금 끼워 넣을 것이 있다」는 다르다. 디테일 기능은 펼친 행이 없어도
   * splice 를 늘 등록해 두므로, 등록 여부로 원천을 고르면 합성할 것이 없는 그리드도 칸마다
   * 전 행 배열을 만든다. 그래서 등록자가 활성 술어를 같이 넘기고, 모든 splice 가 비활성이면
   * 직통 원천을 쓴다. 술어 없이 등록한 splice 는 늘 활성으로 본다(뜻을 바꾸지 않는 쪽).
   *
   * "Registered" is not the same as "has something to insert now". The detail feature keeps its
   * splice registered even with no row expanded, so choosing the source by registration would make
   * a grid with nothing to compose rebuild the whole row array per cell. The registrant therefore
   * passes an activity predicate as well, and when every splice is inactive the direct source is
   * used. A splice registered without a predicate is treated as always active (the safe reading).
   *
   * @param fn - flat 배열 변환 함수 / Flat-array transform function
   * @param isActive - 지금 끼워 넣을 것이 있는지(생략하면 늘 true) / Whether it has anything to insert now (always true when omitted)
   * @param version - 끼워 넣는 결과가 바뀔 때마다 오르는 판 번호(생략하면 합성 결과를 담아 두지 않는다) / A version bumped whenever the inserted result would change (when omitted the composed result is never kept)
   */
  registerSplice(fn: FlatSpliceFn, isActive: () => boolean = () => true, version?: () => number): void {
    this._splices.push({ fn, isActive, version: version ?? null });
    this._invalidate();
  }

  /** 합성 완료된 flat 행 수. / Count of composed flat rows. */
  count(): number {
    return this._source().count();
  }

  /**
   * 합성 완료된 flat 배열 원본을 노출한다(F2 렌더 배선 소비 — GridRenderer.renderBody 가 이 배열을
   * `groupFlatRows` 자리에 그대로 넘겨받아 detail head/filler 를 렌더한다). 호출측은 결과를
   * 변경하지 않는다(내부 backing/splice 산출물을 그대로 반환).
   * / Expose the composed flat array (consumed by F2 render wiring — GridRenderer.renderBody takes it in the
   * `groupFlatRows` slot to render detail head/filler). Callers must not mutate the result (it returns the
   * internal backing/splice output as-is).
   *
   * @returns 합성된 flat 배열(변경 금지) / The composed flat array (do not mutate)
   */
  getFlatArray(): FlatItem[] {
    return this._source().array();
  }

  /**
   * flat index 가 가리키는 행의 참조 정보를 해소한다(C0.3 쓰기 안전).
   * / Resolve the reference info for the row at a flat index (C0.3 write-safety).
   *
   * @param flatIndex - 합성된 flat 배열의 인덱스 / Index into the composed flat array
   * @returns 행 참조 정보 / Row reference info
   */
  resolveFlatRow(flatIndex: number): FlatRowRef {
    const item = this._source().itemAt(flatIndex);
    if (item == null) return { kind: 'data' };

    // F2(11_design_F2_v2.md §3.4/C0.3): DetailManager 가 registerSplice 로 끼워 넣는 detail
    // head/filler 의사행. 반드시 _isGroup/isTreeNode 판별보다 먼저 걸러야 한다 — 두 검사 모두
    // 이 항목엔 매칭되지 않아(플래그 없음) 이 체크 없이는 "plain data row" 폴백으로 새어
    // rowId=undefined 인 잘못된 kind:'data' 를 반환하게 된다(INT-01 쓰기 안전 위반).
    if ((item as any)._isDetailFiller === true) return { kind: 'detailFiller', rowId: (item as any)._rowId };
    if ((item as any)._isDetailHead === true) return { kind: 'detailHead', rowId: (item as any)._rowId };

    if (_isGroup(item)) return { kind: 'group' };

    if (isTreeNode(item)) {
      const row = (item as any).data;
      return { kind: 'tree', rowId: row?.[this._d.rowIdField] };
    }

    // plain data row(T)
    const rowId = item[this._d.rowIdField];
    const dataIndex = this._d.getDataLayer().getDataIndexByRowId(rowId);
    const ref: FlatRowRef = { kind: 'data', rowId };
    if (dataIndex !== undefined) ref.dataIndex = dataIndex;
    // backing 이 교체된(group/tree) 상태에선 flatIndex 가 더 이상 display 순서와 무관하므로 비운다.
    if (!this._backing) ref.displayIndex = flatIndex;
    return ref;
  }

  /**
   * flat index 가 가리키는 데이터 행(트리 노드면 그 노드의 데이터). 그룹 머리·상세 칸·범위 밖이면 null.
   * / The data row at a flat index (a tree node's data for tree rows); null for group heads, detail slots or out of range.
   *
   * @param flatIndex - 합성된 flat 배열의 인덱스 / Index into the composed flat array
   * @returns 데이터 행 또는 null / The data row or null
   */
  rowAt(flatIndex: number): Record<string, any> | null {
    const item = this._source().itemAt(flatIndex);
    if (item == null || item._isDetailFiller === true || item._isDetailHead === true || _isGroup(item)) return null;
    return isTreeNode(item) ? ((item as any).data ?? null) : item;
  }

  /**
   * rowId → 현재 flat index. 없으면 -1. / rowId → current flat index; -1 if absent.
   *
   * @param rowId - 조회할 stable rowId / Stable rowId to look up
   * @returns flat index 또는 -1 / Flat index or -1
   */
  flatIndexOfRowId(rowId: string): number {
    this._ensureRevIndex();
    return this._revIndex!.get(rowId) ?? -1;
  }

  /**
   * flat index → rowId(data/tree 행일 때만). 그 외 null. / flat index → rowId (only for data/tree rows); null otherwise.
   *
   * @param flatIndex - 합성된 flat 배열의 인덱스 / Index into the composed flat array
   * @returns rowId 또는 null / rowId or null
   */
  rowIdOfFlat(flatIndex: number): string | null {
    const ref = this.resolveFlatRow(flatIndex);
    return (ref.kind === 'data' || ref.kind === 'tree') ? (ref.rowId ?? null) : null;
  }

  // ─── 내부 ──────────────────────────────────────────────
  /**
   * 지금 상태에 맞는 원천. backing 이 없고 활성 splice 가 하나도 없으면 직통, 아니면 합성.
   * / The source that fits the current state: direct when there is no backing and no active
   * splice, composed otherwise.
   */
  private _source(): FlatRowSource {
    if (this._backing) return this._composed;
    for (let i = 0; i < this._splices.length; i++) {
      if (this._splices[i]!.isActive()) return this._composed;
    }
    return this._direct;
  }

  /** backing(또는 표시 순서) → splice 를 차례로 적용한 합성 배열. / The array composed from backing (or display order) through every splice in order. */
  private _compose(): FlatItem[] {
    let flat = this._backing ? this._backing() : this._d.getDataLayer().getData();
    for (const splice of this._splices) flat = splice.fn(flat);
    return flat;
  }

  private _invalidate(): void {
    this._composed.invalidate();
    this._revIndex = null;
    this._revIndexSrc = null;
  }

  private _ensureRevIndex(): void {
    const flat = this._source().array();
    if (this._revIndex && this._revIndexSrc === flat) return;
    const idx = new Map<string, number>();
    for (let i = 0; i < flat.length; i++) {
      const item = flat[i];
      if (item == null || _isGroup(item)) continue;
      // F2: detail head/filler 는 고유 데이터 행이 아니므로 역인덱스에서 제외(마스터 행 자신은
      // 스플라이스 전 위치 그대로 별도 인덱싱된다 — head/filler 는 그 "뒤"에 삽입되는 의사행).
      if ((item as any)._isDetailHead === true || (item as any)._isDetailFiller === true) continue;
      const row = isTreeNode(item) ? (item as any).data : item;
      const rid = row?.[this._d.rowIdField];
      if (rid != null) idx.set(rid, i);
    }
    this._revIndex = idx;
    this._revIndexSrc = flat;
  }
}
