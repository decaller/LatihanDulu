const { Database } = require("bun:sqlite");
const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db");

try {
  const count = db.query("SELECT COUNT(*) as count FROM questions").get().count;
  console.log("Current questions count in database:", count);
  if (count > 0) {
    const rows = db.query("SELECT id, question_text, created_by_model, checked_status FROM questions").all();
    console.log("Questions list:");
    console.log(rows);
  }
} catch (error) {
  console.error("Check failed:", error);
} finally {
  db.close();
}
