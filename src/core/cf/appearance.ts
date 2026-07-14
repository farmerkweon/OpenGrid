// ============================================================
// DD-05 §2.5·§9.1 AppearanceView — CF 가 소비하는 좁은 읽기 포트(DD-11 위임 경계)
// / DD-05 §2.5·§9.1 AppearanceView — the narrow read port CF consumes (delegation boundary to DD-11).
// ------------------------------------------------------------
// CF 는 색 토큰 값을 소유하지 않는다(§9.1 "CF 가 색을 만들지 않는다"). 데이터바 채움·히트맵 램프·
// 아이콘 tint 는 모두 테마 primary + graphite 축에서 파생한다 → CF 는 rampFrom(seed) 로 시드색만
// 물어본다. DD-11(외관) appearance/ 착지 시 본 포트를 그쪽 어댑터로 배선한다(재선언 삭제).
// 순수·헤드리스.
// ============================================================

/** 시드 축 — 테마 primary(주색) 또는 graphite(무채색) 파생. / Seed axis — theme primary or graphite. */
export type CFRampSeed = 'primary' | 'graphite';

/**
 * CF 가 소비하는 좁은 외관 읽기 포트. rampFrom 만이 시각 정직성의 색 원천이다(hex 하드코딩 금지).
 * / The narrow appearance read port CF consumes. rampFrom is the sole color source (no hardcoded hex).
 */
export interface AppearanceView {
  /** 시드색(hex/rgb) — 데이터바/히트맵/아이콘 색 파생의 단일 시드. / Seed color for bar/heatmap/icon derivation. */
  rampFrom(seed: CFRampSeed): string;
  /** 반경 리터럴(선택, DD-11 위임). / Radius literal (optional, DD-11-delegated). */
  radius?(px: number): string;
}

/**
 * 테스트·기본용 정적 AppearanceView. graphite 무채색 시드가 기본(§9.3 "graphite ↔ 히트맵 한 몸").
 * / A static AppearanceView for tests/defaults; graphite is the default achromatic seed.
 *
 * @param seeds - primary/graphite 시드색 override(선택) / Optional primary/graphite seed overrides
 * @returns 정적 읽기 포트 / A static read port
 */
export function staticAppearanceView(seeds?: Partial<Record<CFRampSeed, string>>): AppearanceView {
  const primary = seeds?.primary ?? '#1976d2';
  const graphite = seeds?.graphite ?? '#3a3f45';
  return {
    rampFrom: (seed) => (seed === 'primary' ? primary : graphite),
  };
}
