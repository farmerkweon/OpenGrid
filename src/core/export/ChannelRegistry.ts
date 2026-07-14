// ============================================================
// DD-15 §2.7·4.2 채널 확장점(SPI) — DD-10 IRegistry 동형(C1). 미등록 조회 never-throw(undefined).
// / DD-15 §2.7 channel extension point — isomorphic with DD-10 IRegistry; unregistered ⇒ undefined.
// ------------------------------------------------------------
// 새 채널(parquet·ODS·markdown…)은 IExportChannel 구현 + register 만으로 추가(파사드/펌프/소스 무변경).
// 기본 채널 교체도 동일 id 재등록(last-wins). 별도 override 경로 신설 금지 — DD-10 단일 표면 편입(C2).
// ============================================================

import { TypedRegistry } from '../extension/Registry.js';
import type { ChannelId, IExportChannel } from './types.js';

/**
 * export 채널 레지스트리 — DD-10 TypedRegistry 위의 채널 특화 별칭.
 * register(channel) 는 IRegistry.register(channel.id, channel) 의 별칭.
 * / Channel registry — a channel-typed alias over DD-10 TypedRegistry.
 */
export class ChannelRegistry {
  private readonly _reg: TypedRegistry<IExportChannel, ChannelId>;

  constructor() {
    this._reg = new TypedRegistry<IExportChannel, ChannelId>({
      spi: { name: 'IExportChannel', version: '1' },
    });
  }

  /** 채널 등록(id 재등록 시 last-wins user override). / Register a channel (last-wins for user overrides). */
  register(channel: IExportChannel): void {
    this._reg.register(channel.id, channel, { origin: 'builtin' });
  }

  /** 사용자 채널 교체(동일 id last-wins, 내장 보호 우회). / User channel override (replaces builtin). */
  override(channel: IExportChannel): void {
    this._reg.register(channel.id, channel, { origin: 'user', override: true });
  }

  /** 미등록 → undefined(never-throw). / Unregistered ⇒ undefined. */
  get(id: ChannelId): IExportChannel | undefined {
    return this._reg.get(id);
  }

  has(id: ChannelId): boolean { return this._reg.has(id); }
  list(): ChannelId[] { return this._reg.list(); }
}
