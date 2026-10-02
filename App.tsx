import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import newPaymentQr from "@/imports/1790650599110_183052119154929829_6626361424152401626_17f52c2ee9ba301590abf6f3db452439.jpg";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { BrowserRouter, Routes, Route, useNavigate, useSearchParams } from "react-router";
import AdminDashboardPage, { AdminLoginPage } from "@/app/AdminDashboard";
import {
  Play, Pause, SkipBack, SkipForward, Volume2,
  Heart, Search, X, ChevronRight, ChevronDown,
  Upload, TrendingUp, Users, Zap, Check, Music,
  Sparkles, ShoppingCart, Headphones,
  Eye, EyeOff, LogOut,
  Shield, FileText,
  Download, DollarSign,
  BarChart2, Wallet, ArrowUpRight,
  Gift, Phone, MapPin, CalendarDays, AlertTriangle,
  UserCheck, Info, Plus, Trash2, Lock, Unlock, Key, Clock, Archive,
  QrCode, Banknote, FileCheck, ExternalLink, Copy, Receipt, CreditCard, ShoppingBag, FolderOpen,
} from "lucide-react";
import { toast, Toaster } from "sonner";
// ── Recharts removed — custom zero-dependency sparklines below ──────────────

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

type UserRole = "admin" | "producer" | "user";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: UserRole;
  bio: string;
  phone: string;
  location: string;
  country: string;
  dob?: string;           // YYYY-MM-DD, sent to backend
  joinedAt: string;
  isVerified: boolean;
  authProvider: "email" | "google";
  isNewUser?: boolean;    // true if first Google login
  hasDob?: boolean;       // false = show birthday reminder
}

interface Track {
  id: number; title: string; artist: string; genre: string;
  bpm: number; key: string; price: number; plays: number;
  likes: number; artwork: string; isExclusive: boolean; isNew: boolean;
  isFeatured?: boolean; mp3Url?: string;
}

type LicenseType = "MP3" | "WAV" | "BUNDLE";

interface AdminPaymentConfig {
  qrDataUrl: string;       // base64 or URL of QR image uploaded by admin
  bankName: string;
  accountNumber: string;
  accountName: string;
  commission: number;      // platform cut percentage
}

interface PurchasedItem {
  orderId: string;
  track: Track;
  license: LicenseType;
  amount: number;
  purchasedAt: string;
}

interface PendingBeat {
  id: number;
  title: string;
  producer: string;
  producerId: string;
  format: string;
  price: number;
  bpm: number;
  key: string;
  uploadedAt: string;
  // MP3: public S3 URL — loaded directly by <audio> for admin preview
  mp3Url: string | null;
  // WAV / STEMS: always null in the list response (private S3 objects).
  // AdminBeatRow fetches a presigned URL on demand via /api/admin/tracks/:id/presign
  wavUrl:   null;
  stemsUrl: null;
  // S3 keys — used to request presigned URLs
  mp3Key?:   string | null;
  wavKey?:   string | null;
  stemsKey?: string | null;
  // File metadata for admin verification panel
  mp3Name?:   string;
  wavName?:   string;
  stemsName?: string;
  mp3Size?:   number;   // bytes
  wavSize?:   number;
  stemsSize?: number;
  status: "Pending" | "Approved" | "Rejected";
  rejectReason?: string;
}

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const GENRES = ["All", "Hip Hop", "Trap", "R&B", "V-Pop", "EDM", "Lo-fi", "Drill", "Afrobeats"];

const COUNTRIES = [
  "Việt Nam", "Hoa Kỳ", "Nhật Bản", "Hàn Quốc", "Thái Lan",
  "Singapore", "Indonesia", "Philippines", "Malaysia", "Đức",
  "Pháp", "Anh", "Canada", "Úc", "Brazil", "Ấn Độ", "Khác",
];

const VN_MONTHS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const TRACKS: Track[] = [
  { id: 1, title: "Midnight Drip", artist: "KHD Beats", genre: "Trap", bpm: 140, key: "Am", price: 150000, plays: 24800, likes: 1204, artwork: "https://images.unsplash.com/photo-1781892711745-01b46cda7523?w=300&h=300&fit=crop&auto=format", isExclusive: true, isNew: false },
  { id: 2, title: "Sài Gòn Nights", artist: "Phúc Producer", genre: "V-Pop", bpm: 120, key: "Cm", price: 200000, plays: 18900, likes: 987, artwork: "https://images.unsplash.com/photo-1785622757763-866e7a87c9d6?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: true },
  { id: 3, title: "Galaxy Mind", artist: "TRXPBOY", genre: "Hip Hop", bpm: 93, key: "Gm", price: 120000, plays: 31200, likes: 2109, artwork: "https://images.unsplash.com/photo-1775475668658-c7eb89fdf051?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: false },
  { id: 4, title: "Rượu Đắng", artist: "Lê Minh Sound", genre: "R&B", bpm: 78, key: "Fm", price: 350000, plays: 9600, likes: 543, artwork: "https://images.unsplash.com/photo-1765188049874-126c386b8cce?w=300&h=300&fit=crop&auto=format", isExclusive: true, isNew: false },
  { id: 5, title: "Neon Drift", artist: "VN Electronic", genre: "EDM", bpm: 128, key: "Dm", price: 180000, plays: 44100, likes: 3211, artwork: "https://images.unsplash.com/photo-1590347830191-399f8397e2db?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: true },
  { id: 6, title: "3AM Coffee", artist: "LoLo Beats", genre: "Lo-fi", bpm: 72, key: "Bbm", price: 80000, plays: 67300, likes: 5892, artwork: "https://images.unsplash.com/photo-1741745978060-9add161ba2c2?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: false },
  { id: 7, title: "Road to Glory", artist: "Trường Drill", genre: "Drill", bpm: 135, key: "Cm", price: 250000, plays: 15600, likes: 789, artwork: "https://images.unsplash.com/photo-1777734448565-9655048cf444?w=300&h=300&fit=crop&auto=format", isExclusive: true, isNew: true },
  { id: 8, title: "Golden Hour", artist: "SunKid Producer", genre: "R&B", bpm: 85, key: "Db", price: 195000, plays: 22100, likes: 1567, artwork: "https://images.unsplash.com/photo-1777734448523-6b441c719d8d?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: false },
  { id: 9, title: "Lagos to HCM", artist: "AfroViet", genre: "Afrobeats", bpm: 105, key: "Em", price: 175000, plays: 8900, likes: 412, artwork: "https://images.unsplash.com/photo-1775475668658-c7eb89fdf051?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: true },
  { id: 10, title: "Mưa Tháng 6", artist: "Đức Audio", genre: "V-Pop", bpm: 115, key: "Am", price: 130000, plays: 36400, likes: 2876, artwork: "https://images.unsplash.com/photo-1765188049874-126c386b8cce?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: false },
  { id: 11, title: "Dark Matter", artist: "KHD Beats", genre: "Trap", bpm: 145, key: "Bm", price: 200000, plays: 19200, likes: 1045, artwork: "https://images.unsplash.com/photo-1590347830191-399f8397e2db?w=300&h=300&fit=crop&auto=format", isExclusive: true, isNew: false },
  { id: 12, title: "Hanoi Chill", artist: "N.Beats", genre: "Lo-fi", bpm: 68, key: "Fm", price: 60000, plays: 51000, likes: 4321, artwork: "https://images.unsplash.com/photo-1781892711745-01b46cda7523?w=300&h=300&fit=crop&auto=format", isExclusive: false, isNew: false },
];

const PACKS = [
  { id: 1, title: "Trap Vietnam Vol.3", creator: "KHD Beats", tracks: 24, price: 450000, cover: "https://images.unsplash.com/photo-1590347830191-399f8397e2db?w=600&h=450&fit=crop&auto=format", tag: "Best Seller" },
  { id: 2, title: "Lo-fi Hà Nội", creator: "N.Beats Studio", tracks: 18, price: 320000, cover: "https://images.unsplash.com/photo-1741745978060-9add161ba2c2?w=600&h=450&fit=crop&auto=format", tag: "New Release" },
  { id: 3, title: "Summer V-Pop Essentials", creator: "Phúc Producer", tracks: 30, price: 600000, cover: "https://images.unsplash.com/photo-1785622757763-866e7a87c9d6?w=600&h=450&fit=crop&auto=format", tag: "Editor's Pick" },
];

const PLANS = [
  { name: "Free", price: 0, period: "mãi mãi", description: "Khám phá nền tảng", features: ["Nghe thử không giới hạn", "Đăng tối đa 20 beat/tháng", "Hoa hồng 20% mỗi giao dịch", "Cửa hàng cơ bản", "Phân tích cơ bản"], cta: "Bắt đầu miễn phí", highlight: false },
  { name: "Pro Creator", price: 199000, period: "tháng", description: "Dành cho nghệ sĩ nghiêm túc", features: ["Upload không giới hạn", "Hoa hồng giảm còn 10%", "Ưu tiên đề xuất trang chủ", "Voice tag tùy chỉnh (FFmpeg)", "Dashboard phân tích nâng cao", "Badge xác minh Creator"], cta: "Dùng thử 14 ngày", highlight: true },
];

const REGISTER_ROLES = [
  { value: "user" as UserRole, label: "Người mua", desc: "Mua Beat & Sample", emoji: "🎧" },
  { value: "producer" as UserRole, label: "Producer / Seller", desc: "Bán beat & sample", emoji: "🎹" },
];

const ALL_ROLES: { value: UserRole; label: string; emoji: string; color: string }[] = [
  { value: "admin",    label: "Admin",    emoji: "⚙️", color: "#ef4444" },
  { value: "producer", label: "Producer", emoji: "🎹", color: "#00c896" },
  { value: "user",     label: "Người mua", emoji: "🎧", color: "#3b82f6" },
];

// ═══════════════════════════════════════════════════════════════════
// GOOGLE IDENTITY SERVICES — Cấu hình Production chính thức
// ═══════════════════════════════════════════════════════════════════
//
// Hai luồng đăng nhập Google song song:
//
//   LUỒNG A — Authorization Code (nút bấm):
//     startGoogleOAuth()  →  /api/auth/google  →  Google  →  /api/auth/google/callback (backend)  →  frontend JWT
//     →  POST /api/auth/google/exchange  →  JWT  →  AppShell
//
//   LUỒNG B — One Tap (khung trượt tự động, tương tự Beatstars):
//     useGoogleOneTap()  →  window.google.accounts.id.initialize()
//     →  auto_select: true + ux_mode: "redirect"
//     →  Google  POST →  /api/auth/google/onetap (backend)
//     →  backend xác thực ID token  →  redirect về / với JWT params
//     →  AppShell đọc URL params  →  applyAuthSuccess()

// Client ID chính thức — .trim() loại bỏ mọi khoảng trắng / ký tự ẩn.
const GOOGLE_CLIENT_ID =
  "916633799812-6n7k5eha7kmuk3f8k910if93jdfiroq9.apps.googleusercontent.com".trim();

// One Tap login_uri: backend nhận POST từ Google sau khi user chọn tài khoản.
// URI này phải được đăng ký trong Google Cloud Console → Authorized redirect URIs.
const GOOGLE_ONE_TAP_LOGIN_URI =
  "https://mathuatbeat.xyz/api/auth/google/onetap".trim();

// redirect_uri dùng cho luồng server-side (backend /api/auth/google/callback xử lý).
// Dev override: đặt VITE_GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
const GOOGLE_REDIRECT_URI: string = (
  (import.meta as { env: Record<string, string> }).env?.VITE_GOOGLE_REDIRECT_URI ??
  "https://mathuatbeat.xyz/api/auth/google/callback"
).trim();

// TypeScript shim cho Google Identity Services (GSI) API
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            ux_mode?: "popup" | "redirect";
            login_uri?: string;
            auto_select?: boolean;
            callback?: (resp: { credential: string }) => void;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: (momentListener?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          cancel: () => void;
          revoke: (email: string, done: () => void) => void;
        };
      };
    };
  }
}

// Backend base URL. VITE_API_BASE_URL is preferred (set in Figma Make Secrets).
// Falls back to the known Railway deployment URL so the app works even before
// a fresh publish bakes the secret into the bundle.
const API_BASE: string = (
  (import.meta as { env: Record<string, string> }).env?.VITE_API_BASE_URL ||
  "https://mathuatsound-production.up.railway.app"
).trim();

// startGoogleOAuth — Authorization Code flow.
//
// MODE A (VITE_API_BASE_URL set — Figma Make CDN + Railway):
//   → ${API_BASE}/api/auth/google  (backend sets server-session CSRF)
//   → Google → mathuatbeat.xyz/api/auth/google/callback (React SPA relay)
//   → ${API_BASE}/api/auth/google/callback (backend verifies session CSRF, exchanges code)
//   → frontend ?auth_token= (AppShell LUỒNG B)
//
// MODE B (VITE_API_BASE_URL not set — same-origin deployment):
//   → frontend builds Google auth URL, stores CSRF in sessionStorage
//   → Google → mathuatbeat.xyz/api/auth/google/callback (GoogleCallbackPage)
//   → POST /api/auth/google/exchange (same-origin)
//   → sessionStorage["oauth_result"] → AppShell
function startGoogleOAuth() {
  // Cancel any lingering One Tap / FedCM prompt from a cached old build.
  try { window.google?.accounts.id.cancel(); } catch { /* ignore */ }

  if (API_BASE) {
    // Split-domain: backend (Railway) is a separate origin from the frontend CDN.
    // Let the backend initiate OAuth so it can set the server-session CSRF state.
    // Backend GET /api/auth/google → Google → mathuatbeat.xyz/api/auth/google/callback
    // → GoogleCallbackPage relays ?code=&state= back to backend callback handler
    // → backend exchanges code, creates JWT, redirects to frontend with ?auth_token=
    window.location.href = `${API_BASE}/api/auth/google`;
    return;
  }

  // Same-origin fallback: frontend builds auth URL directly and stores CSRF in sessionStorage.
  // Only works when the backend and frontend share the same origin (e.g. Railway serves the build).
  const state = crypto.randomUUID();
  sessionStorage.setItem("google_oauth_state", state);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",     GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri",  GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope",         "openid email profile");
  url.searchParams.set("access_type",   "offline");
  url.searchParams.set("prompt",        "select_account");
  url.searchParams.set("state",         state);

  window.location.href = url.toString();
}

// ── SoundCloud OAuth 2.0 — Authorization Code Flow ───────────────────
// VITE_SOUNDCLOUD_CLIENT_ID overrides the hardcoded default below.
// VITE_SOUNDCLOUD_REDIRECT_URI defaults to window.location.origin + "/auth/soundcloud/callback"
const SC_CLIENT_ID: string =
  (import.meta as { env: Record<string, string> }).env?.VITE_SOUNDCLOUD_CLIENT_ID ??
  "269d98e4922fb3895e9ae2108cbb5064";
const SC_REDIRECT_URI: string =
  (import.meta as { env: Record<string, string> }).env?.VITE_SOUNDCLOUD_REDIRECT_URI ??
  `${window.location.origin}/auth/soundcloud/callback`;

function buildSoundCloudAuthUrl(action: "login" | "register"): string {
  const state = `sc_${action}_${crypto.randomUUID()}`;
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem("oauth_action", action);
  sessionStorage.setItem("oauth_provider", "soundcloud");
  const params = new URLSearchParams({
    client_id: SC_CLIENT_ID,
    redirect_uri: SC_REDIRECT_URI,
    response_type: "code",
    scope: "non-expiring",
    state,
  });
  return `https://soundcloud.com/connect?${params.toString()}`;
}

function startSoundCloudOAuth(action: "login" | "register") {
  (window.top ?? window).location.href = buildSoundCloudAuthUrl(action);
}

// ── GitHub OAuth 2.0 — Authorization Code Flow ───────────────────────
// VITE_GITHUB_CLIENT_ID: set in .env (overrides empty string below until set)
// VITE_GITHUB_REDIRECT_URI: defaults to window.location.origin + "/auth/github/callback"
const GH_CLIENT_ID: string =
  (import.meta as { env: Record<string, string> }).env?.VITE_GITHUB_CLIENT_ID ?? "";
const GH_REDIRECT_URI: string =
  (import.meta as { env: Record<string, string> }).env?.VITE_GITHUB_REDIRECT_URI ??
  `${window.location.origin}/auth/github/callback`;

function buildGitHubAuthUrl(action: "login" | "register"): string {
  const state = `gh_${action}_${crypto.randomUUID()}`;
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem("oauth_action", action);
  sessionStorage.setItem("oauth_provider", "github");
  const params = new URLSearchParams({
    client_id: GH_CLIENT_ID,
    redirect_uri: GH_REDIRECT_URI,
    scope: "user:email read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

function startGitHubOAuth(action: "login" | "register") {
  (window.top ?? window).location.href = buildGitHubAuthUrl(action);
}

const DEFAULT_ADMIN_PAYMENT: AdminPaymentConfig = {
  qrDataUrl: "",
  bankName: "",
  accountNumber: "",
  accountName: "LE HAI ANH",
  commission: 15,
};

const KEY_FREQ: Record<string, number[]> = {
  Am: [220, 261.63, 329.63], Bm: [246.94, 293.66, 369.99],
  Cm: [261.63, 311.13, 392], Db: [277.18, 329.63, 415.3],
  Dm: [293.66, 349.23, 440], Em: [329.63, 392, 493.88],
  Fm: [349.23, 415.3, 523.25], Gm: [392, 466.16, 587.33],
  Bbm: [233.08, 277.18, 349.23],
};

const REVENUE_DATA = [
  { month: "T1", revenue: 1200, plays: 8200 }, { month: "T2", revenue: 2100, plays: 12400 },
  { month: "T3", revenue: 1800, plays: 9800 }, { month: "T4", revenue: 3200, plays: 18600 },
  { month: "T5", revenue: 2800, plays: 15200 }, { month: "T6", revenue: 4100, plays: 24300 },
  { month: "T7", revenue: 5200, plays: 31000 }, { month: "T8", revenue: 4800, plays: 28400 },
];

// No fake demo data — all user/track/purchase data is fetched from the backend.

// ═══════════════════════════════════════════════════════════════════
// WEB AUDIO ENGINE
// ═══════════════════════════════════════════════════════════════════

function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const beatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeOscs = useRef<OscillatorNode[]>([]);

  const getCtx = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };

  const stopAll = useCallback(() => {
    if (beatRef.current) { clearInterval(beatRef.current); beatRef.current = null; }
    activeOscs.current.forEach((o) => { try { o.stop(); } catch { /* */ } });
    activeOscs.current = [];
  }, []);

  const playTrack = useCallback((track: Track, vol: number) => {
    stopAll();
    const ctx = getCtx();
    masterRef.current = ctx.createGain();
    masterRef.current.gain.value = (vol / 100) * 0.06;
    masterRef.current.connect(ctx.destination);
    const freqs = KEY_FREQ[track.key] || KEY_FREQ.Am;
    let beat = 0;
    const playBeat = () => {
      const now = ctx.currentTime;
      const freq = freqs[beat % freqs.length] * (beat % 8 === 0 ? 0.5 : 1);
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = beat % 4 === 0 ? "sawtooth" : "sine";
      env.gain.setValueAtTime(0.7, now);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(env); env.connect(masterRef.current!);
      osc.start(now); osc.stop(now + 0.25);
      activeOscs.current.push(osc);
      if (activeOscs.current.length > 20) activeOscs.current = activeOscs.current.slice(-10);
      beat++;
    };
    playBeat();
    beatRef.current = setInterval(playBeat, (60 / track.bpm) * 1000);
  }, [stopAll]);

  const updateVolume = useCallback((vol: number) => {
    if (masterRef.current) masterRef.current.gain.value = (vol / 100) * 0.06;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);
  return { playTrack, stopAll, updateVolume };
}

// ═══════════════════════════════════════════════════════════════════
// useGoogleOneTap — disabled.
//
// Auto-prompt (auto_select + use_fedcm_for_prompt) caused two problems:
//   1. FedCM NetworkError: browser's navigator.credentials.get() fails when
//      the backend /api/auth/google/onetap endpoint isn't reachable at prompt
//      time, leaving a native loading indicator that never resolves.
//   2. Google 10-minute cooldown: auto_select triggers re-auth on every page
//      load; after the first failure Google blocks further attempts for 10 min
//      ("Auto re-auth was previously triggered less than 10 minutes ago").
//
// Sign-in now happens exclusively through the explicit button click:
//   startGoogleOAuth() → GET /api/auth/google (backend) → Google → callback
// That server-side Authorization Code flow is unaffected by this change.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useGoogleOneTap(_enabled: boolean) { /* no-op */ }

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

// Safe JSON fetch — throws a readable error when the server returns HTML
// (e.g. Vite SPA fallback or an Express HTML error page) instead of JSON.
async function safeJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        `Backend offline hoặc URL sai — server trả về HTML thay vì JSON.\n` +
        `Hãy chạy: cd backend && npm start  (port 3001)`
      );
    }
    throw new Error(`Phản hồi không phải JSON (${res.status}): ${text.slice(0, 120)}`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function seededBars(seed: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const v = Math.abs(Math.sin(seed * 127.1 + i * 311.7) * 43758.5453) % 1;
    return v * 0.65 + 0.35;
  });
}
function formatVND(n: number) { if (!n) return "Miễn phí"; if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M đ`; return `${Math.round(n / 1000)}K đ`; }
function formatK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
function fmtTime(s: number) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }
function getInitials(n: string) { return n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase(); }

function calcAge(dobStr: string): number {
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

// ═══════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// ── Custom sparkline charts (no Recharts, no key collisions) ────────────────
type ChartPoint = { month: string; revenue?: number; plays?: number };

function SparkLine({ data, dataKey, color = "#00c896", height = 160 }: {
  data: ChartPoint[]; dataKey: "revenue" | "plays"; color?: string; height?: number;
}) {
  const values = data.map(d => d[dataKey] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 480; const h = height - 40;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <div style={{ width: "100%", height }}>
      <svg viewBox={`0 -4 ${w} ${h + 44}`} preserveAspectRatio="none" style={{ width: "100%", height: h + 40 }}>
        <defs>
          <linearGradient id={`sg-${dataKey}-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#sg-${dataKey}-${color.replace("#","")})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {data.filter((_, i) => i % 2 === 0).map(d => (
          <span key={d.month} style={{ fontSize: 10, color: "#6b6b88" }}>{d.month}</span>
        ))}
      </div>
    </div>
  );
}

function SparkBar({ data, dataKey, color = "#8b5cf6", height = 160 }: {
  data: ChartPoint[]; dataKey: "revenue" | "plays"; color?: string; height?: number;
}) {
  const values = data.map(d => d[dataKey] as number);
  const max = Math.max(...values) || 1;
  const barH = height - 32;
  return (
    <div style={{ width: "100%", height }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: barH }}>
        {values.map((v, i) => (
          <div key={i} style={{
            flex: 1, borderRadius: "3px 3px 0 0",
            height: `${Math.max(4, (v / max) * 100)}%`,
            background: color, opacity: 0.85,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {data.filter((_, i) => i % 2 === 0).map(d => (
          <span key={d.month} style={{ fontSize: 10, color: "#6b6b88" }}>{d.month}</span>
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SoundCloudIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="#ff5500">
      <path d="M1.543 13.89c-.078.43.312.782.742.782.39 0 .703-.273.742-.664l.234-2.734-.234-2.89c-.039-.39-.352-.664-.742-.664-.43 0-.82.352-.742.782l-.001 5.388zm2.148 1.289c-.078.507.39.898.898.898.468 0 .859-.351.898-.82l.273-3.124-.273-3.36c-.039-.468-.43-.82-.898-.82-.508 0-.976.39-.898.898l-.001 6.328zm2.227 1.055c-.117.546.313 1.054.898 1.054.547 0 1.016-.43.976-.976L7.52 12l-.235-3.79c0-.508-.43-.938-.976-.938-.547 0-1.016.43-.899.976l.228 4.502-.228-.001.003 3.485zm2.266.508c0 .625.508 1.093 1.094 1.093.586 0 1.094-.468 1.094-1.093l.273-4.89-.273-3.984c0-.586-.508-1.054-1.094-1.054-.586 0-1.094.468-1.094 1.054l-.234 3.984.234 4.89zm2.266-.039c0 .664.547 1.172 1.172 1.172.586 0 1.133-.508 1.133-1.172l.234-4.851-.234-4.18c0-.625-.547-1.132-1.133-1.132-.625 0-1.172.507-1.172 1.132l-.195 4.18.195 4.851zm2.266.156c0 .703.586 1.29 1.29 1.29.663 0 1.25-.587 1.25-1.29l.19-5.007-.19-4.96c0-.664-.587-1.25-1.25-1.25-.704 0-1.29.586-1.29 1.25l-.195 4.96.195 5.007zm2.344.078c0 .742.625 1.367 1.368 1.367.742 0 1.367-.625 1.367-1.367l.195-5.085-.195-3.984c0-.742-.625-1.328-1.367-1.328-.743 0-1.368.586-1.368 1.328l-.156 3.984.156 5.085zm2.344-.117a1.406 1.406 0 1 0 2.812 0l.156-4.968-.156-1.953c0-.781-.625-1.406-1.407-1.406-.78 0-1.405.625-1.405 1.406l-.117 1.953.117 4.968zM21.2 10.055c-.43 0-.82.078-1.211.195-.273-2.695-2.578-4.766-5.39-4.766-1.211 0-2.305.39-3.164 1.016v10.234c0 .625.508 1.094 1.094 1.094H21.2c1.54 0 2.8-1.25 2.8-2.812 0-1.524-1.25-2.96-2.8-2.96z"/>
    </svg>
  );
}

function SoundCloudCallbackLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center" style={{ background: "#08090d" }}>
      <div className="flex flex-col items-center gap-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(255,85,0,0.15)", border: "1px solid rgba(255,85,0,0.3)" }}>
          <SoundCloudIcon />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-base font-bold" style={{ color: "#eeeef5" }}>Đang xác thực với SoundCloud...</p>
          <p className="text-xs" style={{ color: "#6b6b88" }}>Vui lòng chờ trong giây lát</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#ff5500", animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function GitHubCallbackLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center" style={{ background: "#08090d" }}>
      <div className="flex flex-col items-center gap-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <GitHubIcon />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-base font-bold" style={{ color: "#eeeef5" }}>Đang xác thực với GitHub...</p>
          <p className="text-xs" style={{ color: "#6b6b88" }}>Vui lòng chờ trong giây lát</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#eeeef5", animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function UserAvatar({ user, size = 32 }: { user: UserProfile; size?: number }) {
  return user.avatar
    ? <img src={user.avatar} alt={user.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-full flex items-center justify-center font-bold shrink-0 select-none" style={{ width: size, height: size, background: "#00c896", color: "#020910", fontSize: size * 0.38 }}>{getInitials(user.name)}</div>;
}

function FormInput({ label, type = "text", value, onChange, placeholder, error, hint, rightEl, disabled }: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; hint?: string; rightEl?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "#eeeef5" }}>{label}</label>
      <div className="relative">
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
          className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
          style={{ background: disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)", border: `1px solid ${error ? "#ef4444" : "rgba(255,255,255,0.1)"}`, color: disabled ? "#6b6b88" : "#eeeef5", paddingRight: rightEl ? "2.5rem" : undefined }}
          onFocus={(e) => { if (!disabled) e.target.style.border = `1px solid ${error ? "#ef4444" : "rgba(0,200,150,0.5)"}`; }}
          onBlur={(e) => { e.target.style.border = `1px solid ${error ? "#ef4444" : "rgba(255,255,255,0.1)"}`; }}
        />
        {rightEl && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>}
      </div>
      {error && <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}><AlertTriangle size={10} />{error}</p>}
      {hint && !error && <p className="text-[11px] mt-1" style={{ color: "#6b6b88" }}>{hint}</p>}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, delta, color = "#00c896" }: { icon: React.ElementType; label: string; value: string; delta?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold" style={{ color: "#6b6b88" }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-extrabold mb-1 tracking-tight">{value}</p>
      {delta && <p className="text-[11px] flex items-center gap-1" style={{ color: "#00c896" }}><ArrowUpRight size={10} />{delta}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WAVEFORM
// ═══════════════════════════════════════════════════════════════════

function WaveformBars({ trackId, isActive, progress = 0, count = 48 }: { trackId: number; isActive: boolean; progress?: number; count?: number }) {
  const bars = useMemo(() => seededBars(trackId, count), [trackId, count]);
  const splitAt = Math.floor((progress / 100) * count);
  return (
    <div className="flex items-center gap-[2px] h-9 w-full">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 rounded-full transition-colors duration-75"
          style={{ height: `${h * 100}%`, background: isActive && i < splitAt ? "#00c896" : isActive ? "rgba(0,200,150,0.28)" : "rgba(255,255,255,0.13)" }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TRACK CARD
// ═══════════════════════════════════════════════════════════════════

function TrackCard({ track, isActive, isPlaying, onPlay, liked, onLike, progress, onBuy }: {
  track: Track; isActive: boolean; isPlaying: boolean; onPlay: () => void;
  liked: boolean; onLike: () => void; progress: number; onBuy: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="group relative rounded-xl overflow-hidden cursor-pointer select-none transition-all duration-200"
      style={{ borderWidth: "1px", borderStyle: "solid", borderColor: isActive ? "rgba(0,200,150,0.35)" : "rgba(255,255,255,0.07)", background: isActive ? "#0c1e18" : "#0f0f1a" }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onPlay}>
      <div className="relative aspect-square overflow-hidden bg-[#090912]">
        <img src={track.artwork} alt={track.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {track.isExclusive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-widest" style={{ background: "#8b5cf6", color: "#fff" }}>EXCLUSIVE</span>}
          {track.isNew && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-widest" style={{ background: "#00c896", color: "#020910" }}>NEW</span>}
        </div>
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-150" style={{ opacity: hovered || isActive ? 1 : 0 }}
          onClick={(e) => { e.stopPropagation(); onPlay(); }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-110"
            style={{ background: isActive && isPlaying ? "#00c896" : "rgba(255,255,255,0.92)", color: isActive && isPlaying ? "#020910" : "#000" }}>
            {isActive && isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
          </div>
        </div>
      </div>
      <div className="px-3 pt-2.5 transition-opacity duration-200" style={{ opacity: hovered || isActive ? 1 : 0.35 }}>
        <WaveformBars trackId={track.id} isActive={isActive} progress={isActive ? progress : 0} />
      </div>
      <div className="px-3 pt-2 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" style={{ color: isActive ? "#00c896" : "#eeeef5" }}>{track.title}</p>
            <p className="text-xs truncate mt-0.5" style={{ color: "#6b6b88" }}>{track.artist}</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onLike(); }} className="shrink-0 mt-0.5 transition-transform hover:scale-125">
            <Heart size={13} style={{ color: liked ? "#f87171" : "#6b6b88", fill: liked ? "#f87171" : "none" }} />
          </button>
        </div>
        <div className="flex gap-1.5 mb-2.5 flex-wrap" style={{ fontFamily: "'DM Mono', monospace", fontSize: 10 }}>
          {[`${track.bpm} BPM`, track.key, track.genre].map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b6b88" }}>{t}</span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "#6b6b88" }}>{formatK(track.plays)} plays</span>
          <button onClick={(e) => { e.stopPropagation(); onBuy(); }} className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all"
            style={{ color: "#00c896", background: "rgba(0,200,150,0.1)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#00c896"; e.currentTarget.style.color = "#020910"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,200,150,0.1)"; e.currentTarget.style.color = "#00c896"; }}>
            {formatVND(track.price)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PERSISTENT PLAYER
// ═══════════════════════════════════════════════════════════════════

function PersistentPlayer({ track, isPlaying, progress, volume, onPlayPause, onNext, onPrev, onProgressChange, onVolumeChange, onClose }: {
  track: Track | null; isPlaying: boolean; progress: number; volume: number;
  onPlayPause: () => void; onNext: () => void; onPrev: () => void;
  onProgressChange: (v: number) => void; onVolumeChange: (v: number) => void; onClose: () => void;
}) {
  if (!track) return null;
  const DURATION = 126;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[90]" style={{ background: "rgba(10,10,18,0.97)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.07)", height: 72 }}>
      <div className="max-w-7xl mx-auto h-full flex items-center gap-4 px-4">
        <img src={track.artwork} alt={track.title} className="w-10 h-10 rounded-lg object-cover shrink-0" />
        <div className="min-w-0 w-36 shrink-0 hidden sm:block">
          <p className="text-xs font-semibold truncate" style={{ color: "#eeeef5" }}>{track.title}</p>
          <p className="text-[10px] truncate" style={{ color: "#6b6b88" }}>{track.artist}</p>
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-center gap-4">
            <button onClick={onPrev} className="hover:opacity-70 transition-opacity"><SkipBack size={16} style={{ color: "#eeeef5" }} /></button>
            <button onClick={onPlayPause} className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-105" style={{ background: "#00c896", color: "#020910" }}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" style={{ marginLeft: 1 }} />}
            </button>
            <button onClick={onNext} className="hover:opacity-70 transition-opacity"><SkipForward size={16} style={{ color: "#eeeef5" }} /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] w-7 text-right shrink-0" style={{ color: "#6b6b88", fontFamily: "'DM Mono', monospace" }}>{fmtTime((progress / 100) * DURATION)}</span>
            <div className="flex-1 relative h-1 rounded-full cursor-pointer group" style={{ background: "rgba(255,255,255,0.1)" }}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onProgressChange(((e.clientX - r.left) / r.width) * 100); }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-full" style={{ width: `${progress}%`, background: "#00c896" }} />
            </div>
            <span className="text-[10px] w-7 shrink-0" style={{ color: "#6b6b88", fontFamily: "'DM Mono', monospace" }}>{fmtTime(DURATION)}</span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Volume2 size={14} style={{ color: "#6b6b88" }} />
          <input type="range" min={0} max={100} value={volume} onChange={(e) => onVolumeChange(Number(e.target.value))} className="w-20 accent-[#00c896]" />
        </div>
        <button onClick={onClose} className="hover:opacity-60 transition-opacity shrink-0" style={{ color: "#6b6b88" }}><X size={14} /></button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── GOOGLE AUTH COMPONENTS ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * OAuthCallbackLoading — shown while exchanging code with backend
 */
function OAuthCallbackLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center" style={{ background: "#08090d" }}>
      <div className="flex flex-col items-center gap-6">
        <svg width="48" height="48" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 29.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.8 20-21 0-1.4-.2-2.7-.5-4z"/>
          <path fill="#34A853" d="M6.3 14.7l7 5.1C15 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.7 0-14.3 4.6-17.7 11.7z"/>
          <path fill="#FBBC05" d="M24 45c5.5 0 10.5-1.9 14.3-5.1l-6.6-5.6C29.6 36 26.9 37 24 37c-5.1 0-9.4-3.1-11.4-7.6l-7 5.4C9.5 40.3 16.3 45 24 45z"/>
          <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.6 3-2.4 5.6-4.8 7.4l6.6 5.6C41.6 38.1 44.5 31.4 44.5 24c0-1.4-.2-2.7-.5-4z"/>
        </svg>
        <div className="flex flex-col items-center gap-2">
          <p className="text-base font-bold" style={{ color: "#eeeef5" }}>Đang xác thực với Google...</p>
          <p className="text-xs" style={{ color: "#6b6b88" }}>Vui lòng chờ trong giây lát</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#4285F4", animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}


/**
 * NewUserProfileModal
 * Shown after Google auth when backend returns is_new_user: true.
 * Collects: Phone + Country to complete the profile.
 */
function NewUserProfileModal({ user, onComplete, onSkip }: {
  user: UserProfile;
  onComplete: (phone: string, country: string) => void;
  onSkip: () => void;
}) {
  const [phone,   setPhone]   = useState("");
  const [country, setCountry] = useState("Việt Nam");
  const [dob, setDob]         = useState<DatePickerValue>({ day: "", month: "", year: "" });
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [blocked, setBlocked] = useState(false); // true when age < 13

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};

    // Date of birth — required for new users; must be ≥ 13 years old
    if (!dob.day || !dob.month || !dob.year) {
      errs.dob = "Vui lòng chọn đầy đủ ngày tháng năm sinh";
    } else {
      const dobStr = `${dob.year}-${dob.month.padStart(2, "0")}-${dob.day.padStart(2, "0")}`;
      const parsed = new Date(dobStr);
      if (isNaN(parsed.getTime())) {
        errs.dob = "Ngày sinh không hợp lệ";
      } else {
        const age = calcAge(dobStr);
        if (age < 13) {
          setBlocked(true);
          return;
        }
        if (age > 120) errs.dob = "Ngày sinh không hợp lệ";
      }
    }

    if (phone && !/^[+\d\s\-()]{8,15}$/.test(phone)) errs.phone = "Số điện thoại không hợp lệ";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    setTimeout(() => { setSaving(false); onComplete(phone, country); }, 700);
  }

  // ── Age gate: user is under 13 ─────────────────────────────────────────────
  if (blocked) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }} />
        <div className="relative w-full max-w-xs rounded-2xl p-8 flex flex-col items-center gap-5 text-center" style={{ background: "#10101e", border: "1px solid rgba(239,68,68,0.3)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
            <Lock size={24} style={{ color: "#ef4444" }} />
          </div>
          <div>
            <p className="font-extrabold text-base mb-2" style={{ color: "#ef4444" }}>Không đủ điều kiện đăng ký</p>
            <p className="text-sm" style={{ color: "#6b6b88", lineHeight: 1.6 }}>
              MathuatSound yêu cầu người dùng phải từ <strong style={{ color: "#eeeef5" }}>đủ 13 tuổi trở lên</strong> để tạo tài khoản theo quy định bảo vệ trẻ em (COPPA / GDPR-K).
            </p>
          </div>
          <button onClick={onSkip} className="w-full py-2.5 rounded-xl font-semibold text-sm" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
            Đóng
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} />
      <div className="relative w-full max-w-sm rounded-2xl p-6 flex flex-col gap-5" style={{ background: "#10101e", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Google success badge */}
        <div className="flex items-center gap-3">
          {user.avatar && <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover" />}
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <GoogleIcon />
              <span className="text-xs font-bold" style={{ color: "#34a853" }}>Xác thực thành công</span>
            </div>
            <p className="text-sm font-bold" style={{ color: "#eeeef5" }}>{user.name}</p>
            <p className="text-[11px]" style={{ color: "#6b6b88" }}>{user.email}</p>
          </div>
        </div>

        <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

        <div>
          <h2 className="font-extrabold text-base mb-1" style={{ letterSpacing: "-0.02em" }}>Hoàn thiện hồ sơ</h2>
          <p className="text-xs" style={{ color: "#6b6b88" }}>Bắt buộc điền ngày sinh để xác minh độ tuổi (phải từ đủ 13 tuổi)</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {/* Date of birth — required, age ≥ 13 */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#eeeef5" }}>
              <CalendarDays size={11} className="inline mr-1" />Ngày sinh <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <DatePickerField value={dob} onChange={setDob} error={errors.dob} />
            {!errors.dob && <p className="text-[10px] mt-1" style={{ color: "#6b6b88" }}>Phải từ đủ 13 tuổi trở lên để đăng ký</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#eeeef5" }}>
              <Phone size={11} className="inline mr-1" />Số điện thoại <span style={{ color: "#6b6b88" }}>(tuỳ chọn)</span>
            </label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+84 901 234 567"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${errors.phone ? "#ef4444" : "rgba(255,255,255,0.1)"}`, color: "#eeeef5" }}
              onFocus={(e) => { e.target.style.border = "1px solid rgba(0,200,150,0.5)"; }}
              onBlur={(e) => { e.target.style.border = `1px solid ${errors.phone ? "#ef4444" : "rgba(255,255,255,0.1)"}`; }} />
            {errors.phone && <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}><AlertTriangle size={10} />{errors.phone}</p>}
          </div>

          {/* Country */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#eeeef5" }}>
              <MapPin size={11} className="inline mr-1" />Quốc gia
            </label>
            <select value={country} onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all appearance-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }}
              onFocus={(e) => { e.target.style.border = "1px solid rgba(0,200,150,0.5)"; }}
              onBlur={(e) => { e.target.style.border = "1px solid rgba(255,255,255,0.1)"; }}>
              {COUNTRIES.map((c) => <option key={c} value={c} style={{ background: "#1a1a2d" }}>{c}</option>)}
            </select>
          </div>

          <button type="submit" disabled={saving} className="w-full py-3 rounded-xl font-bold text-sm transition-all mt-1"
            style={{ background: "#00c896", color: "#020910", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Đang lưu..." : "Hoàn tất & Vào Beat Store 🎵"}
          </button>
        </form>

        <button onClick={onSkip} className="text-center text-xs transition-colors" style={{ color: "#6b6b88" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#eeeef5"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#6b6b88"; }}>
          Bỏ qua, điền sau
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── TRADITIONAL AUTH COMPONENTS ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

/**
 * DatePickerField
 * Mobile-friendly three-select picker (Day / Month / Year).
 * Displays DD/MM/YYYY. Sends YYYY-MM-DD to backend.
 *
 * Validation rules:
 *   - Cannot select a future date
 *   - Shows warning if age < 13 (underage)
 *   - Error if age < 0 (impossible)
 */
interface DatePickerValue { day: string; month: string; year: string; }

function DatePickerField({ value, onChange, error }: {
  value: DatePickerValue;
  onChange: (v: DatePickerValue) => void;
  error?: string;
}) {
  const currentYear = 2026;
  const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i));

  const maxDay = value.month && value.year
    ? daysInMonth(Number(value.month), Number(value.year))
    : 31;
  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0"));

  // Determine age warning
  let ageWarning: string | null = null;
  let ageInfo: string | null = null;
  if (value.day && value.month && value.year) {
    const dobStr = `${value.year}-${value.month.padStart(2, "0")}-${value.day.padStart(2, "0")}`;
    const age = calcAge(dobStr);
    if (age < 0) ageWarning = "Ngày sinh không hợp lệ (không thể ở tương lai)";
    else if (age < 13) ageWarning = `Bạn ${age < 0 ? 0 : age} tuổi — cần đủ 13 tuổi để thực hiện giao dịch trên Beat Store`;
    else ageInfo = `${age} tuổi`;
  }

  // Prevent selecting future year/month/day combinations
  function isFutureDate(d: string, m: string, y: string) {
    if (!d || !m || !y) return false;
    const picked = new Date(Number(y), Number(m) - 1, Number(d));
    return picked > new Date();
  }

  const selectStyle = (hasError: boolean) => ({
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${hasError ? "#ef4444" : "rgba(255,255,255,0.1)"}`,
    color: "#eeeef5",
    appearance: "none" as const,
  });

  const focusStyle = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.target.style.border = "1px solid rgba(0,200,150,0.5)";
  };
  const blurStyle = (e: React.FocusEvent<HTMLSelectElement>, hasError: boolean) => {
    e.target.style.border = `1px solid ${hasError ? "#ef4444" : "rgba(255,255,255,0.1)"}`;
  };

  const hasError = !!(error || ageWarning);

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#eeeef5" }}>
        <CalendarDays size={11} /> Ngày sinh
      </label>
      <div className="grid grid-cols-3 gap-2">
        {/* Day */}
        <select value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value })}
          className="rounded-xl px-2 py-2.5 text-sm outline-none cursor-pointer"
          style={selectStyle(hasError)}
          onFocus={focusStyle}
          onBlur={(e) => blurStyle(e, hasError)}>
          <option value="" style={{ background: "#1a1a2d", color: "#6b6b88" }}>Ngày</option>
          {days.map((d) => {
            const future = isFutureDate(d, value.month, value.year);
            return <option key={d} value={d} disabled={future} style={{ background: "#1a1a2d" }}>{d}</option>;
          })}
        </select>
        {/* Month */}
        <select value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value, day: "" })}
          className="rounded-xl px-2 py-2.5 text-sm outline-none cursor-pointer"
          style={selectStyle(hasError)}
          onFocus={focusStyle}
          onBlur={(e) => blurStyle(e, hasError)}>
          <option value="" style={{ background: "#1a1a2d", color: "#6b6b88" }}>Tháng</option>
          {VN_MONTHS.map((m, i) => {
            const monthNum = i + 1;
            const future = value.year && monthNum > new Date().getMonth() + 1 && Number(value.year) >= currentYear;
            return <option key={i} value={String(monthNum)} disabled={!!future} style={{ background: "#1a1a2d" }}>{m}</option>;
          })}
        </select>
        {/* Year */}
        <select value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value, month: "", day: "" })}
          className="rounded-xl px-2 py-2.5 text-sm outline-none cursor-pointer"
          style={selectStyle(hasError)}
          onFocus={focusStyle}
          onBlur={(e) => blurStyle(e, hasError)}>
          <option value="" style={{ background: "#1a1a2d", color: "#6b6b88" }}>Năm</option>
          {years.map((y) => <option key={y} value={y} style={{ background: "#1a1a2d" }}>{y}</option>)}
        </select>
      </div>
      {/* Error / warning */}
      {(error || ageWarning) && (
        <p className="text-[11px] mt-1.5 flex items-start gap-1" style={{ color: "#f59e0b" }}>
          <AlertTriangle size={11} className="shrink-0 mt-px" />{error || ageWarning}
        </p>
      )}
      {/* Age info (valid age) */}
      {ageInfo && !ageWarning && !error && (
        <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: "#00c896" }}>
          <Check size={10} />{ageInfo} — Đủ điều kiện giao dịch
        </p>
      )}
      <p className="text-[10px] mt-1" style={{ color: "#6b6b88" }}>
        Định dạng hiển thị: DD/MM/YYYY · Gửi API: YYYY-MM-DD
      </p>
    </div>
  );
}

/**
 * BirthdayReminderModal
 * Shown after email login if user has no DOB stored (hasDob: false).
 * Encourages user to update DOB to receive birthday gifts.
 */
function BirthdayReminderModal({ userName, onUpdate, onSkip }: {
  userName: string;
  onUpdate: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }} onClick={onSkip} />
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "#10101e", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Birthday banner */}
        <div className="relative h-28 flex items-center justify-center overflow-hidden" style={{ background: "linear-gradient(135deg, #1a0d3d, #0d1a30)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 0%, rgba(139,92,246,0.4) 0%, transparent 70%)" }} />
          <div className="flex flex-col items-center gap-1 relative z-10">
            <Gift size={32} style={{ color: "#f59e0b" }} />
            <span className="text-3xl">🎂</span>
          </div>
          <button onClick={onSkip} className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)", color: "#eeeef5" }}>
            <X size={12} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <h3 className="font-extrabold text-base mb-1" style={{ letterSpacing: "-0.02em" }}>Nhận quà sinh nhật, {userName.split(" ").pop()}! 🎁</h3>
            <p className="text-xs leading-relaxed" style={{ color: "#6b6b88" }}>
              Hồ sơ của bạn chưa có ngày sinh. Cập nhật ngay để nhận <span style={{ color: "#f59e0b", fontWeight: 700 }}>ưu đãi giảm 30%</span> vào đúng ngày sinh nhật và thông báo khuyến mãi cá nhân hoá.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={onUpdate} className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", color: "#fff" }}>
              <CalendarDays size={14} /> Cập nhật ngày sinh ngay
            </button>
            <button onClick={onSkip} className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all" style={{ background: "rgba(255,255,255,0.05)", color: "#6b6b88" }}>
              Nhắc lại sau
            </button>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
            <Info size={12} style={{ color: "#f59e0b", flexShrink: 0 }} />
            <p className="text-[10px]" style={{ color: "#d97706" }}>Ngày sinh chỉ dùng cho ưu đãi sinh nhật, không hiển thị công khai.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AUTH MODAL (combines Google + Traditional flows)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// CHECKOUT MODAL
// ═══════════════════════════════════════════════════════════════════

function CheckoutModal({ track, adminPayment, onClose, onComplete }: {
  track: Track;
  adminPayment: AdminPaymentConfig;
  onClose: () => void;
  onComplete: (item: PurchasedItem) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [license, setLicense] = useState<LicenseType>("MP3");
  const [payMethod, setPayMethod] = useState<"QR" | "MOMO" | "CARD">("QR");
  const [confirming, setConfirming] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [copied, setCopied] = useState(false);
  const orderIdRef = useRef("ORD-" + Math.random().toString(36).substr(2, 6).toUpperCase());

  const LICENSE_OPTIONS: { key: LicenseType; label: string; desc: string; color: string; bg: string; multiplier: number }[] = [
    { key: "MP3", label: "MP3 — Bản nghe thử", desc: "Phát hành online, 50% bản quyền, không remix track", color: "#00c896", bg: "rgba(0,200,150,0.1)", multiplier: 1 },
    { key: "WAV", label: "WAV — Chất lượng studio", desc: "100% bản quyền thương mại cơ bản, file WAV gốc", color: "#3b82f6", bg: "rgba(59,130,246,0.1)", multiplier: 3 },
    { key: "BUNDLE", label: "WAV + STEMS — Trọn bộ", desc: "Full quyền + track tách nhạc cụ, hỗ trợ ưu tiên", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", multiplier: 5 },
  ];

  const selected = LICENSE_OPTIONS.find(o => o.key === license)!;
  const amount = Math.round(track.price * selected.multiplier);
  const platformFee = Math.round(amount * adminPayment.commission / 100);
  const producerEarns = amount - platformFee;
  const orderId = orderIdRef.current;
  const transferContent = `BSTORE ${orderId}`;
  const qrUrl = `${adminPayment.qrDataUrl.split("?")[0]}?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}`;

  function handleConfirm() {
    setConfirming(true);
    setCountdown(3);
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(iv);
          setConfirming(false);
          onComplete({
            orderId, track, license, amount,
            purchasedAt: new Date().toISOString(),
          });
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function copyContent() {
    navigator.clipboard?.writeText(transferContent).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const PAY_METHODS = [
    { key: "QR" as const, label: "Chuyển khoản QR", icon: QrCode, color: "#00c896" },
    { key: "MOMO" as const, label: "Ví MoMo", icon: Wallet, color: "#ae2d68" },
    { key: "CARD" as const, label: "Thẻ Visa/Master", icon: CreditCard, color: "#f59e0b" },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }} onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "#10101e", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "92vh", overflowY: "auto", scrollbarWidth: "none" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <img src={track.artwork} alt={track.title} className="w-10 h-10 rounded-lg object-cover" />
            <div>
              <p className="text-sm font-bold" style={{ color: "#eeeef5" }}>{track.title}</p>
              <p className="text-xs" style={{ color: "#6b6b88" }}>{track.artist}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "#6b6b88" }} className="hover:opacity-60"><X size={18} /></button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {[["1", "Giấy phép"], ["2", "Thanh toán"], ["3", "QR Code"]].map(([n, lbl], i) => (
            <div key={n} className="flex items-center gap-1.5 flex-1">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: step > i + 1 ? "#00c896" : step === i + 1 ? "#00c896" : "rgba(255,255,255,0.08)", color: step >= i + 1 ? "#020910" : "#6b6b88" }}>
                {step > i + 1 ? <Check size={10} /> : n}
              </div>
              <span className="text-[10px]" style={{ color: step === i + 1 ? "#eeeef5" : "#6b6b88" }}>{lbl}</span>
              {i < 2 && <div className="flex-1 h-px" style={{ background: step > i + 1 ? "#00c896" : "rgba(255,255,255,0.08)" }} />}
            </div>
          ))}
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* ── STEP 1: License ── */}
          {step === 1 && (
            <>
              <h3 className="font-extrabold text-base" style={{ letterSpacing: "-0.02em" }}>Chọn loại giấy phép</h3>
              <div className="flex flex-col gap-2.5">
                {LICENSE_OPTIONS.map(opt => (
                  <button key={opt.key} onClick={() => setLicense(opt.key)}
                    className="flex items-center gap-4 p-4 rounded-xl text-left transition-all"
                    style={{ background: license === opt.key ? opt.bg : "rgba(255,255,255,0.03)", border: `1px solid ${license === opt.key ? opt.color + "60" : "rgba(255,255,255,0.07)"}` }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: opt.bg }}>
                      <FileCheck size={16} style={{ color: opt.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: license === opt.key ? opt.color : "#eeeef5" }}>{opt.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "#6b6b88" }}>{opt.desc}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold" style={{ color: license === opt.key ? opt.color : "#eeeef5" }}>{formatVND(Math.round(track.price * opt.multiplier))}</p>
                      {license === opt.key && <Check size={14} className="ml-auto mt-1" style={{ color: opt.color }} />}
                    </div>
                  </button>
                ))}
              </div>
              {/* Price breakdown */}
              <div className="rounded-xl p-3 flex flex-col gap-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex justify-between text-xs"><span style={{ color: "#6b6b88" }}>Giá beat</span><span style={{ color: "#eeeef5" }}>{formatVND(amount)}</span></div>
                <div className="flex justify-between text-xs"><span style={{ color: "#6b6b88" }}>Phí nền tảng ({adminPayment.commission}%)</span><span style={{ color: "#f59e0b" }}>-{formatVND(platformFee)}</span></div>
                <div className="flex justify-between text-xs"><span style={{ color: "#6b6b88" }}>Producer nhận</span><span style={{ color: "#00c896" }}>+{formatVND(producerEarns)}</span></div>
                <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className="flex justify-between text-sm font-bold"><span>Tổng thanh toán</span><span style={{ color: selected.color }}>{formatVND(amount)}</span></div>
              </div>
              <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: selected.color, color: "#020910" }}>
                Tiếp tục →
              </button>
            </>
          )}

          {/* ── STEP 2: Payment method ── */}
          {step === 2 && (
            <>
              <h3 className="font-extrabold text-base" style={{ letterSpacing: "-0.02em" }}>Chọn phương thức thanh toán</h3>
              <div className="flex flex-col gap-2">
                {PAY_METHODS.map(m => (
                  <button key={m.key} onClick={() => setPayMethod(m.key)}
                    className="flex items-center gap-4 p-4 rounded-xl transition-all"
                    style={{ background: payMethod === m.key ? `rgba(${m.key === "QR" ? "0,200,150" : m.key === "MOMO" ? "174,45,104" : "245,158,11"},0.1)` : "rgba(255,255,255,0.03)", border: `1px solid ${payMethod === m.key ? m.color + "50" : "rgba(255,255,255,0.07)"}` }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: payMethod === m.key ? m.color + "22" : "rgba(255,255,255,0.05)" }}>
                      <m.icon size={16} style={{ color: m.color }} />
                    </div>
                    <span className="text-sm font-semibold flex-1 text-left" style={{ color: payMethod === m.key ? "#eeeef5" : "#6b6b88" }}>{m.label}</span>
                    {payMethod === m.key && <Check size={14} style={{ color: m.color }} />}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl font-semibold text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}>← Quay lại</button>
                <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl font-bold text-sm" style={{ background: "#00c896", color: "#020910" }}>
                  {payMethod === "QR" ? "Xem mã QR →" : "Thanh toán ngay →"}
                </button>
              </div>
            </>
          )}

          {/* ── STEP 3: QR / Confirm ── */}
          {step === 3 && (
            <>
              <div className="text-center">
                <h3 className="font-extrabold text-base mb-0.5" style={{ letterSpacing: "-0.02em" }}>
                  {payMethod === "QR" ? "Quét mã QR để thanh toán" : "Đang chuyển hướng..."}
                </h3>
                <p className="text-xs" style={{ color: "#6b6b88" }}>Mã đơn hàng: <strong style={{ color: "#eeeef5" }}>{orderId}</strong></p>
              </div>

              {payMethod === "QR" && (
                <>
                  {/* QR image */}
                  <div className="flex flex-col items-center gap-3">
                    <ImageWithFallback src={newPaymentQr} alt="QR code thanh toán" className="w-56 rounded-2xl object-contain" />
                    {/* Payment info */}
                    <div className="w-full rounded-xl p-3 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#6b6b88" }}>Người nhận</span>
                        <span className="font-bold" style={{ color: "#eeeef5" }}>LE HAI ANH</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "#6b6b88" }}>Số tiền</span>
                        <span className="font-bold text-sm" style={{ color: "#00c896" }}>{formatVND(amount)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span style={{ color: "#6b6b88" }}>Nội dung CK</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold px-2 py-0.5 rounded" style={{ background: "rgba(0,200,150,0.1)", color: "#00c896", fontFamily: "'DM Mono', monospace" }}>{transferContent}</span>
                          <button onClick={copyContent} className="p-1 rounded hover:opacity-70" style={{ color: copied ? "#00c896" : "#6b6b88" }}>
                            {copied ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Confirm / Webhook simulation */}
              <button onClick={handleConfirm} disabled={confirming}
                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all"
                style={{ background: confirming ? "rgba(0,200,150,0.2)" : "#00c896", color: confirming ? "#00c896" : "#020910" }}>
                {confirming
                  ? <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10" /></svg>
                      Đang xác thực giao dịch... {countdown}s
                    </span>
                  : "✓ Xác nhận đã chuyển khoản"
                }
              </button>
              <button onClick={() => setStep(2)} className="text-center text-xs w-full" style={{ color: "#6b6b88" }}>← Đổi phương thức</button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DOWNLOAD MODAL  (post-purchase)
// ═══════════════════════════════════════════════════════════════════

function DownloadModal({ item, onClose }: { item: PurchasedItem; onClose: () => void }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const FILES: { type: string; size: string; color: string; bg: string }[] = [
    { type: "MP3", size: "12.4 MB", color: "#00c896", bg: "rgba(0,200,150,0.1)" },
    ...(item.license === "WAV" || item.license === "BUNDLE"
      ? [{ type: "WAV", size: "148.2 MB", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" }] : []),
    ...(item.license === "BUNDLE"
      ? [{ type: "STEMS", size: "285.7 MB", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)" }] : []),
  ];

  function simulateDownload(type: string) {
    setDownloading(type);
    setTimeout(() => { setDownloading(null); toast.success(`Tải ${type} thành công! Kiểm tra thư mục Downloads.`); }, 1600);
  }

  const licenseColor = item.license === "MP3" ? "#00c896" : item.license === "WAV" ? "#3b82f6" : "#8b5cf6";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(16px)" }} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden" style={{ background: "#10101e", border: "1px solid rgba(255,255,255,0.1)" }}>

        {/* Success banner */}
        <div className="px-6 py-5 flex items-center gap-4" style={{ background: "linear-gradient(135deg, rgba(0,200,150,0.12), rgba(0,200,150,0.04))", borderBottom: "1px solid rgba(0,200,150,0.15)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(0,200,150,0.2)" }}>
            <Check size={22} style={{ color: "#00c896" }} />
          </div>
          <div>
            <p className="font-extrabold text-base" style={{ letterSpacing: "-0.02em" }}>Thanh toán thành công! 🎉</p>
            <p className="text-xs mt-0.5" style={{ color: "#6b6b88" }}>Mã đơn: <strong style={{ color: "#00c896", fontFamily: "'DM Mono', monospace" }}>{item.orderId}</strong></p>
          </div>
          <button onClick={onClose} className="ml-auto hover:opacity-60"><X size={18} style={{ color: "#6b6b88" }} /></button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Track info */}
          <div className="flex items-center gap-3">
            <img src={item.track.artwork} alt={item.track.title} className="w-14 h-14 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{item.track.title}</p>
              <p className="text-xs" style={{ color: "#6b6b88" }}>{item.track.artist}</p>
              <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: licenseColor + "20", color: licenseColor }}>
                Giấy phép: {item.license === "BUNDLE" ? "WAV + STEMS" : item.license}
              </span>
            </div>
          </div>

          {/* Download buttons */}
          <div>
            <p className="text-xs font-bold mb-3 uppercase tracking-widest" style={{ color: "#6b6b88" }}>Tải file gốc</p>
            <div className="flex flex-col gap-2">
              {FILES.map(f => (
                <button key={f.type} onClick={() => simulateDownload(f.type)}
                  disabled={downloading === f.type}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{ background: f.bg, border: `1px solid ${f.color}30` }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: f.color + "22" }}>
                    {downloading === f.type
                      ? <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={f.color} strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" /></svg>
                      : <Download size={14} style={{ color: f.color }} />}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold" style={{ color: f.color }}>{f.type}</p>
                    <p className="text-[10px]" style={{ color: "#6b6b88" }}>{f.size} · Lưu trữ nội bộ MathuatSound</p>
                  </div>
                  <ExternalLink size={12} style={{ color: f.color + "80" }} />
                </button>
              ))}
            </div>
          </div>

          {/* License certificate */}
          <div>
            <p className="text-xs font-bold mb-3 uppercase tracking-widest" style={{ color: "#6b6b88" }}>Giấy chứng nhận bản quyền</p>
            <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {/* Certificate header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "#00c896" }}>
                    <Music size={11} style={{ color: "#020910" }} />
                  </div>
                  <span className="text-xs font-extrabold" style={{ color: "#00c896" }}>MathuatSound</span>
                </div>
                <span className="text-[10px]" style={{ color: "#6b6b88", fontFamily: "'DM Mono', monospace" }}>LICENSE CERT</span>
              </div>
              <div className="h-px" style={{ background: "rgba(0,200,150,0.2)" }} />
              {[
                ["Beat", item.track.title],
                ["Nghệ sĩ sản xuất", item.track.artist],
                ["Loại giấy phép", item.license === "BUNDLE" ? "WAV + STEMS Bundle" : item.license],
                ["Người mua", "Tài khoản đã xác thực"],
                ["Mã đơn hàng", item.orderId],
                ["Ngày cấp", new Date(item.purchasedAt).toLocaleDateString("vi-VN")],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span style={{ color: "#6b6b88" }}>{k}</span>
                  <span className="font-semibold text-right max-w-[60%] truncate" style={{ color: "#eeeef5" }}>{v}</span>
                </div>
              ))}
              <div className="h-px mt-1" style={{ background: "rgba(255,255,255,0.07)" }} />
              <button onClick={() => toast.success("Đang tải Certificate PDF...")}
                className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all"
                style={{ background: "rgba(0,200,150,0.08)", color: "#00c896" }}>
                <Receipt size={12} /> Tải Certificate PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type AuthTab = "login" | "register";

function AuthModal({ isOpen, defaultTab, onClose, onSuccess }: {
  isOpen: boolean;
  defaultTab: AuthTab;
  onClose: () => void;
  onSuccess: (u: UserProfile) => void;
}) {
  const [tab, setTab] = useState<AuthTab>(defaultTab);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Login fields ──
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // ── Register fields ──
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regDob, setRegDob] = useState<DatePickerValue>({ day: "", month: "", year: "" });
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regRole, setRegRole] = useState<UserRole>("user");
  const [regBio, setRegBio] = useState("");

  function reset() {
    setTab(defaultTab); setStep(1); setErrors({}); setSubmitting(false); setShowPass(false); setShowConfirm(false);
    setLoginEmail(""); setLoginPass("");
    setRegName(""); setRegPhone(""); setRegDob({ day: "", month: "", year: "" });
    setRegEmail(""); setRegPass(""); setRegConfirm(""); setRegRole("user"); setRegBio("");
  }

  useEffect(() => { if (isOpen) reset(); }, [isOpen, defaultTab]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (isOpen) window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Validate DOB field ──
  function validateDob(dob: DatePickerValue): string | null {
    if (!dob.day || !dob.month || !dob.year) return "Vui lòng chọn đầy đủ ngày tháng năm sinh";
    const dobStr = `${dob.year}-${dob.month.padStart(2, "0")}-${dob.day.padStart(2, "0")}`;
    const parsed = new Date(dobStr);
    if (isNaN(parsed.getTime())) return "Ngày sinh không hợp lệ";
    if (parsed > new Date()) return "Ngày sinh không thể ở tương lai";
    const age = calcAge(dobStr);
    if (age < 13) return "Bạn phải từ 13 tuổi trở lên để tham gia Beat Store";
    return null;
  }

  // ── Login submit ──
  function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!loginEmail.trim()) errs.email = "Vui lòng nhập email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) errs.email = "Email không hợp lệ";
    if (!loginPass || loginPass.length < 6) errs.pass = "Mật khẩu tối thiểu 6 ký tự";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      // Simulate: existing user without DOB (hasDob: false triggers reminder)
      const user: UserProfile = {
        id: "e_" + Date.now(), name: loginEmail.split("@")[0], email: loginEmail,
        role: "user", bio: "", phone: "", location: "", country: "Việt Nam",
        joinedAt: new Date().toISOString(), isVerified: false, authProvider: "email",
        hasDob: false,
      };
      onSuccess(user); onClose(); toast.success("Đăng nhập thành công! 🎵");
    }, 900);
  }

  // ── Register step 1: name, phone, dob, email, password ──
  function handleStep1Next(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!regName.trim()) errs.name = "Vui lòng nhập họ tên";
    if (regPhone && !/^[+\d\s\-()]{8,15}$/.test(regPhone)) errs.phone = "Số điện thoại không hợp lệ";
    const dobErr = validateDob(regDob);
    if (dobErr) errs.dob = dobErr;
    if (!regEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) errs.email = "Email không hợp lệ";
    if (!regPass || regPass.length < 8) errs.pass = "Mật khẩu tối thiểu 8 ký tự";
    if (regConfirm !== regPass) errs.confirm = "Mật khẩu không khớp";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({}); setStep(2);
  }

  // ── Register step 2 final submit ──
  function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const dobStr = regDob.day && regDob.month && regDob.year
      ? `${regDob.year}-${regDob.month.padStart(2, "0")}-${regDob.day.padStart(2, "0")}`
      : undefined;
    setTimeout(() => {
      setSubmitting(false);
      const user: UserProfile = {
        id: "e_" + Date.now(),
        name: regName, email: regEmail,
        role: regRole, bio: regBio, phone: regPhone, location: "", country: "Việt Nam",
        dob: dobStr, hasDob: !!dobStr,
        joinedAt: new Date().toISOString(), isVerified: false, authProvider: "email",
      };
      onSuccess(user); onClose(); toast.success(`Đăng ký thành công! Chào mừng ${user.name} 🎉`);
    }, 900);
  }

  const GoogleBtn = ({ label }: { label: string }) => (
    <div className="flex flex-col gap-1.5">
      <button onClick={() => { startGoogleOAuth(); onClose(); }}
        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#fff", color: "#1f1f1f" }}>
        <GoogleIcon />{label}
      </button>
      <p className="text-center text-[11px]" style={{ color: "#6b6b88" }}>
        Bằng cách tiếp tục, bạn đồng ý với{" "}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline" style={{ color: "#00c896" }}>Chính sách bảo mật</a>
        {" "}và{" "}
        <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline" style={{ color: "#00c896" }}>Điều khoản dịch vụ</a>
      </p>
    </div>
  );

  const SoundCloudBtn = ({ action, label }: { action: "login" | "register"; label: string }) => {
    const url = buildSoundCloudAuthUrl(action);
    return (
      <a href={url} target="_top" rel="noopener noreferrer"
        onClick={(e) => { e.preventDefault(); onClose(); startSoundCloudOAuth(action); }}
        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:brightness-110 active:scale-[0.98] no-underline"
        style={{ background: "#ff5500", color: "#fff" }}>
        <SoundCloudIcon />{label}
      </a>
    );
  };

  const GitHubBtn = ({ action, label }: { action: "login" | "register"; label: string }) => {
    const url = buildGitHubAuthUrl(action);
    return (
      <a href={url} target="_top" rel="noopener noreferrer"
        onClick={(e) => { e.preventDefault(); onClose(); startGitHubOAuth(action); }}
        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:brightness-125 active:scale-[0.98] no-underline"
        style={{ background: "#24292e", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}>
        <GitHubIcon />{label}
      </a>
    );
  };

  const Divider = () => (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.09)" }} />
      <span className="text-xs" style={{ color: "#6b6b88" }}>hoặc bằng email</span>
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.09)" }} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-y-auto" style={{ background: "#10101e", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "92vh", scrollbarWidth: "none" }}>

        {/* Logo + Close */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#00c896" }}><Music size={13} style={{ color: "#020910" }} /></div>
            <span className="font-extrabold text-sm">mathuat<span style={{ color: "#00c896" }}>sound</span></span>
          </div>
          <button onClick={onClose} style={{ color: "#6b6b88" }} className="hover:opacity-60 transition-opacity"><X size={18} /></button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 mb-5">
          <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", padding: 4 }}>
            {(["login", "register"] as AuthTab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setStep(1); setErrors({}); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ background: tab === t ? "#00c896" : "transparent", color: tab === t ? "#020910" : "#6b6b88" }}>
                {t === "login" ? "Đăng nhập" : "Đăng ký"}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4">

          {/* ══ LOGIN ══ */}
          {tab === "login" && (
            <>
              <div>
                <h2 className="text-xl font-extrabold mb-0.5" style={{ letterSpacing: "-0.02em" }}>Chào mừng trở lại</h2>
                <p className="text-sm" style={{ color: "#6b6b88" }}>Đăng nhập để tiếp tục khám phá âm nhạc</p>
              </div>
              <GoogleBtn label="Tiếp tục với Google" />
              <GitHubBtn action="login" label="Tiếp tục với GitHub" />
              <SoundCloudBtn action="login" label="Tiếp tục với SoundCloud" />
              <Divider />
              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3.5">
                <FormInput label="Email" type="email" value={loginEmail} onChange={setLoginEmail} placeholder="ten@gmail.com" error={errors.email} />
                <FormInput label="Mật khẩu" type={showPass ? "text" : "password"} value={loginPass} onChange={setLoginPass} placeholder="••••••••" error={errors.pass}
                  rightEl={<button type="button" onClick={() => setShowPass((p) => !p)} style={{ color: "#6b6b88" }}>{showPass ? <EyeOff size={14} /> : <Eye size={14} />}</button>} />
                <div className="flex justify-end">
                  <button type="button" className="text-xs font-medium" style={{ color: "#00c896" }}>Quên mật khẩu?</button>
                </div>
                <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl font-bold text-sm transition-all"
                  style={{ background: "#00c896", color: "#020910", opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
                </button>
              </form>
              <p className="text-center text-sm" style={{ color: "#6b6b88" }}>
                Chưa có tài khoản? <button onClick={() => { setTab("register"); setErrors({}); }} className="font-semibold" style={{ color: "#00c896" }}>Đăng ký miễn phí</button>
              </p>
            </>
          )}

          {/* ══ REGISTER — Step 1: Credentials + Personal Info ══ */}
          {tab === "register" && step === 1 && (
            <>
              <div>
                <h2 className="text-xl font-extrabold mb-0.5" style={{ letterSpacing: "-0.02em" }}>Tạo tài khoản</h2>
                <p className="text-sm" style={{ color: "#6b6b88" }}>Bước 1/2 — Thông tin cá nhân</p>
              </div>
              <GoogleBtn label="Tiếp tục với Google" />
              <GitHubBtn action="register" label="Tiếp tục với GitHub" />
              <SoundCloudBtn action="register" label="Tiếp tục với SoundCloud" />
              <Divider />
              <form onSubmit={handleStep1Next} className="flex flex-col gap-3.5">
                {/* Personal fields */}
                <FormInput label="Họ và tên *" value={regName} onChange={setRegName} placeholder="Nguyễn Văn A" error={errors.name} />

                <div>
                  <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: "#eeeef5" }}>
                    <Phone size={11} />Số điện thoại <span style={{ color: "#6b6b88", fontWeight: 400 }}>(tuỳ chọn)</span>
                  </label>
                  <input type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="+84 901 234 567"
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                    style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${errors.phone ? "#ef4444" : "rgba(255,255,255,0.1)"}`, color: "#eeeef5" }}
                    onFocus={(e) => { e.target.style.border = "1px solid rgba(0,200,150,0.5)"; }}
                    onBlur={(e) => { e.target.style.border = `1px solid ${errors.phone ? "#ef4444" : "rgba(255,255,255,0.1)"}`; }} />
                  {errors.phone && <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}><AlertTriangle size={10} />{errors.phone}</p>}
                </div>

                {/* DOB picker with age validation */}
                <DatePickerField value={regDob} onChange={setRegDob} error={errors.dob} />

                <div className="h-px" style={{ background: "rgba(255,255,255,0.07)" }} />

                {/* Account credentials */}
                <FormInput label="Email *" type="email" value={regEmail} onChange={setRegEmail} placeholder="ten@gmail.com" error={errors.email} />
                <FormInput label="Mật khẩu *" type={showPass ? "text" : "password"} value={regPass} onChange={setRegPass} placeholder="Tối thiểu 8 ký tự" error={errors.pass}
                  hint={!errors.pass ? "Dùng chữ hoa, số và ký tự đặc biệt" : undefined}
                  rightEl={<button type="button" onClick={() => setShowPass((p) => !p)} style={{ color: "#6b6b88" }}>{showPass ? <EyeOff size={14} /> : <Eye size={14} />}</button>} />
                <FormInput label="Xác nhận mật khẩu *" type={showConfirm ? "text" : "password"} value={regConfirm} onChange={setRegConfirm} placeholder="Nhập lại mật khẩu" error={errors.confirm}
                  rightEl={<button type="button" onClick={() => setShowConfirm((p) => !p)} style={{ color: "#6b6b88" }}>{showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}</button>} />

                <button type="submit" className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: "#00c896", color: "#020910" }}>
                  Tiếp theo <ChevronRight size={15} />
                </button>
              </form>
              <p className="text-center text-sm" style={{ color: "#6b6b88" }}>
                Đã có tài khoản? <button onClick={() => { setTab("login"); setErrors({}); }} className="font-semibold" style={{ color: "#00c896" }}>Đăng nhập</button>
              </p>
            </>
          )}

          {/* ══ REGISTER — Step 2: Role + Bio ══ */}
          {tab === "register" && step === 2 && (
            <>
              <div>
                <h2 className="text-xl font-extrabold mb-0.5" style={{ letterSpacing: "-0.02em" }}>Hoàn thiện hồ sơ</h2>
                <p className="text-sm" style={{ color: "#6b6b88" }}>Bước 2/2 — Vai trò & giới thiệu</p>
              </div>

              {/* Role picker */}
              <div>
                <p className="text-xs font-semibold mb-2.5" style={{ color: "#eeeef5" }}>Bạn là ai? *</p>
                <div className="grid grid-cols-2 gap-2">
                  {REGISTER_ROLES.map((r) => (
                    <button key={r.value} type="button" onClick={() => setRegRole(r.value)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                      style={{ background: regRole === r.value ? "rgba(0,200,150,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${regRole === r.value ? "rgba(0,200,150,0.4)" : "rgba(255,255,255,0.08)"}` }}>
                      <span className="text-base">{r.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: regRole === r.value ? "#00c896" : "#eeeef5" }}>{r.label}</p>
                        <p className="text-[10px] truncate" style={{ color: "#6b6b88" }}>{r.desc}</p>
                      </div>
                      {regRole === r.value && <Check size={12} className="shrink-0 ml-auto" style={{ color: "#00c896" }} />}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: "#eeeef5" }}>Giới thiệu bản thân</label>
                  <textarea value={regBio} onChange={(e) => setRegBio(e.target.value)} placeholder="Nói vài điều về bạn..." rows={3}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }}
                    onFocus={(e) => { e.target.style.border = "1px solid rgba(0,200,150,0.5)"; }}
                    onBlur={(e) => { e.target.style.border = "1px solid rgba(255,255,255,0.1)"; }} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl font-semibold text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}>
                    ← Quay lại
                  </button>
                  <button type="submit" disabled={submitting} className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
                    style={{ background: "#00c896", color: "#020910", opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? "Đang tạo..." : "Tạo tài khoản 🎉"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SMART UPLOAD FORM  (Producer) — 3 Dropzone version
// ═══════════════════════════════════════════════════════════════════

type SlotKey = "mp3" | "wav" | "stems";

interface UploadSlot {
  name: string;
  sizeMB: string;
  progress: number; // 0-100
  done: boolean;
  file: File | null;
}

const FAKE_FILES = [
  { name: "saigon_flow_preview.mp3",  size: "8.4 MB",   ext: "mp3",  slot: "mp3"   as SlotKey, date: "18/08/2026" },
  { name: "saigon_flow_master.wav",   size: "42.1 MB",  ext: "wav",  slot: "wav"   as SlotKey, date: "18/08/2026" },
  { name: "saigon_flow_stems.zip",    size: "156.3 MB", ext: "zip",  slot: "stems" as SlotKey, date: "18/08/2026" },
  { name: "midnight_redux.mp3",       size: "7.2 MB",   ext: "mp3",  slot: "mp3"   as SlotKey, date: "17/08/2026" },
  { name: "chill_vn_master.wav",      size: "38.9 MB",  ext: "wav",  slot: "wav"   as SlotKey, date: "16/08/2026" },
  { name: "trap_hcm_stems.rar",       size: "204.7 MB", ext: "rar",  slot: "stems" as SlotKey, date: "15/08/2026" },
];

function SimulatedFilePicker({
  onSelect, onCancel,
}: {
  onSelect: (picked: typeof FAKE_FILES) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [folder, setFolder] = useState("Nhạc");

  function toggle(i: number, e: React.MouseEvent) {
    setSelected(prev => {
      const next = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        next.has(i) ? next.delete(i) : next.add(i);
      } else {
        next.clear();
        next.add(i);
      }
      return next;
    });
  }

  const selectedFiles = FAKE_FILES.filter((_, i) => selected.has(i));
  const fileNameStr = selectedFiles.map(f => f.name).join(", ") || "";

  const folderColors: Record<string, string> = { Desktop: "#f59e0b", "Nhạc": "#00c896", "Tải về": "#3b82f6", Stems: "#8b5cf6" };

  const extIcon: Record<string, string> = { mp3: "🎵", wav: "🎶", zip: "📦", rar: "📦" };
  const extColor: Record<string, string> = { mp3: "#00c896", wav: "#3b82f6", zip: "#8b5cf6", rar: "#8b5cf6" };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}>

      <div className="flex flex-col rounded-xl overflow-hidden shadow-2xl"
        style={{ width: 720, maxHeight: "80vh", background: "#1a1a2d", border: "1px solid rgba(255,255,255,0.12)" }}>

        {/* ── Title bar ── */}
        <div className="flex items-center justify-between px-4 py-2.5 select-none"
          style={{ background: "#13131f", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2">
            <span className="text-sm">📂</span>
            <span className="text-xs font-semibold" style={{ color: "#eeeef5" }}>Mở File Beat — Chọn file âm thanh</span>
          </div>
          <div className="flex gap-1.5">
            {["─", "□", "✕"].map((ch, idx) => (
              <button key={idx} onClick={idx === 2 ? onCancel : undefined}
                className="w-7 h-6 rounded text-[11px] flex items-center justify-center transition-colors"
                style={{ color: "#6b6b88", background: "rgba(255,255,255,0.04)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = idx === 2 ? "#ef4444" : "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#eeeef5"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "#6b6b88"; }}>
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* ── Address bar ── */}
        <div className="flex items-center gap-2 px-4 py-2" style={{ background: "#13131f", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {["←", "→", "↑"].map((ch, i) => (
            <button key={i} className="w-6 h-6 rounded text-xs flex items-center justify-center" style={{ color: "#6b6b88", background: "rgba(255,255,255,0.04)" }}>{ch}</button>
          ))}
          <div className="flex-1 flex items-center gap-1 px-3 py-1 rounded-md text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}>
            <span style={{ color: "#6b6b88" }}>Máy tính</span>
            <span style={{ color: "#6b6b88" }}> › </span>
            <span style={{ color: "#6b6b88" }}>{folder}</span>
            <span style={{ color: "#6b6b88" }}> › </span>
            <span>Beats</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "#6b6b88" }}>
            <Search size={11} /> Tìm kiếm
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 280 }}>

          {/* Left panel */}
          <div className="flex flex-col gap-0.5 p-3 shrink-0" style={{ width: 160, background: "#111120", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#4b4b6b" }}>Truy cập nhanh</p>
            {(["Desktop", "Nhạc", "Tải về", "Stems"] as const).map(f => (
              <button key={f} onClick={() => setFolder(f)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all text-left w-full"
                style={{ background: folder === f ? `${folderColors[f]}18` : "transparent", color: folder === f ? folderColors[f] : "#6b6b88" }}>
                <span>{f === "Desktop" ? "🖥️" : f === "Nhạc" ? "🎵" : f === "Tải về" ? "⬇️" : "📦"}</span>
                {f}
              </button>
            ))}
            <div className="mt-3 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <p className="text-[10px] font-semibold uppercase tracking-wider mt-2 mb-1" style={{ color: "#4b4b6b" }}>Máy tính</p>
            {["Ổ C:", "Ổ D:"].map(d => (
              <button key={d} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left w-full" style={{ color: "#6b6b88" }}>
                <span>💾</span>{d}
              </button>
            ))}
          </div>

          {/* File list */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Column headers */}
            <div className="flex items-center px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#4b4b6b", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span className="flex-1">Tên file</span>
              <span className="w-24 text-right">Ngày sửa</span>
              <span className="w-16 text-center">Loại</span>
              <span className="w-20 text-right pr-2">Kích thước</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {FAKE_FILES.map((f, i) => {
                const isSel = selected.has(i);
                return (
                  <div key={i} onClick={(e) => toggle(i, e)}
                    className="flex items-center px-3 py-2 cursor-pointer select-none transition-colors"
                    style={{ background: isSel ? `${extColor[f.ext]}22` : "transparent" }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <span className="text-base shrink-0">{extIcon[f.ext]}</span>
                      <span className="text-xs truncate" style={{ color: isSel ? "#eeeef5" : "#c4c4d4" }}>{f.name}</span>
                    </div>
                    <span className="w-24 text-right text-[11px] shrink-0" style={{ color: "#6b6b88" }}>{f.date}</span>
                    <span className="w-16 text-center shrink-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: `${extColor[f.ext]}22`, color: extColor[f.ext] }}>{f.ext}</span>
                    </span>
                    <span className="w-20 text-right pr-2 text-[11px] shrink-0" style={{ color: "#6b6b88" }}>{f.size}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="flex flex-col gap-2 px-4 py-3" style={{ background: "#13131f", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <span className="text-xs shrink-0" style={{ color: "#6b6b88" }}>Tên file:</span>
            <input readOnly value={fileNameStr}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs shrink-0" style={{ color: "#6b6b88" }}>Loại file:</span>
            <div className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }}>
              <span>Nhạc & File nén (*.mp3, *.wav, *.zip, *.rar)</span>
              <ChevronDown size={12} style={{ color: "#6b6b88" }} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={onCancel}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}>
                Hủy
              </button>
              <button onClick={() => selectedFiles.length > 0 && onSelect(selectedFiles)}
                className="px-5 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ background: selectedFiles.length > 0 ? "#00c896" : "rgba(255,255,255,0.1)", color: selectedFiles.length > 0 ? "#020910" : "#4b4b6b" }}>
                Mở ({selectedFiles.length || 0})
              </button>
            </div>
          </div>
          <p className="text-[10px] text-center" style={{ color: "#4b4b6b" }}>
            Giữ Ctrl để chọn nhiều file · Chọn đủ MP3 + WAV + STEMS để xuất bản beat
          </p>
        </div>
      </div>
    </div>
  );
}

function useUploadSlot() {
  const [slot, setSlot] = useState<UploadSlot | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startUpload(file: File) {
    const sizeMB = (file.size / 1048576).toFixed(1);
    // If size is 0 (fake file in browser), show a random size for demo
    const displayMB = file.size === 0 ? (Math.random() * 20 + 2).toFixed(1) : sizeMB;
    setSlot({ name: file.name, sizeMB: displayMB, progress: 0, done: false, file });
    if (timerRef.current) clearInterval(timerRef.current);
    let pct = 0;
    timerRef.current = setInterval(() => {
      pct += Math.random() * 14 + 4;
      if (pct >= 100) {
        pct = 100;
        clearInterval(timerRef.current!);
        setSlot(s => s ? { ...s, progress: 100, done: true } : s);
      } else {
        setSlot(s => s ? { ...s, progress: Math.round(pct) } : s);
      }
    }, 160);
  }

  function clear() {
    if (timerRef.current) clearInterval(timerRef.current);
    setSlot(null);
  }

  return { slot, startUpload, clear };
}

function DropZone({
  slotKey, label, accept, accentColor, accentBg, tagLabel, helpText,
  slot, onFile, onClear,
}: {
  slotKey: SlotKey; label: string; accept: string;
  accentColor: string; accentBg: string; tagLabel: string; helpText: string;
  slot: UploadSlot | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const borderColor = dragOver ? accentColor : slot?.done ? accentColor : "rgba(255,255,255,0.12)";
  const bgColor = dragOver ? `${accentBg}22` : slot?.done ? `${accentBg}11` : "rgba(255,255,255,0.02)";

  return (
    <div className="rounded-2xl flex flex-col transition-all" style={{ border: `2px dashed ${borderColor}`, background: bgColor }}>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />

      {/* Header label */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: accentBg, color: accentColor }}>
            {tagLabel}
          </span>
          <span className="text-sm font-semibold" style={{ color: "#eeeef5" }}>{label}</span>
        </div>
        {slot?.done && (
          <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: accentColor }}>
            <Check size={12} /> Đã tải lên
          </span>
        )}
        {slot && !slot.done && (
          <span className="text-[11px]" style={{ color: "#6b6b88" }}>Đang tải...</span>
        )}
      </div>

      {slot ? (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* File info row */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: accentBg }}>
              {slotKey === "stems" ? <Archive size={14} style={{ color: accentColor }} /> : <Music size={14} style={{ color: accentColor }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "#eeeef5" }}>{slot.name}</p>
              <p className="text-[10px]" style={{ color: "#6b6b88" }}>{slot.sizeMB} MB</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-[10px] px-2 py-1 rounded-lg hover:opacity-70 transition-opacity"
              style={{ color: "#6b6b88", background: "rgba(255,255,255,0.06)" }}>
              Xoá
            </button>
          </div>
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px]" style={{ color: "#6b6b88" }}>
                {slot.done ? "Lưu trữ nội bộ ✓" : `Đang tải lên máy chủ...`}
              </span>
              <span className="text-[10px] font-bold" style={{ color: slot.done ? accentColor : "#6b6b88" }}>
                {slot.progress}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-200"
                style={{ width: `${slot.progress}%`, background: slot.done ? accentColor : `linear-gradient(90deg, ${accentColor}88, ${accentColor})` }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-8 cursor-pointer"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
          onClick={() => inputRef.current?.click()}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: accentBg }}>
            <Upload size={18} style={{ color: accentColor }} />
          </div>
          <div className="text-center px-4">
            <p className="text-xs font-semibold mb-0.5" style={{ color: "#eeeef5" }}>Kéo thả hoặc nhấn để chọn</p>
            <p className="text-[11px]" style={{ color: "#6b6b88" }}>{helpText}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SmartUploadForm({ autoOpen = false }: { autoOpen?: boolean }) {
  const mp3Slot = useUploadSlot();
  const wavSlot = useUploadSlot();
  const stemsSlot = useUploadSlot();

  const [title, setTitle] = useState("");
  const [mp3Price, setMp3Price] = useState("");
  const [wavPrice, setWavPrice] = useState("");
  const [mp3PriceErr, setMp3PriceErr] = useState("");
  const [wavPriceErr, setWavPriceErr] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [stemsError, setStemsError] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const autoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoOpen) return;
    // Attempt real native picker (works if within user-gesture trust window)
    const timer = setTimeout(() => {
      try { autoInputRef.current?.click(); } catch (_) {}
      // Always show simulated picker as the prototype experience
      setShowPicker(true);
    }, 80);
    return () => clearTimeout(timer);
  }, [autoOpen]);

  function validateMp3Price(v: string) {
    const n = parseInt(v) || 0;
    if (v && (n < 100000 || n > 1000000)) setMp3PriceErr("Giá MP3: 100.000 — 1.000.000 đ");
    else setMp3PriceErr("");
  }

  function validateWavPrice(v: string) {
    const n = parseInt(v) || 0;
    if (v && (n < 100000 || n > 10000000)) setWavPriceErr("Giá WAV: 100.000 — 10.000.000 đ");
    else setWavPriceErr("");
  }

  function handleFile(key: SlotKey, file: File) {
    if (key === "mp3") {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "mp3") { toast.error("Vùng MP3 chỉ chấp nhận file .mp3"); return; }
      mp3Slot.startUpload(file);
    } else if (key === "wav") {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "wav") { toast.error("Vùng WAV chỉ chấp nhận file .wav"); return; }
      wavSlot.startUpload(file);
    } else {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "zip" && ext !== "rar") { toast.error("STEMS phải là file .zip hoặc .rar"); return; }
      stemsSlot.startUpload(file);
      setStemsError(false);
    }
  }

  const isValidTitle = title.trim().length >= 2;
  const mp3Ok = mp3Slot.slot?.done && !mp3PriceErr && parseInt(mp3Price) >= 100000;
  const wavOk = wavSlot.slot?.done && !wavPriceErr && parseInt(wavPrice) >= 100000;
  const stemsOk = stemsSlot.slot?.done;
  const canPublish = isValidTitle && !!mp3Ok && !!wavOk && !!stemsOk;

  async function handlePublish() {
    if (!stemsOk) {
      setStemsError(true);
      toast.error("Bắt buộc tải lên STEMS trước khi xuất bản!");
      return;
    }
    if (!canPublish || publishing) return;
    setPublishing(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("mp3Price", mp3Price);
      form.append("wavPrice", wavPrice);
      if (mp3Slot.slot?.file) form.append("mp3", mp3Slot.slot.file);
      if (wavSlot.slot?.file) form.append("wav", wavSlot.slot.file);
      if (stemsSlot.slot?.file) form.append("stems", stemsSlot.slot.file);
      const res = await fetch(`${API_BASE}/api/tracks/upload`, {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}` },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || e.message || `HTTP ${res.status}`); }
      toast.success(`Beat "${title}" đã gửi duyệt thành công! 🎵`, { description: "Admin sẽ xét duyệt trong 24h. Theo dõi tại Dashboard." });
      setTitle(""); setMp3Price(""); setWavPrice("");
      mp3Slot.clear(); wavSlot.clear(); stemsSlot.clear();
      setStemsError(false);
    } catch (err: unknown) {
      toast.error("Upload thất bại: " + (err instanceof Error ? err.message : "Lỗi không xác định"));
    } finally {
      setPublishing(false);
    }
  }

  function handleSimulatedSelect(picked: typeof FAKE_FILES) {
    setShowPicker(false);
    picked.forEach(f => {
      const mimeMap: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", zip: "application/zip", rar: "application/x-rar-compressed" };
      const mockFile = new File([""], f.name, { type: mimeMap[f.ext] ?? "application/octet-stream" });
      handleFile(f.slot, mockFile);
    });
    if (picked.length > 0) toast.info(`Đã chọn ${picked.length} file — Đang tải lên...`);
  }

  const checks: [string, boolean][] = [
    ["Tên beat (≥ 2 ký tự)", isValidTitle],
    ["MP3 đã tải lên (100%)", !!mp3Slot.slot?.done],
    ["WAV đã tải lên (100%)", !!wavSlot.slot?.done],
    ["STEMS đã tải lên (100%) — Bắt buộc", !!stemsOk],
    ["Giá MP3 hợp lệ (100K — 1tr)", !!mp3Ok],
    ["Giá WAV hợp lệ (100K — 10tr)", !!wavOk],
  ];

  return (
    <>
    {/* Hidden combined input for real native picker auto-trigger */}
    <input ref={autoInputRef} type="file" accept="audio/*,.zip,.rar" multiple className="hidden"
      onChange={(e) => {
        Array.from(e.target.files ?? []).forEach(file => {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          if (ext === "mp3") handleFile("mp3", file);
          else if (ext === "wav") handleFile("wav", file);
          else if (ext === "zip" || ext === "rar") handleFile("stems", file);
        });
        e.target.value = "";
      }} />

    {/* Simulated OS file picker overlay */}
    {showPicker && (
      <SimulatedFilePicker
        onSelect={handleSimulatedSelect}
        onCancel={() => setShowPicker(false)}
      />
    )}

    {/* Upload Studio CTA button */}
    <button onClick={() => setShowPicker(true)}
      className="flex items-center gap-2 self-end text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
      style={{ background: "rgba(0,200,150,0.1)", color: "#00c896", border: "1px solid rgba(0,200,150,0.2)" }}>
      <FolderOpen size={13} /> Chọn file từ máy tính
    </button>

    <div className="flex flex-col gap-6">

      {/* Beat title */}
      <div>
        <FormInput label="Tên Beat *" value={title} onChange={setTitle} placeholder="Ví dụ: Midnight Drip Vol.2" />
      </div>

      {/* 3 Dropzones */}
      <div className="grid md:grid-cols-3 gap-4">
        <DropZone slotKey="mp3" label="Bản nghe thử" accept=".mp3"
          accentColor="#00c896" accentBg="rgba(0,200,150,0.12)"
          tagLabel="MP3" helpText="Giá bán: 100K — 1.000.000 đ"
          slot={mp3Slot.slot} onFile={(f) => handleFile("mp3", f)} onClear={mp3Slot.clear} />
        <DropZone slotKey="wav" label="Chất lượng cao" accept=".wav"
          accentColor="#3b82f6" accentBg="rgba(59,130,246,0.12)"
          tagLabel="WAV" helpText="Giá bán: 100K — 10.000.000 đ"
          slot={wavSlot.slot} onFile={(f) => handleFile("wav", f)} onClear={wavSlot.clear} />
        <DropZone slotKey="stems" label="Tách track — Bắt buộc" accept=".zip,.rar"
          accentColor={stemsError ? "#ef4444" : "#8b5cf6"} accentBg={stemsError ? "rgba(239,68,68,0.12)" : "rgba(139,92,246,0.12)"}
          tagLabel="STEMS" helpText=".zip hoặc .rar — Tệp nén đa track"
          slot={stemsSlot.slot} onFile={(f) => handleFile("stems", f)} onClear={() => { stemsSlot.clear(); setStemsError(false); }} />
      </div>

      {/* STEMS error banner */}
      {stemsError && !stemsOk && (
        <div className="flex items-start gap-3 rounded-xl p-3.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
          <div>
            <p className="text-xs font-bold" style={{ color: "#ef4444" }}>Thiếu file STEMS — Không thể xuất bản!</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#6b6b88" }}>
              File STEMS (.zip/.rar) là bắt buộc. Nó chứa các track nhạc cụ tách riêng, giúp bảo vệ bản quyền và tăng giá trị thương mại của beat.
            </p>
          </div>
        </div>
      )}

      {/* Prices row */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#eeeef5" }}>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(0,200,150,0.12)", color: "#00c896" }}>MP3</span>
            Giá bán MP3 (VNĐ) *
          </label>
          <input type="number" value={mp3Price}
            onChange={(e) => { setMp3Price(e.target.value); validateMp3Price(e.target.value); }}
            placeholder="150000"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${mp3PriceErr ? "#ef4444" : "rgba(255,255,255,0.1)"}`, color: "#eeeef5" }}
            onFocus={(e) => { e.target.style.border = `1px solid ${mp3PriceErr ? "#ef4444" : "rgba(0,200,150,0.5)"}`; }}
            onBlur={(e) => { e.target.style.border = `1px solid ${mp3PriceErr ? "#ef4444" : "rgba(255,255,255,0.1)"}`; }} />
          {mp3PriceErr && <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}><AlertTriangle size={10} />{mp3PriceErr}</p>}
          {!mp3PriceErr && parseInt(mp3Price) >= 100000 && (
            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#00c896" }}><Check size={10} />{formatVND(parseInt(mp3Price))}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "#eeeef5" }}>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}>WAV</span>
            Giá bán WAV (VNĐ) *
          </label>
          <input type="number" value={wavPrice}
            onChange={(e) => { setWavPrice(e.target.value); validateWavPrice(e.target.value); }}
            placeholder="500000"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${wavPriceErr ? "#ef4444" : "rgba(255,255,255,0.1)"}`, color: "#eeeef5" }}
            onFocus={(e) => { e.target.style.border = `1px solid ${wavPriceErr ? "#ef4444" : "rgba(3,130,246,0.5)"}`; }}
            onBlur={(e) => { e.target.style.border = `1px solid ${wavPriceErr ? "#ef4444" : "rgba(255,255,255,0.1)"}`; }} />
          {wavPriceErr && <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}><AlertTriangle size={10} />{wavPriceErr}</p>}
          {!wavPriceErr && parseInt(wavPrice) >= 100000 && (
            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#3b82f6" }}><Check size={10} />{formatVND(parseInt(wavPrice))}</p>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-xl p-4 flex flex-col gap-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-[11px] font-bold mb-1" style={{ color: "#6b6b88" }}>ĐIỀU KIỆN XUẤT BẢN</p>
        {checks.map(([label, ok]) => (
          <div key={label} className="flex items-center gap-2 text-xs" style={{ color: ok ? "#00c896" : label.includes("STEMS") && stemsError ? "#ef4444" : "#6b6b88" }}>
            {ok
              ? <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(0,200,150,0.15)" }}><Check size={9} /></div>
              : <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: label.includes("STEMS") && stemsError ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)" }}>
                  <X size={9} style={{ color: label.includes("STEMS") && stemsError ? "#ef4444" : "rgba(255,255,255,0.25)" }} />
                </div>
            }
            {label}
          </div>
        ))}
      </div>

      {/* Publish button */}
      <button onClick={handlePublish} disabled={publishing}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all relative overflow-hidden"
        style={{
          background: canPublish ? "linear-gradient(135deg, #00c896, #00a878)" : "rgba(255,255,255,0.06)",
          color: canPublish ? "#020910" : "#6b6b88",
          cursor: canPublish ? "pointer" : "not-allowed",
          boxShadow: canPublish ? "0 0 24px rgba(0,200,150,0.35)" : "none",
        }}>
        {publishing
          ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10" /></svg>Đang gửi duyệt...</span>
          : canPublish
            ? "🚀 Xuất bản Beat"
            : !stemsOk
              ? "⚠️ Thiếu STEMS — Chưa thể xuất bản"
              : "Hoàn thiện đầy đủ để xuất bản"
        }
      </button>
    </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADMIN BEAT ROW
// ═══════════════════════════════════════════════════════════════════

function AdminBeatRow({ beat, onApprove, onReject }: {
  beat: PendingBeat;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // Presigned URL state for private S3 files (WAV / STEMS)
  const [presignLoading, setPresignLoading] = useState<Record<string, boolean>>({});

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play().catch(() => {}); setPlaying(true); }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    if (!audioRef.current) return;
    const t = parseFloat(e.target.value);
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  }

  function fmtTime(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  function fmtSize(bytes?: number) {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Fetch a time-limited presigned URL from the backend, then open in new tab
  async function openPresigned(file: "wav" | "stems") {
    setPresignLoading(p => ({ ...p, [file]: true }));
    try {
      const res  = await fetch(`${API_BASE}/api/admin/tracks/${beat.id}/presign?file=${file}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}` },
      });
      const data = await safeJson(res) as { url: string };
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Không thể tải file: " + (err instanceof Error ? err.message : "Lỗi"));
    } finally {
      setPresignLoading(p => ({ ...p, [file]: false }));
    }
  }

  const previewUrl = beat.mp3Url || "";

  // File slots: MP3 is public (direct link), WAV/STEMS need presigned URL
  const fileSlots = [
    { label: "MP3",   name: beat.mp3Name,   size: beat.mp3Size,   key: beat.mp3Key,   hasKey: !!beat.mp3Key,   color: "#00c896", publicUrl: beat.mp3Url, fileParam: null              as null },
    { label: "WAV",   name: beat.wavName,   size: beat.wavSize,   key: beat.wavKey,   hasKey: !!beat.wavKey,   color: "#3b82f6", publicUrl: null,         fileParam: "wav"             as "wav" },
    { label: "STEMS", name: beat.stemsName, size: beat.stemsSize, key: beat.stemsKey, hasKey: !!beat.stemsKey, color: "#8b5cf6", publicUrl: null,         fileParam: "stems"           as "stems" },
  ];

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {/* Real HTML5 audio element — MP3 src = public S3 URL */}
      {previewUrl && (
        <audio
          ref={audioRef}
          src={previewUrl}
          preload="metadata"
          onEnded={() => setPlaying(false)}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        />
      )}

      {/* Beat info header */}
      <div className="flex items-center gap-3">
        <button onClick={togglePlay} disabled={!previewUrl}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all"
          style={{ background: playing ? "#00c896" : "rgba(0,200,150,0.15)", opacity: previewUrl ? 1 : 0.4 }}>
          {playing
            ? <Pause size={14} style={{ color: "#020910" }} />
            : <Play size={14} style={{ color: "#00c896" }} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: "#eeeef5" }}>{beat.title}</p>
          <p className="text-xs" style={{ color: "#6b6b88" }}>{beat.producer} · {beat.bpm} BPM · {beat.key} · {formatVND(beat.price)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "#f59e0b" }}>⏳ Chờ duyệt</span>
          <span className="text-[10px]" style={{ color: "#6b6b88" }}>{beat.uploadedAt}</span>
        </div>
      </div>

      {/* Seekable audio player bar */}
      {previewUrl && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums w-8 text-right shrink-0" style={{ color: "#6b6b88" }}>{fmtTime(currentTime)}</span>
          <input
            type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "#00c896", background: `linear-gradient(to right, #00c896 ${duration ? (currentTime/duration)*100 : 0}%, rgba(255,255,255,0.1) 0%)` }}
          />
          <span className="text-[10px] tabular-nums w-8 shrink-0" style={{ color: "#6b6b88" }}>{fmtTime(duration)}</span>
        </div>
      )}

      {/* File slots — MP3 direct link, WAV/STEMS presigned on click */}
      <div className="grid grid-cols-3 gap-2">
        {fileSlots.map(f => {
          const loading = f.fileParam ? presignLoading[f.fileParam] : false;
          const hasFile = f.publicUrl || f.hasKey;
          // MP3: plain anchor to public S3 URL
          if (f.fileParam === null) {
            return (
              <a key={f.label} href={f.publicUrl || "#"} target="_blank" rel="noopener noreferrer"
                onClick={e => { if (!f.publicUrl) e.preventDefault(); }}
                className="flex flex-col gap-0.5 p-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${hasFile ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`, textDecoration: "none", opacity: hasFile ? 1 : 0.4 }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.color }} />
                  <span className="text-[10px] font-bold" style={{ color: f.color }}>{f.label}</span>
                  {hasFile && <ExternalLink size={8} style={{ color: "#6b6b88", marginLeft: "auto" }} />}
                </div>
                <p className="text-[9px] truncate" style={{ color: "#6b6b88" }}>{f.name || (hasFile ? "✓ S3 public" : "Chưa có")}</p>
                <p className="text-[9px] font-semibold" style={{ color: "#eeeef5" }}>{fmtSize(f.size)}</p>
              </a>
            );
          }
          // WAV / STEMS: button → presigned URL → opens in new tab
          return (
            <button key={f.label} onClick={() => openPresigned(f.fileParam!)}
              disabled={!f.hasKey || loading}
              className="flex flex-col gap-0.5 p-2 rounded-lg text-left transition-all"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${f.hasKey ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`, opacity: f.hasKey ? 1 : 0.4, cursor: f.hasKey ? "pointer" : "default" }}>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.color }} />
                <span className="text-[10px] font-bold" style={{ color: f.color }}>{f.label}</span>
                {f.hasKey && (
                  loading
                    ? <span className="text-[8px] ml-auto" style={{ color: "#6b6b88" }}>...</span>
                    : <Lock size={8} style={{ color: "#6b6b88", marginLeft: "auto" }} />
                )}
              </div>
              <p className="text-[9px] truncate" style={{ color: "#6b6b88" }}>{f.name || (f.hasKey ? "🔒 S3 private" : "Chưa có")}</p>
              <p className="text-[9px] font-semibold" style={{ color: "#eeeef5" }}>{fmtSize(f.size)}</p>
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      {!showReject ? (
        <div className="flex gap-2">
          <button onClick={onApprove}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            style={{ background: "rgba(0,200,150,0.12)", color: "#00c896", border: "1px solid rgba(0,200,150,0.2)" }}>
            <Check size={12} /> Phê duyệt &amp; Xuất bản
          </button>
          <button onClick={() => setShowReject(true)}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.18)" }}>
            <X size={12} /> Từ chối
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Lý do từ chối (ví dụ: Chất lượng âm thanh kém, Sai định dạng STEMS...)"
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.3)", color: "#eeeef5" }}
          />
          <div className="flex gap-2">
            <button onClick={() => { onReject(rejectReason); setShowReject(false); }}
              disabled={!rejectReason.trim()}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
              style={{ background: rejectReason.trim() ? "#ef4444" : "rgba(255,255,255,0.06)", color: rejectReason.trim() ? "#fff" : "#6b6b88" }}>
              Xác nhận từ chối &amp; Gửi thông báo
            </button>
            <button onClick={() => setShowReject(false)}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#6b6b88" }}>
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD MODAL
// ═══════════════════════════════════════════════════════════════════

interface ApprovedBeat {
  id: number;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  price: number;
  artwork: string;
  mp3Url: string;
  isFeatured: boolean;
}

function FeaturedManagementTab({ apiBase, token }: { apiBase: string; token: string }) {
  const [beats, setBeats] = useState<ApprovedBeat[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<number>>(new Set());
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function fetchBeats() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/beats/approved`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApprovedBeat[] = await res.json();
      setBeats(data);
    } catch (err: unknown) {
      toast.error("Không thể tải danh sách beat: " + (err instanceof Error ? err.message : "Lỗi"));
    } finally {
      setLoading(false);
    }
  }

  async function toggleFeatured(beat: ApprovedBeat) {
    setToggling(s => new Set([...s, beat.id]));
    try {
      const res = await fetch(`${apiBase}/api/admin/beats/${beat.id}/featured`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured: !beat.isFeatured }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBeats(prev => prev.map(b => b.id === beat.id ? { ...b, isFeatured: !b.isFeatured } : b));
      toast.success(beat.isFeatured ? `"${beat.title}" đã gỡ khỏi Đề xuất` : `"${beat.title}" đã thêm vào Đề xuất ✨`);
    } catch (err: unknown) {
      toast.error("Cập nhật thất bại: " + (err instanceof Error ? err.message : "Lỗi"));
    } finally {
      setToggling(s => { const n = new Set(s); n.delete(beat.id); return n; });
    }
  }

  function togglePlay(beat: ApprovedBeat) {
    if (!beat.mp3Url) return;
    if (playingId === beat.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(beat.mp3Url);
      audio.onended = () => setPlayingId(null);
      audio.play().catch(() => {});
      audioRef.current = audio;
      setPlayingId(beat.id);
    }
  }

  useEffect(() => { fetchBeats(); }, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const featuredBeats = beats.filter(b => b.isFeatured);
  const approvedBeats = beats.filter(b => !b.isFeatured);

  function BeatRow({ beat, action }: { beat: ApprovedBeat; action: "add" | "remove" }) {
    const isToggling = toggling.has(beat.id);
    const isPlaying = playingId === beat.id;
    return (
      <div className="flex items-center gap-3 p-2.5 rounded-xl transition-all hover:bg-white/[0.03]" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="relative shrink-0 w-9 h-9 rounded-lg overflow-hidden">
          <img src={beat.artwork} alt={beat.title} className="w-full h-full object-cover" />
          {beat.mp3Url && (
            <button onClick={() => togglePlay(beat)}
              className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
              style={{ background: "rgba(0,0,0,0.6)" }}>
              {isPlaying ? <Pause size={12} style={{ color: "#fff" }} /> : <Play size={12} style={{ color: "#fff" }} />}
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: "#eeeef5" }}>{beat.title}</p>
          <p className="text-[10px] truncate" style={{ color: "#6b6b88" }}>{beat.artist} · {beat.genre} · {beat.bpm} BPM</p>
        </div>
        <button onClick={() => toggleFeatured(beat)} disabled={isToggling}
          className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
          style={action === "add"
            ? { background: "rgba(0,200,150,0.12)", color: "#00c896", border: "1px solid rgba(0,200,150,0.2)", opacity: isToggling ? 0.6 : 1 }
            : { background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.18)", opacity: isToggling ? 0.6 : 1 }}>
          {isToggling ? "..." : action === "add" ? <><Plus size={10} /> Đề xuất</> : <><X size={10} /> Gỡ</>}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-lg">Quản lý Đề xuất</h2>
          <p className="text-xs mt-0.5" style={{ color: "#6b6b88" }}>Chọn beat xuất hiện trong khung Featured trên trang chủ</p>
        </div>
        <button onClick={fetchBeats} disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
          style={{ background: "rgba(0,200,150,0.1)", color: "#00c896" }}>
          {loading ? "Đang tải..." : "↻ Làm mới"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#00c896" }} />
        </div>
      ) : beats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: "#6b6b88" }}>
          <Sparkles size={32} style={{ color: "rgba(255,255,255,0.08)" }} />
          <p className="text-sm">Chưa có beat nào được duyệt</p>
          <p className="text-xs" style={{ color: "#4b4b6b" }}>Kết nối backend tại VITE_API_BASE_URL để quản lý</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left: available to feature */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ background: "#6b6b88" }} />
              <span className="text-xs font-bold" style={{ color: "#6b6b88" }}>Đã duyệt ({approvedBeats.length})</span>
            </div>
            (approvedBeats ?? []).length
              ? <p className="text-xs py-6 text-center" style={{ color: "#4b4b6b" }}>Tất cả beat đã được đề xuất</p>
              : (approvedBeats ?? []).map((b) => (
  <BeatRow key={b.id} beat={b} action="add" />
          </div>

          {/* Right: currently featured */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ background: "#00c896" }} />
              <span className="text-xs font-bold" style={{ color: "#00c896" }}>Đang đề xuất ({featuredBeats.length})</span>
            </div>
            (featuredBeats ?? []).length
              ? <p className="text-xs py-6 text-center" style={{ color: "#4b4b6b" }}>Chưa có beat nào được đề xuất</p>
              : (featuredBeats ?? []).map((b) => (
  <BeatRow key={b.id} beat={b} action="remove" />
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardModal({ isOpen, onClose, user, onUpdateDob }: {
  isOpen: boolean; onClose: () => void; user: UserProfile; onUpdateDob?: () => void;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [uploadKey, setUploadKey] = useState(0);
  const [dobValue, setDobValue] = useState<DatePickerValue>({ day: "", month: "", year: "" });
  const [dobSaved, setDobSaved] = useState(!!user.dob);
  const [dobError, setDobError] = useState("");
  const [lockedUsers, setLockedUsers] = useState<Set<number>>(new Set([5]));
  const [pendingBeats, setPendingBeats] = useState<PendingBeat[]>([]);
  const [beatsLoading, setBeatsLoading] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [commission, setCommission] = useState(15);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token") ?? ""}`,
  });

  async function fetchPendingBeats() {
    setBeatsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/tracks/pending`, { headers: authHeader() });
      const data = await safeJson(res) as PendingBeat[];
      setPendingBeats(data);
      setBackendOffline(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      const isOffline = msg.includes("Backend offline") || msg.includes("Failed to fetch");
      setBackendOffline(isOffline);
      if (!isOffline) toast.error("Không thể tải danh sách beat: " + msg);
    } finally {
      setBeatsLoading(false);
    }
  }

  async function handleApproveBeat(id: number) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/tracks/${id}/approve`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
      });
      await safeJson(res);
      setPendingBeats(prev => prev.filter(b => b.id !== id));
      toast.success("Beat đã được phê duyệt và xuất bản công khai! ✓");
    } catch (err: unknown) {
      toast.error("Phê duyệt thất bại: " + (err instanceof Error ? err.message : "Lỗi"));
    }
  }

  async function handleRejectBeat(id: number, reason: string) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/tracks/${id}/reject`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      await safeJson(res);
      setPendingBeats(prev => prev.filter(b => b.id !== id));
      toast.success("Đã từ chối beat và thông báo Producer.");
    } catch (err: unknown) {
      toast.error("Từ chối thất bại: " + (err instanceof Error ? err.message : "Lỗi"));
    }
  }

  useEffect(() => {
    if (isOpen) {
      setActiveTab("overview");
      if (user.role === "admin") fetchPendingBeats();
    }
  }, [isOpen]);

  // Auto-refresh pending beats every 30s while the admin dashboard is open
  useEffect(() => {
    if (!isOpen || user.role !== "admin") return;
    const iv = setInterval(fetchPendingBeats, 30_000);
    return () => clearInterval(iv);
  }, [isOpen, user.role]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOpen) return null;

  const roleMeta = ALL_ROLES.find((r) => r.value === user.role) ?? ALL_ROLES[2];

  const TABS: Record<UserRole, { id: string; label: string; icon: React.ElementType }[]> = {
    admin: [{ id: "overview", label: "Tổng quan", icon: BarChart2 }, { id: "users", label: "Người dùng", icon: Users }, { id: "content", label: "Duyệt Beat", icon: FileText }, { id: "featured", label: "Đề xuất", icon: Sparkles }, { id: "payment", label: "Thanh toán", icon: Banknote }, { id: "settings", label: "Cài đặt", icon: Key }],
    producer: [{ id: "overview", label: "Tổng quan", icon: TrendingUp }, { id: "tracks", label: "Beats", icon: Music }, { id: "earnings", label: "Thu nhập", icon: Wallet }, { id: "upload", label: "Upload", icon: Upload }],
    user: [{ id: "overview", label: "Tổng quan", icon: Headphones }, { id: "purchases", label: "Đã mua", icon: ShoppingCart }, { id: "downloads", label: "Tải xuống", icon: Download }, { id: "profile", label: "Hồ sơ", icon: UserCheck }],
  };
  const tabs = TABS[user.role];

  function saveDob() {
    if (!dobValue.day || !dobValue.month || !dobValue.year) { setDobError("Vui lòng chọn đầy đủ ngày tháng năm"); return; }
    const dobStr = `${dobValue.year}-${dobValue.month.padStart(2, "0")}-${dobValue.day.padStart(2, "0")}`;
    const age = calcAge(dobStr);
    if (age < 0) { setDobError("Ngày sinh không thể ở tương lai"); return; }
    if (age < 13) { setDobError(`Cần đủ 13 tuổi (hiện tại: ${age} tuổi)`); return; }
    setDobError("");
    setDobSaved(true);
    toast.success("Đã lưu ngày sinh! 🎂 Bạn sẽ nhận ưu đãi sinh nhật vào ngày đặc biệt.");
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }} onClick={onClose} />
      <div className="relative w-full max-w-5xl rounded-2xl overflow-hidden flex" style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "90vh" }}>

        {/* Sidebar */}
        <div className="w-52 shrink-0 flex flex-col" style={{ background: "#080812", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "#00c896" }}><Music size={11} style={{ color: "#020910" }} /></div>
              <span className="font-extrabold text-xs">mathuat<span style={{ color: "#00c896" }}>sound</span></span>
            </div>
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
              <UserAvatar user={user} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: "#eeeef5" }}>{user.name}</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${roleMeta.color}20`, color: roleMeta.color }}>{roleMeta.emoji} {roleMeta.label}</span>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 pb-3 flex flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => {
                setActiveTab(t.id);
                if (t.id === "upload") setUploadKey(k => k + 1);
              }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left"
                style={{ background: activeTab === t.id ? "rgba(0,200,150,0.1)" : "transparent", color: activeTab === t.id ? "#00c896" : "#6b6b88", borderLeft: activeTab === t.id ? "2px solid #00c896" : "2px solid transparent" }}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </nav>
          <div className="p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button onClick={onClose} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs w-full hover:bg-white/5 transition-all" style={{ color: "#6b6b88" }}>
              <LogOut size={13} /> Đóng
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: "none" }}>

          {/* Admin Overview */}
          {user.role === "admin" && activeTab === "overview" && (
            <div className="flex flex-col gap-5">
              <h2 className="font-extrabold text-lg">Tổng quan hệ thống</h2>
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-sm" style={{ color: "#6b6b88" }}>Dữ liệu thực sẽ được lấy từ database khi backend kết nối.</p>
              </div>
            </div>
          )}

          {user.role === "admin" && activeTab === "users" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-lg">Quản lý người dùng</h2>
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                  ⚙️ Quyền Admin đang bật
                </span>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-xs">
                  <thead><tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    {(["Tên", "Email", "Vai trò", "Trạng thái", "Doanh thu", "Hành động"] as string[]).map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left font-semibold" style={{ color: "#6b6b88" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-xs" style={{ color: "#6b6b88" }}>Dữ liệu người dùng sẽ được tải từ database.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Producer Overview */}
          {user.role === "producer" && activeTab === "overview" && (
            <div className="flex flex-col gap-4 p-4">
              <h2 className="font-extrabold text-lg">Producer Dashboard</h2>
              <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <p className="font-semibold text-sm" style={{ color: "#f59e0b" }}>Tài khoản đang chờ duyệt</p>
                <p className="text-xs mt-1" style={{ color: "#6b6b88" }}>Admin sẽ xem xét hồ sơ của bạn. Bạn sẽ nhận được thông báo sau khi được duyệt.</p>
              </div>
            </div>
          )}

          {user.role === "producer" && activeTab === "tracks" && (
            <div className="flex flex-col gap-4 p-4">
              <h2 className="font-extrabold text-lg">Beats của tôi</h2>
              <div className="rounded-xl p-6 flex flex-col items-center gap-2 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Music size={24} style={{ color: "#6b6b88" }} />
                <p className="text-sm font-semibold" style={{ color: "#eeeef5" }}>Chưa có beat nào</p>
                <p className="text-xs" style={{ color: "#6b6b88" }}>Tài khoản cần được duyệt trước khi upload.</p>
              </div>
            </div>
          )}

          {user.role === "producer" && activeTab === "upload" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-lg">Upload Studio</h2>
                <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg" style={{ background: "rgba(0,200,150,0.08)", color: "#00c896" }}>
                  <FolderOpen size={11} /> Hộp thoại file đang mở...
                </div>
              </div>
              <SmartUploadForm key={uploadKey} autoOpen={uploadKey > 0} />
            </div>
          )}

          {user.role === "producer" && activeTab === "earnings" && (
            <div className="flex flex-col gap-4 p-4">
              <h2 className="font-extrabold text-lg">Thu nhập</h2>
              <div className="rounded-xl p-6 flex flex-col items-center gap-2 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Wallet size={24} style={{ color: "#6b6b88" }} />
                <p className="text-sm font-semibold" style={{ color: "#eeeef5" }}>Chưa có dữ liệu thu nhập</p>
                <p className="text-xs" style={{ color: "#6b6b88" }}>Doanh thu sẽ hiển thị sau khi bạn bán được beat đầu tiên.</p>
              </div>
            </div>
          )}

          {/* Buyer */}
          {user.role === "user" && activeTab === "overview" && (
            <div className="flex flex-col gap-5">
              <h2 className="font-extrabold text-lg">Tổng quan</h2>
              {!user.hasDob && (
                <div className="p-4 rounded-xl flex items-center gap-4" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)" }}>
                  <Gift size={20} style={{ color: "#8b5cf6", flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold mb-0.5" style={{ color: "#eeeef5" }}>Nhận quà sinh nhật!</p>
                    <p className="text-xs" style={{ color: "#6b6b88" }}>Cập nhật ngày sinh để nhận ưu đãi 30% vào ngày sinh nhật.</p>
                  </div>
                  <button onClick={() => setActiveTab("profile")} className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0" style={{ background: "#8b5cf6", color: "#fff" }}>
                    Cập nhật
                  </button>
                </div>
              )}
            </div>
          )}

          {user.role === "user" && activeTab === "purchases" && (
            <div className="flex flex-col gap-4 p-4">
              <h2 className="font-extrabold text-lg">Lịch sử mua hàng</h2>
              <div className="rounded-xl p-6 flex flex-col items-center gap-2 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <ShoppingCart size={24} style={{ color: "#6b6b88" }} />
                <p className="text-sm font-semibold" style={{ color: "#eeeef5" }}>Chưa có giao dịch nào</p>
                <p className="text-xs" style={{ color: "#6b6b88" }}>Lịch sử mua hàng sẽ hiển thị tại đây.</p>
              </div>
            </div>
          )}

          {/* Buyer profile — DOB update */}
          {user.role === "user" && activeTab === "profile" && (
            <div className="flex flex-col gap-5">
              <h2 className="font-extrabold text-lg">Hồ sơ cá nhân</h2>
              {dobSaved ? (
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.25)" }}>
                  <Check size={18} style={{ color: "#00c896", flexShrink: 0 }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#00c896" }}>Ngày sinh đã được lưu!</p>
                    <p className="text-xs" style={{ color: "#6b6b88" }}>Bạn sẽ nhận ưu đãi sinh nhật vào ngày đặc biệt.</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2">
                    <CalendarDays size={16} style={{ color: "#8b5cf6" }} />
                    <p className="text-sm font-bold">Cập nhật ngày sinh</p>
                  </div>
                  <p className="text-xs" style={{ color: "#6b6b88" }}>Ngày sinh giúp chúng tôi gửi ưu đãi sinh nhật và nội dung cá nhân hoá.</p>
                  <DatePickerField value={dobValue} onChange={setDobValue} error={dobError} />
                  <button onClick={saveDob} className="w-full py-2.5 rounded-xl font-bold text-sm" style={{ background: "#8b5cf6", color: "#fff" }}>
                    Lưu ngày sinh 🎂
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Fallback empty states */}
          {user.role === "user" && activeTab === "downloads" && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Download size={36} style={{ color: "rgba(255,255,255,0.1)" }} />
              <p className="text-sm font-semibold" style={{ color: "#6b6b88" }}>Chưa có file nào được tải</p>
            </div>
          )}

          {/* Admin — Pending Beats Approval */}
          {user.role === "admin" && activeTab === "content" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-lg">Duyệt Beat</h2>
                <button onClick={fetchPendingBeats} disabled={beatsLoading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                  style={{ background: "rgba(0,200,150,0.1)", color: "#00c896" }}>
                  {beatsLoading ? "Đang tải..." : "↻ Làm mới"}
                </button>
              </div>

              {beatsLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 rounded-full animate-spin" style={{ border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#00c896" }} />
                </div>
              )}

              {/* Backend offline banner */}
              {!beatsLoading && backendOffline && (
                <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.12)" }}>
                      <AlertTriangle size={16} style={{ color: "#ef4444" }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: "#ef4444" }}>Backend chưa được khởi động</p>
                      <p className="text-xs mt-0.5" style={{ color: "#6b6b88" }}>
                        Server API không phản hồi — đây là nguyên nhân lỗi <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "rgba(255,255,255,0.06)" }}>Unexpected token {"'<'"}</code>
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] font-semibold mb-1.5" style={{ color: "#6b6b88" }}>KHỞI ĐỘNG BACKEND</p>
                    <code className="text-xs" style={{ color: "#00c896" }}>cd backend &amp;&amp; npm install &amp;&amp; npm start</code>
                    <p className="text-[10px] mt-1.5" style={{ color: "#4b4b6b" }}>Port mặc định: 3001 · Vite proxy tự forward /api/* sang đó</p>
                  </div>
                  <button onClick={fetchPendingBeats}
                    className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                    ↻ Thử kết nối lại
                  </button>
                </div>
              )}

              {!beatsLoading && !backendOffline && pendingBeats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: "#6b6b88" }}>
                  <Music size={32} style={{ color: "rgba(255,255,255,0.08)" }} />
                  <p className="text-sm">Không có beat nào đang chờ duyệt</p>
                  <p className="text-xs" style={{ color: "#4b4b6b" }}>Tất cả beat đã được xử lý — Producer chưa gửi bài mới</p>
                </div>
              )}

              {pendingBeats.map((beat) => (
                <AdminBeatRow
                  key={beat.id}
                  beat={beat}
                  onApprove={() => handleApproveBeat(beat.id)}
                  onReject={(reason) => handleRejectBeat(beat.id, reason)}
                />
              ))}
            </div>
          )}

          {/* ── Admin: Featured Management ── */}
          {user.role === "admin" && activeTab === "featured" && (
            <FeaturedManagementTab
              apiBase={API_BASE}
              token={localStorage.getItem("auth_token") ?? ""}
            />
          )}

          {/* Admin — System Settings */}
          {/* ── Admin: Payment Settings ── */}
          {user.role === "admin" && activeTab === "payment" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-lg">Quản lý Thanh toán</h2>
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>💳 Cổng thanh toán</span>
              </div>

              {/* QR Upload */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <QrCode size={15} style={{ color: "#00c896" }} />
                  <p className="text-sm font-bold">Mã QR Nhận Tiền</p>
                </div>
                <div className="flex gap-5 items-start">
                  <div className="p-3 rounded-xl shrink-0" style={{ background: "#fff" }}>
                    <img src="https://img.vietqr.io/image/MB-0123456789-compact2.png?amount=0&addInfo=BSTORE"
                      alt="QR" className="w-28 h-28 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6b88" }}>Ngân hàng</label>
                      <input defaultValue="MB Bank" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6b88" }}>Số tài khoản</label>
                      <input defaultValue="0123456789" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1" style={{ color: "#6b6b88" }}>Chủ tài khoản</label>
                      <input defaultValue="MATHUAT SOUND CO.,LTD" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }} />
                    </div>
                    <button onClick={() => toast.success("Đã cập nhật thông tin QR ✓")}
                      className="py-2 rounded-lg text-xs font-bold transition-all"
                      style={{ background: "rgba(0,200,150,0.1)", color: "#00c896" }}>
                      Lưu cấu hình QR
                    </button>
                  </div>
                </div>
                <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.15)" }}>
                  <label className="text-xs font-bold flex-1" style={{ color: "#6b6b88" }}>Tải lên QR mới</label>
                  <input type="file" accept="image/*" className="hidden" id="qr-upload" onChange={() => toast.success("Đã tải QR mới lên hệ thống ✓")} />
                  <label htmlFor="qr-upload" className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "#00c896", color: "#020910" }}>
                    Chọn ảnh QR
                  </label>
                </div>
              </div>

              {/* Commission */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <DollarSign size={15} style={{ color: "#f59e0b" }} />
                  <p className="text-sm font-bold">Tỷ lệ hoa hồng sàn</p>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min={5} max={30} value={commission} onChange={(e) => setCommission(Number(e.target.value))}
                    className="flex-1 accent-[#00c896]" />
                  <span className="text-lg font-extrabold w-14 text-right" style={{ color: "#00c896", fontFamily: "'DM Mono', monospace" }}>{commission}%</span>
                </div>
                <div className="flex justify-between text-xs" style={{ color: "#6b6b88" }}>
                  <span>Min 5%</span><span>Producer nhận: <strong style={{ color: "#00c896" }}>{100 - commission}%</strong> mỗi giao dịch</span><span>Max 30%</span>
                </div>
                <button onClick={() => toast.success(`Đã lưu hoa hồng ${commission}% ✓`)} className="py-2 rounded-lg text-xs font-bold" style={{ background: "rgba(0,200,150,0.1)", color: "#00c896" }}>
                  Lưu hoa hồng
                </button>
              </div>

              {/* Recent transactions */}
              <div className="rounded-xl p-5 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-1"><Receipt size={14} style={{ color: "#3b82f6" }} /><p className="text-sm font-bold">Giao dịch gần đây</p></div>
                {[
                  { id: "ORD-A1B2C3", beat: "Midnight Drip", buyer: "Trần Thị Lan", amount: 450000, fee: 67500, time: "08:42", status: "paid" },
                  { id: "ORD-D4E5F6", beat: "Sài Gòn Nights", buyer: "Nguyễn Văn A", amount: 200000, fee: 30000, time: "Yesterday", status: "paid" },
                  { id: "ORD-G7H8I9", beat: "3AM Coffee", buyer: "Café Q1", amount: 600000, fee: 90000, time: "2 ngày trước", status: "paid" },
                ].map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,200,150,0.1)" }}><Check size={12} style={{ color: "#00c896" }} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{tx.beat}</p>
                      <p className="text-[10px]" style={{ color: "#6b6b88" }}>{tx.buyer} · {tx.time}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold" style={{ color: "#00c896" }}>+{formatVND(tx.amount)}</p>
                      <p className="text-[10px]" style={{ color: "#f59e0b" }}>Phí: {formatVND(tx.fee)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {user.role === "admin" && activeTab === "settings" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-lg">Cài đặt hệ thống</h2>
                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>⚙️ Toàn quyền</span>
              </div>

              {/* Commission rate */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <DollarSign size={15} style={{ color: "#f59e0b" }} />
                  <p className="text-sm font-bold">Tỷ lệ hoa hồng sàn</p>
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min={5} max={30} value={commission} onChange={(e) => setCommission(Number(e.target.value))}
                    className="flex-1 accent-[#00c896]" />
                  <span className="text-xl font-extrabold w-14 text-right" style={{ color: "#00c896", fontFamily: "'DM Mono', monospace" }}>{commission}%</span>
                </div>
                <div className="flex justify-between text-[10px]" style={{ color: "#6b6b88" }}>
                  <span>Min 5%</span><span>Hiện tại: <strong style={{ color: "#eeeef5" }}>{commission}%</strong> mỗi giao dịch</span><span>Max 30%</span>
                </div>
                <button onClick={() => toast.success(`Đã lưu tỷ lệ hoa hồng ${commission}% ✓`)}
                  className="w-full py-2.5 rounded-xl font-bold text-sm" style={{ background: "#f59e0b", color: "#1a0a00" }}>
                  Lưu cấu hình
                </button>
              </div>

              {/* API Key management */}
              <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <Key size={15} style={{ color: "#8b5cf6" }} />
                  <p className="text-sm font-bold">Quản lý API Key</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type={apiKeyVisible ? "text" : "password"} value="sk-mts-2026-a1b2-c3d4-e5f6" readOnly
                    className="flex-1 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5", fontFamily: "'DM Mono', monospace" }} />
                  <button onClick={() => setApiKeyVisible((v) => !v)} className="px-3 py-2.5 rounded-xl transition-all"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#6b6b88" }}>
                    {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard?.writeText("sk-mts-2026-a1b2-c3d4-e5f6"); toast.success("Đã sao chép API key"); }}
                    className="flex-1 py-2 rounded-xl font-semibold text-xs" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                    Sao chép
                  </button>
                  <button onClick={() => toast.info("Đã tạo API key mới. Key cũ bị vô hiệu hoá sau 24h.")}
                    className="flex-1 py-2 rounded-xl font-semibold text-xs" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                    Làm mới key
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function FeaturedSection({ onPlay, onBuy, activeTrackId, isPlaying, likedIds, onLike }: {
  onPlay: (t: Track) => void;
  onBuy: (t: Track) => void;
  activeTrackId?: number;
  isPlaying: boolean;
  likedIds: Set<number>;
  onLike: (id: number) => void;
}) {
  const [featuredTracks, setFeaturedTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/beats/featured`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Track[]) => setFeaturedTracks(data))
      .catch(() => setFeaturedTracks([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && featuredTracks.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={14} style={{ color: "#00c896" }} />
        <h2 className="font-extrabold text-base">Được Đề xuất</h2>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(0,200,150,0.1)", color: "#00c896" }}>
          {loading ? "..." : featuredTracks.length} beat
        </span>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} className="shrink-0 w-36 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)", height: 180 }} />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {featuredTracks.map(t => (
            <div key={t.id} className="shrink-0 w-36 rounded-xl overflow-hidden cursor-pointer group transition-all hover:-translate-y-1"
              style={{ background: activeTrackId === t.id ? "rgba(0,200,150,0.08)" : "#0f0f1a", border: activeTrackId === t.id ? "1px solid rgba(0,200,150,0.3)" : "1px solid rgba(255,255,255,0.07)" }}>
              <div className="relative aspect-square overflow-hidden">
                <img src={t.artwork} alt={t.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <button onClick={() => onPlay(t)}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(0,200,150,0.9)" }}>
                    {activeTrackId === t.id && isPlaying
                      ? <Pause size={14} style={{ color: "#020910" }} />
                      : <Play size={14} style={{ color: "#020910" }} />}
                  </div>
                </button>
                {t.isExclusive && (
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#00c896", color: "#020910" }}>EXCL</span>
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-bold truncate mb-0.5" style={{ color: "#eeeef5" }}>{t.title}</p>
                <p className="text-[10px] truncate mb-2" style={{ color: "#6b6b88" }}>{t.artist}</p>
                <div className="flex items-center justify-between gap-1">
                  <button onClick={() => onLike(t.id)} style={{ color: likedIds.has(t.id) ? "#ef4444" : "#6b6b88" }}>
                    <Heart size={11} fill={likedIds.has(t.id) ? "#ef4444" : "none"} />
                  </button>
                  <button onClick={() => onBuy(t)}
                    className="text-[9px] font-bold px-2 py-1 rounded-lg transition-all hover:brightness-110"
                    style={{ background: "#00c896", color: "#020910" }}>
                    {formatVND(t.price)}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// APP (ROOT)
// ═══════════════════════════════════════════════════════════════════

function AppShell() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [showDash, setShowDash] = useState(false);
  const [genre, setGenre] = useState("All");
  const [search, setSearch] = useState("");
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(70);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Page routing
  const [appPage, setAppPage] = useState<"home">("home");

  // Transaction system
  const [adminPayment, setAdminPayment] = useState<AdminPaymentConfig>(DEFAULT_ADMIN_PAYMENT);
  const [checkoutTrack, setCheckoutTrack] = useState<Track | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [lastPurchase, setLastPurchase] = useState<PurchasedItem | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<number>>(new Set());
  const [producerWalletBalance, setProducerWalletBalance] = useState(8_900_000);

  // Google OAuth loading (đang đổi code → JWT)
  const [oAuthLoading, setOAuthLoading] = useState(false);

  // New user Google profile completion
  const [pendingNewUser, setPendingNewUser] = useState<UserProfile | null>(null);

  // Birthday reminder (for email login users without DOB)
  const [showBirthdayReminder, setShowBirthdayReminder] = useState(false);
  const [birthdayReminderUser, setBirthdayReminderUser] = useState<UserProfile | null>(null);

  const { playTrack, stopAll, updateVolume } = useAudioEngine();

  // Kill any lingering One Tap / FedCM auto-prompt from a previously cached build.
  useEffect(() => {
    try { window.google?.accounts.id.cancel(); } catch { /* ignore */ }
  }, []);

  // Google Sign-In is triggered only by the explicit button click (startGoogleOAuth).
  // Auto-prompt is disabled — One Tap hook is a no-op.
  useGoogleOneTap(false);

  const filtered = useMemo(() =>
    TRACKS.filter((t) => (genre === "All" || t.genre === genre) && (!search || t.title.toLowerCase().includes(search.toLowerCase()) || t.artist.toLowerCase().includes(search.toLowerCase()))),
    [genre, search]
  );

  function openAuth(tab: AuthTab) { setAuthTab(tab); setShowAuth(true); }

  // ── LUỒNG A: Google Authorization Code callback tại root "/" ─────────────
  // (Legacy client-side flow) Google redirect về root URL?code=xxx&state=xxx.
  // Luồng chính hiện tại là server-side: backend /api/auth/google/callback xử lý code.
  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const code     = params.get("code");
    const state    = params.get("state");
    const googleErr = params.get("error"); // "access_denied" nếu user bấm Cancel

    // Chỉ xử lý khi có code (Google callback) — tránh xử lý nhầm các URL khác
    if (!code && !googleErr) return;

    // Xóa params khỏi URL ngay lập tức — JWT không được nằm trong browser history
    const clean = new URL(window.location.href);
    ["code", "state", "error", "scope", "authuser", "prompt"].forEach(k => clean.searchParams.delete(k));
    window.history.replaceState({}, "", clean.pathname + (clean.search || ""));

    if (googleErr) {
      toast.error("Đăng nhập Google bị huỷ", { description: googleErr });
      return;
    }

    // CSRF check — state phải khớp giá trị đã lưu trong sessionStorage
    const savedState = sessionStorage.getItem("google_oauth_state");
    sessionStorage.removeItem("google_oauth_state");
    if (!state || state !== savedState) {
      toast.error("Lỗi bảo mật", { description: "State không hợp lệ — có thể bị tấn công CSRF. Vui lòng thử lại." });
      return;
    }

    // Đổi code lấy JWT — gửi redirect_uri khớp với redirect_uri đã dùng khi tạo auth URL
    setOAuthLoading(true);
    fetch(`${API_BASE}/api/auth/google/exchange`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ code, redirect_uri: GOOGLE_REDIRECT_URI }),
    })
      .then(async r => {
        const data = await r.json() as { error?: string; user: UserProfile; token: string; isNew: boolean };
        if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
        return data;
      })
      .then(data => {
        localStorage.setItem("auth_token", data.token ?? "");
        if (data.isNew) {
          setPendingNewUser(data.user); // → NewUserProfileModal (nhập ngày sinh ≥13 tuổi)
        } else {
          applyAuthSuccess(data.user, false); // → routing theo 6 vai trò
        }
      })
      .catch((e: Error) => {
        toast.error("Xác thực Google thất bại", { description: e.message });
      })
      .finally(() => setOAuthLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── LUỒNG B: Đọc auth_token từ URL params (One Tap + backend redirect) ───
  // Backend đặt: ?auth_token=JWT&auth_user=JSON&auth_is_new=true[&auth_redirect=/admin]
  useEffect(() => {
    const params      = new URLSearchParams(window.location.search);
    const token       = params.get("auth_token");
    const userRaw     = params.get("auth_user");
    const isNew       = params.get("auth_is_new") === "true";
    const authErr     = params.get("auth_error");
    const authRedirect = params.get("auth_redirect") || "";

    if (!token && !authErr) return;

    const clean = new URL(window.location.href);
    ["auth_token", "auth_user", "auth_is_new", "auth_provider", "auth_error", "auth_redirect"]
      .forEach(k => clean.searchParams.delete(k));
    window.history.replaceState({}, "", clean.pathname + (clean.search || ""));

    if (authErr) {
      toast.error("Đăng nhập thất bại", { description: decodeURIComponent(authErr) });
      return;
    }

    if (!token || !userRaw) return;

    try {
      const u = JSON.parse(decodeURIComponent(userRaw)) as UserProfile;
      localStorage.setItem("auth_token", token);
      if (isNew) {
        // Store redirect for after new-user profile setup
        if (authRedirect) sessionStorage.setItem("post_auth_redirect", authRedirect);
        setPendingNewUser(u);
      } else {
        applyAuthSuccess(u, false, authRedirect);
      }
    } catch {
      toast.error("Lỗi xử lý đăng nhập. Vui lòng thử lại.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle OAuth result từ sessionStorage (Luồng A client-side + GitHub/SoundCloud) ──
  // GoogleCallbackPage (/api/auth/google/callback) và OAuthCallbackPage đặt kết quả vào đây.
  useEffect(() => {
    const raw = sessionStorage.getItem("oauth_result");
    if (!raw) return;
    sessionStorage.removeItem("oauth_result");
    try {
      const { user: u, token, isNew } = JSON.parse(raw) as {
        user: UserProfile; token: string; isNew: boolean;
      };
      localStorage.setItem("auth_token", token ?? "");
      if (isNew) setPendingNewUser(u);
      else applyAuthSuccess(u, false);
    } catch {
      toast.error("Lỗi xử lý đăng nhập. Vui lòng thử lại.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared post-auth navigation logic
  // authRedirect (optional): path set by backend based on user role (e.g. "/admin")
  function applyAuthSuccess(u: UserProfile, isNew: boolean, authRedirect?: string) {
    setUser(u);
    setAppPage("home");
    if (u.role === "admin") setShowDash(true);
    const rl = ALL_ROLES.find(r => r.value === u.role)?.label ?? u.role;
    toast.success(`Chào mừng${isNew ? "" : " lại"}, ${u.name}! 👋`, { description: `Vai trò: ${rl}` });

    // Priority 1: server-sent redirect (based on DB role — most authoritative)
    if (authRedirect) {
      window.location.href = authRedirect;
      return;
    }
    // Priority 2: frontend-set redirect (GitHub OAuth / admin login page)
    const storedRedirect = sessionStorage.getItem("post_auth_redirect");
    if (storedRedirect) {
      sessionStorage.removeItem("post_auth_redirect");
      window.location.href = storedRedirect;
    }
  }

  function handleNewUserComplete(phone: string, country: string) {
    if (!pendingNewUser) return;
    const completed = { ...pendingNewUser, phone, country, isNewUser: false };
    setPendingNewUser(null);
    // Retrieve any pending redirect that was stashed before new-user profile setup
    const storedRedirect = sessionStorage.getItem("post_auth_redirect") ?? "";
    if (storedRedirect) sessionStorage.removeItem("post_auth_redirect");
    applyAuthSuccess(completed, true, storedRedirect || undefined);
    toast.success(`Chào mừng ${completed.name}! Hồ sơ đã sẵn sàng 🎉`);
  }

  function handleAuthSuccess(u: UserProfile) {
    setUser(u);
    if (u.authProvider === "email" && !u.hasDob) {
      setTimeout(() => { setBirthdayReminderUser(u); setShowBirthdayReminder(true); }, 1200);
    }
  }

  function handleBuy(track: Track) {
    if (!user) { openAuth("login"); toast.info("Đăng nhập để mua beat"); return; }
    setCheckoutTrack(track);
    setShowCheckout(true);
  }

  function handleOrderComplete(item: PurchasedItem) {
    setShowCheckout(false);
    setLastPurchase(item);
    setPurchasedIds(s => new Set([...s, item.track.id]));
    // Auto-split: producer gets (100 - commission)%
    const producerCut = Math.round(item.amount * (1 - adminPayment.commission / 100));
    setProducerWalletBalance(b => b + producerCut);
    setShowDownload(true);
    toast.success("Thanh toán xác nhận! Đang mở trang tải file...", { description: `+${formatVND(producerCut)} đã ghi nhận cho Producer` });
  }

  function handlePlay(track: Track) {
    if (activeTrack?.id === track.id) {
      setIsPlaying((p) => { if (!p) { playTrack(track, volume); startProgress(); } else { stopAll(); stopProgress(); } return !p; });
      return;
    }
    stopProgress(); setActiveTrack(track); setProgress(0); setIsPlaying(true);
    playTrack(track, volume); startProgress();
  }

  function startProgress() {
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => setProgress((p) => { if (p >= 100) { clearInterval(progressRef.current!); return 0; } return p + 100 / 126; }), 1000);
  }
  function stopProgress() { if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; } }

  function handleNext() {
    if (!activeTrack) return;
    const next = TRACKS[(TRACKS.findIndex((t) => t.id === activeTrack.id) + 1) % TRACKS.length];
    stopProgress(); setProgress(0); setActiveTrack(next); setIsPlaying(true); playTrack(next, volume); startProgress();
  }
  function handlePrev() {
    if (!activeTrack) return;
    const prev = TRACKS[(TRACKS.findIndex((t) => t.id === activeTrack.id) - 1 + TRACKS.length) % TRACKS.length];
    stopProgress(); setProgress(0); setActiveTrack(prev); setIsPlaying(true); playTrack(prev, volume); startProgress();
  }

  function handleVolumeChange(v: number) { setVolume(v); updateVolume(v); }

  useEffect(() => () => stopProgress(), []);

  // Hiện loading screen khi đang đổi authorization code → JWT
  if (oAuthLoading) return <OAuthCallbackLoading />;

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", paddingBottom: activeTrack ? 72 : 0 }}>
      <Toaster position="top-right" theme="dark" richColors />

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50" style={{ background: "rgba(8,9,13,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#00c896" }}><Music size={13} style={{ color: "#020910" }} /></div>
            <span className="font-extrabold text-sm tracking-tight">mathuat<span style={{ color: "#00c896" }}>sound</span></span>
          </div>
          <div className="flex-1 relative max-w-sm hidden md:block">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b6b88" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm beat, artist..."
              className="w-full pl-8 pr-3 py-2 rounded-xl text-xs outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.07)", color: "#eeeef5" }}
              onFocus={(e) => { e.target.style.border = "1px solid rgba(0,200,150,0.35)"; }}
              onBlur={(e) => { e.target.style.border = "1px solid rgba(255,255,255,0.07)"; }} />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {user ? (
              <div className="flex items-center gap-2">
                {/* Role-specific nav buttons */}
                {user.role === "admin" && (
                  <a href="/admin"
                    className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                    ⚙️ Admin Panel
                  </a>
                )}
                <button onClick={() => setShowDash(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:bg-white/8"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#eeeef5" }}>
                  <UserAvatar user={user} size={20} /> {user.name.split(" ").pop()}
                </button>
                <button onClick={() => { setUser(null); setAppPage("home"); stopAll(); setActiveTrack(null); }} className="text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors" style={{ color: "#6b6b88" }}>
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => openAuth("login")} className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all hover:bg-white/8" style={{ color: "#eeeef5", border: "1px solid rgba(255,255,255,0.1)" }}>Đăng nhập</button>
                <button onClick={() => openAuth("register")} className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all hover:brightness-110" style={{ background: "#00c896", color: "#020910" }}>Đăng ký</button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Home Page ── */}
      {appPage === "home" && <>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ minHeight: 480 }}>
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1400&h=600&fit=crop&auto=format" alt="Music studio" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,200,150,0.12) 0%, transparent 70%)" }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 60%, #08090d 100%)" }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 py-20 flex flex-col items-center text-center gap-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(0,200,150,0.1)", color: "#00c896", border: "1px solid rgba(0,200,150,0.2)" }}>
            <Sparkles size={11} /> Beat & Sample Marketplace
          </span>
          <h1 className="font-extrabold leading-tight" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", letterSpacing: "-0.03em" }}>
            Mua bán Beat & Sample<br /><span style={{ color: "#00c896" }}>chuyên nghiệp</span>
          </h1>
          <p className="text-sm max-w-lg" style={{ color: "#6b6b88", lineHeight: 1.8 }}>
            Khám phá và mua beat & sample từ các producer độc lập.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={() => openAuth("register")} className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all hover:brightness-110 hover:scale-[1.02]" style={{ background: "#00c896", color: "#020910" }}>
              Bắt đầu miễn phí <ChevronRight size={15} />
            </button>
            <button className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all hover:bg-white/8" style={{ color: "#eeeef5", border: "1px solid rgba(255,255,255,0.12)" }}>
              <Headphones size={14} /> Nghe thử
            </button>
          </div>
        </div>
      </section>

      {/* ── Featured Beats (API-driven) ── */}
      <FeaturedSection
        onPlay={handlePlay}
        onBuy={handleBuy}
        activeTrackId={activeTrack?.id}
        isPlaying={isPlaying}
        likedIds={likedIds}
        onLike={(id) => setLikedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })}
      />

      {/* ── Genre Filter ── */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {GENRES.map((g) => (
            <button key={g} onClick={() => setGenre(g)} className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
              style={{ background: genre === g ? "#00c896" : "rgba(255,255,255,0.05)", color: genre === g ? "#020910" : "#6b6b88", border: genre === g ? "none" : "1px solid rgba(255,255,255,0.07)" }}>
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── Track Grid ── */}
      <section className="max-w-7xl mx-auto px-4 pb-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-extrabold text-lg">{genre === "All" ? "Tất cả Beats" : genre} <span className="text-sm font-normal" style={{ color: "#6b6b88" }}>({filtered.length})</span></h2>
        </div>
        {filtered.length === 0
          ? <div className="text-center py-20"><Music size={40} style={{ color: "rgba(255,255,255,0.08)" }} className="mx-auto mb-3" /><p className="text-sm" style={{ color: "#6b6b88" }}>Không tìm thấy kết quả</p></div>
          : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filtered.map((t) => (
                <TrackCard key={t.id} track={t} isActive={activeTrack?.id === t.id} isPlaying={isPlaying && activeTrack?.id === t.id}
                  onPlay={() => handlePlay(t)} liked={likedIds.has(t.id)} progress={activeTrack?.id === t.id ? progress : 0}
                  onLike={() => setLikedIds((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
                  onBuy={() => handleBuy(t)} />
              ))}
            </div>
        }
      </section>

      {/* ── Sample Packs ── */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <h2 className="font-extrabold text-lg mb-5">Sample Packs nổi bật</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PACKS.map((p) => (
            <div key={p.id} className="rounded-2xl overflow-hidden cursor-pointer group transition-all hover:-translate-y-1" style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="relative aspect-video overflow-hidden bg-[#090912]">
                <img src={p.cover} alt={p.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <span className="absolute top-3 left-3 text-[9px] font-bold px-2 py-1 rounded-full" style={{ background: "#00c896", color: "#020910" }}>{p.tag}</span>
              </div>
              <div className="p-4">
                <p className="font-bold text-sm mb-1" style={{ color: "#eeeef5" }}>{p.title}</p>
                <p className="text-xs mb-3" style={{ color: "#6b6b88" }}>by {p.creator} · {p.tracks} tracks</p>
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm" style={{ color: "#00c896" }}>{formatVND(p.price)}</span>
                  <button onClick={() => { if (!user) { openAuth("login"); } else { toast.success("Đã thêm pack vào giỏ hàng!"); } }}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: "rgba(0,200,150,0.1)", color: "#00c896" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#00c896"; e.currentTarget.style.color = "#020910"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,200,150,0.1)"; e.currentTarget.style.color = "#00c896"; }}>
                    Mua pack
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="max-w-7xl mx-auto px-4 pb-20">
        <div className="text-center mb-10">
          <h2 className="font-extrabold text-2xl mb-2" style={{ letterSpacing: "-0.02em" }}>Gói đăng ký Creator</h2>
          <p className="text-sm" style={{ color: "#6b6b88" }}>Chọn gói phù hợp với mức độ sáng tạo của bạn</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <div key={plan.name} className="rounded-2xl p-6 flex flex-col gap-4 relative"
              style={{ background: plan.highlight ? "linear-gradient(135deg, rgba(0,200,150,0.08), rgba(139,92,246,0.08))" : "#0f0f1a", border: plan.highlight ? "1px solid rgba(0,200,150,0.3)" : "1px solid rgba(255,255,255,0.07)" }}>
              {plan.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full" style={{ background: "#00c896", color: "#020910" }}>PHỔ BIẾN NHẤT</span>}
              <div>
                <p className="font-extrabold text-base mb-1">{plan.name}</p>
                <p className="text-xs" style={{ color: "#6b6b88" }}>{plan.description}</p>
              </div>
              <div>
                <span className="font-extrabold text-3xl" style={{ color: plan.highlight ? "#00c896" : "#eeeef5" }}>{formatVND(plan.price)}</span>
                {plan.price > 0 && <span className="text-xs ml-1" style={{ color: "#6b6b88" }}>/ {plan.period}</span>}
              </div>
              <ul className="flex flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs" style={{ color: "#eeeef5" }}>
                    <Check size={12} style={{ color: "#00c896", flexShrink: 0 }} /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => openAuth("register")} className="mt-auto py-3 rounded-xl font-bold text-sm transition-all hover:brightness-110"
                style={{ background: plan.highlight ? "#00c896" : "rgba(255,255,255,0.07)", color: plan.highlight ? "#020910" : "#eeeef5" }}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="max-w-7xl mx-auto px-4 py-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "#00c896" }}><Music size={11} style={{ color: "#020910" }} /></div>
            <span className="font-extrabold text-sm">mathuat<span style={{ color: "#00c896" }}>sound</span></span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <a href="/privacy-policy" className="text-xs no-underline hover:underline" style={{ color: "#6b6b88" }}>Chính sách bảo mật</a>
            <a href="/terms-of-service" className="text-xs no-underline hover:underline" style={{ color: "#6b6b88" }}>Điều khoản dịch vụ</a>
            <p className="text-xs" style={{ color: "#6b6b88" }}>© 2026 MathuatSound · Nền tảng âm nhạc Việt Nam</p>
          </div>
        </div>
      </footer>

      </>}{/* end appPage === "home" */}

      {/* ═══ MODALS ═══ */}

      <AuthModal isOpen={showAuth} defaultTab={authTab} onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />

      {user && (
        <DashboardModal isOpen={showDash} onClose={() => setShowDash(false)} user={user}
          onUpdateDob={() => { setShowDash(false); }} />
      )}

      {/* New user Google profile completion */}
      {pendingNewUser && (
        <NewUserProfileModal user={pendingNewUser} onComplete={handleNewUserComplete} onSkip={() => { setUser(pendingNewUser); setPendingNewUser(null); toast.success(`Chào mừng ${pendingNewUser.name}! 👋`); }} />
      )}

      {/* Birthday reminder for email users without DOB */}
      {showBirthdayReminder && birthdayReminderUser && (
        <BirthdayReminderModal userName={birthdayReminderUser.name}
          onUpdate={() => { setShowBirthdayReminder(false); setShowDash(true); }}
          onSkip={() => setShowBirthdayReminder(false)} />
      )}

      {/* ── Persistent Player ── */}
      <PersistentPlayer track={activeTrack} isPlaying={isPlaying} progress={progress} volume={volume}
        onPlayPause={() => {
          if (isPlaying) { stopAll(); stopProgress(); setIsPlaying(false); }
          else { if (activeTrack) { playTrack(activeTrack, volume); startProgress(); setIsPlaying(true); } }
        }}
        onNext={handleNext} onPrev={handlePrev}
        onProgressChange={(v) => setProgress(v)}
        onVolumeChange={handleVolumeChange}
        onClose={() => { stopAll(); stopProgress(); setActiveTrack(null); setIsPlaying(false); setProgress(0); }}
      />

      {/* ── OAuth Callback Loading ── */}

      {/* ── Checkout Modal ── */}
      {showCheckout && checkoutTrack && (
        <CheckoutModal
          track={checkoutTrack}
          adminPayment={adminPayment}
          onClose={() => setShowCheckout(false)}
          onComplete={handleOrderComplete}
        />
      )}

      {/* ── Download Modal ── */}
      {showDownload && lastPurchase && (
        <DownloadModal
          item={lastPurchase}
          onClose={() => setShowDownload(false)}
        />
      )}
    </div>
  );
}

// ── Privacy Policy Page — /privacy-policy ────────────────────────────────────
function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen" style={{ background: "#08090d", color: "#eeeef5" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <a href="/" className="flex items-center gap-2 no-underline">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#00c896" }}>
              <Music size={13} style={{ color: "#020910" }} />
            </div>
            <span className="font-extrabold text-sm">mathuat<span style={{ color: "#00c896" }}>sound</span></span>
          </a>
        </div>

        <h1 className="text-3xl font-extrabold mb-2" style={{ letterSpacing: "-0.03em" }}>Chính sách bảo mật</h1>
        <p className="text-sm mb-10" style={{ color: "#6b6b88" }}>Cập nhật lần cuối: tháng 9 năm 2026</p>

        <div className="flex flex-col gap-8 text-sm leading-relaxed" style={{ color: "#b0b0c8" }}>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>1. Giới thiệu</h2>
            <p>MathuatSound (<strong style={{ color: "#eeeef5" }}>mathuatbeatxyz.com</strong>) cam kết bảo vệ quyền riêng tư của bạn. Chính sách này giải thích chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân của bạn như thế nào khi sử dụng nền tảng của chúng tôi.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>2. Thông tin chúng tôi thu thập qua Google Sign-In</h2>
            <p className="mb-3">Khi bạn đăng nhập bằng tài khoản Google, chúng tôi <strong style={{ color: "#eeeef5" }}>chỉ</strong> yêu cầu các quyền tối thiểu (<code style={{ color: "#00c896", background: "rgba(0,200,150,0.1)", padding: "1px 4px", borderRadius: 3 }}>openid email profile</code>):</p>
            <ul className="list-disc list-inside flex flex-col gap-1.5 ml-2">
              <li><strong style={{ color: "#eeeef5" }}>Địa chỉ email</strong> — dùng để định danh tài khoản và liên lạc với bạn</li>
              <li><strong style={{ color: "#eeeef5" }}>Tên hiển thị</strong> — hiển thị trong hồ sơ của bạn trên nền tảng</li>
              <li><strong style={{ color: "#eeeef5" }}>Ảnh đại diện</strong> — hiển thị trong hồ sơ (tuỳ chọn)</li>
            </ul>
            <p className="mt-3">Chúng tôi <strong style={{ color: "#ef4444" }}>không</strong> truy cập Gmail, Google Drive, Google Contacts, Google Calendar hoặc bất kỳ dữ liệu Google nào khác ngoài thông tin hồ sơ cơ bản nêu trên.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>3. Cách chúng tôi sử dụng thông tin</h2>
            <ul className="list-disc list-inside flex flex-col gap-1.5 ml-2">
              <li>Xác thực danh tính và cung cấp quyền truy cập vào tài khoản của bạn</li>
              <li>Hiển thị tên và ảnh đại diện trong hồ sơ công khai của bạn</li>
              <li>Liên lạc với bạn về giao dịch, thông báo hệ thống và hỗ trợ</li>
              <li>Cải thiện tính năng và trải nghiệm người dùng trên nền tảng</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>4. Chia sẻ thông tin</h2>
            <p>Chúng tôi <strong style={{ color: "#ef4444" }}>không bán, không cho thuê và không chia sẻ</strong> thông tin cá nhân của bạn với bên thứ ba vì mục đích thương mại. Thông tin chỉ được chia sẻ khi:</p>
            <ul className="list-disc list-inside flex flex-col gap-1.5 ml-2 mt-2">
              <li>Cần thiết để vận hành dịch vụ (ví dụ: nhà cung cấp cơ sở hạ tầng đám mây)</li>
              <li>Được yêu cầu bởi pháp luật hoặc cơ quan có thẩm quyền</li>
              <li>Bạn đã đồng ý rõ ràng</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>5. Bảo mật dữ liệu</h2>
            <p>Chúng tôi áp dụng các biện pháp bảo mật phù hợp để bảo vệ thông tin của bạn, bao gồm mã hoá HTTPS, xác thực JWT và lưu trữ an toàn trên cơ sở hạ tầng đám mây.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>6. Quyền của bạn</h2>
            <p className="mb-2">Bạn có quyền:</p>
            <ul className="list-disc list-inside flex flex-col gap-1.5 ml-2">
              <li>Truy cập và chỉnh sửa thông tin hồ sơ của bạn</li>
              <li>Yêu cầu xoá toàn bộ dữ liệu tài khoản của bạn</li>
              <li>Thu hồi quyền truy cập Google tại <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: "#00c896" }}>myaccount.google.com/permissions</a></li>
            </ul>
            <p className="mt-3">Để yêu cầu xoá dữ liệu hoặc bất kỳ vấn đề bảo mật nào, vui lòng liên hệ: <a href="mailto:support@mathuatbeatxyz.com" style={{ color: "#00c896" }}>support@mathuatbeatxyz.com</a></p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>7. Cookies</h2>
            <p>Chúng tôi sử dụng cookie phiên (session cookie) ngắn hạn trong quá trình đăng nhập Google để bảo vệ chống CSRF. Cookie này tự động hết hạn sau 10 phút và không được dùng cho mục đích theo dõi.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>8. Thay đổi chính sách</h2>
            <p>Chúng tôi có thể cập nhật chính sách này định kỳ. Thay đổi quan trọng sẽ được thông báo qua email hoặc thông báo trên nền tảng. Tiếp tục sử dụng dịch vụ sau khi cập nhật đồng nghĩa với việc bạn chấp nhận chính sách mới.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>9. Liên hệ</h2>
            <p>Mọi câu hỏi về quyền riêng tư, vui lòng liên hệ:</p>
            <ul className="list-none flex flex-col gap-1 mt-2">
              <li><strong style={{ color: "#eeeef5" }}>Email:</strong> <a href="mailto:support@mathuatbeatxyz.com" style={{ color: "#00c896" }}>support@mathuatbeatxyz.com</a></li>
              <li><strong style={{ color: "#eeeef5" }}>Website:</strong> <a href="https://mathuatbeatxyz.com" style={{ color: "#00c896" }}>mathuatbeatxyz.com</a></li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <a href="/" className="text-sm font-semibold no-underline" style={{ color: "#00c896" }}>← Quay về trang chủ</a>
        </div>
      </div>
    </div>
  );
}

// ── Terms of Service Page — /terms-of-service ─────────────────────────────────
function TermsOfServicePage() {
  return (
    <div className="min-h-screen" style={{ background: "#08090d", color: "#eeeef5" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <a href="/" className="flex items-center gap-2 no-underline">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#00c896" }}>
              <Music size={13} style={{ color: "#020910" }} />
            </div>
            <span className="font-extrabold text-sm">mathuat<span style={{ color: "#00c896" }}>sound</span></span>
          </a>
        </div>

        <h1 className="text-3xl font-extrabold mb-2" style={{ letterSpacing: "-0.03em" }}>Điều khoản dịch vụ</h1>
        <p className="text-sm mb-10" style={{ color: "#6b6b88" }}>Cập nhật lần cuối: tháng 9 năm 2026</p>

        <div className="flex flex-col gap-8 text-sm leading-relaxed" style={{ color: "#b0b0c8" }}>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>1. Chấp nhận điều khoản</h2>
            <p>Bằng cách truy cập và sử dụng MathuatSound (<strong style={{ color: "#eeeef5" }}>mathuatbeatxyz.com</strong>), bạn đồng ý tuân thủ các điều khoản dịch vụ này. Nếu bạn không đồng ý, vui lòng không sử dụng nền tảng.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>2. Mô tả dịch vụ</h2>
            <p>MathuatSound là nền tảng âm nhạc Việt Nam cho phép:</p>
            <ul className="list-disc list-inside flex flex-col gap-1.5 ml-2 mt-2">
              <li>Producer tải lên và bán beat nhạc</li>
              <li>Người mua khám phá, nghe thử và mua beat có bản quyền</li>
              <li>Doanh nghiệp tìm kiếm âm nhạc cho dự án thương mại</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>3. Tài khoản và đăng nhập</h2>
            <p>Bạn có thể đăng ký và đăng nhập thông qua Google, GitHub hoặc SoundCloud. Bạn chịu trách nhiệm bảo mật tài khoản của mình và mọi hoạt động diễn ra dưới tài khoản đó. Chúng tôi chỉ yêu cầu thông tin hồ sơ cơ bản (email, tên, ảnh đại diện) từ các nhà cung cấp OAuth.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>4. Quyền sở hữu trí tuệ</h2>
            <p>Producer giữ toàn quyền sở hữu trí tuệ đối với beat của mình. Khi mua beat, người mua nhận được giấy phép sử dụng theo loại giấy phép đã chọn (MP3, WAV, hoặc BUNDLE). Giấy phép không bao gồm quyền bán lại hoặc phân phối lại beat.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>5. Hoa hồng và thanh toán</h2>
            <p>MathuatSound thu hoa hồng 15% trên mỗi giao dịch thành công. Producer nhận 85% giá trị beat sau khi giao dịch được xác nhận. Giá bán được hiển thị bằng đồng Việt Nam (VND).</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>6. Nội dung bị cấm</h2>
            <p>Nghiêm cấm tải lên nội dung vi phạm bản quyền, kích động thù địch, hoặc vi phạm pháp luật Việt Nam. Chúng tôi có quyền xoá nội dung vi phạm và khoá tài khoản mà không cần thông báo trước.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>7. Giới hạn trách nhiệm</h2>
            <p>MathuatSound không chịu trách nhiệm về thiệt hại gián tiếp, ngẫu nhiên hoặc hậu quả phát sinh từ việc sử dụng hoặc không thể sử dụng dịch vụ. Trách nhiệm tối đa của chúng tôi không vượt quá số tiền bạn đã thanh toán trong 3 tháng gần nhất.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>8. Thay đổi dịch vụ</h2>
            <p>Chúng tôi có quyền sửa đổi hoặc ngừng cung cấp dịch vụ bất kỳ lúc nào, có hoặc không có thông báo trước. Chúng tôi sẽ cố gắng thông báo trước ít nhất 30 ngày đối với các thay đổi quan trọng.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>9. Luật áp dụng</h2>
            <p>Các điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Mọi tranh chấp sẽ được giải quyết tại toà án có thẩm quyền tại Việt Nam.</p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3" style={{ color: "#eeeef5" }}>10. Liên hệ</h2>
            <p>Câu hỏi về điều khoản dịch vụ, vui lòng liên hệ: <a href="mailto:support@mathuatbeatxyz.com" style={{ color: "#00c896" }}>support@mathuatbeatxyz.com</a></p>
          </section>
        </div>

        <div className="mt-12 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <a href="/" className="text-sm font-semibold no-underline" style={{ color: "#00c896" }}>← Quay về trang chủ</a>
        </div>
      </div>
    </div>
  );
}

// ── Google Callback Page — rendered at /api/auth/google/callback ──────────────
//
// Google redirects the browser here after the user picks their Gmail account.
//
// TWO MODES depending on whether VITE_API_BASE_URL is configured:
//
// A) Split-domain (VITE_API_BASE_URL set, e.g. Railway):
//    startGoogleOAuth() redirected to ${API_BASE}/api/auth/google (backend initiation).
//    Backend set server-session CSRF state and used mathuatbeat.xyz/api/auth/google/callback
//    as redirect_uri. Google now lands here. We relay ?code=&state= directly to the
//    backend callback handler (${API_BASE}/api/auth/google/callback) which owns the
//    session CSRF, exchanges the code, creates the JWT, and redirects to the frontend
//    with ?auth_token= (AppShell LUỒNG B reads it).
//
// B) Same-origin (VITE_API_BASE_URL not set — backend and frontend share one origin):
//    startGoogleOAuth() set sessionStorage CSRF and sent the user to Google directly.
//    We verify sessionStorage CSRF here, then POST to /api/auth/google/exchange.
//
function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code      = searchParams.get("code");
    const state     = searchParams.get("state");
    const googleErr = searchParams.get("error"); // e.g. "access_denied"

    if (googleErr) {
      setError(`Đăng nhập bị huỷ: ${googleErr}`);
      sessionStorage.removeItem("google_oauth_state");
      setTimeout(() => navigate("/"), 2500);
      return;
    }

    if (!code) { navigate("/"); return; }

    // ── MODE A: Split-domain relay ───────────────────────────────────────────
    // Backend initiated OAuth and owns the server-session CSRF state.
    // Pass ?code=&state= straight to the backend callback handler.
    if (API_BASE) {
      const dest = new URL(`${API_BASE}/api/auth/google/callback`);
      dest.searchParams.set("code", code);
      if (state) dest.searchParams.set("state", state);
      window.location.href = dest.toString();
      return;
    }

    // ── MODE B: Same-origin — verify sessionStorage CSRF then exchange ───────
    const savedState = sessionStorage.getItem("google_oauth_state");
    sessionStorage.removeItem("google_oauth_state");

    if (!state || state !== savedState) {
      setError("Lỗi bảo mật: State không hợp lệ — vui lòng thử lại.");
      setTimeout(() => navigate("/"), 3000);
      return;
    }

    fetch(`/api/auth/google/exchange`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ code, redirect_uri: GOOGLE_REDIRECT_URI }),
    })
      .then(async r => {
        const text = await r.text();
        // Detect HTML response (CDN catch-all / SPA fallback) before JSON.parse
        if (text.trimStart().startsWith("<")) {
          throw new Error("Backend không trả về JSON. Hãy đặt VITE_API_BASE_URL trong Figma Make secrets.");
        }
        const data = JSON.parse(text) as { error?: string; user: UserProfile; token: string; isNew: boolean };
        if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
        return data;
      })
      .then(data => {
        sessionStorage.setItem("oauth_result", JSON.stringify({
          user:  data.user,
          token: data.token ?? "",
          isNew: data.isNew ?? false,
        }));
        navigate("/");
      })
      .catch((e: Error) => {
        setError(`Xác thực Google thất bại: ${e.message}`);
        setTimeout(() => navigate("/"), 3000);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4" style={{ background: "#08090d" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)" }}>
          <X size={20} style={{ color: "#ef4444" }} />
        </div>
        <p className="text-sm font-semibold text-center max-w-xs px-4" style={{ color: "#ef4444" }}>{error}</p>
        <p className="text-xs" style={{ color: "#6b6b88" }}>Đang chuyển về trang chủ...</p>
      </div>
    );
  }

  return <OAuthCallbackLoading />;
}

// ── OAuth Callback Page ──────────────────────────────────────────────────────
// Rendered at /auth/github/callback, /auth/soundcloud/callback
type OAuthProvider = "github" | "soundcloud";

const PROVIDER_META: Record<OAuthProvider, { label: string; apiPath: string; getRedirectUri: () => string; LoadingScreen: () => React.ReactElement }> = {
  github:     { label: "GitHub",     apiPath: "/api/auth/github/callback",     getRedirectUri: () => GH_REDIRECT_URI, LoadingScreen: GitHubCallbackLoading },
  soundcloud: { label: "SoundCloud", apiPath: "/api/auth/soundcloud/callback", getRedirectUri: () => SC_REDIRECT_URI, LoadingScreen: SoundCloudCallbackLoading },
};

function OAuthCallbackPage({ provider }: { provider: OAuthProvider }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const meta = PROVIDER_META[provider];

  useEffect(() => {
    const code  = searchParams.get("code");
    const err   = searchParams.get("error");
    const state = searchParams.get("state");

    if (err) {
      setError(`Đăng nhập ${meta.label} thất bại: ${err}`);
      sessionStorage.removeItem("oauth_state");
      sessionStorage.removeItem("oauth_action");
      sessionStorage.removeItem("oauth_provider");
      setTimeout(() => navigate("/"), 2500);
      return;
    }

    if (!code) { navigate("/"); return; }

    const savedState  = sessionStorage.getItem("oauth_state");
    const savedAction = sessionStorage.getItem("oauth_action") ?? "login";

    if (state !== savedState) {
      setError("Lỗi bảo mật: State không hợp lệ. Vui lòng thử lại.");
      setTimeout(() => navigate("/"), 2500);
      return;
    }

    sessionStorage.removeItem("oauth_state");
    sessionStorage.removeItem("oauth_action");
    sessionStorage.removeItem("oauth_provider");

    fetch(`${API_BASE}${meta.apiPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirect_uri: meta.getRedirectUri() }),
    })
      .then(r => r.json())
      .then((data: { error?: string; user: UserProfile; token?: string; isNew?: boolean }) => {
        if (data.error) throw new Error(data.error);
        sessionStorage.setItem("oauth_result", JSON.stringify({
          user: data.user,
          token: data.token ?? "",
          isNew: data.isNew ?? false,
          action: savedAction,
        }));
        navigate("/");
      })
      .catch((e: Error) => {
        setError(`Xác thực ${meta.label} thất bại: ${e.message}`);
        setTimeout(() => navigate("/"), 2500);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4" style={{ background: "#08090d" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)" }}>
          <X size={20} style={{ color: "#ef4444" }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>{error}</p>
        <p className="text-xs" style={{ color: "#6b6b88" }}>Đang chuyển về trang chủ...</p>
      </div>
    );
  }

  return <meta.LoadingScreen />;
}

// ── Root App with BrowserRouter + Routes ─────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Google OAuth callback — backend xử lý trước; route này là fallback client-side */}
        <Route path="/api/auth/google/callback" element={<GoogleCallbackPage />} />
        <Route path="/oauth2callback"           element={<GoogleCallbackPage />} />
        <Route path="/auth/github/callback"     element={<OAuthCallbackPage provider="github" />} />
        <Route path="/auth/soundcloud/callback" element={<OAuthCallbackPage provider="soundcloud" />} />
        {/* Các trang công khai — không cần đăng nhập */}
        <Route path="/privacy-policy"           element={<PrivacyPolicyPage />} />
        <Route path="/terms-of-service"         element={<TermsOfServicePage />} />
        <Route path="/admin/login"              element={<AdminLoginPage />} />
        <Route path="/admin"                    element={<AdminDashboardPage />} />
        <Route path="/admin/*"                  element={<AdminDashboardPage />} />
        <Route path="*"                         element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  );
}
