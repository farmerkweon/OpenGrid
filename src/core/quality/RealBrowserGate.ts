// ============================================================
// DD-13 §2.7 실브라우저 렌더 게이트 — RealBrowserGate (REQ-TX-829·803·828)
// / DD-13 §2.7 Real-browser render gate.
// jsdom ctx=null 유닛 통과로는 완료 불인정. 렌더 의존 기능은 실브라우저에서 실픽셀·DOM 노드수 어서션.
// 실 구동은 주입 계약(ICaseRunner) — 로직·계약 중심, 헤드리스. 커버리지/무효(assertion=0) 판정 소유.
// ============================================================

/** 픽셀 어서션 — 특정 좌표의 RGBA 기대(허용오차). / Pixel assertion — expected RGBA at a coordinate. */
export interface PixelAssertion {
  readonly kind: 'pixel';
  readonly at: { x: number; y: number };
  readonly expect: { rgba: [number, number, number, number]; tolerance: number };
}

/** 노드수 어서션 — 셀렉터 라이브 노드 상한(TX-803). / Node-count assertion — live node cap. */
export interface NodeCountAssertion {
  readonly kind: 'nodeCount';
  readonly selector: string;         // 예: '.og-cell'
  readonly max: number;              // TX-803 상한(≤5,000 기본 뷰포트, DD-02 소유)
}

/** 렌더 의존 기능 1건. / One render-dependent feature case. */
export interface RenderGateCase {
  readonly id: string;
  readonly feature: 'chart' | 'microVisual' | 'virtualization' | 'pixelAlign' | 'merge' | 'frozen';
  readonly fixtureId: string;
  /** 최소 1개 이상의 픽셀/노드 어서션 필수(없으면 게이트가 이 케이스를 무효 처리). */
  readonly assertions: ReadonlyArray<PixelAssertion | NodeCountAssertion>;
}

/** 단일 어서션 결과. / A single assertion result. */
export interface AssertionResult {
  readonly assertion: PixelAssertion | NodeCountAssertion;
  readonly measured: number | [number, number, number, number];
  readonly status: 'pass' | 'fail';
}

/** 케이스 1건의 실행 결과. / One case's run result. */
export interface CaseResult {
  readonly caseId: string;
  readonly engine: string;           // 'chromium' | 'firefox' | 'webkit'
  readonly status: 'pass' | 'fail' | 'invalid'; // invalid = assertion 0(허위완료 차단)
  readonly assertions: readonly AssertionResult[];
}

/** 엔진별 개별 리포트(TX-828 크로스브라우저). / Per-engine report. */
export interface RenderGateReport {
  readonly engine: string;
  readonly cases: readonly CaseResult[];
  readonly status: 'pass' | 'fail';
}

/** 실브라우저 케이스 구동 계약(Playwright 잡/스텁 주입). / Real-browser case runner contract. */
export interface ICaseRunner {
  readonly engine: string;
  run(c: RenderGateCase): Promise<readonly AssertionResult[]>;
}

/**
 * 실브라우저 게이트 — 렌더 의존 기능 전수가 실픽셀/노드 어서션을 통과해야 완료.
 * CRC: 케이스 등록·구동·판정·커버리지 | 협력: ICaseRunner(엔진별)·ReleaseGate.
 * 불변식: 케이스마다 assertion ≥1(허위완료 방지). assertion=0 → invalid.
 * / Real-browser gate — every render-dependent feature must pass real pixel/node assertions.
 */
export class RealBrowserGate {
  private readonly _cases: RenderGateCase[] = [];
  constructor(private readonly runner: ICaseRunner) {}

  /** 케이스 등록. / Register a case. */
  registerCase(c: RenderGateCase): void {
    this._cases.push(c);
  }

  /** 등록 케이스 수. / Registered case count. */
  get caseCount(): number {
    return this._cases.length;
  }

  /** 실브라우저 구동 → 엔진 리포트. assertion=0 케이스는 invalid(허위완료 차단). / Run cases. */
  async run(): Promise<RenderGateReport> {
    const results: CaseResult[] = [];
    for (const c of this._cases) {
      if (c.assertions.length === 0) {
        results.push({ caseId: c.id, engine: this.runner.engine, status: 'invalid', assertions: [] });
        continue;
      }
      const asserts = await this.runner.run(c);
      const failed = asserts.some(a => a.status === 'fail');
      results.push({
        caseId: c.id,
        engine: this.runner.engine,
        status: failed ? 'fail' : 'pass',
        assertions: asserts,
      });
    }
    const ok = results.every(r => r.status === 'pass');
    return { engine: this.runner.engine, cases: results, status: ok ? 'pass' : 'fail' };
  }

  /** 커버리지: 렌더 의존 기능 목록 중 케이스 없는 항목 → 미커버 실패. / Coverage gaps. */
  coverageGaps(featureInventory: readonly string[]): string[] {
    const covered = new Set(this._cases.map(c => c.feature));
    return featureInventory.filter(f => !covered.has(f as RenderGateCase['feature']));
  }
}
