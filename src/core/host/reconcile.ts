// ============================================================
// DD-14 §2.4 reconcile — updateProps 재조정 정책(값객체·순수함수) / reconcile policy value object
// 구조 키 = 재생성, 표면 키(data/theme/skin/options) = in-place.
// 이 분류표가 4어댑터 공통 SSOT 라서 프레임워크별 패리티 균열(REQ-T8-006)이 원천 차단된다.
// 헤드리스·결정론(DOM/전역 미참조).
// ============================================================
import type { GridOptions } from '../types.js';
import type { GridPropsPatch } from './GridHostPort.js';

/**
 * 구조 옵션 키(변경 시 그리드 재생성 필요). / Structural option keys (require recreation).
 * 컬럼 형태·고정열·트리/그룹·페이징 등 조립 위상에 영향을 주는 옵션들.
 */
export const STRUCTURAL_KEYS = [
  'columns',
  'frozenColumns',
  'frozenRows',
  'treeMode',
  'groupBy',
  'masterDetail',
  'pagination',
  'virtualScroll',
  'multiHeader',
] as const;

export type StructuralKey = (typeof STRUCTURAL_KEYS)[number];

/** updateProps 재조정 계획. / Reconcile plan for updateProps. */
export interface ReconcilePlan {
  /** 구조 옵션 변경 → 재생성. / Structural change → recreate. */
  readonly recreate: boolean;
  readonly data: boolean;
  readonly theme: boolean;
  readonly skin: boolean;
  readonly options: boolean;
}

const STRUCTURAL_SET: ReadonlySet<string> = new Set(STRUCTURAL_KEYS);

/**
 * 순수 함수(헤드리스·결정론). 구조 vs in-place 를 옵션 키 분류표로 판정.
 * / Pure, deterministic. Classifies structural vs in-place using the key table.
 */
export function reconcile<T>(prev: GridOptions<T>, patch: GridPropsPatch<T>): ReconcilePlan {
  const hasColumns = patch.columns !== undefined;
  const patchOpts = patch.options ?? {};

  // 구조 판정: columns 델타 또는 options 안에 구조 키가 들어오면 재생성.
  let recreate = hasColumns;
  if (!recreate) {
    for (const key of Object.keys(patchOpts)) {
      if (STRUCTURAL_SET.has(key)) {
        recreate = true;
        break;
      }
    }
  }

  // 표면 키(비구조 options 존재 여부).
  const hasSurfaceOptions =
    Object.keys(patchOpts).some((k) => !STRUCTURAL_SET.has(k));

  return {
    recreate,
    data: patch.data !== undefined,
    theme: patch.theme !== undefined,
    skin: patch.skin !== undefined,
    options: hasSurfaceOptions,
  };
}
