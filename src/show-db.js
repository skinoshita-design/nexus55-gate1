// DBの中身を確認する(動作確認用): npm run db
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'), { readonly: true });
console.log('■ inquiries');
console.table(db.prepare('SELECT id, title, status, assignee_id, updated_at, closed_at FROM inquiries').all());
console.log('■ inquiry_histories');
console.table(db.prepare('SELECT * FROM inquiry_histories ORDER BY id').all());
db.close();
