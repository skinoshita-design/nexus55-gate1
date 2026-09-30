// 状態遷移表(要件定義書 2.4)
// ここに書かれていない遷移はすべて不可。画面表示とサーバー検証の両方でこの定数を使う。
const TRANSITIONS = {
  NEW: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING', 'DONE'],
  PENDING: ['IN_PROGRESS'],
  DONE: ['IN_PROGRESS'], // 再オープン
};

function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// 画面の変更先ラジオボタン用(V-01)
function nextStatuses(from) {
  return TRANSITIONS[from] ? [...TRANSITIONS[from]] : [];
}

module.exports = { TRANSITIONS, canTransition, nextStatuses };
