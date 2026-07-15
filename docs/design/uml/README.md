# OPEN GRID — 설계 UML (v1.3, 배포용)

이 폴더는 **최신 버전(v1.3) 아키텍처를 설명하는 PlantUML 다이어그램**만 모은 것입니다.
npm 패키지만 받은 상태에서 코드를 처음부터 분석하지 않고도, 이 그림들로 구조를 빠르게 파악할 수 있습니다.

> 소스(`.puml`)와 렌더 이미지(`img/*.svg`, `img/*.png`)를 함께 둡니다. 다른 도구·AI가 `.puml`을 열어 수정하거나
> 이미지를 바로 볼 수 있습니다. 페르소나·개인 실명 없음, 경쟁 제품명 없음.

## 코어 아키텍처 (v1.3)
| 파일 | 다이어그램 |
|---|---|
| `arch_v13_component` | 컴포넌트 아키텍처 — OpenGrid(파사드) 중심 + 현재 서브시스템 전량(데이터/렌더/정렬·필터/편집/선택·범위 F1/수식 F3/크로스그리드/마스터·디테일 F2/통합차트 F4/조건부서식 CF/실시간 RT/외관·스킨/i18n/내보내기/오버라이드 커널). 코어 제로 의존성. |
| `arch_v13_class_facade` | 클래스도 — OpenGrid 파사드가 매니저들을 합성(deps 주입)으로 거느리는 구조 + 주요 공개 메서드. |
| `arch_v13_seq_render` | 렌더 시퀀스 — `setData → MutationService → VirtualScroll(rAF 코얼레싱) → RenderController → GridRenderer`. 가시 윈도우만 DOM 생성. |

## ECharts 통합 (코어 무수정, v1.3)
| 파일 | 다이어그램 |
|---|---|
| `ec1_component_integration` | 비침습 통합 — 그리드 코어(무수정)·어댑터(데모 자산)·ECharts(외부 ESM). |
| `ec2_seq_grid_to_chart` | 그리드→차트 — 공개 이벤트 구독 + 공개 API 읽기. |
| `ec3_seq_chart_to_grid` | 차트→그리드 — ECharts 이벤트 → 공개 API 역구동(`__ri` 사이드카). |
| `ec4_dataflow_pipeline` | 데이터 파이프라인 — 그리드(SSOT)→어댑터(표준 설정)→렌더 + 프로비넌스 배지 + 텍스트 등가. |
| `ec5_state_chart_lifecycle` | 차트 인스턴스 라이프사이클(로드→활성→정리). |

## 다시 렌더하려면
`.puml`을 고친 뒤 PlantUML(`plantuml -tsvg`/`-tpng`)로 렌더하면 됩니다. 한글 라벨은 NanumGothic 폰트를 씁니다.
