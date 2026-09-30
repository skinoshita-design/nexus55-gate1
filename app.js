// アプリ起動: npm start
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb } = require('./src/db');

const db = openDb();
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// 動作確認用のユーザー切替(画面にはUIを置かない)
// 例: /login?user_id=1 → 田中 一郎(ADMIN)として操作
app.get('/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.query.user_id));
  if (!user) return res.status(400).send('user_id が不正です。');
  res.cookie('user_id', String(user.id));
  res.send(`${user.name}(${user.role})としてログインしました。`);
});

const { createInquiryService } = require('./src/services/inquiryService');
const { MESSAGES } = require('./src/constants/messages');
const { STATUS_LABELS } = require('./src/constants/status');
const { canTransition } = require('./src/constants/transitions');
// V-06:優先度の表示名
const PRIORITY_LABELS = { HIGH: '高', MIDDLE: '中', LOW: '低' };
const service = createInquiryService(db);

// Cookie のユーザーIDから操作者を取得
function currentUser(req) {
  const id = Number(req.cookies.user_id);
  if (!id) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

// 処理結果を次の画面表示まで保持する
function setFlash(res, result) {
  res.cookie('flash', JSON.stringify({ type: result.type, text: result.text }));
}

// 表示用の日時整形(yyyy/MM/dd HH:mm)
function formatDateTime(value) {
  if (!value) return '';
  const [date, time] = value.split(' ');
  return `${date.replace(/-/g, '/')} ${time.slice(0, 5)}`;
}

// 問い合わせ詳細画面
app.get('/inquiries/:id', (req, res) => {
  // 処理結果メッセージを1回だけ表示
  let flash = null;
  if (req.cookies.flash) {
    try { flash = JSON.parse(req.cookies.flash); } catch (e) { flash = null; }
    res.clearCookie('flash');
  }

  const inquiry = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(Number(req.params.id));
  if (!inquiry) {
    return res.render('detail', { inquiry: null, flash: { type: 'error', text: MESSAGES.NOT_FOUND } });
  }

  const operator = currentUser(req);
  const isAdmin = !!operator && operator.role === 'ADMIN';
  const isMember = !!operator && operator.role === 'MEMBER';

  const users = db.prepare('SELECT * FROM users').all();
  const userName = (id) => {
    if (id == null || id === '') return '未割り当て';
    const u = users.find((x) => String(x.id) === String(id));
    return u ? u.name : '';
  };

  // V-01:遷移表で「○」の値のみ(canTransition を使用)
  const nextStatusList = Object.keys(STATUS_LABELS).filter((to) => canTransition(inquiry.status, to));

  // V-03:有効ユーザーのみ、氏名の五十音順
  const activeUsers = users
    .filter((u) => u.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  // V-04 / V-05:担当者変更ボタンの非活性
  const showAskAdmin = isMember && inquiry.assignee_id != null;
  const assigneeButtonDisabled = showAskAdmin || inquiry.status === 'DONE';

  // 変更履歴:新しい順・最大20件
  const histories = db.prepare(`
    SELECT * FROM inquiry_histories
     WHERE inquiry_id = ?
     ORDER BY changed_at DESC, id DESC
     LIMIT 20
  `).all(inquiry.id).map((h) => {
    const isStatus = h.field_name === 'status';
    return {
      changedAt: formatDateTime(h.changed_at),
      operatorName: userName(h.changed_by),
      fieldLabel: isStatus ? 'ステータス' : '担当者',
      oldLabel: isStatus ? STATUS_LABELS[h.old_value] : userName(h.old_value),
      newLabel: isStatus ? STATUS_LABELS[h.new_value] : userName(h.new_value),
    };
  });

  res.render('detail', {
    flash,
    inquiry,
    statusLabels: STATUS_LABELS,
    priorityLabel: PRIORITY_LABELS[inquiry.priority],
    createdAt: formatDateTime(inquiry.created_at),
    nextStatusList,
    assigneeName: userName(inquiry.assignee_id),
    isAdmin,
    activeUsers,
    assigneeButtonDisabled,
    showAskAdmin,
    histories,
  });
});

// ステータス変更
app.post('/inquiries/:id/status', (req, res) => {
  const inquiryId = Number(req.params.id);
  const operator = currentUser(req);
  const result = operator
    ? service.changeStatus({
        inquiryId,
        operator,
        toStatus: req.body.status,
        comment: req.body.comment,
        expectedUpdatedAt: req.body.updated_at,
      })
    : { ok: false, type: 'error', text: MESSAGES.NO_PERMISSION };
  setFlash(res, result);
  res.redirect(`/inquiries/${req.params.id}`);
});

// 担当者変更(プルダウンの「未割り当て」は空文字で送られる)
app.post('/inquiries/:id/assignee', (req, res) => {
  const inquiryId = Number(req.params.id);
  const operator = currentUser(req);
  const raw = req.body.assignee_id;
  const assigneeId = raw === undefined || raw === '' ? null : Number(raw);
  const result = operator
    ? service.changeAssignee({ inquiryId, operator, assigneeId, expectedUpdatedAt: req.body.updated_at })
    : { ok: false, type: 'error', text: MESSAGES.NO_PERMISSION };
  setFlash(res, result);
  res.redirect(`/inquiries/${req.params.id}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT} で起動しました`);
});

module.exports = { app, db };
