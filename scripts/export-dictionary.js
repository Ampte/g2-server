import fs from "node:fs";
import path from "node:path";
import { escapeCsv } from "../dictionaryCsv.js";
import { db, dbPath, initializeDatabase } from "../db.js";

function resolveOutputPath() {
  const rawPath = process.argv[2] || "./data/dictionary-export.csv";
  return path.resolve(process.cwd(), rawPath);
}

initializeDatabase();

const outputPath = resolveOutputPath();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const rows = db.prepare(`
  SELECT id, english_word, garo_word, notes
  FROM dictionary_entries
  ORDER BY id ASC
`).all();

const csvLines = [
  ["id", "english_word", "garo_word", "notes"].join(","),
  ...rows.map((row) =>
    [
      escapeCsv(row.id),
      escapeCsv(row.english_word),
      escapeCsv(row.garo_word),
      escapeCsv(row.notes)
    ].join(",")
  )
];

fs.writeFileSync(outputPath, `${csvLines.join("\n")}\n`, "utf8");

console.log(`Exported dictionary CSV from ${dbPath}`);
console.log(`Output: ${outputPath}`);
console.log(`Rows: ${rows.length}`);
