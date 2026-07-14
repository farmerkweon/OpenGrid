// ============================================================
// DD-11 defaults — 프로세스 기본 축 레지스트리 묶음 팩토리(컴포저 주입용)
// / DD-11 defaults — factory for the process-default axis registry set (for composer injection).
// ------------------------------------------------------------
// 설계 근거: AppearanceComposer 는 5축 레지스트리를 주입받는다(§2.3). 기본 배선은 기존 전역
//   레지스트리(skin·icon)를 어댑터로 감싸고 신설 축(theme-meta·density·texture) 전역을 묶는다.
//   별도 인스턴스가 필요하면(멀티그리드 격리) 이 팩토리를 참고해 자체 조립한다. 헤드리스.
// ============================================================

import { skinRegistry } from '../SkinRegistry.js';
import { iconRegistry } from '../IconRegistry.js';
import { themeMetaRegistry } from './ThemeMetaRegistry.js';
import { densityRegistry } from './DensityRegistry.js';
import { textureRegistry } from './TextureRegistry.js';
import { SkinAxisAdapter, IconAxisAdapter } from './axisAdapters.js';
import { AppearanceComposer, type AppearanceRegistrySet } from './AppearanceComposer.js';

/**
 * 기본 5축 레지스트리 묶음(전역 레지스트리 + skin/icon 어댑터).
 * / The default 5-axis registry set (global registries + skin/icon adapters).
 *
 * @returns 컴포저 주입용 레지스트리 묶음 / A registry set for composer injection
 */
export function defaultAppearanceRegistrySet(): AppearanceRegistrySet {
  return {
    theme: themeMetaRegistry,
    skin: new SkinAxisAdapter(skinRegistry),
    density: densityRegistry,
    texture: textureRegistry,
    icon: new IconAxisAdapter(iconRegistry),
  };
}

/** 프로세스 공유 기본 컴포저(전역 레지스트리 기반). / Process-shared default composer. */
export const defaultAppearanceComposer = new AppearanceComposer(defaultAppearanceRegistrySet());
