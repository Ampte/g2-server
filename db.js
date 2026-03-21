import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const configuredDbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(process.cwd(), "data", "garo2.sqlite");
const dataDir = path.dirname(configuredDbPath);
const dbPath = configuredDbPath;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const now = () => new Date().toISOString();

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dictionary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english_word TEXT NOT NULL,
      garo_word TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      explanation TEXT NOT NULL,
      content_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS home_ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS g2_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (username, email, password, is_active, is_admin, created_at, updated_at)
      VALUES (@username, @email, @password, @is_active, @is_admin, @created_at, @updated_at)
    `);
    insertUser.run({
      username: "admin",
      email: "admin@garo2.local",
      password: "admin123",
      is_active: 1,
      is_admin: 1,
      created_at: now(),
      updated_at: now()
    });
    insertUser.run({
      username: "learner",
      email: "learner@garo2.local",
      password: "learner123",
      is_active: 1,
      is_admin: 0,
      created_at: now(),
      updated_at: now()
    });
  }

  const dictionaryCount = db.prepare("SELECT COUNT(*) AS count FROM dictionary_entries").get().count;
  if (dictionaryCount === 0) {
    const insert = db.prepare(`
      INSERT INTO dictionary_entries (english_word, garo_word, notes, is_active, created_at, updated_at)
      VALUES (@english_word, @garo_word, @notes, @is_active, @created_at, @updated_at)
    `);
    [
      ["house", "nok", "Traditional word for home."],
      ["water", "chi", ""],
      ["hello", "na'a simang", "Friendly greeting."]
    ].forEach(([english_word, garo_word, notes]) =>
      insert.run({ english_word, garo_word, notes, is_active: 1, created_at: now(), updated_at: now() })
    );
  }

  const lessonsCount = db.prepare("SELECT COUNT(*) AS count FROM lessons").get().count;
  if (lessonsCount === 0) {
    const insert = db.prepare(`
      INSERT INTO lessons (title, topic, explanation, content_json, sort_order, is_active, created_at, updated_at)
      VALUES (@title, @topic, @explanation, @content_json, @sort_order, @is_active, @created_at, @updated_at)
    `);
    [
      ["Basic Greetings", "Basic Greetings", "Use short greetings and respectful replies.", [{ english: "Greetings for meeting someone politely." }], 1],
      ["Simple Vocabulary", "Simple Vocabulary", "Start with people, places, and household words.", [{ english: "Everyday nouns and simple verbs." }], 2],
      ["Daily Conversation", "Daily Conversation", "Practice short exchanges used every day.", [{ english: "Question and answer patterns for regular conversation." }], 3],
      ["Garo Traditions and Practices", "Garo Traditions and Practices", "Learn a few cultural notes alongside the language.", [{ english: "Customs, values, and community life." }], 4]
    ].forEach(([title, topic, explanation, content, sort_order]) =>
      insert.run({
        title,
        topic,
        explanation,
        content_json: JSON.stringify(content),
        sort_order,
        is_active: 1,
        created_at: now(),
        updated_at: now()
      })
    );
  }

  const adsCount = db.prepare("SELECT COUNT(*) AS count FROM home_ads").get().count;
  if (adsCount === 0) {
    db.prepare(`
      INSERT INTO home_ads (image_url, description, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("/nokpante.jpg", "Nokpante, a traditional house of Garo boys.", 1, 1, now(), now());
  }

  const g2Count = db.prepare("SELECT COUNT(*) AS count FROM g2_knowledge").get().count;
  if (g2Count === 0) {
    const insert = db.prepare(`
      INSERT INTO g2_knowledge (question, answer, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    [
      ["Teach me a Garo greeting", "Try 'Na'a simang?' as a warm, simple greeting."],
      ["How do I start learning Garo?", "Start with greetings, numbers, family words, and short daily phrases."],
      ["Give me a practice quiz", "Quiz: What is the Garo word for house? Answer: nok."]
    ].forEach(([question, answer]) => insert.run(question, answer, 1, now(), now()));
  }
}

export function mapUser(row) {
  if (!row) return null;
  return {
    ...row,
    is_active: Boolean(row.is_active),
    is_admin: Boolean(row.is_admin)
  };
}

export function mapLesson(row) {
  return {
    ...row,
    is_active: Boolean(row.is_active),
    content: JSON.parse(row.content_json || "[]")
  };
}

export function mapRow(row) {
  return row ? { ...row, is_active: Boolean(row.is_active) } : null;
}

export { dbPath };
