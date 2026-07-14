// ============================================================
// DD-03 §2.4 CellPipeline — 셀 1개 합성의 유일 오케스트레이터
// 4레인(배경→값→데코→오버레이) 순회 → 누적 → 물질화(Applier) → 오버레이 합성(Compositor).
// never throw to host: 어떤 단계·인터셉터 실패도 그 셀만 격리(오류경계+회로차단, REQ-T3-819/T4-810/TX-840).
// 배경 레인 후 배경 명도 → AA 텍스트색 힌트 산출(REQ-T5-807) → 값 레인이 소비.
// DOM 접촉은 Applier/Compositor 2곳만 — 파이프라인 본체·단계 contribute 는 순수·헤드리스.
// ============================================================

import type {
  CellRenderRequest,
  PaintAccumulator,
  StagePaint,
  StageKind,
  StageTraceEntry,
  BgLayer,
  PaintNode,
  OverlayLayer,
} from './CellRenderRequest.js';
import type { CellStageRegistry } from './CellStageRegistry.js';
import type { RenderBudget } from './RenderBudget.js';
import type { CellApplier } from './CellApplier.js';
import type { OverlayCompositor } from './OverlayCompositor.js';
import type { CellErrorBoundary, StageCircuitBreaker } from './CellErrorBoundary.js';
import { contrastText } from './contrast.js';

/**
 * 레인 간 합성 상태의 가변 구현(누적기). 파이프라인 내부 전용 — 단계에는 Readonly<PaintAccumulator>
 * 로 전달돼 순수성을 강제한다. merge() 로 StagePaint 를 병합적으로 흡수한다.
 * / Mutable accumulator (pipeline-internal). Passed to stages as Readonly<PaintAccumulator>.
 */
class MutablePaintAccumulator implements PaintAccumulator {
  background: string | null = null;
  readonly bgLayers: BgLayer[] = [];
  content: (() => Node) | null = null;
  readonly decorations: PaintNode[] = [];
  readonly overlays: OverlayLayer[] = [];
  readonly cellStyle: Record<string, string> = {};
  readonly classes = new Set<string>();
  readonly aria: Record<string, string> = {};
  contentColorHint?: string;
  readonly trace: StageTraceEntry[] = [];

  /** 배경 명도 유도 AA 텍스트색 힌트 설정(값 레인 소비). / Set AA text-color hint (value lane). */
  setContentColorHint(hint: string): void {
    this.contentColorHint = hint;
  }

  /** StagePaint 를 누적기에 병합(미지정 필드는 무시). / Merge a StagePaint into the accumulator. */
  merge(paint: StagePaint): void {
    if (paint.background !== undefined) this.background = paint.background;
    if (paint.bgLayers) this.bgLayers.push(...paint.bgLayers);
    if (paint.content !== undefined) this.content = paint.content;
    if (paint.decorations) this.decorations.push(...paint.decorations);
    if (paint.overlays) this.overlays.push(...paint.overlays);
    if (paint.cellStyle) Object.assign(this.cellStyle, paint.cellStyle);
    if (paint.classes) for (const c of paint.classes) this.classes.add(c);
    if (paint.aria) Object.assign(this.aria, paint.aria);
    if (paint.contentColorHint !== undefined) this.contentColorHint = paint.contentColorHint;
  }
}

/**
 * CellPipeline — 셀 1개 합성 오케스트레이터. 협력자를 주입받아 4레인을 순회한다.
 * / CellPipeline — orchestrates single-cell composition over the four lanes.
 */
export class CellPipeline {
  constructor(
    private readonly registry: CellStageRegistry,
    private readonly budget: RenderBudget,
    private readonly applier: CellApplier,
    private readonly compositor: OverlayCompositor,
    private readonly boundary: CellErrorBoundary,
    private readonly breaker: StageCircuitBreaker,
  ) {}

  /**
   * 셀 렌더. never throw to host — 어떤 단계·인터셉터·물질화 실패도 그 셀만 격리한다.
   * / Render a cell. Never throws to host — isolates any stage/interceptor/materialization failure.
   *
   * @param req - 읽기 전용 셀 요청 / Read-only cell request
   * @param cellEl - 대상 셀 엘리먼트 / Target cell element
   */
  renderCell(req: CellRenderRequest, cellEl: HTMLElement): void {
    const acc = new MutablePaintAccumulator();

    // before 인터셉터(격리) — 예산 안에서만 실행·계측.
    this.boundary.guard(
      { stageId: 'interceptor.before', ri: req.ri, ci: req.ci },
      () => this.budget.runBeforeCell(req),
      undefined,
    );

    // 1) 배경 레인.
    this._runLane('background', req, acc);
    // 2) AA 이음새: 배경 명도 → AA-safe 텍스트색 힌트(리터럴 배경일 때만; var()면 유지).
    const hint = contrastText(acc.background);
    if (hint) acc.setContentColorHint(hint);
    // 3) 값 레인 → 4) 데코 레인 → 5) 오버레이 레인.
    this._runLane('value', req, acc);
    this._runLane('decorator', req, acc);
    this._runLane('overlay', req, acc);

    // 6) 물질화(DOM 접촉①) — 격리(never throw to host).
    this.boundary.guard(
      { stageId: 'applier', ri: req.ri, ci: req.ci },
      () => this.applier.apply(cellEl, acc, req),
      undefined,
    );
    // 7) 오버레이 z-합성(DOM 접촉②) — 격리.
    this.boundary.guard(
      { stageId: 'compositor', ri: req.ri, ci: req.ci },
      () => this.compositor.compose(cellEl, acc.overlays),
      undefined,
    );

    // after 인터셉터(격리).
    this.boundary.guard(
      { stageId: 'interceptor.after', ri: req.ri, ci: req.ci },
      () => this.budget.runAfterCell(req, cellEl),
      undefined,
    );
  }

  /**
   * 진단·특성화용 순수 합성(DOM 미접촉). 누적 결과(trace 포함)를 반환해 결정론 스냅샷·byte-identical
   * 검증에 쓴다(§8 R4). 물질화·오버레이 합성은 하지 않는다.
   * / Pure composition for diagnostics/characterization (no DOM). Returns the accumulator (with trace)
   * for deterministic snapshots.
   *
   * @param req - 읽기 전용 셀 요청 / Read-only cell request
   * @returns 누적 페인트(읽기 전용) / The accumulated paint (read-only)
   */
  compose(req: CellRenderRequest): PaintAccumulator {
    const acc = new MutablePaintAccumulator();
    this._runLane('background', req, acc);
    const hint = contrastText(acc.background);
    if (hint) acc.setContentColorHint(hint);
    this._runLane('value', req, acc);
    this._runLane('decorator', req, acc);
    this._runLane('overlay', req, acc);
    return acc;
  }

  /** 한 레인의 단계를 order 순으로 순회·격리 실행·누적. / Traverse a lane's stages, isolate, accumulate. */
  private _runLane(kind: StageKind, req: CellRenderRequest, acc: MutablePaintAccumulator): void {
    for (const stage of this.registry.stagesFor(kind)) {
      // 회로 open 이면 호출 자체 skip(폭주 차단).
      if (this.breaker.isOpen(stage.id)) {
        acc.trace.push({ stageId: stage.id, kind, contributed: false, ms: 0, failed: true });
        continue;
      }
      const start = Date.now();
      let contributed = false;
      const ok = this.boundary.guard(
        { stageId: stage.id, ri: req.ri, ci: req.ci },
        () => {
          if (!stage.appliesTo(req)) return true;      // 게이트 닫힘 = 성공·무기여(제로코스트)
          const paint = stage.contribute(req, acc);
          if (paint) { acc.merge(paint); contributed = true; }
          return true;
        },
        false,
      );
      this.breaker.record(stage.id, ok);
      acc.trace.push({ stageId: stage.id, kind, contributed, ms: Date.now() - start, ...(ok ? {} : { failed: true }) });
    }
  }
}
