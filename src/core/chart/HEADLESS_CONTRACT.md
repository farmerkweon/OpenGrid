# 차트 헤드리스 계약 (DD-06 · REQ-T6-060/807)

> 경계 다이어그램 · 7원자 독립 수용기준 · 릴리스 게이트. SSOT = `sessions/design-uxui-2026-07/detailed-design/DD-06_chart-subsystem.md`.

## 1. 경계 다이어그램 — 순수 이음새 vs humble surface

```
              ┌───────────────────────── 순수 이음새 (window/document/canvas 미참조, 불변식1) ─────────────────────────┐
   model ────▶│  computeChartGeometry(geometry.ts)  ──▶  buildChartScene(scene.ts)  ──▶  ChartScene(원시명령 SSOT)     │
   spec  ────▶│  · extent(bar 0기준선 강제)              · 색/패턴 확정(palette 재사용)     · prims[] + geometry + meta   │
   size  ────▶│  · niceScale(scales 재사용)             · null=gap/빈슬롯(§9.3.3)          · 결정론(Date/random 미사용) │
              └───────────────────────────────────────────────┬────────────────────────────────────────────────────────┘
                                                               │ 동일 scene (바이트 동일)
                        ┌──────────────────────────────────────┼──────────────────────────────────────┐
                        ▼                                       ▼                                      ▼
              CanvasSurface(DOM)                       SvgSurface(문자열, 서버공용)          ServerRasterSurface(주입 IRasterizer)
              ctx=null → no-op                         toString() = <svg>(RT-803)           toPNG() = 위임(미주입=throw, 불변식4)
                        └──────────────── 세 타깃은 판단하지 않는다(humble) — sceneEquals 로 1급 파리티 증명 ─────────────┘
```

- **불변식1**(헤드리스): `geometry.ts`·`scene.ts`·`surfaces/SvgSurface.ts`·`server.ts`·`parity.ts`·`provenance.ts`·`downsample-report.ts` 는 `window`/`document`/`canvas` 를 심볼조차 참조하지 않는다. → DD-14 `arch:check` + `no-restricted-globals` lint 등록 대상(통합 TODO).
- **불변식2**(재계산 금지): 어떤 surface 도 기하·스케일·색을 재계산하지 않는다. → `parity.ts sceneEquals` 게이트가 집행.
- **불변식3**(결측 무침묵): null 은 0 으로 치환되지 않는다(bar 빈 슬롯·line gap).
- **불변식4**(조용한 폴백 금지): 미주입 PNG·미로드 엔진·미지원 타입은 throw 또는 배지로 고지.
- **불변식5**(결정론): 동일 입력 → 동일 scene(골든 벡터 안정성).

## 2. REQ-T6-807 7원자 독립 수용기준

| # | 하위 요구 | 수용기준 | 현 상태 |
|---|---|---|---|
| 1 | 헤드리스 계약 문서 | 본 문서 존재·경계 다이어그램 포함 | ✅ |
| 2 | 엔진 seam | `ChartEngineRegistry` SRI 검증·미로드 폴백 사유 값 | ✅ (registries.test) |
| 3 | SVG/PNG export | `SvgSurface.toString()`·`renderChartServer` svg 항상, png opt-in(IRasterizer) | ✅ SVG / PNG 주입형 |
| 4 | 인쇄 경로 | scene.meta provenance 동행(SVG `<desc>`) → DD-15 연동 | ⏳ 통합(DD-15) |
| 5 | 키보드/alt | a11yTable(기존)·SVG role=img+aria-label+`<desc>` | ✅ 문자열 / 키보드는 CanvasAdapter(기존) |
| 6 | 터치 | DD-08 연동 | ⏳ 통합(DD-08) |
| 7 | 릴리스 게이트 | 실브라우저(비jsdom) 파리티 CI 단계 | ⏳ CI(DD-13/14) |

## 3. 릴리스 게이트

- **1급 파리티(계산 동일성)**: `sceneEquals(canvas, svg) && sceneEquals(svg, server)` — 골든 케이스(bar 양/음수·line 결측·area 다계열·pie 음수) deep-equal. 현 `test/unit/chart/parity.test.ts` 집행.
- **픽셀 계량(SSIM≥0.98·ΔE≤2.0)**: DD-13 `VisualRegressionHarness` 소유(DD-06 은 `sceneEquals` 만; 픽셀 지표 재구현 금지).
- **다운샘플 정직성**: `analyzeDownsample` — 극값 100%·특징≥95%·편차≤1px(`downsample-report.test.ts`).
- **번들**: 순수 이음새는 기존 `_computeGeometry`/`_paint` **이동**분(순증 미미). `SvgSurface`/`server.ts`/`ServerRasterSurface`/`parity.ts`/registries 는 트리셰이킹 분리 대상(client canvas-only 미포함). PNG 인코더는 코어 미내장(주입형).

## 4. 소유권 경계 (크로스컷 정합)

- DD-06 대표 소유: `RenderTargetKind`·`RenderSurface`·`ChartScene`·`renderChartServer`·`sceneEquals`. (DD-07 은 import 소비.)
- DD-11 소유(DD-06 소비): `ChartTheme`/`ResolvedAppearanceSnapshot`(CSS→JS 브리지, REQ-T6-813).
- DD-13 소유(DD-06 소비): `ssim`/`maxDeltaE` 픽셀 지표.
- DD-04 소비: 값 포맷은 `spec.numberFormat`(IFormatter) 위임 — 차트 자체 포맷 로직 없음.
- DD-10 동형: `ChartTypeRegistry`·`ChartEngineRegistry` = `IRegistry<V,K>` 어댑터(TypedRegistry 위임, 재구현 0).
