// 問い合わせのステータス変更・担当者変更の業務ロジック
const { MESSAGES } = require('../constants/messages');
const { STATUS_LABELS } = require('../constants/status');
const { canTransition } = require('../constants/transitions');

const COMMENT_MAX = 200;

// ---- 排他制御(N-02)用の updated_at ----
// updated_at は「yyyy-MM-dd HH:mm:ss.SSS」(ミリ秒まで)で記録する。
// 同じミリ秒内に更新が重なると値が同じになり、古い画面を見分けられなくなるため、
// 新しい値は必ず「前の値より1ミリ秒以上あと」にする(値が更新のたびに必ず変わる)。
function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}
function formatMs(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function parseDateTime(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value || '');
  if (!m) return 0;
  const ms = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms).getTime();
}
function nextUpdatedAt(previous) {
  return formatMs(new Date(Math.max(Date.now(), parseDateTime(previous) + 1)));
}

// 更新対象の行が画面表示後に変わっていた(=条件付きUPDATEが0件)ことを表す
class ConflictError extends Error {}

function ok(text) {
  return { ok: true, type: 'success', text };
}
function ng(text) {
  return { ok: false, type: 'error', text };
}

function isActiveOperator(operator) {
  return !!operator && !!operator.is_active;
}

// トランザクションを実行する。競合で更新できなかった場合は false を返す
// (履歴登録の失敗など、それ以外のエラーはロールバックしたうえでそのまま投げる:N-01)
function runOrConflict(run) {
  try {
    run();
    return true;
  } catch (e) {
    if (e instanceof ConflictError) return false;
    throw e;
  }
}

function createInquiryService(db) {
  const findInquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?');
  const insertHistory = db.prepare(`
    INSERT INTO inquiry_histories (inquiry_id, changed_by, field_name, old_value, new_value, changed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
  `);

  // 条件付きUPDATE:画面表示時の updated_at のままの場合だけ更新する(N-02)
  // チェックと更新の間に他の更新が割り込んでも、ここで確実に検出する。
  function updateIfUnchanged(sql, params, inquiryId, expectedUpdatedAt, previousUpdatedAt) {
    const info = db.prepare(`${sql}, updated_at = ? WHERE id = ? AND updated_at = ?`)
      .run(...params, nextUpdatedAt(previousUpdatedAt), inquiryId, expectedUpdatedAt);
    if (info.changes !== 1) throw new ConflictError();
  }

  function addHistory(inquiryId, userId, field, oldValue, newValue) {
    // 動作確認専用:FAIL_HISTORY=1 のとき履歴登録を意図的に失敗させる(N-01 のロールバック確認用)
    if (process.env.FAIL_HISTORY === '1') {
      throw new Error('FAIL_HISTORY=1:履歴登録を意図的に失敗させました');
    }
    insertHistory.run(
      inquiryId,
      userId,
      field,
      oldValue == null ? null : String(oldValue),
      newValue == null ? null : String(newValue),
    );
  }

  // ステータス変更(POST /inquiries/:id/status)
  function changeStatus({ inquiryId, operator, toStatus, comment, expectedUpdatedAt }) {
    // ① 存在チェック
    const inquiry = findInquiry.get(inquiryId);
    if (!inquiry) return ng(MESSAGES.NOT_FOUND);

    // 操作者が有効ユーザーか(無効ユーザーは閲覧のみ・変更操作は不可)
    if (!isActiveOperator(operator)) return ng(MESSAGES.NO_PERMISSION);

    // N-02 排他制御:画面表示時の updated_at と一致するか
    if (inquiry.updated_at !== expectedUpdatedAt) return ng(MESSAGES.CONFLICT);

    // ② コメント文字数(保存はしない)
    if ([...(comment || '')].length > COMMENT_MAX) return ng(MESSAGES.COMMENT_TOO_LONG);

    // ③ 遷移表チェック
    const from = inquiry.status;
    if (!canTransition(from, toStatus)) return ng(MESSAGES.INVALID_TRANSITION);

    // ④ 更新と付随処理(1トランザクション)
    const run = db.transaction(() => {
      let assigneeId = inquiry.assignee_id;
      let closedSql = 'closed_at'; // 変更なし

      // NEW → IN_PROGRESS:担当者未設定なら操作者を担当者に
      const autoAssign = from === 'NEW' && toStatus === 'IN_PROGRESS' && inquiry.assignee_id == null;
      if (autoAssign) assigneeId = operator.id;

      // * → DONE:closed_at に現在日時
      if (toStatus === 'DONE') closedSql = "datetime('now', 'localtime')";
      // DONE → IN_PROGRESS:closed_at を NULL に
      if (from === 'DONE' && toStatus === 'IN_PROGRESS') closedSql = 'NULL';

      updateIfUnchanged(
        `UPDATE inquiries SET status = ?, assignee_id = ?, closed_at = ${closedSql}`,
        [toStatus, assigneeId],
        inquiry.id, expectedUpdatedAt, inquiry.updated_at,
      );

      // 自動割り当て時:担当者の履歴も1件
      // (仕様書 2.7 の画面例に合わせ、新しい順で「ステータス → 担当者」の並びになるよう先に登録する)
      if (autoAssign) addHistory(inquiry.id, operator.id, 'assignee', null, operator.id);
      // 全遷移:履歴1件
      addHistory(inquiry.id, operator.id, 'status', from, toStatus);
    });
    if (!runOrConflict(run)) return ng(MESSAGES.CONFLICT);

    // ⑤ 成功メッセージ
    return ok(MESSAGES.STATUS_CHANGED(STATUS_LABELS[toStatus]));
  }

  // 担当者変更(POST /inquiries/:id/assignee)
  // assigneeId が null のときは「未割り当てに戻す」
  function changeAssignee({ inquiryId, operator, assigneeId, expectedUpdatedAt }) {
    // ① 存在チェック
    const inquiry = findInquiry.get(inquiryId);
    if (!inquiry) return ng(MESSAGES.NOT_FOUND);

    // 操作者が有効ユーザーか(無効ユーザーは閲覧のみ・変更操作は不可)
    if (!isActiveOperator(operator)) return ng(MESSAGES.NO_PERMISSION);

    // N-02 排他制御:画面表示時の updated_at と一致するか
    if (inquiry.updated_at !== expectedUpdatedAt) return ng(MESSAGES.CONFLICT);

    // ② R-02:DONE は担当者変更不可
    if (inquiry.status === 'DONE') return ng(MESSAGES.DONE_ASSIGNEE_LOCKED);

    // ③ R-01:有効ユーザーのみ指定可(未割り当ては対象外)
    const clearing = assigneeId == null;
    let target = null;
    if (!clearing) {
      target = db.prepare('SELECT * FROM users WHERE id = ?').get(assigneeId);
      if (!target || !target.is_active) return ng(MESSAGES.INVALID_USER);
    }

    // ④ 権限チェック
    if (clearing) {
      // R-05:未割り当てに戻せるのは ADMIN かつ NEW のみ
      if (!(operator.role === 'ADMIN' && inquiry.status === 'NEW')) return ng(MESSAGES.NO_PERMISSION);
    } else if (operator.role !== 'ADMIN') {
      // R-03:MEMBER は未割り当ての問い合わせを自分に割り当てる操作のみ
      if (!(inquiry.assignee_id == null && target.id === operator.id)) return ng(MESSAGES.NO_PERMISSION);
    }
    // R-04:ADMIN は任意の有効ユーザーに割り当て可(追加チェックなし)

    // ⑤ 更新+履歴(1トランザクション)
    const run = db.transaction(() => {
      updateIfUnchanged(
        'UPDATE inquiries SET assignee_id = ?',
        [clearing ? null : target.id],
        inquiry.id, expectedUpdatedAt, inquiry.updated_at,
      );
      addHistory(inquiry.id, operator.id, 'assignee', inquiry.assignee_id, clearing ? null : target.id);
    });
    if (!runOrConflict(run)) return ng(MESSAGES.CONFLICT);

    // ⑥ 成功メッセージ
    return clearing ? ok(MESSAGES.ASSIGNEE_CLEARED) : ok(MESSAGES.ASSIGNEE_CHANGED(target.name));
  }

  return { changeStatus, changeAssignee, addHistory, findInquiry, isActiveOperator };
}

module.exports = { createInquiryService };
