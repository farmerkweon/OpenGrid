// ============================================================
// DD-08 §2.1 — 바운디드 컨텍스트 진입점 (CalcService 파사드, REQ-T8-842)
// 레이어: Algorithm (헤드리스, DOM/프레임워크 무의존 — 단독 인스턴스화 가능)
// 설계 SSOT: DD-08 §2.1, §4 Facade. RecalcCoordinator(오케스트레이션)를 감싸고 FunctionRegistry·
//   Generation·ReferenceRewriter·CyclePathReporter·CalcCacheStore·CalcProvenance 를 DI 로 조립한다.
// additive(strangler): 기존 코어 무수정. RecalcCoordinator 를 소유·재사용하며 그 공개 API 를 계승.
//   그리드는 이 파사드에만 의존하면 구현 교체가 자유롭다(seam).
// ============================================================

import {
  cellKey, parseCellKey,
  type CanonicalRef, type CanonicalRangeRef, type CellKey, type CellValue,
  type FormulaErrorCode, type FormulaGridAccessor, type RefMode,
} from './types.js';
import { computeHasRangeRef } from './normalizeRefs.js';
import { RecalcCoordinator, type RecalcSummary } from './RecalcCoordinator.js';
import { TieredFunctionRegistry, type FunctionRegistry } from './FunctionRegistry.js';
import { GenerationCounter, SyncCalcExecutor, type CalcExecutor, type Generation } from './Generation.js';
import { AstReferenceRewriter, type ReferenceRewriter, type StructuralEdit, type RewriteReport, type BrokenRef } from './ReferenceRewriter.js';
import { DefaultCyclePathReporter, type CyclePathReporter } from './CyclePathReporter.js';
import { LruCalcCacheStore, hashInputs, type CalcCacheStore, type CalcCacheSnapshot } from './CalcCacheStore.js';
import { buildProvenance, type CalcProvenance } from './CalcProvenance.js';
import type { FormulaGraph } from './FormulaGraph.js';
import type { FormulaStore } from './FormulaStore.js';

/**
 * 계산 엔진이 그리드/데이터를 보는 유일한 포트(§2.2). 핵심 7메서드는 동결(FormulaGridAccessor),
 * 구조편집·명명범위·시각파생은 옵셔널 확장(미구현 안전 폴백 — 인터페이스 비대화 회피).
 * / The sole port through which the calc engine views the grid (§2.2). Core 7 methods frozen;
 *   structural/named-range/derived hooks are optional (safe fallback when unimplemented).
 */
export interface CalcHostPort extends FormulaGridAccessor {
  /** (선택) 명명범위 해소(INDIRECT/named-range, §2.2). / (optional) resolve a named range. */
  resolveName?(name: string): CanonicalRangeRef | CanonicalRef | null;
  /** (선택) 구조편집 좌표 델타 환산. / (optional) structural-edit coordinate delta. */
  structuralDelta?(edit: StructuralEdit): { dRow: number; dCol: number };
  /** (선택) 시각 파생 소비자 등록(REQ-T8-801). / (optional) register a derived visual consumer. */
  registerDerived?(node: unknown): void;
}

/** CalcService DI 구성 옵션(§2.1). / CalcService DI options (§2.1). */
export interface CalcServiceOptions {
  /** 좌표·값 질의 포트(§2.2). / Coordinate/value query port (§2.2). */
  host: CalcHostPort;
  /** 계산 결과를 셀에 반영하는 콜백. / Callback writing a computed value back to a cell. */
  setComputedValue: (rowId: string, field: string, v: CellValue) => void;
  /** (선택) 수식 오류 통지. / (optional) formula-error notification. */
  onFormulaError?: (rowId: string, field: string, e: FormulaErrorCode) => void;
  /** (선택) 함수 레지스트리(미주입 시 빈 레지스트리 — 내장 필수함수는 switch 폴백). / (optional) function registry. */
  functions?: FunctionRegistry;
  /** (선택) 계산 실행기(기본 동기). / (optional) calc executor (default sync). */
  executor?: CalcExecutor;
  /** (선택) 참조 정규화 모드('stable' 기본). / (optional) reference mode ('stable' default). */
  refMode?: RefMode;
  /** (선택) 나눗셈 정밀도(기본 30). / (optional) division precision (default 30). */
  divisionPrecision?: number;
  /** (선택) 결정론 주입 시각(volatile 함수·벤치). / (optional) injected deterministic clock. */
  now?: () => number;
  /** (선택) 캐시 LRU 상한(기본 5000). / (optional) cache LRU capacity (default 5000). */
  cacheCapacity?: number;
}

/**
 * 계산 엔진 바운디드 컨텍스트의 단일 진입점(파사드, §2.1). UI/DOM 무의존, 단독 인스턴스화 가능.
 * RecalcCoordinator 의 CRUD/재계산 API 를 계승하고 DD-08 신설 능력(구조편집 재작성·순환경로·
 * 세대·계보·캐시)을 얹는다.
 * / Single entry point of the calc bounded context (facade, §2.1). Inherits RecalcCoordinator's
 *   CRUD/recalc API and adds DD-08 capabilities (structural rewrite, cycle path, generation,
 *   provenance, cache).
 *
 * @example
 * const svc = new CalcService({ host, setComputedValue });
 * svc.setCellFormula('r1', 'total', '=[price]*[qty]');
 * svc.getProvenance('r1', 'total'); // { kind, precedents, … }
 */
export class CalcService {
  private readonly _coord: RecalcCoordinator;
  private readonly _host: CalcHostPort;
  private readonly _registry: FunctionRegistry;
  private readonly _executor: CalcExecutor;
  private readonly _gen = new GenerationCounter();
  private readonly _rewriter: ReferenceRewriter;
  private readonly _cycleReporter: CyclePathReporter = new DefaultCyclePathReporter();
  private readonly _cache: CalcCacheStore;
  /** 직전 구조편집에서 셀별 #REF 사유(계보 표기용). / Per-cell #REF reasons from the last structural edit. */
  private readonly _brokenByKey = new Map<CellKey, BrokenRef[]>();

  constructor(opts: CalcServiceOptions) {
    this._host = opts.host;
    this._registry = opts.functions ?? new TieredFunctionRegistry();
    this._executor = opts.executor ?? new SyncCalcExecutor();
    this._rewriter = new AstReferenceRewriter(opts.host);
    this._cache = new LruCalcCacheStore(opts.cacheCapacity ?? 5000);

    const coordOpts: {
      accessor: FormulaGridAccessor;
      setComputedValue: (rowId: string, field: string, value: CellValue) => void;
      onFormulaError?: (rowId: string, field: string, error: FormulaErrorCode) => void;
      refMode?: RefMode;
      divisionPrecision?: number;
      functions?: FunctionRegistry;
      now?: () => number;
    } = {
      accessor: opts.host,
      setComputedValue: opts.setComputedValue,
      functions: this._registry,
    };
    if (opts.onFormulaError) coordOpts.onFormulaError = opts.onFormulaError;
    if (opts.refMode) coordOpts.refMode = opts.refMode;
    if (opts.divisionPrecision !== undefined) coordOpts.divisionPrecision = opts.divisionPrecision;
    if (opts.now) coordOpts.now = opts.now;
    this._coord = new RecalcCoordinator(coordOpts);
  }

  // ── CRUD (현 RecalcCoordinator API 계승·안정, §2.1) ──
  /** @see RecalcCoordinator.setCellFormula */
  setCellFormula(rowId: string, field: string, src: string): RecalcSummary {
    return this._coord.setCellFormula(rowId, field, src);
  }
  /** @see RecalcCoordinator.getCellFormula */
  getCellFormula(rowId: string, field: string): string | null {
    return this._coord.getCellFormula(rowId, field);
  }
  /** @see RecalcCoordinator.clearCellFormula */
  clearCellFormula(rowId: string, field: string): CellKey[] {
    return this._coord.clearCellFormula(rowId, field);
  }
  /** @see RecalcCoordinator.hasCellFormula */
  hasCellFormula(rowId: string, field: string): boolean {
    return this._coord.hasCellFormula(rowId, field);
  }
  /** @see RecalcCoordinator.getCellError */
  getCellError(rowId: string, field: string): FormulaErrorCode | null {
    return this._coord.getCellError(rowId, field);
  }

  // ── 재계산 (증분/전체·불변식 SSOT, §2.1) ──
  /** C2 배치 진입점(증분). / C2 batch entry (incremental). */
  onValuesChanged(keys: CellKey[]): RecalcSummary {
    return this._coord.onValuesChanged(keys);
  }
  /** 전체 재계산(증분==전체 오라클). / Full recalculation (incremental==full oracle). */
  recalculateAll(): RecalcSummary {
    return this._coord.recalculateAll();
  }
  /** 정렬/필터 후크(범위-보유 수식 dirty). / Sort/filter hook (dirties range-bearing formulas). */
  recalcRangeBearing(): RecalcSummary {
    return this._coord.recalcRangeBearing();
  }
  /** F1 fill(상대축 오프셋). / F1 fill (relative-axis offset). */
  offsetFormula(srcRowId: string, srcField: string, dRow: number, dCol: number): string {
    return this._coord.offsetFormula(srcRowId, srcField, dRow, dCol);
  }

  // ── 구조편집 재작성 (DD-08 신설·승격, §2.5/§3.3, REQ-T8-804/805) ──
  /**
   * 저장된 전 수식을 구조편집에 맞춰 순수 재작성하고, deps 가 바뀐 수식을 재계산한다.
   * 대상 소멸 참조는 #REF 정직 전환(RewriteReport.broken). undo 는 호출부(DD-09) 트랜잭션 몫.
   * / Purely rewrite every stored formula for a structural edit, then recalc formulas whose deps
   *   changed. Dead refs → #REF (RewriteReport.broken).
   *
   * @param edit - 구조편집(행/열 삽입·삭제·이동) / The structural edit
   * @returns 재작성 리포트(시프트·#REF·불변 집계) / Rewrite report (shifted/#REF/unchanged tallies)
   */
  rewriteReferences(edit: StructuralEdit): RewriteReport {
    let rewritten = 0;
    let unchanged = 0;
    const broken: BrokenRef[] = [];
    const affected: CellKey[] = [];
    this._brokenByKey.clear();

    for (const { rowId, field, cell } of this._coord.store.getAllFormulaCells()) {
      const newAst = this._rewriter.rewrite(cell.ast, { rowId, field }, edit);
      const rep = this._rewriter.lastReport();
      rewritten += rep.rewritten;
      unchanged += rep.unchanged;
      if (rep.broken.length > 0) {
        broken.push(...rep.broken);
        this._brokenByKey.set(cellKey(rowId, field), rep.broken);
      }
      if (newAst !== cell.ast) {
        cell.ast = newAst;
        cell.hasRangeRef = computeHasRangeRef(newAst);
        affected.push(cellKey(rowId, field));
      }
    }

    if (affected.length > 0) this.onValuesChanged(affected);
    return { rewritten, broken, unchanged };
  }

  // ── 순환·계보 (§2.6, REQ-T8-803/T4-030) ──
  /**
   * (rowId, field) 셀이 순환에 속하면 고리 경로([A,B,A])를, 아니면 null 을 반환한다(지연 복원).
   * / Return the cycle path ([A,B,A]) if the cell is in a cycle, else null (lazy recovery).
   */
  getCyclePath(rowId: string, field: string): CellKey[] | null {
    const key = cellKey(rowId, field);
    const graph = this._coord.graph;
    const { cycles } = graph.topoOrder(graph.allFormulaKeys());
    if (!cycles.includes(key)) return null;
    const paths = this._cycleReporter.recover(cycles, graph);
    return paths.get(key) ?? null;
  }

  /**
   * 이 셀 값/에러가 "왜" 그러한가(§2.6). error/precedents + (순환 시)경로 + (#REF 시)깨진 참조.
   * / Why this cell holds its value/error (§2.6): error/precedents + cycle path + broken refs.
   */
  getProvenance(rowId: string, field: string): CalcProvenance {
    const key = cellKey(rowId, field);
    const cyclePath = this.getCyclePath(rowId, field) ?? undefined;
    const brokenRefs = this._brokenByKey.get(key);
    const src: { graph: FormulaGraph; store: FormulaStore; cyclePath?: CellKey[]; brokenRefs?: BrokenRef[] } = {
      graph: this._coord.graph,
      store: this._coord.store,
    };
    if (cyclePath) src.cyclePath = cyclePath;
    if (brokenRefs) src.brokenRefs = brokenRefs;
    return buildProvenance(rowId, field, src);
  }

  // ── 비동기 세대 (§2.4, REQ-T8-806) ──
  /** 현재 세대. / Current generation. */
  currentGeneration(): Generation {
    return this._gen.current();
  }
  /** 세대를 올려 in-flight(비동기) 결과를 폐기한다. / Bump the generation to discard in-flight async results. */
  invalidateGeneration(): Generation {
    return this._gen.invalidate();
  }

  // ── 캐시 (§2.7, REQ-T5-049/T8-846) ──
  /**
   * 현재 계산 상태를 캐시 스냅샷으로 직렬화한다(includeCalcModelCache). 각 수식 셀의 결과를
   * 선행값 구조해시(inputsHash)와 함께 기록한다.
   * / Serialize the current calc state into a cache snapshot; each formula outcome is recorded with
   *   its precedent-value structural hash (inputsHash).
   */
  exportCache(): CalcCacheSnapshot {
    for (const { rowId, field, cell } of this._coord.store.getAllFormulaCells()) {
      const key = cellKey(rowId, field);
      this._cache.set(key, { value: cell.value, error: cell.error, approx: !!cell.approx, touched: new Set() }, this._inputsHashOf(key));
    }
    return this._cache.export();
  }

  /**
   * 캐시 스냅샷을 재로드한다. 각 항목은 현재 선행값 해시와 재검증되어 통과분만 신뢰한다
   * (스테일 캐시 거부, REQ-T8-845).
   * / Import a cache snapshot; each entry is re-verified against current precedent-value hashes and
   *   only matching entries are trusted (stale-cache rejection, REQ-T8-845).
   */
  importCache(snap: CalcCacheSnapshot): void {
    this._cache.import(snap, (key, inputsHash) => this._inputsHashOf(key) === inputsHash);
  }

  /** 캐시 저장소 직접 접근(진단·테스트). / Direct cache access (diagnostics/tests). */
  get cache(): CalcCacheStore {
    return this._cache;
  }

  /** 선행값 구조해시 — graph precedents 순서로 host 값을 읽어 hashInputs. / Structural hash of precedent values. */
  private _inputsHashOf(key: CellKey): string {
    const precs = this._coord.graph.getPrecedents(key);
    const vals: CellValue[] = precs.map((p) => {
      const { rowId, field } = parseCellKey(p);
      const raw = this._host.getCellValue(rowId, field);
      return (raw ?? null) as CellValue;
    });
    return hashInputs(vals);
  }

  // ── 함수 레지스트리 SPI (§2.3, REQ-T8-827) ──
  /** 함수 등록·조회·오버라이드 SPI(§2.3). / Function register/get/override SPI (§2.3). */
  get functions(): FunctionRegistry {
    return this._registry;
  }

  /** 실행기(진단·테스트). / Executor (diagnostics/tests). */
  get executor(): CalcExecutor {
    return this._executor;
  }

  /** 내부 코디네이터(진단·고급 배선). / Underlying coordinator (diagnostics/advanced wiring). */
  get coordinator(): RecalcCoordinator {
    return this._coord;
  }
}
