// DD-03 렌더 파이프라인 테스트 공용 헬퍼(테스트 수집 대상 아님 — *.test 아님).
import { AppearanceResolver } from '../../../src/core/AppearanceResolver.js';
import { makeRect } from '../../../src/core/coordinate/index.js';
import { buildRequest } from '../../../src/core/render/index.js';
import type { CellRenderRequest, ICellStage, StageKind, StagePaint } from '../../../src/core/render/index.js';
import type { ColumnDef } from '../../../src/core/types.js';

/** 테스트용 CellRenderRequest 조립(기본값 + override). */
export function makeReq(over: Partial<CellRenderRequest> = {}): CellRenderRequest {
  const column = (over.column ?? { field: 'name', header: 'Name' }) as ColumnDef;
  return buildRequest({
    ri: 0,
    ci: 0,
    rect: makeRect(0, 0, 100, 20),
    value: 'hi',
    row: { name: 'hi' },
    column,
    rowState: 'none',
    isSelected: false,
    isFocused: false,
    isEditable: false,
    merge: null,
    appearance: new AppearanceResolver(),
    t: (k: string) => k,
    ...over,
  });
}

/** 최소 테스트 단계 생성기(appliesTo=true, contribute=paint 또는 side-effect). */
export function makeStage(
  id: string,
  kind: StageKind,
  contribute: (req: CellRenderRequest) => StagePaint | null,
  order?: number,
): ICellStage {
  return {
    id,
    kind,
    ...(order !== undefined ? { order } : {}),
    appliesTo: () => true,
    contribute: (req) => contribute(req),
  };
}
