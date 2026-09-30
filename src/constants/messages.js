// 処理結果メッセージ(要件定義書 2.8 / N-02)
// 文言は句読点まで完全一致させること。変更禁止。
const MESSAGES = {
  STATUS_CHANGED: (label) => `ステータスを「${label}」に変更しました。`,
  ASSIGNEE_CHANGED: (name) => `担当者を「${name}」に変更しました。`,
  ASSIGNEE_CLEARED: '担当者を未割り当てに戻しました。',
  INVALID_TRANSITION: 'このステータスへは変更できません。画面を再読み込みしてください。',
  NO_PERMISSION: 'この操作を行う権限がありません。',
  DONE_ASSIGNEE_LOCKED: '完了済みの問い合わせは担当者を変更できません。',
  INVALID_USER: '指定されたユーザーは選択できません。',
  COMMENT_TOO_LONG: 'コメントは200文字以内で入力してください。',
  NOT_FOUND: '指定された問い合わせは存在しません。',
  CONFLICT: '他のユーザーが更新しました。画面を再読み込みしてください。',
};

module.exports = { MESSAGES };
