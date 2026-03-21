import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { escapeCsv, parseCsv } from "./dictionaryCsv.js";
import { db, dbPath, initializeDatabase, mapLesson, mapRow, mapUser } from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 8000);
const FRONTEND_ORIGINS = String(
  process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SESSION_COOKIE = "garo2_session";
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || "false").toLowerCase() === "true";
const COOKIE_SAME_SITE = String(process.env.COOKIE_SAME_SITE || "lax").toLowerCase();
const TRUST_PROXY = String(process.env.TRUST_PROXY || "false").toLowerCase() === "true";

initializeDatabase();

if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || FRONTEND_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed."));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

const now = () => new Date().toISOString();

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    isAdmin: user.is_admin,
    is_admin: user.is_admin,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

const ADMIN_SECTION_CONFIG = {
  users: {
    table: "users",
    listSql: "SELECT * FROM users ORDER BY id ASC",
    getSql: "SELECT * FROM users WHERE id = ?",
    deleteSql: "DELETE FROM users WHERE id = ?",
    allowCreate: false,
    map: (row) => publicUser(mapUser(row)),
    update(record, body) {
      const next = {
        username: String(body.username ?? record.username).trim(),
        email: String(body.email ?? record.email).trim(),
        is_active: body.is_active ? 1 : 0,
        is_admin: body.is_admin ? 1 : 0
      };
      db.prepare(`
        UPDATE users
        SET username = ?, email = ?, is_active = ?, is_admin = ?, updated_at = ?
        WHERE id = ?
      `).run(next.username, next.email, next.is_active, next.is_admin, now(), record.id);
    }
  },
  dictionary: {
    table: "dictionary_entries",
    listSql: "SELECT * FROM dictionary_entries ORDER BY id ASC",
    getSql: "SELECT * FROM dictionary_entries WHERE id = ?",
    deleteSql: "DELETE FROM dictionary_entries WHERE id = ?",
    allowCreate: true,
    map: mapRow,
    create(body) {
      const timestamp = now();
      const result = db.prepare(`
        INSERT INTO dictionary_entries (english_word, garo_word, notes, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        String(body.english_word || "").trim(),
        String(body.garo_word || "").trim(),
        String(body.notes || "").trim(),
        body.is_active ? 1 : 0,
        timestamp,
        timestamp
      );
      return db.prepare("SELECT * FROM dictionary_entries WHERE id = ?").get(result.lastInsertRowid);
    },
    update(record, body) {
      const next = {
        english_word: String(body.english_word ?? record.english_word).trim(),
        garo_word: String(body.garo_word ?? record.garo_word).trim(),
        notes: String(body.notes ?? record.notes ?? "").trim(),
        is_active: body.is_active ? 1 : 0
      };
      db.prepare(`
        UPDATE dictionary_entries
        SET english_word = ?, garo_word = ?, notes = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(next.english_word, next.garo_word, next.notes, next.is_active, now(), record.id);
    }
  },
  lessons: {
    table: "lessons",
    listSql: "SELECT * FROM lessons ORDER BY sort_order ASC, id ASC",
    getSql: "SELECT * FROM lessons WHERE id = ?",
    deleteSql: "DELETE FROM lessons WHERE id = ?",
    allowCreate: true,
    map: mapLesson,
    create(body) {
      const explanation = String(body.explanation || "").trim();
      const timestamp = now();
      const result = db.prepare(`
        INSERT INTO lessons (title, topic, explanation, content_json, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(body.title || "").trim(),
        String(body.topic || "").trim(),
        explanation,
        JSON.stringify([{ english: explanation }]),
        Number.parseInt(String(body.sort_order || 0), 10) || 0,
        body.is_active ? 1 : 0,
        timestamp,
        timestamp
      );
      return db.prepare("SELECT * FROM lessons WHERE id = ?").get(result.lastInsertRowid);
    },
    update(record, body) {
      const explanation = String(body.explanation ?? record.explanation).trim();
      const existingContent = JSON.parse(record.content_json || "[]");
      const nextContent = Array.isArray(existingContent) && existingContent.length > 0
        ? [{ ...existingContent[0], english: explanation }, ...existingContent.slice(1)]
        : [{ english: explanation }];
      db.prepare(`
        UPDATE lessons
        SET title = ?, topic = ?, explanation = ?, content_json = ?, sort_order = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        String(body.title ?? record.title).trim(),
        String(body.topic ?? record.topic).trim(),
        explanation,
        JSON.stringify(nextContent),
        Number.parseInt(String(body.sort_order ?? record.sort_order), 10) || 0,
        body.is_active ? 1 : 0,
        now(),
        record.id
      );
    }
  },
  "home-ads": {
    table: "home_ads",
    listSql: "SELECT * FROM home_ads ORDER BY sort_order ASC, id ASC",
    getSql: "SELECT * FROM home_ads WHERE id = ?",
    deleteSql: "DELETE FROM home_ads WHERE id = ?",
    allowCreate: true,
    map: mapRow,
    create(body) {
      const timestamp = now();
      const result = db.prepare(`
        INSERT INTO home_ads (image_url, description, sort_order, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        String(body.image_url || "").trim(),
        String(body.description || "").trim(),
        Number.parseInt(String(body.sort_order || 0), 10) || 0,
        body.is_active ? 1 : 0,
        timestamp,
        timestamp
      );
      return db.prepare("SELECT * FROM home_ads WHERE id = ?").get(result.lastInsertRowid);
    },
    update(record, body) {
      db.prepare(`
        UPDATE home_ads
        SET image_url = ?, description = ?, sort_order = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        String(body.image_url ?? record.image_url).trim(),
        String(body.description ?? record.description ?? "").trim(),
        Number.parseInt(String(body.sort_order ?? record.sort_order), 10) || 0,
        body.is_active ? 1 : 0,
        now(),
        record.id
      );
    }
  },
  g2: {
    table: "g2_knowledge",
    listSql: "SELECT * FROM g2_knowledge ORDER BY id ASC",
    getSql: "SELECT * FROM g2_knowledge WHERE id = ?",
    deleteSql: "DELETE FROM g2_knowledge WHERE id = ?",
    allowCreate: true,
    map: mapRow,
    create(body) {
      const timestamp = now();
      const result = db.prepare(`
        INSERT INTO g2_knowledge (question, answer, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        String(body.question || "").trim(),
        String(body.answer || "").trim(),
        body.is_active ? 1 : 0,
        timestamp,
        timestamp
      );
      return db.prepare("SELECT * FROM g2_knowledge WHERE id = ?").get(result.lastInsertRowid);
    },
    update(record, body) {
      db.prepare(`
        UPDATE g2_knowledge
        SET question = ?, answer = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        String(body.question ?? record.question).trim(),
        String(body.answer ?? record.answer).trim(),
        body.is_active ? 1 : 0,
        now(),
        record.id
      );
    }
  }
};

function getUserBySession(req) {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (!sessionId) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) return null;
  return mapUser(db.prepare("SELECT * FROM users WHERE id = ? AND is_active = 1").get(session.user_id));
}

function requireUser(req, res, next) {
  const user = getUserBySession(req);
  if (!user) return res.status(401).json({ error: "Authentication required." });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

function setSession(res, user) {
  const sessionId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)").run(sessionId, user.id, now());
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE
  });
}

function clearSession(req, res) {
  const sessionId = req.cookies[SESSION_COOKIE];
  if (sessionId) db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  res.clearCookie(SESSION_COOKIE);
}

function findDictionaryMatch(text, from, to) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return "";
  if (from === "en" && to === "garo") {
    const row = db.prepare(`
      SELECT garo_word FROM dictionary_entries
      WHERE is_active = 1 AND lower(english_word) = ?
      LIMIT 1
    `).get(normalized);
    return row?.garo_word || "";
  }
  if (from === "garo" && to === "en") {
    const row = db.prepare(`
      SELECT english_word FROM dictionary_entries
      WHERE is_active = 1 AND lower(garo_word) = ?
      LIMIT 1
    `).get(normalized);
    return row?.english_word || "";
  }
  return "";
}

function importDictionaryCsv(csvText) {
  const rows = parseCsv(String(csvText || "").replace(/^\uFEFF/, ""));
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

  const existing = new Set(
    db.prepare(`
      SELECT lower(trim(english_word)) AS english_word, lower(trim(garo_word)) AS garo_word
      FROM dictionary_entries
    `).all().map((row) => `${row.english_word}|||${row.garo_word}`)
  );

  const insert = db.prepare(`
    INSERT INTO dictionary_entries (english_word, garo_word, notes, is_active, created_at, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;
  const timestamp = now();

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

      const key = `${englishWord.toLowerCase()}|||${garoWord.toLowerCase()}`;
      if (existing.has(key)) {
        skipped += 1;
        continue;
      }

      insert.run(englishWord, garoWord, notes, timestamp, timestamp);
      existing.add(key);
      inserted += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    inserted,
    skipped,
    total: db.prepare("SELECT COUNT(*) AS count FROM dictionary_entries").get().count
  };
}

function exportDictionaryCsv() {
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

  return {
    csv: `${csvLines.join("\n")}\n`,
    count: rows.length
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "garo-backend", database: dbPath });
});

app.get("/api/auth/me/", (req, res) => {
  res.json({ user: publicUser(getUserBySession(req)) });
});

app.post("/api/auth/login/", (req, res) => {
  const { username, password } = req.body || {};
  const user = mapUser(
    db.prepare(`
      SELECT * FROM users
      WHERE username = ? AND password = ? AND is_active = 1
      LIMIT 1
    `).get(username, password)
  );
  if (!user) return res.status(401).json({ error: "Invalid username or password." });
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/register/", (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, and password are required." });
  }

  const exists = db.prepare("SELECT id FROM users WHERE lower(username) = lower(?) LIMIT 1").get(username);
  if (exists) return res.status(409).json({ error: "Username already exists." });

  const timestamp = now();
  const result = db.prepare(`
    INSERT INTO users (username, email, password, is_active, is_admin, created_at, updated_at)
    VALUES (?, ?, ?, 1, 0, ?, ?)
  `).run(String(username).trim(), String(email).trim(), String(password), timestamp, timestamp);

  const user = mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid));
  setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/logout/", (req, res) => {
  clearSession(req, res);
  res.json({ success: true });
});

app.post("/api/translate/", (req, res) => {
  const { text, source, target } = req.body || {};
  if (!text || !source || !target) {
    return res.status(400).json({ error: "Text, source, and target are required." });
  }
  const matched = findDictionaryMatch(text, source, target);
  if (!matched) {
    return res.status(404).json({
      error: "the given word is not found in the database please check the spelling and try again"
    });
  }
  res.json({ translated_text: matched });
});

app.get("/api/lessons/", (_req, res) => {
  const rows = db.prepare(`
    SELECT * FROM lessons
    WHERE is_active = 1
    ORDER BY sort_order ASC, id ASC
  `).all();
  res.json({ lessons: rows.map(mapLesson) });
});

app.get("/api/home-ads/", (_req, res) => {
  const rows = db.prepare(`
    SELECT * FROM home_ads
    WHERE is_active = 1
    ORDER BY sort_order ASC, id ASC
  `).all();
  res.json({ ads: rows.map(mapRow) });
});

app.post("/api/g2/ask/", (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Question is required." });

  const lower = question.toLowerCase();
  const directMatch = db.prepare(`
    SELECT * FROM g2_knowledge
    WHERE is_active = 1 AND lower(?) LIKE '%' || lower(question) || '%'
    ORDER BY id ASC
    LIMIT 1
  `).get(lower);

  const dictionaryMatch = db.prepare(`
    SELECT * FROM dictionary_entries
    WHERE is_active = 1 AND lower(?) LIKE '%' || lower(english_word) || '%'
    ORDER BY id ASC
    LIMIT 1
  `).get(lower);

  let answer = directMatch?.answer;
  if (!answer && dictionaryMatch) {
    answer = `The Garo word for ${dictionaryMatch.english_word} is ${dictionaryMatch.garo_word}.`;
  }
  if (!answer && /greeting|hello/.test(lower)) {
    answer = "Try 'Na'a simang?' as a warm Garo greeting.";
  }
  if (!answer && /learn|start/.test(lower)) {
    answer = "Start with greetings, simple vocabulary, and a few daily conversation phrases.";
  }
  if (!answer) {
    answer = "Sorry, this is out of my knowledge right now. Please try another question.";
  }

  res.json({ answer });
});

app.get("/api/admin/dashboard/", requireUser, requireAdmin, (_req, res) => {
  const adminUsers = db.prepare("SELECT * FROM users ORDER BY id ASC").all().map(mapUser).map(publicUser);
  const adminDictionary = db.prepare("SELECT * FROM dictionary_entries ORDER BY id ASC").all().map(mapRow);
  const adminLessons = db.prepare("SELECT * FROM lessons ORDER BY sort_order ASC, id ASC").all().map(mapLesson);
  const adminAds = db.prepare("SELECT * FROM home_ads ORDER BY sort_order ASC, id ASC").all().map(mapRow);
  const adminKnowledge = db.prepare("SELECT * FROM g2_knowledge ORDER BY id ASC").all().map(mapRow);

  res.json({
    users: adminUsers,
    dictionary: adminDictionary,
    lessons: adminLessons,
    ads: adminAds,
    g2: adminKnowledge,
    stats: {
      total_users: adminUsers.length,
      total_dictionary_words: adminDictionary.length,
      total_learning_topics: adminLessons.length,
      total_chatbot_questions: adminKnowledge.length
    }
  });
});

app.post("/api/admin/dictionary/import/", requireUser, requireAdmin, (req, res) => {
  try {
    const csv = String(req.body?.csv || "");
    if (!csv.trim()) {
      return res.status(400).json({ error: "CSV content is required." });
    }

    const result = importDictionaryCsv(csv);
    const items = db.prepare("SELECT * FROM dictionary_entries ORDER BY id ASC").all().map(mapRow);
    return res.status(201).json({
      ...result,
      items
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Could not import dictionary CSV." });
  }
});

app.get("/api/admin/dictionary/export/", requireUser, requireAdmin, (_req, res) => {
  const { csv, count } = exportDictionaryCsv();
  const dateStamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"dictionary-export-${dateStamp}.csv\"`);
  res.setHeader("X-Total-Rows", String(count));
  res.send(csv);
});

app.get("/api/admin/:section/", requireUser, requireAdmin, (req, res) => {
  const config = ADMIN_SECTION_CONFIG[req.params.section];
  if (!config) return res.status(404).json({ error: "Unknown admin section." });
  const rows = db.prepare(config.listSql).all().map(config.map);
  res.json({ items: rows });
});

app.post("/api/admin/:section/", requireUser, requireAdmin, (req, res) => {
  const config = ADMIN_SECTION_CONFIG[req.params.section];
  if (!config) return res.status(404).json({ error: "Unknown admin section." });
  if (!config.allowCreate) {
    return res.status(400).json({ error: "Create is not supported for this section." });
  }

  const created = config.create(req.body || {});
  res.status(201).json({ item: config.map(created) });
});

app.put("/api/admin/:section/:id/", requireUser, requireAdmin, (req, res) => {
  const config = ADMIN_SECTION_CONFIG[req.params.section];
  if (!config) return res.status(404).json({ error: "Unknown admin section." });
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid record id." });

  const record = db.prepare(config.getSql).get(id);
  if (!record) return res.status(404).json({ error: "Record not found." });

  if (req.params.section === "users" && req.user.id === id && req.body.is_admin === false) {
    return res.status(400).json({ error: "You cannot remove your own admin access." });
  }

  config.update(record, req.body || {});
  const updated = db.prepare(config.getSql).get(id);
  res.json({ item: config.map(updated) });
});

app.delete("/api/admin/:section/:id/", requireUser, requireAdmin, (req, res) => {
  const config = ADMIN_SECTION_CONFIG[req.params.section];
  if (!config) return res.status(404).json({ error: "Unknown admin section." });
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid record id." });

  if (req.params.section === "users" && req.user.id === id) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }

  const record = db.prepare(config.getSql).get(id);
  if (!record) return res.status(404).json({ error: "Record not found." });

  db.prepare(config.deleteSql).run(id);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Garo backend running on http://localhost:${PORT}`);
  console.log(`SQLite database ready at ${dbPath}`);
});
