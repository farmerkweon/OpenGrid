// ============================================================
// 여분 컬럼(상태·끌기·행번호·체크·디테일 토글)의 켜짐·순서·폭 / Extra columns: on/off, order, width
// 지금까지 같은 합 계산이 머리글·본문·고정 left·병합·폭 배분·푸터에 따로따로 복사돼 있었다.
// 한 군데만 고치면 나머지가 어긋나므로, 그 지식을 이 값 하나에 모으고 다른 곳은 묻기만 한다.
//
// Extra-column widths used to be re-summed in many places (header, body, frozen left, merge, width
// distribution, footer). Keeping that knowledge in one value means a single change can't drift.
// ============================================================
import { px, type Px } from './types.js';
import type { ExtraColumnId, IExtraColumns } from './geometryPorts.js';

/**
 * 그리는 순서와 폭. 순서는 이 표의 순서 그대로다(옵션 객체를 어떤 순서로 썼든 상관없다).
 *
 * Drawing order and widths; order follows this table regardless of option key order.
 */
const TABLE: readonly { readonly id: ExtraColumnId; readonly width: number }[] = [
  { id: 'state', width: 24 },
  { id: 'drag', width: 18 },
  { id: 'rowNumber', width: 44 },
  { id: 'check', width: 36 },
  { id: 'detail', width: 28 },
];

/** 다섯 켬/끔 조합(2⁵)마다 하나씩만 만들어 나눠 쓴다 — 불변 값이라 공유해도 안전하다. */
const CACHE: (ExtraColumns | undefined)[] = new Array(1 << TABLE.length);

/** fromOptions 가 읽는 옵션. 참거짓은 지금 코드처럼 truthy 로 본다(`=== true` 가 아님). */
export interface ExtraColumnOptions {
  stateColumn?: boolean;
  draggable?: boolean;
  rowNumber?: boolean;
  checkColumn?: boolean;
  detailExpanderCol?: boolean;
}

/**
 * 여분 컬럼의 켜짐·순서·폭을 아는 유일한 곳(불변 값).
 * 불변: width() = Σ 켜진 폭, ids 순서 = state→drag→rowNumber→check→detail.
 *
 * Sole owner of extra-column on/off, order and width (immutable value).
 */
export class ExtraColumns implements IExtraColumns {
  readonly ids: readonly ExtraColumnId[];
  private readonly _width: Float64Array;
  private readonly _left: Float64Array;
  private readonly _total: number;

  private constructor(mask: number) {
    const ids: ExtraColumnId[] = [];
    this._width = new Float64Array(TABLE.length);
    this._left = new Float64Array(TABLE.length);
    let acc = 0;
    for (let i = 0; i < TABLE.length; i++) {
      const on = (mask & (1 << i)) !== 0;
      this._left[i] = acc;
      if (on) {
        ids.push(TABLE[i]!.id);
        this._width[i] = TABLE[i]!.width;
        acc += TABLE[i]!.width;
      }
    }
    this.ids = Object.freeze(ids);
    this._total = acc;
  }

  /**
   * 그리드 옵션에서 만든다. 옵션이 없어도(undefined) 던지지 않고 「여분 없음」을 돌려준다 — 래퍼가 옵션 없이 부를 수 있다.
   *
   * Builds from grid options; undefined yields the empty set instead of throwing.
   */
  static fromOptions(o: ExtraColumnOptions | null | undefined): ExtraColumns {
    const opts = o ?? {};
    const mask =
      (opts.stateColumn ? 1 : 0) |
      (opts.draggable ? 2 : 0) |
      (opts.rowNumber ? 4 : 0) |
      (opts.checkColumn ? 8 : 0) |
      (opts.detailExpanderCol ? 16 : 0);
    return CACHE[mask] ?? (CACHE[mask] = new ExtraColumns(mask));
  }

  /** 꺼진 컬럼이면 0. / 0 when that column is off. */
  widthOf(id: ExtraColumnId): Px {
    return px(this._width[indexOf(id)]!);
  }

  /**
   * 고정(sticky) 때 left. 꺼진 컬럼이면 width() — 묻는 쪽에 NaN·undefined 가 퍼지지 않게 끝자리를 준다.
   *
   * Sticky left; for an off column returns width() so callers never see NaN.
   */
  leftOf(id: ExtraColumnId): Px {
    const i = indexOf(id);
    return px(this._width[i]! > 0 ? this._left[i]! : this._total);
  }

  /** Σ 켜진 여분 컬럼 폭. / Sum of enabled extra-column widths. */
  width(): Px {
    return px(this._total);
  }

}

/** id → TABLE 자리. / id → TABLE slot. */
const INDEX: Readonly<Record<ExtraColumnId, number>> = { state: 0, drag: 1, rowNumber: 2, check: 3, detail: 4 };

function indexOf(id: ExtraColumnId): number {
  return INDEX[id];
}
