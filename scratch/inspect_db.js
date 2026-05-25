import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('backend/data.db');
try {
  console.log("=== HIERARCHY TABLE COUNT ===");
  const countRow = db.prepare("SELECT count(*) as count FROM hierarchy").get();
  console.log("Count:", countRow.count);

  console.log("\n=== SAMPLE HIERARCHY ROWS ===");
  const rows = db.prepare("SELECT * FROM hierarchy LIMIT 20").all();
  console.dir(rows, { depth: null });

  console.log("\n=== SAMPLE ARTICLES ROWS ===");
  const articles = db.prepare("SELECT id, url, title, speaker FROM articles LIMIT 10").all();
  console.dir(articles, { depth: null });

} catch (err) {
  console.error(err);
} finally {
  db.close();
}
