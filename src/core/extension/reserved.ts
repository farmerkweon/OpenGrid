// ============================================================
// DD-10 §2.4 예약 네임스페이스 가드 / reserved-namespace guard
// og:* 코어 예약 대역. 코어 내장은 origin:'builtin' 로 정당 점유하고,
// 사용자/플러그인의 og:* 등록은 거부+경고(TX-883). 헤드리스·순수.
// ============================================================

/**
 * 그리드가 자기 몫으로 남겨둔 이름 접두사입니다. 이 대역은 그리드에 내장된 기능만 쓸 수 있고,
 * 사용자나 플러그인이 이 접두사로 등록하면 거부됩니다.
 *
 * The name prefixes the grid keeps for itself. Only the grid's own built-ins may use this band;
 * registrations from your code or from plugins are rejected.
 *
 * グリッドが自分用に確保している名前の接頭辞です。この帯域はグリッドに組み込まれた機能だけが使え、
 * ユーザーやプラグインがこの接頭辞で登録すると拒否されます。
 *
 * 表格为自身保留的名称前缀。该区段仅供表格内置功能使用，用户代码或插件以该前缀注册时会被拒绝。
 */
export const RESERVED_PREFIXES = ['og:', 'og-'] as const;

/**
 * 어떤 이름이 예약 대역에 걸리는지 미리 확인합니다. 등록이 거부당하기 전에 물어볼 때 씁니다.
 *
 * Checks up front whether a name falls in the reserved band — ask before a registration gets rejected.
 *
 * ある名前が予約帯域に掛かるかどうかを事前に確認します。登録が拒否される前に問い合わせるときに使います。
 *
 * 预先检查某个名称是否落在保留区段内。可在注册被拒绝之前进行判断。
 *
 * @param key - 검사할 이름
 *
 * The name to check.
 *
 * 検査する名前。
 *
 * 待检查的名称。
 *
 * @returns 예약 접두사로 시작하면 true
 *
 * true if it starts with a reserved prefix.
 *
 * 予約接頭辞で始まる場合は true。
 *
 * 若以保留前缀开头则返回 true。
 */
export function isReserved(key: string): boolean {
  return RESERVED_PREFIXES.some((p) => key.startsWith(p));
}
