import { buildTree, TreeNode } from './TreeEngine.js';
// i18n: OrgChart 는 그리드와 독립된 standalone 컴포넌트(인스턴스 로케일 child 없음) → 전역 t 로 해석.
import { t } from './i18n/LocaleRegistry.js';

export interface OrgChartColumnDef {
  field: string;
  className?: string;
  style?: string | ((value: any, row: Record<string, any>) => string);
  renderer?: (value: any, row: Record<string, any>) => HTMLElement | string;
}

export interface OrgChartOptions {
  idField: string;
  parentIdField: string;
  columns: OrgChartColumnDef[];
  nodeWidth?: number;
  nodeHeight?: number;
  levelGap?: number;
  siblingGap?: number;
  expandOnLoad?: boolean;
  onNodeClick?: (id: any, data: Record<string, any>) => void;
}

interface LayoutInfo { x: number; y: number; }

export class OrgChart {
  private _container: HTMLElement;
  private _opts: Required<OrgChartOptions>;
  private _data: Record<string, any>[] = [];
  private _roots: TreeNode<any>[] = [];
  private _expandedKeys = new Set<any>();
  private _selectedId: any = null;

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

  setData(data: Record<string, any>[]): void {
    this._data = data;
    const { idField, parentIdField, expandOnLoad } = this._opts;
    if (expandOnLoad && this._expandedKeys.size === 0) {
      data.forEach(r => this._expandedKeys.add(r[idField]));
    }
    this._roots = buildTree(data, { idField, parentIdField }, this._expandedKeys);
    this._render();
  }

  setTheme(theme: string): void {
    this._container.setAttribute('data-og-theme', theme);
  }

  /** R12b: FORM(스킨) 축 — data-og-skin 을 자기 컨테이너에 설정(setTheme 과 동형, 색과 직교). */
  setSkin(skin: string): void {
    this._container.setAttribute('data-og-skin', skin);
  }

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
