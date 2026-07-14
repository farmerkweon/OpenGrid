/**
 * OPEN_GRID Vue 바인딩 진입점(`open-grid/vue`). / OPEN_GRID Vue binding entry point (`open-grid/vue`).
 *
 * @packageDocumentation
 */

// SFC 컴포넌트 재수출 / SFC component re-export
export { default as OpenGrid } from './OpenGrid.vue';
// props·emits 타입 재수출 — 상세 문서는 선언 원본(types.ts)에 있다. / props/emits type re-export — detailed docs live on the declarations (types.ts).
export type { OpenGridProps, OpenGridEmits } from './types.js';
