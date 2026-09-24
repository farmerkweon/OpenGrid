/**
 * OPEN_GRID 접근성 도구 — `open-grid/a11y`.
 *
 * 단축키 표(`KeyboardInteractionModel`), 화면 낭독기 공지 관리(`LiveRegionController`), 그림 셀을 말로
 * 바꾸는 등록소(`VisualEquivRegistry`). 그리드와 따로 쓰는 도구라 그리드 동작을 바꾸지 않고, 코어와
 * 다른 진입점이라 이 모듈을 import 하지 않는 사용자에게는 배송되지 않는다.
 *
 * OPEN_GRID accessibility helpers — `open-grid/a11y`.
 *
 * A shortcut table (`KeyboardInteractionModel`), screen-reader announcement management
 * (`LiveRegionController`) and a registry that puts picture cells into words (`VisualEquivRegistry`).
 * They are used alongside the grid and do not change its behavior; being a separate entry point, they
 * are not shipped to users who do not import this module.
 *
 * OPEN_GRID アクセシビリティの道具 — `open-grid/a11y`。
 *
 * ショートカット表(`KeyboardInteractionModel`)、スクリーンリーダーへのお知らせ管理(`LiveRegionController`)、
 * 絵のセルを言葉に変える登録所(`VisualEquivRegistry`)。グリッドとは別に使う道具なのでグリッドの動作は変えず、
 * コアとは別のエントリーなので、このモジュールを import しない利用者には配信されません。
 *
 * OPEN_GRID 无障碍工具 — `open-grid/a11y`。
 *
 * 快捷键表(`KeyboardInteractionModel`)、屏幕阅读器通知管理(`LiveRegionController`)、把图形单元格转换成文字的
 * 注册表(`VisualEquivRegistry`)。它们与表格分开使用,不改变表格的行为;作为与核心不同的入口,
 * 不 import 本模块的用户不会下载它们。
 *
 * @example
 * import { OpenGrid } from 'open-grid';
 * import { KeyboardInteractionModel, strokeFromEvent } from 'open-grid/a11y';
 */
export { KeyboardInteractionModel, strokeFromEvent } from '../core/a11y/KeyboardInteractionModel.js';
export { LiveRegionController } from '../core/a11y/LiveRegionController.js';
export { VisualEquivRegistry } from '../core/a11y/VisualEquivRegistry.js';
export type {
  InteractionMode, KeyStroke, KeyBinding, KeyEventLike,
} from '../core/a11y/KeyboardInteractionModel.js';
export type { Announcement, LiveRegionControllerOpts, TimerHandle } from '../core/a11y/LiveRegionController.js';
export type { LiveChannel } from '../core/a11y/ports.js';
export type { VisualEquivProvider } from '../core/a11y/VisualEquivRegistry.js';
