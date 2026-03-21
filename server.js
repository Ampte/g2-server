import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
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
  const translated_text =
    matched ||
    (source === "en" && target === "garo"
      ? `A'chik: ${String(text).trim()}`
      : `English: ${String(text).trim()}`);
  res.json({ translated_text });
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
    answer = "Practice a few short words each day, then move into greetings and common conversation.";
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

app.listen(PORT, () => {
  console.log(`Garo backend running on http://localhost:${PORT}`);
  console.log(`SQLite database ready at ${dbPath}`);
});
