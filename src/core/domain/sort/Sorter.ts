// ============================================================
// 정렬 창구(파사드) / Sorting facade
//
// 표시 순서의 주인(DataLayer)과 정렬 상태의 주인(SortFilterManager)이 아는 정렬 쪽 이름은 이것 하나다.
// 안에서는 키 열 보관소 → 순서 매기기 고르기 → 실행기로 차례대로 맡기기만 한다.
// 출발 순서는 늘 원천이 주는 「지금 표시 순서」다 — 같은 값끼리는 직전 순서를 지키는 것이 옛 정렬의
// 규칙이고, 비교가 「같음」인데 값이 다른 경우(10 과 '10', NaN)에 결과로 드러나기 때문이다.
// 긴 공통 머리말 정렬(드물게 탐)은 처음 필요해질 때 따로 내려받는다. 받기 전에는 코어의 비교 정렬이 같은 순서를
// 내고(안정 정렬의 결과는 하나뿐), 받은 뒤부터 비용 어림이 고른다 — 정렬은 늘 부른 자리에서 동기로 끝난다.
//
// The only sorting name the display-order owner and the sort-state owner know. Internally it just
// delegates: key-column store → orderer choice → runner. The start order is always the source's current
// display order — the legacy rule keeps the previous order among equal keys, which becomes visible
// whenever different values compare equal (10 vs '10', NaN). The rarely needed long-prefix sort is fetched
// on first need; until it arrives the core comparison sort yields the same order (a stable sort's result is
// unique), afterwards the cost estimate chooses — sorting always completes synchronously where it is called.
// ============================================================
import type {
  IRowSource, ISorter, ISortKeyColumn, ISortKeyStore, ISortOrderer, ISortRunner, SortComparator, SortJob, SortSpec,
} from './ports.js';

/** 따로 내려받는 조각이 내놓는 것 — 머리말 기억 정렬과 그것을 고르는 비용 어림. / What the lazily loaded chunk provides. */
export interface PrefixSortChunk {
  readonly LcpMergeOrderer: new () => ISortOrderer;
  readonly SortCostEstimate: {
    pickOrderer(orderers: readonly ISortOrderer[], keys: readonly ISortKeyColumn[], start: readonly number[]): ISortOrderer;
  };
}

/** 생성 옵션. / Construction options. */
export interface SorterOptions {
  /** 머리말 기억 정렬 조각을 내려받는 함수(없으면 비교 정렬만). / Loader for the prefix-sort chunk (none: comparison only). */
  readonly loadPrefixSort?: () => Promise<PrefixSortChunk>;
}

/** 머리말 정렬 조각을 부를 만한 최소 행 수(이보다 작으면 이득이 없다 — 표본 크기와 같음). / Min rows worth fetching it for. */
const PREFIX_MIN_ROWS = 1024;

/**
 * 정렬 파사드. sortNow 는 늘 동기로 끝난 순서를 돌려준다(orderBy 의 공개 뜻).
 *
 * Sorting facade; sortNow always returns a finished order synchronously (orderBy's public meaning).
 */
export class Sorter implements ISorter {
  /** 진단: 마지막 정렬이 쓴 순서 매기기의 이름표. / Diagnostic: id of the orderer used by the last sort. */
  lastOrdererId = '';
  /** 머리말 정렬 조각 받기가 끝나면(실패 포함) 풀리는 약속 — 시험·진단용. / Settles once the chunk load ends (incl. failure). */
  prefixSortReady: Promise<void> = Promise.resolve();

  private _orderers: readonly ISortOrderer[];
  private _pick: PrefixSortChunk['SortCostEstimate']['pickOrderer'] | null = null;
  private _load: (() => Promise<PrefixSortChunk>) | null;

  /**
   * @param source 행 원천(원 자료 + 지금 표시 순서) / row source (data + current display order)
   * @param store 키 열을 주는 곳 / key-column store
   * @param orderers 순서 매기기 후보(받아 주는 첫 전략을 씀 — 조각이 오면 비용 어림이 고름) / candidate orderers
   * @param sync 한 번에 끝내는 실행기 / run-to-completion runner
   * @param opts 머리말 정렬 조각 로더 / prefix-sort chunk loader
   */
  constructor(
    private readonly _source: IRowSource,
    private readonly _store: ISortKeyStore,
    orderers: readonly ISortOrderer[],
    private readonly _sync: ISortRunner,
    opts: SorterOptions = {},
  ) {
    if (orderers.length === 0) throw new RangeError('Sorter: at least one orderer is required');
    this._orderers = orderers;
    this._load = opts.loadPrefixSort ?? null;
  }

  /**
   * @param start 출발 순서. 생략하면 원천의 지금 표시 순서(원천을 쥐고 직접 부르는 쪽의 편의 — 표시 순서의 주인은 늘 넘긴다)
   *   / start order; defaults to the source's current display order (the display-order owner always passes it)
   */
  sortNow(specs: readonly SortSpec[], cmp: SortComparator, start: readonly number[] = this._source.displayOrder()): readonly number[] {
    // 키가 없으면 출발 순서 그대로(사본 — 넘겨받은 배열을 밖으로 내주지 않는다).
    // No keys: the start order as is (a copy, never the caller's own array).
    if (specs.length === 0) return start.slice();
    return Array.from(this._start(specs, cmp, start).settle());
  }

  sortInteractive(specs: readonly SortSpec[], cmp: SortComparator, start: readonly number[] = this._source.displayOrder()): SortJob {
    return this._start(specs, cmp, start);
  }

  private _start(specs: readonly SortSpec[], cmp: SortComparator, start: readonly number[]): SortJob {
    // 키 열과 순서 매기기가 같은 출발 배열을 본다 — 정렬 도중 원천이 바뀌어도(비교자 안에서 다시 정렬하는 등) 흔들리지 않는다.
    // Key columns and the orderer see the same start array, so a source change mid-sort cannot skew them.
    const keys = specs.map(s => this._store.keyColumnFor(s, cmp, start));
    const dirs = specs.map(s => s.dir);
    const orderer = this._ordererFor(keys, start);
    this.lastOrdererId = orderer.id;
    const job = this._sync.run(start, keys, dirs, orderer);
    // 끝난 순서를 보관소에 알린다 — 같은 컬럼을 다시 정렬할 때 이 순서에서 등수를 매긴다(첫 키만 이 순서로 정렬돼 있다).
    // Tell the store the finished order; a re-sort of the same column ranks from it (only the first key is sorted by it).
    job.onDone(order => this._store.noteSorted?.(keys[0]!, order, dirs[0]));
    return job;
  }

  private _ordererFor(keys: readonly ISortKeyColumn[], start: readonly number[]): ISortOrderer {
    if (this._pick) return this._pick(this._orderers, keys, start);
    this._fetchPrefixSortIfUseful(keys, start.length);
    const found = this._orderers.find(o => o.accepts(keys, start.length));
    if (!found) throw new Error('Sorter: no orderer accepts these keys');
    return found;
  }

  /**
   * 글자 키 하나로 큰 표를 정렬할 때 처음 한 번만 머리말 정렬 조각을 부른다. 이번 정렬은 기다리지 않는다.
   * 받기에 실패하면 비교 정렬로 계속(결과는 같고 느릴 뿐).
   *
   * Fetches the prefix-sort chunk once, on the first large single-string-key sort; this sort does not wait.
   * A failed fetch keeps the comparison sort (same result, only slower).
   */
  private _fetchPrefixSortIfUseful(keys: readonly ISortKeyColumn[], rowCount: number): void {
    const load = this._load;
    if (!load || keys.length !== 1 || keys[0]!.kind !== 'string' || rowCount < PREFIX_MIN_ROWS) return;
    this._load = null;
    this.prefixSortReady = load().then(
      chunk => {
        this._orderers = [...this._orderers, new chunk.LcpMergeOrderer()];
        this._pick = (o, k, s) => chunk.SortCostEstimate.pickOrderer(o, k, s);
      },
      () => { /* 받지 못하면 비교 정렬 그대로 / keep the comparison sort */ },
    );
  }
}
