// DBを初期状態(シードデータ)に戻す: npm run seed
const { openDb } = require('./db');

const db = openDb({ reset: true });
console.log('DBを初期化しました。');
console.table(db.prepare('SELECT id, name, role, is_active FROM users').all());
console.table(db.prepare('SELECT id, title, status, assignee_id, priority, closed_at FROM inquiries').all());
db.close();
