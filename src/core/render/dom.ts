// 그리기 부품들이 함께 쓰는 DOM 작은 도구. 렌더러 앞면과 그리기 부품이 서로를 import 하는 고리를 만들지 않으려고
// 어느 것도 import 하지 않는 잎 모듈에 둔다. 렌더러 앞면(GridRenderer)은 기존 import 를 위해 이것을 다시 내보낸다.
//
// Tiny DOM helpers shared by the paint parts. Kept in a leaf module that imports nothing, so the renderer facade and
// the paint parts do not import each other in a cycle. The renderer facade (GridRenderer) re-exports these for existing imports.

/**
 * 태그(+선택 className)로 요소를 만든다. / Create an element from a tag (+optional className).
 * @internal
 */
export function _el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/**
 * 요소 style 에 부분 스타일을 병합한다. / Merge a partial style bag into an element's style.
 * @internal
 */
export function _style(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles);
}
