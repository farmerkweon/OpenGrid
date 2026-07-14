// ============================================================
// DD-12 접근성 어댑터·i18n — 배럴 / accessibility adapter & i18n — barrel
// ------------------------------------------------------------
// additive 신설(`src/core/a11y/`). 미배선(스트랭글러 단계 1) — 트리셰이크로 코어 gzip 불변.
// 통합 배선(OpenGrid/GridComposer/렌더 포트)은 후속 태스크(로그 "통합 TODO").
// / Additive new module. Unwired (strangler stage 1) — tree-shaken, core gzip unchanged.
// ============================================================

export type { AriaRole, A11yNodeKey, AriaAttrKey, AriaAttrs, AriaIntent } from './AriaIntent.js';
export { makeAriaIntent } from './AriaIntent.js';

export type { FocusRequest, IAriaRenderPort, LiveChannel } from './ports.js';

export type { Announcement, LiveRegionControllerOpts, TimerHandle } from './LiveRegionController.js';
export { LiveRegionController } from './LiveRegionController.js';

export type {
  A11ySelectionRect, A11yModelView, ILocaleContextPort, AccessibilityAdapterDeps,
} from './AccessibilityAdapter.js';
export { AccessibilityAdapter, cellKey, parseCellKey } from './AccessibilityAdapter.js';

export type { InteractionMode, KeyStroke, KeyBinding } from './KeyboardInteractionModel.js';
export { KeyboardInteractionModel, normalizePattern, strokeToPattern } from './KeyboardInteractionModel.js';

export type { OverlayFrame } from './OverlayStack.js';
export { OverlayStack } from './OverlayStack.js';

export type { VisualEquivProvider } from './VisualEquivRegistry.js';
export { VisualEquivRegistry } from './VisualEquivRegistry.js';
