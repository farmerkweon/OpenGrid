// ============================================================
// DD-15 §2.3 변환 provenance — 흐름 끝까지 동행하는 정직성 메타(REQ-T6-811)
// / DD-15 §2.3 transform provenance — honesty meta that travels to the artifact.
// ------------------------------------------------------------
// 다운샘플·집계·로그·절단축·마스킹·축약·클램프가 화면 툴팁·배지에서 끝나지 않고 산출물까지 운반된다.
// 화면·배지·export·인쇄가 '동일 ArtifactProvenance 인스턴스'를 각 채널로 렌더 → 채널 간 고지 누락 0.
// 배지는 흑백 픽토(monochromeGlyph) 병기 → 흑백 인쇄에서도 의미 생존. 순수·헤드리스.
// ============================================================

import type {
  ChannelId, IArtifactProvenance, ProvenanceBadge, ProvenanceBlock, TransformProvenance,
} from './types.js';

/** kind → 기본 흑백 픽토(색 상실 대비). / Default monochrome glyph per transform kind. */
const GLYPH: Record<TransformProvenance['kind'], string> = {
  downsample: '⋯',
  aggregate: 'Σ',
  normalize: '≈',
  log: '㏒',
  truncatedAxis: '⊣',
  mask: '•',
  abbreviate: 'K',
  clamp: '⊓',
};

/** kind → 짧은 라벨(로케일 t 미주입 시 폴백). / Short label per kind (fallback when no t). */
const LABEL: Record<TransformProvenance['kind'], string> = {
  downsample: '다운샘플',
  aggregate: '집계',
  normalize: '정규화',
  log: '로그축',
  truncatedAxis: '절단축',
  mask: '마스킹',
  abbreviate: '축약',
  clamp: '클램프',
};

/** ArtifactProvenance 구성 인자. / Construction options. */
export interface ArtifactProvenanceOptions {
  readonly transforms?: ReadonlyArray<TransformProvenance>;
  /** 전체 행수 등 범위 고지("인쇄 범위: 전체 12,300행"). / Range note. */
  readonly rangeNote?: string;
  /** 산출 시각(테스트 결정론 위해 주입 가능). / Generated-at (injectable for determinism). */
  readonly generatedAt?: number;
  /** 로케일 라벨 해석(미주입 시 ko 폴백). / Locale label resolver (ko fallback). */
  readonly t?: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 산출물 단위 provenance 집계 — 아티팩트가 '어디에 놓이든 자신의 변환을 고지'(§2.3).
 * / Per-artifact provenance aggregate — discloses its own transforms wherever it lands.
 */
export class ArtifactProvenance implements IArtifactProvenance {
  readonly transforms: ReadonlyArray<TransformProvenance>;
  readonly badges: ReadonlyArray<ProvenanceBadge>;
  readonly generatedAt: number;
  readonly rangeNote: string;
  private readonly _t?: (key: string, params?: Record<string, string | number>) => string;

  constructor(opts: ArtifactProvenanceOptions = {}) {
    this.transforms = opts.transforms ?? [];
    this.rangeNote = opts.rangeNote ?? '';
    this.generatedAt = opts.generatedAt ?? Date.now();
    if (opts.t !== undefined) this._t = opts.t;
    this.badges = this._buildBadges();
  }

  /** 변환 집합 → 무결성 배지(중복 kind 는 1배지). / Transforms → integrity badges (dedup by kind). */
  private _buildBadges(): ProvenanceBadge[] {
    const seen = new Set<string>();
    const out: ProvenanceBadge[] = [];
    for (const tr of this.transforms) {
      if (seen.has(tr.kind)) continue;
      seen.add(tr.kind);
      out.push({
        code: tr.kind,
        label: this._label(tr.kind),
        monochromeGlyph: GLYPH[tr.kind],
      });
    }
    return out;
  }

  private _label(kind: TransformProvenance['kind']): string {
    if (this._t) {
      const key = `export.provenance.${kind}`;
      const resolved = this._t(key);
      // t 가 키를 못 찾아 키 자체를 돌려주면 폴백 라벨 사용. / fall back if t echoes the key.
      if (resolved && resolved !== key) return resolved;
    }
    return LABEL[kind];
  }

  /**
   * 배지/캡션을 채널 표현으로 렌더(§2.3). PDF=꼬리말, xlsx=시트 메모, CSV=주석행, print=페이지 푸터.
   * 어느 채널이든 동일 transforms/badges 를 표현 → 고지 누락 0.
   * / Render badges/caption to the channel's representation; no channel drops a disclosure.
   */
  render(channel: ChannelId): ProvenanceBlock {
    const lines = this.transforms.map(
      tr => `${GLYPH[tr.kind]} ${this._label(tr.kind)}: ${tr.detail}`,
    );
    if (this.rangeNote) lines.push(this.rangeNote);
    const joined = lines.join(' · ');

    let text: string;
    switch (channel) {
      case 'csv':
      case 'xml':
        // 파서가 무시하도록 주석 프리픽스. / Comment-prefixed so parsers skip it.
        text = lines.map(l => `# ${l}`).join('\n');
        break;
      case 'json':
        text = JSON.stringify({
          transforms: this.transforms,
          badges: this.badges,
          rangeNote: this.rangeNote,
          generatedAt: this.generatedAt,
        });
        break;
      case 'pdf':
      case 'print':
      case 'html':
      case 'xlsx':
      default:
        text = joined;
        break;
    }
    return { channel, text, badges: this.badges };
  }
}

/** 편의 팩토리 — transforms 로부터 provenance 생성. / Convenience factory. */
export function buildProvenance(opts: ArtifactProvenanceOptions = {}): ArtifactProvenance {
  return new ArtifactProvenance(opts);
}
