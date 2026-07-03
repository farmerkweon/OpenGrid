/**
 * F4 — nice-number 축 눈금 스케일(순수 함수, 헤드리스). §8.1(자동검증 대상 수학).
 *
 * 표준 Heckbert "Nice Numbers for Graph Labels" 알고리즘. 목표 tick 수(default 6)에 맞춰
 * step 을 1/2/5×10^n 중에서 선택하고, [min,max] 를 그 step 배수로 확장한다.
 *
 * 한계(정직 명시): 이 알고리즘은 min=0 류의 "원점 기준" 범위에서는 매우 안정적으로
 * tick 5~6개를 낸다(설계서 §8.1 문서화 예시 [0,97]→6 tick 포함). min≠0 인 임의 구간에서는
 * step 후보가 {1,2,5,10} 로 성기어(coarse) tick 수가 4개나 7개로 튈 수 있다 — 표준 알고리즘의
 * 알려진 한계이며, 본 구현은 문서화된 대표 입력(§8.1)에 대해서만 5~6 불변식을 보장한다.
 */

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** range 를 1/2/5×10^n 중 하나로 반올림한다(round=true: 가장 가까운 값, false: 올림 쪽 느슨한 값). */
export function niceNum(range: number, round: boolean): number {
  if (range === 0) return 0;
  const abs = Math.abs(range);
  const exponent = Math.floor(Math.log10(abs));
  const fraction = abs / Math.pow(10, exponent);
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exponent);
}

/** step 소수 자릿수에 맞춰 부동소수 잔여 오차(0.3000000000000004 등)를 정리한다. */
function roundToStep(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 6);
  const factor = Math.pow(10, decimals);
  const r = Math.round(v * factor) / factor;
  return r === 0 ? 0 : r; // -0 정규화(Object.is 비교 안전)
}

/**
 * [dataMin,dataMax] → nice range/step/tick 배열(§8.1). maxTicks 는 목표 tick 수(default 6).
 * dataMin===dataMax(degenerate) 이면 값 주변으로 인위 확장한다.
 */
export function niceScale(dataMin: number, dataMax: number, maxTicks = 6): NiceScale {
  let lo = dataMin, hi = dataMax;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (lo === 0) { lo = -1; hi = 1; }
    else { const pad = Math.abs(lo) * 0.5; lo -= pad; hi += pad; }
  }

  const n = Math.max(2, maxTicks);
  const rawRange = niceNum(hi - lo, false);
  const step = niceNum(rawRange / (n - 1), true);
  const niceMin = roundToStep(Math.floor(lo / step) * step, step);
  const niceMax = roundToStep(Math.ceil(hi / step) * step, step);

  const ticks: number[] = [];
  const count = Math.round((niceMax - niceMin) / step) + 1;
  for (let i = 0; i < count; i++) {
    ticks.push(roundToStep(niceMin + i * step, step));
  }

  return { min: niceMin, max: niceMax, step, ticks };
}
