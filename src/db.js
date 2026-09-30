// DB接続・テーブル定義・シードデータ(要件定義書 2.3)
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data.sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       VARCHAR(50) NOT NULL,
  role       VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
  is_active  BOOLEAN     NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inquiries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           VARCHAR(100) NOT NULL,
  body            TEXT         NOT NULL,
  requester_name  VARCHAR(50)  NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'NEW',
  assignee_id     BIGINT       NULL DEFAULT NULL REFERENCES users(id),
  priority        VARCHAR(10)  NOT NULL DEFAULT 'MIDDLE',
  created_at      DATETIME     NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at      DATETIME     NOT NULL DEFAULT (datetime('now', 'localtime')),
  closed_at       DATETIME     NULL DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS inquiry_histories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id  BIGINT      NOT NULL,
  changed_by  BIGINT      NOT NULL,
  field_name  VARCHAR(20) NOT NULL,
  old_value   VARCHAR(50) NULL DEFAULT NULL,
  new_value   VARCHAR(50) NULL DEFAULT NULL,
  changed_at  DATETIME    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
`;

function seed(db) {
  const insertUser = db.prepare('INSERT INTO users (name, role, is_active) VALUES (?, ?, ?)');
  insertUser.run('田中 一郎', 'ADMIN', 1);   // id=1 管理者
  insertUser.run('佐藤 花子', 'MEMBER', 1);  // id=2 一般担当者
  insertUser.run('鈴木 次郎', 'MEMBER', 1);  // id=3 一般担当者
  insertUser.run('高橋 三郎', 'MEMBER', 0);  // id=4 無効ユーザー

  const insertInquiry = db.prepare(`
    INSERT INTO inquiries (title, body, requester_name, status, assignee_id, priority, created_at, updated_at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertInquiry.run('プリンタが印刷できません', '3階の複合機で印刷しようとするとエラーになります。', '山田 太郎',
    'NEW', null, 'MIDDLE', '2026-07-29 10:15:00', '2026-07-29 10:15:00', null);        // id=1
  insertInquiry.run('PCが起動しません', '電源ボタンを押しても画面が真っ暗なままです。', '木村 花子',
    'NEW', null, 'HIGH', '2026-07-29 11:00:00', '2026-07-29 11:00:00', null);         // id=2
  insertInquiry.run('ソフトをインストールしたい', '画像編集ソフトのインストールをお願いします。', '伊藤 健太',
    'IN_PROGRESS', 2, 'MIDDLE', '2026-07-28 09:30:00', '2026-07-28 10:00:00', null);   // id=3
  insertInquiry.run('VPNに接続できません', '自宅からVPNに接続できません。回答待ちです。', '渡辺 真一',
    'PENDING', 3, 'LOW', '2026-07-27 14:00:00', '2026-07-27 15:00:00', null);          // id=4
  insertInquiry.run('メールが送信できません', 'Outlookから送信するとエラーが出ます。', '中村 美咲',
    'DONE', 2, 'HIGH', '2026-07-26 09:00:00', '2026-07-26 17:00:00', '2026-07-26 17:00:00'); // id=5
}

function openDb({ reset = false } = {}) {
  if (reset) {
    require('fs').rmSync(DB_PATH, { force: true });
  }
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (count === 0) seed(db);
  return db;
}

module.exports = { openDb };
