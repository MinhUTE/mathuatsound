-- MathuatSound Beat Store — PostgreSQL Schema
-- Run once: psql -U postgres -d mathuat_sound -f db.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  avatar        TEXT,
  role          TEXT NOT NULL DEFAULT 'Buyer'
                  CHECK (role IN ('Admin','Artist','Producer','Buyer','Enterprise','DemoEnterprise')),
  auth_provider TEXT NOT NULL DEFAULT 'email'
                  CHECK (auth_provider IN ('email','google','github','soundcloud')),
  provider_id   TEXT,                        -- OAuth subject / provider user id
  password_hash TEXT,                        -- NULL for OAuth users
  dob           DATE,
  phone         TEXT,
  country       TEXT DEFAULT 'Việt Nam',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_provider_idx
  ON users (auth_provider, provider_id)
  WHERE provider_id IS NOT NULL;

-- ── Beats ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beats (
  id              SERIAL PRIMARY KEY,
  producer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  genre           TEXT NOT NULL DEFAULT 'Other',
  bpm             INTEGER,
  key             TEXT,

  -- Pricing
  mp3_price       INTEGER NOT NULL DEFAULT 0,  -- VND
  wav_price       INTEGER NOT NULL DEFAULT 0,

  -- Real file paths relative to STORAGE_PATH
  mp3_path        TEXT,
  wav_path        TEXT,
  stems_path      TEXT,

  -- Original file names and sizes for admin verification
  mp3_name        TEXT,
  wav_name        TEXT,
  stems_name      TEXT,
  mp3_size        BIGINT,
  wav_size        BIGINT,
  stems_size      BIGINT,

  -- Artwork (optional upload or URL)
  artwork_url     TEXT,

  -- Moderation
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reject_reason   TEXT,

  -- Featured / discovery
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  featured_order  INTEGER NOT NULL DEFAULT 0,

  -- Stats
  plays           INTEGER NOT NULL DEFAULT 0,
  likes           INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Orders ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id      UUID NOT NULL REFERENCES users(id),
  beat_id       INTEGER NOT NULL REFERENCES beats(id),
  license_type  TEXT NOT NULL CHECK (license_type IN ('MP3','WAV','BUNDLE')),
  amount        INTEGER NOT NULL,           -- VND paid
  producer_cut  INTEGER NOT NULL,          -- VND after platform commission
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Notifications (for producer reject emails etc.) ─────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- 'beat_approved' | 'beat_rejected' | 'sale'
  payload     JSONB,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Helpful indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS beats_status_idx     ON beats (status);
CREATE INDEX IF NOT EXISTS beats_featured_idx   ON beats (is_featured, featured_order) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS beats_producer_idx   ON beats (producer_id);
CREATE INDEX IF NOT EXISTS orders_buyer_idx     ON orders (buyer_id);
CREATE INDEX IF NOT EXISTS notif_user_idx       ON notifications (user_id, read);
