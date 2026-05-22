const { Database } = require("bun:sqlite");
const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db");

try {
  console.log("Bismillah. Wiping all rows from 'questions' table...");
  const result = db.query("DELETE FROM questions").run();
  console.log("All questions deleted successfully! Rows affected:", result.changes);
  
  // Verify count
  const count = db.query("SELECT COUNT(*) as count FROM questions").get().count;
  console.log("Current question count in database:", count);
} catch (error) {
  console.error("Deletion failed:", error);
} finally {
  db.close();
}
