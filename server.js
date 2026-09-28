"use strict";
require("dotenv").config();

const express  = require("express");
const session  = require("express-session");
const cors     = require("cors");
const multer   = require("multer");
const path     = require("path");
const crypto   = require("crypto");
const { Pool } = require("pg");
const jwt      = require("jsonwebtoken");
const { google } = require("googleapis");
const {
  createOAuth2Client: _createOAuth2ClientFromConfig,
  GOOGLE_CLIENT_ID: _GOOGLE_CLIENT_ID,
  GOOGLE_REDIRECT_URI: _GOOGLE_REDIRECT_URI,
} = require("./config/googleAuth");

// ── AWS SDK v3 ───────────────────────────────────────────────────────────────
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload }       = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const PORT           = process.env.PORT           || 8080;
const JWT_SECRET     = process.env.JWT_SECRET     || "dev_secret_change_in_production";
const COMMISSION_PCT = parseInt(process.env.COMMISSION_PCT || "15", 10);

// ── Google OAuth (googleapis) ────────────────────────────────────────────────
// Client ID & Redirect URI khóa cứng từ config/googleAuth.js
// Giá trị GOOGLE_REDIRECT_URI trong .env sẽ override nếu cần (ví dụ: dev local).
const GOOGLE_REDIRECT_URI = _GOOGLE_REDIRECT_URI;
// After auth, backend redirects the browser to this frontend origin.
const FRONTEND_URL        = process.env.FRONTEND_URL || (process.env.NODE_ENV === "production" ? "https://mathuatbeat.xyz" : "http://localhost:5173");

// Dùng factory từ config/googleAuth.js — Client ID chính thức luôn được áp dụng.
function createOAuth2Client() {
  return _createOAuth2ClientFromConfig();
}

// ── S3 ───────────────────────────────────────────────────────────────────────
const S3_BUCKET      = process.env.AWS_S3_BUCKET  || "beatstoreprj00001111";
const S3_REGION      = process.env.AWS_REGION     || "ap-southeast-1";
const S3_PREFIX      = process.env.AWS_S3_PREFIX  || "mã nguồn/audio";
// Public CDN base for public-read objects (MP3 preview).
// Override with CloudFront URL in production: AWS_CDN_BASE=https://xxx.cloudfront.net
const S3_PUBLIC_BASE = process.env.AWS_CDN_BASE
  || `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

const s3 = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Build a public HTTPS URL from an S3 key (only for public-read objects)
function s3PublicUrl(key) {
  if (!key) return null;
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${S3_PUBLIC_BASE}/${encoded}`;
}

/**
 * Stream a Buffer straight to S3.
 * Returns { key, publicUrl } — publicUrl is null for private objects.
 *
 * @param {object} opts
 * @param {Buffer} opts.buffer       — File data from multer memoryStorage
 * @param {string} opts.contentType  — MIME type
 * @param {string} opts.originalname — Original filename (used for extension)
 * @param {string} opts.subdir       — "mp3" | "wav" | "stems"
 * @param {boolean} [opts.isPublic]  — Set ACL public-read (MP3 only)
 */
async function s3Upload({ buffer, contentType, originalname, subdir, isPublic = false }) {
  const ext  = path.extname(originalname).toLowerCase();
  const base = path.basename(originalname, ext).replace(/[^a-z0-9_\-]/gi, "_");
  const key  = `${S3_PREFIX}/${subdir}/${Date.now()}_${base}${ext}`;

  const params = {
    Bucket:      S3_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType || "application/octet-stream",
  };
  // MP3 preview: public-read so the <audio> element can load it directly.
  // Bucket must have "Block Public Access → Block public ACLs" = OFF.
  // If you prefer all-private, remove this line and serve MP3 via presigned URL too.
  if (isPublic) params.ACL = "public-read";

  const uploader = new Upload({
    client:            s3,
    params,
    queueSize:         4,                // parallel part uploads
    partSize:          10 * 1024 * 1024, // 10 MB per part
    leavePartsOnError: false,
  });

  await uploader.done();

  return {
    key,
    publicUrl: isPublic ? s3PublicUrl(key) : null,
  };
}

/**
 * Generate a time-limited presigned GET URL for a private S3 object.
 * @param {string} key            — S3 object key stored in DB
 * @param {number} expiresIn      — seconds until expiry (default 900 = 15 min)
 */
async function s3Presign(key, expiresIn = 900) {
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE
// ═══════════════════════════════════════════════════════════════════════════

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ═══════════════════════════════════════════════════════════════════════════
// MULTER — memory storage (files are streamed to S3, never written to disk)
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_AUDIO = /\.(mp3|wav|flac|aiff)$/i;
const ALLOWED_STEMS = /\.(zip|rar|7z)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB per file
  fileFilter(req, file, cb) {
    if (file.fieldname === "mp3" && !ALLOWED_AUDIO.test(file.originalname))
      return cb(new Error("MP3 field requires an audio file (.mp3 / .wav)"));
    if (file.fieldname === "wav" && !ALLOWED_AUDIO.test(file.originalname))
      return cb(new Error("WAV field requires an audio file (.wav / .flac)"));
    if (file.fieldname === "stems" && !ALLOWED_STEMS.test(file.originalname))
      return cb(new Error("STEMS field requires a zip / rar archive"));
    cb(null, true);
  },
}).fields([
  { name: "mp3",   maxCount: 1 },
  { name: "wav",   maxCount: 1 },
  { name: "stems", maxCount: 1 },
]);

// ═══════════════════════════════════════════════════════════════════════════
// CORS WHITELIST
// ═══════════════════════════════════════════════════════════════════════════

const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "https://mathuatbeat.xyz",
  ...EXTRA_ORIGINS,
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl / Postman
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  maxAge: 600,
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════════════════════════

const app = express();

// Trust the first hop from Cloudflare / nginx so that:
// - req.secure is true (needed for session cookie "secure" flag to be recognized)
// - req.ip reflects the real client IP
// - Session cookies set with secure:true are correctly sent after the Google redirect
app.set("trust proxy", 1);

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// FedCM (Google One Tap) requires this Permissions-Policy header.
// Without it, navigator.credentials.get() rejects with NotAllowedError.
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "identity-credentials-get=*");
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// express-session — used only for the Google OAuth CSRF state handshake.
// For production, swap the default MemoryStore for connect-pg-simple or redis.
const IS_PROD = process.env.NODE_ENV === "production";
app.use(session({
  secret:            process.env.SESSION_SECRET || JWT_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   IS_PROD,  // true in production (HTTPS at mathuatbeat.xyz), false in dev
    sameSite: "lax",    // lax allows the OAuth redirect chain to carry the cookie
    maxAge:   10 * 60 * 1000, // 10 min — only needed during the OAuth handshake
  },
}));

// ── Auth helpers ─────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "Admin") return res.status(403).json({ error: "Admin only" });
  next();
}

// ── DB row → PendingBeat shape sent to frontend ───────────────────────────────
// mp3_path stores the raw S3 key.  MP3 is public → direct URL.
// wav_path / stems_path are private → presigned URL generated on demand.
function rowToPendingBeat(row) {
  return {
    id:         row.id,
    title:      row.title,
    producer:   row.producer_name || "Unknown",
    producerId: row.producer_id,
    format:     "WAV",
    price:      row.wav_price || row.mp3_price,
    bpm:        row.bpm || 0,
    key:        row.key || "—",
    uploadedAt: new Date(row.created_at).toLocaleDateString("vi-VN"),
    // MP3: public S3 URL — <audio src> loads directly for admin preview
    mp3Url:    row.mp3_path  ? s3PublicUrl(row.mp3_path)  : null,
    // WAV / STEMS: private — frontend fetches presigned URL via /api/admin/tracks/:id/presign
    wavUrl:    null,
    stemsUrl:  null,
    // Keys stored so frontend can request presigned URLs
    mp3Key:    row.mp3_path   || null,
    wavKey:    row.wav_path   || null,
    stemsKey:  row.stems_path || null,
    // Original filenames and sizes for admin file-format verification
    mp3Name:   row.mp3_name,
    wavName:   row.wav_name,
    stemsName: row.stems_name,
    mp3Size:   row.mp3_size   ? Number(row.mp3_size)   : null,
    wavSize:   row.wav_size   ? Number(row.wav_size)   : null,
    stemsSize: row.stems_size ? Number(row.stems_size) : null,
    status:    "Pending",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.get("/health", (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString(), s3Bucket: S3_BUCKET })
);

// ── OAuth helpers ─────────────────────────────────────────────────────────────

async function upsertOAuthUser({ provider, providerId, name, email, avatar, refreshToken = null }) {
  const existing = await db.query(
    "SELECT * FROM users WHERE auth_provider = $1 AND provider_id = $2",
    [provider, providerId]
  );
  if (existing.rows.length) {
    await db.query(
      "UPDATE users SET name=$1, avatar=$2, updated_at=now() WHERE id=$3",
      [name, avatar, existing.rows[0].id]
    );
    // Persist refresh_token when Google issues a new one (only on first consent or re-consent)
    if (refreshToken) {
      await db.query(
        "UPDATE users SET google_refresh_token=$1 WHERE id=$2",
        [refreshToken, existing.rows[0].id]
      ).catch(() => {}); // silently skip if column doesn't exist yet
    }
    return { user: existing.rows[0], isNew: false };
  }
  const byEmail = await db.query("SELECT * FROM users WHERE email=$1", [email]);
  if (byEmail.rows.length) {
    await db.query(
      "UPDATE users SET auth_provider=$1, provider_id=$2, name=$3, avatar=$4, updated_at=now() WHERE id=$5",
      [provider, providerId, name, avatar, byEmail.rows[0].id]
    );
    return { user: byEmail.rows[0], isNew: false };
  }
  // New user — insert; google_refresh_token stored for 1-click future logins
  const result = await db.query(
    `INSERT INTO users (name, email, avatar, auth_provider, provider_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, email, avatar, provider, providerId]
  );
  const newUser = result.rows[0];
  if (refreshToken) {
    await db.query(
      "UPDATE users SET google_refresh_token=$1 WHERE id=$2",
      [refreshToken, newUser.id]
    ).catch(() => {});
  }
  return { user: newUser, isNew: true };
}

function mapUser(row) {
  return {
    id: row.id, name: row.name, email: row.email,
    avatar: row.avatar, role: row.role,
    authProvider: row.auth_provider,
    dob: row.dob, phone: row.phone, country: row.country,
  };
}

// ── Google OAuth — Step 1: Initiate ──────────────────────────────────────────
// Browser hits this endpoint → server generates state (CSRF token), saves it
// to the session, then redirects the whole browser to Google's consent page.
app.get("/api/auth/google", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");
  req.session.oauthState = state;

  req.session.save(err => {
    if (err) {
      console.error("[Google OAuth] session save error:", err);
      return res.status(500).json({ error: "Session error — không thể khởi tạo OAuth" });
    }

    const oauth2Client = createOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type:            "offline",
      include_granted_scopes: true,
      prompt:                 "select_account",
      state,
      scope: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
    });

    console.log(`[Google OAuth] Initiating → redirect_uri: ${_GOOGLE_REDIRECT_URI}`);
    res.redirect(authUrl);
  });
});

// ── Google OAuth — Step 2: Callback (/api/auth/google/callback) ───────────────
// Google redirects here with ?code=...&state=...
// 1. Verify state matches session (CSRF protection)
// 2. Exchange code for tokens using googleapis
// 3. Fetch user profile via googleapis
// 4. Upsert user in DB
// 5. Redirect browser back to frontend with JWT in query params
app.get("/api/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  // Google denied access (user clicked "Cancel")
  if (error) {
    console.warn("[Google OAuth] user denied:", error);
    return res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent(String(error))}`);
  }

  // ── CSRF check ────────────────────────────────────────────────────────────
  const savedState = req.session.oauthState;
  if (!state || !savedState || state !== savedState) {
    console.error(
      "[Google OAuth] state mismatch — possible CSRF or session loss.",
      "received:", state,
      "session:", savedState,
      "session ID:", req.sessionID,
      "tip: ensure SESSION_SECRET is set and server has 'trust proxy' enabled"
    );
    return res.redirect(
      `${FRONTEND_URL}?auth_error=${encodeURIComponent("State mismatch — vui lòng thử lại.")}`
    );
  }

  // Invalidate the state immediately (one-time use)
  delete req.session.oauthState;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent("Không nhận được mã xác thực từ Google")}`);
  }

  try {
    const oauth2Client = createOAuth2Client();

    // Exchange authorization code for access + refresh tokens
    const { tokens } = await oauth2Client.getToken(String(code));
    oauth2Client.setCredentials(tokens);

    // Fetch user profile using the official googleapis client
    const oauth2Api  = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2Api.userinfo.get();

    if (!profile.email) throw new Error("Google không trả về địa chỉ email");

    // Upsert user in database; store refresh_token for 1-click re-login
    const { user, isNew } = await upsertOAuthUser({
      provider:     "google",
      providerId:   profile.id,
      name:         profile.name  || profile.email.split("@")[0],
      email:        profile.email,
      avatar:       profile.picture || "",
      refreshToken: tokens.refresh_token || null,
    });

    const jwtToken  = signToken(user);
    const userJson  = encodeURIComponent(JSON.stringify(mapUser(user)));

    // Redirect browser to frontend; query params carry the auth result.
    // Frontend reads these on mount, cleans the URL, and sets app state.
    const dest = new URL(FRONTEND_URL);
    dest.searchParams.set("auth_token",    jwtToken);
    dest.searchParams.set("auth_user",     userJson);
    dest.searchParams.set("auth_is_new",   String(isNew));
    dest.searchParams.set("auth_provider", "google");
    res.redirect(dest.toString());

  } catch (err) {
    console.error("[Google OAuth callback]", err);
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    res.redirect(`${FRONTEND_URL}?auth_error=${encodeURIComponent("Xác thực Google thất bại: " + msg)}`);
  }
});

// ── Google OAuth — Client-Side Exchange ───────────────────────────────────────
//
// Used by the client-side OAuth flow (frontend builds the Google auth URL,
// Google redirects back to the root domain with ?code=&state=, and the SPA
// calls this endpoint to exchange the code for a JWT without a page reload).
//
// redirect_uri sent here MUST match the one used when generating the auth URL
// (i.e. https://mathuatbeat.xyz/api/auth/google/callback or http://localhost:8080/api/auth/google/callback in dev).
//
app.post("/api/auth/google/exchange", async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code)         return res.status(400).json({ error: "Thiếu tham số code" });
  if (!redirect_uri) return res.status(400).json({ error: "Thiếu tham số redirect_uri" });

  try {
    // Create a fresh OAuth2 client using the caller-supplied redirect_uri.
    // Client ID đã khóa cứng từ config/googleAuth.js; redirect_uri do frontend cung cấp.
    const oauth2Client = new google.auth.OAuth2(
      _GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri
    );

    // Exchange authorization code for access + refresh tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile using the official googleapis client
    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2Api.userinfo.get();

    if (!profile.email) throw new Error("Google không trả về địa chỉ email");

    const { user, isNew } = await upsertOAuthUser({
      provider:     "google",
      providerId:   profile.id,
      name:         profile.name  || profile.email.split("@")[0],
      email:        profile.email,
      avatar:       profile.picture || "",
      refreshToken: tokens.refresh_token || null,
    });

    res.json({ user: mapUser(user), token: signToken(user), isNew });
  } catch (err) {
    console.error("[Google exchange]", err);
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    res.status(500).json({ error: "Xác thực Google thất bại: " + msg });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GOOGLE ONE TAP — ux_mode: "redirect" handler
// ════════════════════════════════════════════════════════════════════════════
//
// Khi người dùng chọn tài khoản trong khung Google One Tap (auto_select: true,
// ux_mode: "redirect"), Google thực hiện một form POST đến URI này với:
//   credential   — Google ID Token (JWT đã ký bởi Google)
//   g_csrf_token — token chống CSRF (Google cũng đặt cùng giá trị vào cookie)
//
// Xử lý:
//   1. CSRF check: g_csrf_token trong body phải khớp cookie g_csrf_token
//   2. verifyIdToken() xác minh chữ ký Google + audience = GOOGLE_CLIENT_ID
//   3. Upsert user vào DB
//   4. Tạo JWT của hệ thống
//   5. Redirect về FRONTEND_URL với auth params (AppShell đọc URL params)
//
app.post("/api/auth/google/onetap", async (req, res) => {
  const { credential, g_csrf_token: bodyToken } = req.body;

  // ── CSRF: parse Cookie header thủ công (không cần cookie-parser) ──────────
  const cookieMap = {};
  (req.headers.cookie || "").split(";").forEach(part => {
    const idx = part.indexOf("=");
    if (idx > 0) cookieMap[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  const cookieToken = cookieMap["g_csrf_token"];

  if (!bodyToken || !cookieToken || bodyToken !== cookieToken) {
    console.error("[One Tap] CSRF token mismatch — body:", bodyToken, "cookie:", cookieToken);
    return res.redirect(
      `${FRONTEND_URL}?auth_error=${encodeURIComponent("Xác thực One Tap thất bại: CSRF token không hợp lệ")}`
    );
  }

  if (!credential) {
    return res.redirect(
      `${FRONTEND_URL}?auth_error=${encodeURIComponent("Không nhận được credential từ Google One Tap")}`
    );
  }

  try {
    // Xác minh ID Token — sử dụng client_id chính thức từ config/googleAuth.js
    const client = createOAuth2Client();
    const ticket = await client.verifyIdToken({
      idToken:  credential,
      audience: _GOOGLE_CLIENT_ID, // 916633799812-6n7k5eha7kmuk3f8k910if93jdfiroq9.apps.googleusercontent.com
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error("Google không trả về địa chỉ email");

    const { user, isNew } = await upsertOAuthUser({
      provider:   "google",
      providerId: payload.sub,
      name:       payload.name || payload.email.split("@")[0],
      email:      payload.email,
      avatar:     payload.picture || "",
    });

    const jwtToken = signToken(user);
    const userJson = encodeURIComponent(JSON.stringify(mapUser(user)));

    // Redirect về frontend với auth params — AppShell đọc và xử lý routing theo vai trò
    const dest = new URL(FRONTEND_URL);
    dest.searchParams.set("auth_token",    jwtToken);
    dest.searchParams.set("auth_user",     userJson);
    dest.searchParams.set("auth_is_new",   String(isNew));
    dest.searchParams.set("auth_provider", "google");
    res.redirect(dest.toString());

  } catch (err) {
    console.error("[One Tap verifyIdToken]", err);
    const msg = err instanceof Error ? err.message : "Lỗi không xác định";
    res.redirect(
      `${FRONTEND_URL}?auth_error=${encodeURIComponent("Google One Tap thất bại: " + msg)}`
    );
  }
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────────
app.post("/api/auth/github/callback", async (req, res) => {
  const { code, redirect_uri } = req.body;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code, redirect_uri,
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).json({ error: tokens.error_description || tokens.error });

    const [profileRes, emailRes] = await Promise.all([
      fetch("https://api.github.com/user",        { headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "MathuatSound" } }),
      fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "MathuatSound" } }),
    ]);
    const profile = await profileRes.json();
    const emails  = await emailRes.json();
    const primary = emails.find(e => e.primary && e.verified)?.email || profile.email;
    const { user, isNew } = await upsertOAuthUser({
      provider: "github", providerId: String(profile.id),
      name: profile.name || profile.login, email: primary, avatar: profile.avatar_url,
    });
    res.json({ user: mapUser(user), token: signToken(user), isNew });
  } catch (err) {
    console.error("[GitHub OAuth]", err);
    res.status(500).json({ error: "GitHub authentication failed" });
  }
});

// ── SoundCloud OAuth ──────────────────────────────────────────────────────────
app.post("/api/auth/soundcloud/callback", async (req, res) => {
  const { code, redirect_uri } = req.body;
  try {
    const tokenRes = await fetch("https://api.soundcloud.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.SOUNDCLOUD_CLIENT_ID,
        client_secret: process.env.SOUNDCLOUD_CLIENT_SECRET,
        redirect_uri, code,
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).json({ error: tokens.error_description || tokens.error });

    const profileRes = await fetch("https://api.soundcloud.com/me", {
      headers: { Authorization: `OAuth ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    const { user, isNew } = await upsertOAuthUser({
      provider: "soundcloud", providerId: String(profile.id),
      name: profile.full_name || profile.username,
      email: profile.email || `sc_${profile.id}@soundcloud.invalid`,
      avatar: profile.avatar_url,
    });
    res.json({ user: mapUser(user), token: signToken(user), isNew });
  } catch (err) {
    console.error("[SoundCloud OAuth]", err);
    res.status(500).json({ error: "SoundCloud authentication failed" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// BEATS — Upload (Producer → S3 → DB status: pending)
// ════════════════════════════════════════════════════════════════════════════
//
// Flow:
//   1. multer.memoryStorage() buffers the three files in RAM
//   2. All three are streamed to S3 in parallel via @aws-sdk/lib-storage
//   3. DB row is inserted with the S3 keys and status = 'pending'
//
// S3 structure:
//   MP3  (public)  → beatstoreprj00001111 / mã nguồn/audio/mp3/<ts>_<name>.mp3
//   WAV  (private) → beatstoreprj00001111 / mã nguồn/audio/wav/<ts>_<name>.wav
//   STEMS(private) → beatstoreprj00001111 / mã nguồn/audio/stems/<ts>_<name>.zip
//
app.post("/api/tracks/upload", requireAuth, (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError)
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    if (err)
      return res.status(400).json({ error: err.message });

    const { title, mp3Price, wavPrice, bpm, key, genre } = req.body;
    const files = req.files || {};

    if (!title?.trim())   return res.status(400).json({ error: "Tên beat là bắt buộc" });
    if (!files.mp3?.[0])  return res.status(400).json({ error: "File MP3 là bắt buộc" });
    if (!files.stems?.[0])return res.status(400).json({ error: "File STEMS (.zip/.rar) là bắt buộc" });

    const mp3File   = files.mp3[0];
    const wavFile   = files.wav?.[0] || null;
    const stemsFile = files.stems[0];

    try {
      // ── Stream all files to S3 in parallel ─────────────────────────────
      const [mp3Result, wavResult, stemsResult] = await Promise.all([
        s3Upload({
          buffer:       mp3File.buffer,
          contentType:  mp3File.mimetype,
          originalname: mp3File.originalname,
          subdir:       "mp3",
          isPublic:     true,   // Public-read: admin <audio> loads directly
        }),
        wavFile
          ? s3Upload({
              buffer:       wavFile.buffer,
              contentType:  wavFile.mimetype,
              originalname: wavFile.originalname,
              subdir:       "wav",
              isPublic:     false, // Private: presigned URL only after purchase
            })
          : Promise.resolve(null),
        s3Upload({
          buffer:       stemsFile.buffer,
          contentType:  stemsFile.mimetype,
          originalname: stemsFile.originalname,
          subdir:       "stems",
          isPublic:     false,  // Private: presigned URL only after purchase
        }),
      ]);

      // ── Insert beat record into DB with S3 keys ──────────────────────────
      const result = await db.query(
        `INSERT INTO beats
           (producer_id, title, genre, bpm, key,
            mp3_price, wav_price,
            mp3_path,        wav_path,        stems_path,
            mp3_name,        wav_name,        stems_name,
            mp3_size,        wav_size,        stems_size,
            status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending')
         RETURNING id`,
        [
          req.user.sub,
          title.trim(),
          genre    || "Other",
          parseInt(bpm) || null,
          key      || null,
          parseInt(mp3Price)  || 0,
          parseInt(wavPrice)  || 0,
          mp3Result.key,                    // S3 key, e.g. "mã nguồn/audio/mp3/..."
          wavResult?.key    || null,
          stemsResult.key,
          mp3File.originalname,
          wavFile?.originalname  || null,
          stemsFile.originalname,
          mp3File.size,
          wavFile?.size          || null,
          stemsFile.size,
        ]
      );

      res.json({
        ok:      true,
        beatId:  result.rows[0].id,
        message: "Beat đã gửi duyệt thành công!",
        s3: {
          mp3: mp3Result.publicUrl,  // public URL for reference
          wav: "private",
          stems: "private",
        },
      });
    } catch (upErr) {
      console.error("[Upload S3/DB]", upErr);
      res.status(500).json({ error: "Lỗi upload S3: " + upErr.message });
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — Pending beats
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/admin/tracks/pending", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT b.*, u.name AS producer_name
       FROM beats b
       JOIN users u ON u.id = b.producer_id
       WHERE b.status = 'pending'
       ORDER BY b.created_at DESC`
    );
    res.json(result.rows.map(rowToPendingBeat));
  } catch (err) {
    console.error("[Pending beats]", err);
    res.status(500).json({ error: "Failed to fetch pending beats" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — Presigned URL for private files (WAV / STEMS)
// ════════════════════════════════════════════════════════════════════════════
//
// Admin clicks the WAV or STEMS link → frontend calls this endpoint
// → returns a presigned URL valid for 1 hour.
// The link is only for quality-review purposes; the file stays private on S3.
//
app.get("/api/admin/tracks/:id/presign", requireAuth, requireAdmin, async (req, res) => {
  const { id }   = req.params;
  const { file } = req.query; // "wav" | "stems"

  if (!["wav", "stems"].includes(file))
    return res.status(400).json({ error: "Tham số file phải là 'wav' hoặc 'stems'" });

  try {
    const result = await db.query(
      "SELECT wav_path, stems_path FROM beats WHERE id=$1", [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Beat không tồn tại" });

    const s3Key = file === "wav" ? result.rows[0].wav_path : result.rows[0].stems_path;
    if (!s3Key) return res.status(404).json({ error: "File chưa được upload" });

    const url = await s3Presign(s3Key, 3600); // 1 hour for admin review
    res.json({ url, expiresIn: 3600, file });
  } catch (err) {
    console.error("[Admin presign]", err);
    res.status(500).json({ error: "Không thể tạo presigned URL" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — Approve beat (→ published, appears on home page)
// ════════════════════════════════════════════════════════════════════════════
app.patch("/api/admin/tracks/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE beats SET status='approved', reject_reason=NULL, updated_at=now()
       WHERE id=$1 AND status='pending'
       RETURNING id, producer_id, title`,
      [id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "Beat không tìm thấy hoặc đã xử lý" });

    const beat = result.rows[0];
    await db.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1,'beat_approved',$2)`,
      [beat.producer_id, JSON.stringify({ beatId: beat.id, title: beat.title })]
    );
    res.json({ ok: true, message: `Beat "${beat.title}" đã được phê duyệt và xuất bản` });
  } catch (err) {
    console.error("[Approve]", err);
    res.status(500).json({ error: "Failed to approve beat" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — Reject beat
// ════════════════════════════════════════════════════════════════════════════
app.patch("/api/admin/tracks/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const { id }     = req.params;
  const { reason } = req.body;

  if (!reason?.trim()) return res.status(400).json({ error: "Lý do từ chối là bắt buộc" });

  try {
    const result = await db.query(
      `UPDATE beats SET status='rejected', reject_reason=$1, updated_at=now()
       WHERE id=$2 AND status='pending'
       RETURNING id, producer_id, title`,
      [reason.trim(), id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "Beat không tìm thấy hoặc đã xử lý" });

    const beat = result.rows[0];
    await db.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1,'beat_rejected',$2)`,
      [beat.producer_id, JSON.stringify({ beatId: beat.id, title: beat.title, reason })]
    );
    res.json({ ok: true, message: `Beat "${beat.title}" đã bị từ chối` });
  } catch (err) {
    console.error("[Reject]", err);
    res.status(500).json({ error: "Failed to reject beat" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — Approved beats list (Featured Management tab)
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/admin/beats/approved", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT b.id, b.title, b.genre, b.bpm, b.key, b.wav_price AS price,
              b.mp3_path, b.artwork_url, b.is_featured, u.name AS artist
       FROM beats b JOIN users u ON u.id = b.producer_id
       WHERE b.status = 'approved' ORDER BY b.created_at DESC`
    );
    res.json(result.rows.map(r => ({
      id:         r.id,
      title:      r.title,
      artist:     r.artist,
      genre:      r.genre,
      bpm:        r.bpm,
      price:      r.price,
      artwork:    r.artwork_url || "",
      mp3Url:     r.mp3_path ? s3PublicUrl(r.mp3_path) : null,
      isFeatured: r.is_featured,
    })));
  } catch (err) {
    console.error("[Approved beats]", err);
    res.status(500).json({ error: "Failed to fetch approved beats" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — Toggle featured
// ════════════════════════════════════════════════════════════════════════════
app.patch("/api/admin/beats/:id/featured", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { isFeatured } = req.body;
  if (typeof isFeatured !== "boolean")
    return res.status(400).json({ error: "isFeatured must be boolean" });
  try {
    await db.query(
      "UPDATE beats SET is_featured=$1, updated_at=now() WHERE id=$2 AND status='approved'",
      [isFeatured, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[Toggle featured]", err);
    res.status(500).json({ error: "Failed to update featured status" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC — Featured beats (home page, no auth)
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/beats/featured", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT b.id, b.title, b.genre, b.bpm, b.key,
              b.mp3_price, b.wav_price, b.plays, b.likes,
              b.mp3_path, b.artwork_url, u.name AS artist
       FROM beats b JOIN users u ON u.id = b.producer_id
       WHERE b.status = 'approved' AND b.is_featured = true
       ORDER BY b.featured_order ASC, b.updated_at DESC`
    );
    res.json(result.rows.map(r => ({
      id:          r.id,
      title:       r.title,
      artist:      r.artist,
      genre:       r.genre,
      bpm:         r.bpm,
      key:         r.key,
      price:       r.wav_price || r.mp3_price,
      plays:       r.plays,
      likes:       r.likes,
      artwork:     r.artwork_url || "",
      mp3Url:      r.mp3_path ? s3PublicUrl(r.mp3_path) : null,
      isExclusive: false,
      isNew:       false,
      isFeatured:  true,
    })));
  } catch (err) {
    console.error("[Featured beats]", err);
    res.status(500).json({ error: "Failed to fetch featured beats" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC — All approved beats
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/beats", async (req, res) => {
  const { genre, search, limit = 50, offset = 0 } = req.query;
  try {
    const conditions = ["b.status = 'approved'"];
    const params = [];
    if (genre && genre !== "All") {
      params.push(genre);
      conditions.push(`b.genre = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(b.title ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
    }
    params.push(Number(limit), Number(offset));
    const result = await db.query(
      `SELECT b.id, b.title, b.genre, b.bpm, b.key,
              b.mp3_price, b.wav_price, b.plays, b.likes,
              b.artwork_url, b.is_featured, u.name AS artist
       FROM beats b JOIN users u ON u.id = b.producer_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY b.plays DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(result.rows.map(r => ({
      id:          r.id,
      title:       r.title,
      artist:      r.artist,
      genre:       r.genre,
      bpm:         r.bpm,
      key:         r.key,
      price:       r.wav_price || r.mp3_price,
      plays:       r.plays,
      likes:       r.likes,
      artwork:     r.artwork_url || "",
      isFeatured:  r.is_featured,
      isExclusive: false,
      isNew:       false,
    })));
  } catch (err) {
    console.error("[Beats list]", err);
    res.status(500).json({ error: "Failed to fetch beats" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ORDERS — Create order (buyer intent, pending payment)
// ════════════════════════════════════════════════════════════════════════════
app.post("/api/orders", requireAuth, async (req, res) => {
  const { beatId, licenseType } = req.body;
  try {
    const beatResult = await db.query(
      "SELECT * FROM beats WHERE id=$1 AND status='approved'", [beatId]
    );
    if (!beatResult.rows.length) return res.status(404).json({ error: "Beat not found" });

    const beat        = beatResult.rows[0];
    const amount      = licenseType === "MP3" ? beat.mp3_price
                      : licenseType === "WAV" ? beat.wav_price
                      : beat.mp3_price + beat.wav_price;
    const producerCut = Math.round(amount * (1 - COMMISSION_PCT / 100));

    const orderResult = await db.query(
      `INSERT INTO orders (buyer_id, beat_id, license_type, amount, producer_cut, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
      [req.user.sub, beatId, licenseType, amount, producerCut]
    );
    await db.query("UPDATE beats SET plays = plays + 1 WHERE id=$1", [beatId]);

    res.json({
      orderId: orderResult.rows[0].id,
      amount, producerCut, licenseType,
      beat: { id: beat.id, title: beat.title },
    });
  } catch (err) {
    console.error("[Create order]", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// ── Admin confirms payment → order status = confirmed ─────────────────────────
app.patch("/api/orders/:id/confirm", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE orders SET status='confirmed' WHERE id=$1 AND status='pending' RETURNING *`, [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });

    const order = result.rows[0];
    await db.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1,'sale',$2)`,
      [order.buyer_id, JSON.stringify({ orderId: order.id, amount: order.amount })]
    );
    res.json({ ok: true, order });
  } catch (err) {
    console.error("[Confirm order]", err);
    res.status(500).json({ error: "Failed to confirm order" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// BUYER — Download private file after confirmed payment
// ════════════════════════════════════════════════════════════════════════════
//
// Anti-piracy: WAV and STEMS are NEVER exposed as permanent S3 URLs.
// This endpoint issues a presigned URL valid for exactly 15 minutes,
// only if the buyer's order is confirmed and the license covers the file.
//
app.get("/api/orders/:orderId/download", requireAuth, async (req, res) => {
  const { orderId } = req.params;
  const { file }    = req.query; // "wav" | "stems"

  if (!["wav", "stems"].includes(file))
    return res.status(400).json({ error: "file must be 'wav' or 'stems'" });

  try {
    const result = await db.query(
      `SELECT o.license_type, b.wav_path, b.stems_path, b.title
       FROM orders o JOIN beats b ON b.id = o.beat_id
       WHERE o.id=$1 AND o.buyer_id=$2 AND o.status='confirmed'`,
      [orderId, req.user.sub]
    );
    if (!result.rows.length)
      return res.status(403).json({ error: "Đơn hàng không tồn tại hoặc chưa thanh toán" });

    const order = result.rows[0];

    // License gate: MP3 license cannot download WAV / STEMS
    if (file === "stems" && order.license_type === "WAV")
      return res.status(403).json({ error: "Gói WAV không bao gồm STEMS. Vui lòng nâng cấp lên BUNDLE." });
    if (file === "wav" && order.license_type === "MP3")
      return res.status(403).json({ error: "Gói MP3 không bao gồm WAV. Vui lòng nâng cấp." });

    const s3Key = file === "wav" ? order.wav_path : order.stems_path;
    if (!s3Key) return res.status(404).json({ error: "File chưa khả dụng" });

    const url = await s3Presign(s3Key, 900); // 15 minutes — chống share link lậu
    res.json({ url, expiresIn: 900, file, beatTitle: order.title });
  } catch (err) {
    console.error("[Buyer download presign]", err);
    res.status(500).json({ error: "Không thể tạo link tải" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PRODUCER — My beats list
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/my/beats", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, genre, bpm, key, mp3_price, wav_price,
              status, reject_reason, plays, likes, created_at
       FROM beats WHERE producer_id=$1 ORDER BY created_at DESC`,
      [req.user.sub]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[My beats]", err);
    res.status(500).json({ error: "Failed to fetch your beats" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════════════
app.get("/api/notifications", requireAuth, async (req, res) => {
  const result = await db.query(
    "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
    [req.user.sub]
  );
  res.json(result.rows);
});

app.patch("/api/notifications/read", requireAuth, async (req, res) => {
  await db.query("UPDATE notifications SET read=true WHERE user_id=$1", [req.user.sub]);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// PRODUCTION — Serve React build + SPA fallback
// ════════════════════════════════════════════════════════════════════════════
//
// In production (NODE_ENV=production), this single Express process serves both:
//   • API routes   → /api/*, /oauth2callback  (handled above)
//   • React SPA    → all other paths → index.html
//
// Build first:  cd .. && npm run build   (outputs to /dist)
// Then:         NODE_ENV=production node backend/server.js
//
// nginx is NOT required; Express acts as the origin server.
// Point your reverse proxy / Cloudflare to https://mathuatbeat.xyz → port 8080.
//
if (process.env.NODE_ENV === "production") {
  const DIST = path.join(__dirname, "..", "dist");
  // Serve hashed static assets (JS/CSS/images) with long-lived cache
  app.use(express.static(DIST, { maxAge: "1y", immutable: true }));
  // SPA fallback: any route that didn't match an API handler gets index.html
  app.get("*", (_req, res) => {
    res.sendFile(path.join(DIST, "index.html"));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[Unhandled]", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const origin = IS_PROD ? FRONTEND_URL : `http://localhost:${PORT}`;
  console.log(`\n✅ MathuatSound  [${IS_PROD ? "PRODUCTION" : "development"}]`);
  console.log(`   Server             →  ${origin}`);
  console.log(`   Google OAuth start →  ${origin}/api/auth/google`);
  console.log(`   Google callback    →  ${GOOGLE_REDIRECT_URI}`);
  console.log(`   Post-auth redirect →  ${FRONTEND_URL}`);
  console.log(`   S3 bucket          :  s3://${S3_BUCKET}/${S3_PREFIX}/`);
  console.log(`   DB                 :  ${process.env.DATABASE_URL ? "✓" : "⚠ DATABASE_URL not set"}`);
  console.log(`   AWS keys           :  ${process.env.AWS_ACCESS_KEY_ID ? "✓" : "⚠ not set"}`);
  console.log(`   Google credentials :  ${process.env.GOOGLE_CLIENT_SECRET ? "✓" : "⚠ GOOGLE_CLIENT_SECRET not set"}\n`);
});
