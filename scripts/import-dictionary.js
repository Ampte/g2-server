import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "../dictionaryCsv.js";
import { db, dbPath, initializeDatabase } from "../db.js";

function resolveInputPath() {
  const rawPath = process.argv[2];
  if (!rawPath) {
    throw new Error("Usage: npm run dictionary:import -- <path-to-csv>");
  }
  return path.resolve(process.cwd(), rawPath);
}

initializeDatabase();

const inputPath = resolveInputPath();
if (!fs.existsSync(inputPath)) {
  throw new Error(`CSV file not found: ${inputPath}`);
}

const csvText = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(csvText);

if (rows.length === 0) {
  throw new Error("CSV file is empty.");
}

const [header, ...dataRows] = rows;
const englishIndex = header.findIndex((value) => value.trim().toLowerCase() === "english_word");
const garoIndex = header.findIndex((value) => value.trim().toLowerCase() === "garo_word");
const notesIndex = header.findIndex((value) => value.trim().toLowerCase() === "notes");

if (englishIndex === -1 || garoIndex === -1) {
  throw new Error("CSV must include english_word and garo_word columns.");
}

const insert = db.prepare(`
  INSERT INTO dictionary_entries (english_word, garo_word, notes, is_active, created_at, updated_at)
  VALUES (?, ?, ?, 1, ?, ?)
`);

let inserted = 0;
let skipped = 0;
const timestamp = new Date().toISOString();

db.exec("BEGIN");
try {
  for (const values of dataRows) {
    const englishWord = String(values[englishIndex] || "").trim();
    const garoWord = String(values[garoIndex] || "").trim();
    const notes = notesIndex >= 0 ? String(values[notesIndex] || "").trim() : "";

    if (!englishWord || !garoWord) {
      skipped += 1;
      continue;
    }

    insert.run(englishWord, garoWord, notes, timestamp, timestamp);
    inserted += 1;
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const total = db.prepare("SELECT COUNT(*) AS count FROM dictionary_entries").get().count;

console.log(`Imported dictionary CSV into ${dbPath}`);
console.log(`Source: ${inputPath}`);
console.log(`Inserted: ${inserted}`);
console.log(`Skipped: ${skipped}`);
console.log(`Total rows: ${total}`);
