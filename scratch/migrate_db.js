const { Database } = require("bun:sqlite");
const db = new Database("/home/abuhafi/Project/TesDeen/backend/data.db");

try {
  // Check if column already exists
  const info = db.query("PRAGMA table_info(questions)").all();
  const columnExists = info.some(col => col.name === "checked_status");
  
  if (!columnExists) {
    db.query("ALTER TABLE questions ADD COLUMN checked_status TEXT DEFAULT 'buatan AI'").run();
    console.log("Column 'checked_status' successfully added to 'questions' table!");
  } else {
    console.log("Column 'checked_status' already exists.");
  }
  
  // Let's print out all columns for verification
  const updatedInfo = db.query("PRAGMA table_info(questions)").all();
  console.log("Current Columns:", updatedInfo.map(col => `${col.name} (${col.type})`));
} catch (error) {
  console.error("Migration failed:", error);
} finally {
  db.close();
}
