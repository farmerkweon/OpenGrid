import { buildTree, TreeNode } from './TreeEngine.js';
// i18n: OrgChart 는 그리드와 독립된 standalone 컴포넌트(인스턴스 로케일 child 없음) → 전역 t 로 해석.
import { t } from './i18n/LocaleRegistry.js';

/**
 * 조직도 노드 카드의 컬럼(필드) 정의. / Column (field) definition for an org-chart node card.
 */
export interface OrgChartColumnDef {
  /** 표시할 데이터 필드명. / Data field name to display. */
  field: string;
  /** 셀 래퍼에 추가할 CSS 클래스명. / Extra CSS class name for the cell wrapper. */
  className?: string;
  /** 인라인 스타일 문자열 또는 (값, 행)→스타일 함수. / Inline style string or (value, row)→style function. */
  style?: string | ((value: any, row: Record<string, any>) => string);
  /** 커스텀 렌더러. 값을 텍스트 그대로 보여주는 대신 아바타·배지·아이콘 같은 커스텀 마크업을
   * 넣고 싶을 때 지정한다. 문자열 반환 시 innerHTML, 엘리먼트 반환 시 append.
   * / Custom renderer. Set this when you need avatars, badges, or icons instead of plain text.
   * A string return is set as innerHTML; an element return is appended. */
  renderer?: (value: any, row: Record<string, any>) => HTMLElement | string;
}

/**
 * 조직도 생성 옵션. / Org-chart construction options.
 */
export interface OrgChartOptions {
  /** 각 행의 고유 id 필드명. / Field name holding each row's unique id. */
  idField: string;
  /** 부모 id 를 담은 필드명(트리 구성 기준). / Field name holding the parent id (tree structure key). */
  parentIdField: string;
  /** 노드 카드에 렌더할 컬럼 정의 배열. / Column definitions rendered inside each node card. */
  columns: OrgChartColumnDef[];
  /** 노드 카드 너비(px). 기본 160. / Node card width in px. Default 160. @defaultValue 160 */
  nodeWidth?: number;
  /** 노드 카드 높이(px). 기본 72. / Node card height in px. Default 72. @defaultValue 72 */
  nodeHeight?: number;
  /** 레벨(세대) 간 세로 간격(px). 기본 52. / Vertical gap between levels in px. Default 52. @defaultValue 52 */
  levelGap?: number;
  /** 형제 노드 간 가로 간격(px). 기본 20. / Horizontal gap between siblings in px. Default 20. @defaultValue 20 */
  siblingGap?: number;
  /** 최초 로드 시 전체 펼침 여부. 기본 true. / Whether to expand all on first load. Default true. @defaultValue true */
  expandOnLoad?: boolean;
  /** 노드 클릭 콜백 (id, 행데이터). / Node click callback (id, row data). */
  onNodeClick?: (id: any, data: Record<string, any>) => void;
}

interface LayoutInfo { x: number; y: number; }

/**
 * 조직도 컴포넌트. / Org-chart component.
 *
 * 보고 라인·조직 구조·계층형 카테고리처럼 "누가 누구 밑에 있는가"를 시각적으로 보여주고 싶을 때
 * 쓴다. 그리드와 별개의 독립 컴포넌트라서, 그리드 없이 조직도 하나만 페이지에 넣어도 동작한다.
 * 동작 순서: `setData()`로 평면 행 배열(각 행에 id/parentId만 있으면 됨)을 넘기면 → 내부에서
 * 부모/자식 관계(idField/parentIdField)를 따라 트리로 구성하고 → 그 결과를 SVG 연결선 + 노드
 * 카드로 화면에 그린다.
 * / Use this when you need to show "who reports to whom" — org structure, reporting lines, or
 * hierarchical categories. It's a standalone component independent of the grid, so it works on
 * its own with no grid on the page. Operation order: pass a flat row array to `setData()` (each
 * row just needs an id/parentId) → internally it's built into a tree following the parent/child
 * relation (idField/parentIdField) → the result is drawn on screen as SVG connectors plus node
 * cards.
 *
 * @example
 * const chart = new OrgChart('#org', {
 *   idField: 'id', parentIdField: 'managerId',
 *   columns: [{ field: 'name' }, { field: 'title' }],
 * });
 * chart.setData([{ id: 1, managerId: null, name: 'CEO', title: '대표' }]);
 */
export class OrgChart {
  private _container: HTMLElement;
  private _opts: Required<OrgChartOptions>;
  private _data: Record<string, any>[] = [];
  private _roots: TreeNode<any>[] = [];
  private _expandedKeys = new Set<any>();
  private _selectedId: any = null;

  /**
   * @param selector - 마운트할 컨테이너 셀렉터 문자열 또는 엘리먼트 / Container selector string or element to mount into
   * @param opts - 조직도 옵션 / Org-chart options
   */
  constructor(selector: string | HTMLElement, opts: OrgChartOptions) {
    this._container = typeof selector === 'string'
      ? (document.querySelector(selector) as HTMLElement)
      : selector;
    this._opts = {
      nodeWidth: 160, nodeHeight: 72, levelGap: 52, siblingGap: 20,
      expandOnLoad: true, onNodeClick: () => {},
      ...opts,
    };
    this._container.classList.add('og-orgchart');
  }

  /**
   * 조직도 데이터를 설정하고 렌더한다. 최초 로드는 물론, 데이터를 새로 받아올 때마다
   * 다시 호출하면 트리를 재구성해 다시 그린다. / Set org-chart data and render. Call this on
   * initial load and again whenever fresh data arrives — it rebuilds the tree and redraws.
   *
   * @param data - 부모/자식 관계를 가진 평면 행 배열 / Flat array of rows with parent/child relations
   */
  setData(data: Record<string, any>[]): void {
    this._data = data;
    const { idField, parentIdField, expandOnLoad } = this._opts;
    if (expandOnLoad && this._expandedKeys.size === 0) {
      data.forEach(r => this._expandedKeys.add(r[idField]));
    }
    this._roots = buildTree(data, { idField, parentIdField }, this._expandedKeys);
    this._render();
  }

  /**
   * 색 테마(라이트/다크 등)를 컨테이너에 설정한다. 호스트 페이지의 다크모드 토글에 맞춰 전환할
   * 때 호출한다. / Set the color theme (light/dark, etc.) on the container. Call this when
   * switching to match the host page's dark-mode toggle.
   *
   * @param theme - data-og-theme 값 / data-og-theme value
   */
  setTheme(theme: string): void {
    this._container.setAttribute('data-og-theme', theme);
  }

  // R12b: FORM(스킨) 축 — data-og-skin 을 자기 컨테이너에 설정(setTheme 과 동형, 색과 직교).
  /**
   * 형태(스킨) 테마를 컨테이너에 설정한다. 색은 그대로 두고 모서리·밀도 같은 겉모양만 바꾸고
   * 싶을 때 쓴다. `setTheme`(색)과 서로 독립된 축이라, 색 테마는 그대로 두고 스킨만 바꾸거나
   * 그 반대로 자유롭게 조합할 수 있다.
   * / Set the form (skin) theme on the container. Use this to change the look (corner radius,
   * density, etc.) while leaving color untouched. This is an axis independent from `setTheme`
   * (color), so you can swap the skin alone, the color theme alone, or both freely.
   *
   * @param skin - data-og-skin 값 / data-og-skin value
   */
  setSkin(skin: string): void {
    this._container.setAttribute('data-og-skin', skin);
  }

  /** 모든 노드를 펼친다. 조직 전체를 한눈에 훑어보고 싶을 때 호출. / Expand all nodes. Call when
   * the viewer wants to see the whole organization at a glance. */
  expandAll(): void {
    const collect = (nodes: TreeNode<any>[]) => {
      for (const n of nodes) {
        this._expandedKeys.add(n._treeId);
        if (n.children.length) collect(n.children);
      }
    };
    collect(this._roots);
    this._rebuild();
  }

  /** 모든 노드를 접는다(루트만 표시). 큰 조직도를 처음 접했을 때 최상위 구조부터 보여주고 싶을
   * 때 호출. / Collapse all nodes (roots only). Call to show top-level structure first when a
   * large org chart is first opened. */
  collapseAll(): void {
    this._expandedKeys.clear();
    this._rebuild();
  }

  private _toggle(id: any): void {
    if (this._expandedKeys.has(id)) this._expandedKeys.delete(id);
    else this._expandedKeys.add(id);
    this._rebuild();
  }

  private _rebuild(): void {
    const { idField, parentIdField } = this._opts;
    this._roots = buildTree(this._data, { idField, parentIdField }, this._expandedKeys);
    this._render();
  }

  // ── 레이아웃 계산 (post-order: 리프부터 배치, 부모는 자식 중앙) ──
  private _calcLayout(): { layout: Map<any, LayoutInfo>; totalW: number; totalH: number } {
    const { nodeWidth, nodeHeight, levelGap, siblingGap } = this._opts;
    const layout = new Map<any, LayoutInfo>();
    let nextX = 0;

    const place = (node: TreeNode<any>): { minX: number; maxX: number } => {
      const y = node._depth * (nodeHeight + levelGap);
      const vis = node._expanded ? node.children : [];

      if (!vis.length) {
        const x = nextX;
        nextX += nodeWidth + siblingGap;
        layout.set(node._treeId, { x, y });
        return { minX: x, maxX: x };
      }

      let firstX = Infinity, lastX = -Infinity;
      for (const child of vis) {
        const { minX, maxX } = place(child);
        if (minX < firstX) firstX = minX;
        if (maxX > lastX) lastX = maxX;
      }
      // 자식들의 span 중앙에 부모 배치
      const x = firstX + (lastX - firstX + nodeWidth) / 2 - nodeWidth / 2;
      layout.set(node._treeId, { x, y });
      return { minX: firstX, maxX: lastX };
    };

    for (const root of this._roots) place(root);

    let maxX = 0, maxY = 0;
    for (const { x, y } of layout.values()) {
      if (x + nodeWidth > maxX) maxX = x + nodeWidth;
      if (y + nodeHeight > maxY) maxY = y + nodeHeight;
    }
    return { layout, totalW: maxX + siblingGap, totalH: maxY + levelGap + 16 };
  }

  // ── SVG 직선 헬퍼 ──
  private _line(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number): void {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    el.setAttribute('x1', String(x1));
    el.setAttribute('y1', String(y1));
    el.setAttribute('x2', String(x2));
    el.setAttribute('y2', String(y2));
    el.setAttribute('class', 'og-orgchart-line');
    svg.appendChild(el);
  }

  // ── 렌더 ──
  private _render(): void {
    const { nodeWidth, nodeHeight, levelGap, columns } = this._opts;
    const { layout, totalW, totalH } = this._calcLayout();

    this._container.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'og-orgchart-wrap';
    wrap.style.cssText = `width:${totalW}px;height:${totalH}px;`;

    // ① SVG 연결선
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(totalW));
    svg.setAttribute('height', String(totalH));
    svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;';

    const drawLines = (nodes: TreeNode<any>[]): void => {
      for (const node of nodes) {
        if (!node._expanded || !node.children.length) continue;
        const p = layout.get(node._treeId)!;
        const px = p.x + nodeWidth / 2;
        const py = p.y + nodeHeight;
        const midY = py + levelGap / 2;
        const vis = node.children;

        // 부모 → midY
        this._line(svg, px, py, px, midY);

        if (vis.length > 1) {
          const c0 = layout.get(vis[0]._treeId)!;
          const cn = layout.get(vis[vis.length - 1]._treeId)!;
          // 수평 브래킷
          this._line(svg, c0.x + nodeWidth / 2, midY, cn.x + nodeWidth / 2, midY);
        }
        for (const child of vis) {
          const ci = layout.get(child._treeId)!;
          const cx = ci.x + nodeWidth / 2;
          // midY → 자식 상단
          this._line(svg, cx, midY, cx, ci.y);
        }
        drawLines(vis);
      }
    };
    drawLines(this._roots);
    wrap.appendChild(svg);

    // ② 카드 렌더
    const renderNodes = (nodes: TreeNode<any>[]): void => {
      for (const node of nodes) {
        const info = layout.get(node._treeId);
        if (!info) continue;

        const card = document.createElement('div');
        card.className = 'og-orgchart-node';
        if (node._hasChildren) card.classList.add('og-orgchart-node--branch');
        if (node._expanded)    card.classList.add('og-orgchart-node--expanded');
        if (this._selectedId === node._treeId) card.classList.add('og-orgchart-node--selected');
        card.style.cssText = `left:${info.x}px;top:${info.y}px;width:${nodeWidth}px;height:${nodeHeight}px;`;

        // 컬럼 렌더
        const content = document.createElement('div');
        content.className = 'og-orgchart-node-content';
        for (const col of columns) {
          const val = node.data[col.field];
          const div = document.createElement('div');
          div.className = 'og-orgchart-col' + (col.className ? ' ' + col.className : '');
          if (col.style) {
            const s = typeof col.style === 'function' ? col.style(val, node.data) : col.style;
            div.setAttribute('style', s);
          }
          if (col.renderer) {
            const out = col.renderer(val, node.data);
            if (typeof out === 'string') div.innerHTML = out;
            else div.appendChild(out);
          } else {
            div.textContent = val ?? '';
          }
          content.appendChild(div);
        }
        card.appendChild(content);

        // 확장/축소 토글 버튼 (카드 하단 중앙)
        if (node._hasChildren) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'og-orgchart-toggle';
          btn.setAttribute('aria-expanded', node._expanded ? 'true' : 'false');
          btn.setAttribute('aria-label', t(node._expanded ? 'tree.collapse' : 'tree.expand'));
          const icon = document.createElement('i');
          icon.setAttribute('aria-hidden', 'true');
          icon.className = node._expanded ? 'bi bi-dash-circle' : 'bi bi-plus-circle';
          btn.appendChild(icon);
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggle(node._treeId);
          });
          card.appendChild(btn);
        }

        card.addEventListener('click', () => {
          this._selectedId = node._treeId;
          this._opts.onNodeClick(node._treeId, node.data);
          // 선택 하이라이트만 갱신 (전체 재렌더 최소화)
          this._container.querySelectorAll('.og-orgchart-node--selected')
            .forEach(el => el.classList.remove('og-orgchart-node--selected'));
          card.classList.add('og-orgchart-node--selected');
        });

        wrap.appendChild(card);

        if (node._expanded && node.children.length) renderNodes(node.children);
      }
    };
    renderNodes(this._roots);

    this._container.appendChild(wrap);
  }
}
