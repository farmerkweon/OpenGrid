// ============================================================
// DD-15 §2.7 내보내기 매니페스트 — 채널×상태항목 포함/제외 + 손실 고지(REQ-T3-804)
// / DD-15 §2.7 export manifest — channel×state matrix + loss disclosure.
// ------------------------------------------------------------
// 채널 표현력을 '데이터로 선언'(ChannelCapabilities) → 활성 그리드 상태 대비 잃는 항목을 자동 고지.
// 발산이 아니라 강등: CSV 는 cf.fill 못 담으니 cf=false → "조건부서식 색 손실" 을 export 전에 알린다.
// 순수·헤드리스.
// ============================================================

import type {
  ActiveStateFlags, ChannelCapabilities, ChannelId, ChannelStateMatrix, StateLoss,
} from './types.js';

/** 상태항목 → 한국어 손실 사유(고지 문구 SSOT). / State item → human loss reason. */
const LOSS_REASON: Record<keyof ChannelCapabilities, string> = {
  merges: '셀 병합 정보를 표현할 수 없어 개별 셀로 평탄화됩니다.',
  frozen: '틀 고정(frozen) 상태는 표현되지 않습니다.',
  colWidths: '컬럼 폭 정보가 유지되지 않습니다.',
  cf: '조건부서식 색/데이터바가 표현되지 않습니다.',
  filters: '활성 필터는 값으로만 반영되고 필터 정의는 유지되지 않습니다.',
  sort: '정렬 상태는 행 순서로만 반영되고 정렬 정의는 유지되지 않습니다.',
  hiddenCols: '숨김 컬럼 표시가 유지되지 않습니다.',
  groupCollapse: '그룹 접힘 상태가 유지되지 않습니다.',
  charts: '차트는 이 채널에 포함되지 않습니다.',
  styling: '셀 스타일(폰트/테두리 등)이 유지되지 않습니다.',
  provenance: '변환 고지(provenance)가 이 채널에는 별도 표기로만 동행합니다.',
};

/** 활성 플래그와 능력 매트릭스가 함께 검사하는 항목 키. / Item keys checked for loss. */
const LOSS_ITEMS: ReadonlyArray<keyof ActiveStateFlags & keyof ChannelCapabilities> = [
  'merges', 'frozen', 'colWidths', 'cf', 'filters', 'sort', 'hiddenCols', 'groupCollapse', 'charts', 'styling',
];

/**
 * 채널별 포함/제외 매트릭스 + 이번 export 의 실제 손실 항목 고지(§2.7).
 * / Channel capability matrix + this run's actual losses.
 */
export class ExportManifest {
  constructor(private readonly caps: Readonly<Record<ChannelId, ChannelCapabilities>>) {}

  /** 현 그리드 상태(활성 병합·CF·필터…) 대비 이 채널이 잃는 항목 목록. / Losses for a channel vs active state. */
  losses(channel: ChannelId, activeState: ActiveStateFlags): ReadonlyArray<StateLoss> {
    const cap = this.caps[channel];
    if (!cap) return [];
    const out: StateLoss[] = [];
    for (const item of LOSS_ITEMS) {
      // 상태가 활성인데 채널이 표현 못 하면 손실. / Active state the channel cannot represent = loss.
      if (activeState[item] && !cap[item]) {
        out.push({ item, reason: LOSS_REASON[item] });
      }
    }
    return out;
  }

  /** UI/문서용 채널×항목 매트릭스. / Channel×item matrix for UI/docs. */
  matrix(): ChannelStateMatrix {
    const channels = Object.keys(this.caps) as ChannelId[];
    const items = LOSS_ITEMS.slice();
    const cells: Record<string, Record<string, boolean>> = {};
    for (const ch of channels) {
      const cap = this.caps[ch];
      const row: Record<string, boolean> = {};
      for (const it of items) row[it] = !!cap?.[it];
      cells[ch] = row;
    }
    return { channels, items, cells };
  }
}
