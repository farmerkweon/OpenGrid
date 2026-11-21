/**
 * 넓은 그리드 새 그물 — DOM 사진(골든)과 대조 시험 정규화·비교기.
 * 테스트 설계서(sessions/widegrid-perf-2026-11/design/TEST_DESIGN_NEW.md) §4-2 GD · §4-1/§17-4 DF-01 · §4-3 ST-20.
 *
 * 두 가지 사진을 만든다.
 *
 * 1) 골든 사진(goldenSnapshot) — §4-2 「비교는 container.innerHTML 바이트」.
 *    container.innerHTML 을 **그대로** 쓴다. 속성 순서·인라인 style 글자(선언 순서 포함)·클래스 순서·
 *    aria·글자·요소 순서를 하나도 버리지 않는다. 바꾸는 것은 딱 하나:
 *      - 행 id `og-r-<숫자>` → 처음 나온 순서대로 `og-r-@1`, `og-r-@2` … 로 다시 매김.
 *        까닭: DataLayer 의 행 id 순번(`_rowIdSeq`)이 모듈 전역이라, 같은 장면이라도 앞서 몇 개의
 *        그리드를 만들었느냐(테스트 순서)에 따라 숫자가 달라진다. 순번만 바꾸고 「어느 자리가 같은 행을
 *        가리키나」(디테일 패널 id 와 펼침 단추 aria-controls 의 짝)는 그대로 남긴다.
 *    파일로 둘 때는 사람이 읽고 줄 단위로 diff 할 수 있게 `<` 앞에 줄바꿈을 넣는다(formatGolden).
 *    innerHTML 은 글자 속 `<` 를 `&lt;` 로 내보내므로 날것의 `<` 는 모두 태그 시작이다. 글자 속 진짜 줄바꿈은
 *    먼저 `␤`(U+2424)로 바꾼다. 그래서 formatGolden ↔ unformatGolden 은 서로 되돌릴 수 있다(정보 손실 0).
 *    비교는 「unformat(파일) === 지금 innerHTML(가림 뒤)」 바이트 비교다.
 *
 * 2) 대조 사진(dfSnapshot) — §17-4 정규화(§4-1 보다 뒤 절이 우선).
 *    - 본문 행만 aria-rowindex 순으로 줄 세운다(행이 아닌 자식 — 디테일 패널 등 — 은 DOM 순서 그대로 뒤에).
 *    - **행 안의 칸은 DOM 순서 그대로**(칸 순서가 바뀐 것을 지우지 않게 — ST-20 ⓔ).
 *    - 요소마다: 태그 · 클래스(이름순) · class/style 을 뺀 모든 속성(이름순 — aria-*, data-og-* 포함, 버리지 않는 쪽) ·
 *      style 선언(이름순, !important 포함) · 글자 노드 · 입력 요소의 value/checked 속성값(프로퍼티).
 *    - 머리글·푸터도 같은 방식으로(DOM 순서).
 *    - document.activeElement 의 (aria-rowindex, aria-colindex), bodyWrap·머리글 scrollLeft/scrollTop.
 *    클래스 순서·style 선언 순서는 대조 사진에서 버린다(설계서가 정한 대로). 그 둘은 골든 사진이 지킨다.
 */

const ROW_ID_RE = /og-r-(\d+)/g;
const NL_MARK = '␤';

/** 골든 사진 원문 — container.innerHTML 에서 행 id 순번만 다시 매긴 것. */
export function goldenSnapshot(container: HTMLElement): string {
  return maskRowIds(container.innerHTML);
}

/** `og-r-<n>` 을 처음 나온 순서대로 `og-r-@k` 로. 같은 n 은 같은 k. */
export function maskRowIds(html: string): string {
  const map = new Map<string, number>();
  return html.replace(ROW_ID_RE, (_m, n: string) => {
    let k = map.get(n);
    if (k === undefined) { k = map.size + 1; map.set(n, k); }
    return `og-r-@${k}`;
  });
}

/** 파일로 둘 꼴 — `<` 앞마다 줄바꿈. 되돌릴 수 있어야 하므로 원문에 U+2424 가 있으면 실패. */
export function formatGolden(raw: string): string {
  if (raw.includes(NL_MARK)) throw new Error('골든 원문에 U+2424 가 있어 줄바꿈 표시와 겹친다 — 형식을 바꿀 것');
  return raw.replace(/\n/g, NL_MARK).replace(/</g, '\n<').replace(/^\n/, '') + '\n';
}

/** formatGolden 의 역. */
export function unformatGolden(file: string): string {
  const body = file.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return body.replace(/\n</g, '<').replace(new RegExp(NL_MARK, 'g'), '\n');
}

// ─── 대조 사진 ───────────────────────────────────────────────────────────

function styleDecls(el: Element): string {
  const st = (el as HTMLElement).style;
  if (!st || st.length === 0) return '';
  const names: string[] = [];
  for (let i = 0; i < st.length; i++) names.push(st.item(i));
  names.sort();
  return names.map(n => {
    const pr = st.getPropertyPriority(n);
    return `${n}:${st.getPropertyValue(n)}${pr ? ' !' + pr : ''}`;
  }).join(';');
}

function serializeEl(el: Element, depth: number, out: string[]): void {
  const pad = ' '.repeat(depth);
  const cls = Array.from(el.classList).sort().join(' ');
  const attrs = Array.from(el.attributes)
    .filter(a => a.name !== 'class' && a.name !== 'style')
    .map(a => `${a.name}=${JSON.stringify(a.value)}`)
    .sort();
  const props: string[] = [];
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    props.push(`.value=${JSON.stringify((el as HTMLInputElement).value)}`);
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      props.push(`.checked=${el.checked}`);
    }
  }
  out.push(`${pad}<${el.tagName.toLowerCase()} class=[${cls}] ${attrs.join(' ')} style={${styleDecls(el)}}${props.length ? ' ' + props.join(' ') : ''}>`);
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) serializeEl(n as Element, depth + 1, out);
    else if (n.nodeType === 3) {
      const t = n.textContent ?? '';
      if (t.length) out.push(`${pad} #text ${JSON.stringify(t)}`);
    }
  }
}

function rowKey(el: Element): number {
  const v = el.getAttribute('aria-rowindex');
  return v == null ? Number.POSITIVE_INFINITY : Number(v);
}

export interface DfParts {
  header: HTMLElement | null;
  body: HTMLElement | null;
  bodyWrap: HTMLElement | null;
  footer: HTMLElement | null;
}

/** 그리드 컨테이너에서 머리글·본문·본문 상자·푸터를 찾는다(클래스 이름 — 지금 코드 기준). */
export function findParts(container: HTMLElement): DfParts {
  return {
    header: container.querySelector<HTMLElement>('.og-header'),
    body: container.querySelector<HTMLElement>('.og-body'),
    bodyWrap: container.querySelector<HTMLElement>('.og-body-wrapper'),
    footer: container.querySelector<HTMLElement>('.og-footer-bar'),
  };
}

/**
 * 본문 행 범위 — 'all' 은 그려진 자식 전부, 'viewport' 는 본문 상자 화면(scrollTop ~ scrollTop+clientHeight)에
 * 걸치는 자식만(style.top/height 로 판정, top 이 없는 자식은 남김).
 *
 * 'viewport' 를 둔 까닭(T0 실측): 지금 코드는 「통째 그리기」 길이 둘이고 그리는 행 범위가 다르다.
 * VirtualScroll 의 onRender 길은 `_doRender(s, e)`(가시+여유), 통째 수단 `_doRender(..._visRange())` 는
 * 거기에 `+ visCount + 5` 행을 더 그린다(예: 첫 그림 30행 ↔ 통째 59행). 화면 밖 여분 행 수만 다르고 화면 안 행은 같다.
 * 통째 수단이 스케줄러 하나로 모이는 걸음(R7) 뒤에는 'all' 로 바꾼다.
 */
export type RowScope = 'all' | 'viewport';

export interface DfOptions { rowScope?: RowScope }

function intersectsViewport(el: Element, top: number, height: number): boolean {
  const st = (el as HTMLElement).style;
  if (!st || st.top === '') return true;
  const t = parseFloat(st.top);
  const h = parseFloat(st.height || '0') || 0;
  return t < top + height && t + h > top;
}

/** §17-4 정규화 사진. 줄 배열을 '\n' 으로 이은 글자. */
export function dfSnapshot(container: HTMLElement, opts: DfOptions = {}): string {
  const { header, body, bodyWrap, footer } = findParts(container);
  const scope = opts.rowScope ?? 'all';
  const out: string[] = [];
  out.push('== header');
  if (header) serializeEl(header, 0, out);
  out.push(`== body scope=${scope}`);
  if (body) {
    // body 자체(높이·폭 style 등)도 남긴다 — 자식은 아래에서 행 순서로.
    out.push(`<body-self class=[${Array.from(body.classList).sort().join(' ')}] style={${styleDecls(body)}}>`);
    let kids = Array.from(body.children).map((el, i) => ({ el, i, k: rowKey(el) }));
    if (scope === 'viewport' && bodyWrap) {
      const top = bodyWrap.scrollTop;
      const h = bodyWrap.clientHeight;
      kids = kids.filter(({ el }) => intersectsViewport(el, top, h));
    }
    kids.sort((a, b) => (a.k - b.k) || (a.i - b.i));
    for (const { el } of kids) serializeEl(el, 1, out);
  }
  out.push('== footer');
  if (footer) serializeEl(footer, 0, out);
  out.push('== state');
  const ae = document.activeElement as HTMLElement | null;
  if (ae && container.contains(ae)) {
    const row = ae.closest('[aria-rowindex]');
    const cell = ae.closest('[aria-colindex]');
    out.push(`active ri=${row?.getAttribute('aria-rowindex') ?? '-'} ci=${cell?.getAttribute('aria-colindex') ?? '-'} tag=${ae.tagName.toLowerCase()}`);
  } else {
    out.push('active none');
  }
  out.push(`bodyWrap scroll=${bodyWrap?.scrollLeft ?? '-'},${bodyWrap?.scrollTop ?? '-'}`);
  out.push(`header scroll=${header?.scrollLeft ?? '-'}`);
  return out.join('\n');
}

// ─── 비교기 ───────────────────────────────────────────────────────────

export interface Diff { same: boolean; line: number; a: string; b: string; context: string }

/** 줄 단위 비교. 처음 다른 줄과 앞뒤 2줄을 돌려준다. 바이트로도 같아야 same. */
export function compareSnapshots(a: string, b: string): Diff {
  if (a === b) return { same: true, line: -1, a: '', b: '', context: '' };
  const la = a.split('\n');
  const lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  let i = 0;
  while (i < n && la[i] === lb[i]) i++;
  const from = Math.max(0, i - 2);
  const ctx: string[] = [];
  for (let j = from; j < Math.min(n, i + 3); j++) {
    const mark = j === i ? '>>' : '  ';
    ctx.push(`${mark} ${j + 1} A| ${clip(la[j])}`);
    if (j === i) ctx.push(`${mark} ${j + 1} B| ${clip(lb[j])}`);
  }
  return { same: false, line: i + 1, a: la[i] ?? '<끝>', b: lb[i] ?? '<끝>', context: ctx.join('\n') };
}

function clip(s: string | undefined): string {
  if (s === undefined) return '<끝>';
  return s.length > 400 ? s.slice(0, 400) + `…(+${s.length - 400})` : s;
}

/** 다르면 던진다(메시지에 처음 다른 줄). */
export function assertSameSnapshot(a: string, b: string, label: string): void {
  const d = compareSnapshots(a, b);
  if (!d.same) throw new Error(`[${label}] 사진이 다르다 — ${d.line} 째 줄\n${d.context}`);
}
