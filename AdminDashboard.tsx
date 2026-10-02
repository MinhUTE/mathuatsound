import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  LayoutDashboard, ShoppingCart, Music2, Users, Mic2,
  Banknote, Settings, Search, Bell, LogOut, ChevronRight,
  TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle,
  Filter, Download, Upload, Eye, Edit3, Trash2, MoreHorizontal,
  RefreshCw, ExternalLink, Shield, X, Check, Copy, ChevronDown,
  ArrowUpRight, ArrowDownRight, Loader2, CircleSlash, FileText,
  DollarSign, Star, UserCheck, Activity, Package, Percent, Save,
  QrCode, Menu,
} from "lucide-react";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const API_BASE = (
  (import.meta as Record<string, any>).env?.VITE_API_BASE_URL ||
  "https://mathuatsound-production.up.railway.app"
).trim();

const GREEN  = "#00c896";
const PURPLE = "#8b5cf6";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";
const BLUE   = "#3b82f6";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface Order {
  id: string;
  buyer: string;
  buyerEmail: string;
  beat: string;
  producer: string;
  license: string;
  amount: number;
  status: "completed" | "pending" | "failed" | "refunded";
  createdAt: string;
}

interface Beat {
  id: number;
  title: string;
  producer: string;
  producerId: string;
  genre: string;
  bpm: number;
  key: string;
  price: number;
  status: "Pending" | "Approved" | "Rejected";
  uploadedAt: string;
  mp3Url?: string | null;
  rejectReason?: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "admin" | "producer" | "user";
  joinedAt: string;
  isVerified: boolean;
  beatCount?: number;
  orderCount?: number;
}

interface Artist {
  id: string;
  name: string;
  email: string;
  beatCount: number;
  approvedBeats: number;
  pendingBeats: number;
  totalEarnings: number;
  joinedAt: string;
  isVerified: boolean;
}

interface Payment {
  id: string;
  orderId: string;
  buyer: string;
  producer: string;
  amount: number;
  platformFee: number;
  producerShare: number;
  status: "settled" | "pending" | "refunded";
  createdAt: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("auth_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  return `${Math.floor(hrs / 24)} ngày trước`;
}

function decodeJwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role ? String(payload.role).toLowerCase() : null;
  } catch {
    return null;
  }
}

function decodeJwtUser(token: string): Partial<AdminUser> | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return {
      id: payload.sub ?? payload.id ?? "",
      name: payload.name ?? payload.email ?? "Admin",
      email: payload.email ?? "",
      role: payload.role ? String(payload.role).toLowerCase() : "",
      avatar: payload.avatar ?? undefined,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Auth guard hook
// ─────────────────────────────────────────────

function useAdminAuth() {
  const [status, setStatus] = useState<"loading" | "ok" | "unauth" | "forbidden">("loading");
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) { setStatus("unauth"); return; }

    // Quick JWT decode to get an optimistic role (avoids full flash to 403 on cold load)
    const localRole = decodeJwtRole(token);
    if (!localRole) { setStatus("unauth"); return; }

    // Verify server-side: /api/auth/me returns fresh role from DB and re-issues token
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async res => {
        if (res.status === 401) { setStatus("unauth"); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { user: AdminUser; token: string };
        // Persist re-issued token (may contain updated role)
        if (data.token) localStorage.setItem("auth_token", data.token);
        if (String(data.user.role).toLowerCase() !== "admin") {
          setStatus("forbidden");
        } else {
          setUser(data.user);
          setStatus("ok");
        }
      })
      .catch(() => {
        // Backend unreachable — fall back to local JWT decode
        // This allows the admin panel to load in dev without the backend running
        if (localRole !== "admin") { setStatus("forbidden"); return; }
        const partial = decodeJwtUser(token);
        setUser({ id: "", name: "Admin", email: "", role: "admin", ...partial });
        setStatus("ok");
      });
  }, []);

  return { status, user };
}

// ─────────────────────────────────────────────
// Small reusable UI atoms
// ─────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: `${color}18`, color }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    completed:  ["Hoàn thành", GREEN],
    settled:    ["Đã quyết toán", GREEN],
    Approved:   ["Đã duyệt", GREEN],
    pending:    ["Chờ xử lý", AMBER],
    Pending:    ["Chờ duyệt", AMBER],
    failed:     ["Thất bại", RED],
    Rejected:   ["Từ chối", RED],
    refunded:   ["Hoàn tiền", PURPLE],
  };
  const [label, color] = map[status] ?? [status, "#6b6b88"];
  return <Badge label={label} color={color} />;
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = { admin: RED, producer: PURPLE, user: BLUE };
  return <Badge label={role} color={map[role] ?? "#6b6b88"} />;
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded animate-pulse ${className}`}
      style={{ background: "rgba(255,255,255,0.06)" }}
    />
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <Icon size={28} style={{ color: "#6b6b88" }} />
      </div>
      <div>
        <p className="font-semibold text-sm mb-1" style={{ color: "#eeeef5" }}>{title}</p>
        <p className="text-xs max-w-xs" style={{ color: "#6b6b88" }}>{description}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
          style={{ background: GREEN, color: "#020910" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle size={32} style={{ color: RED }} />
      <p className="text-sm font-medium" style={{ color: "#eeeef5" }}>Lỗi tải dữ liệu</p>
      <p className="text-xs" style={{ color: "#6b6b88" }}>{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2"
        style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}
      >
        <RefreshCw size={12} /> Thử lại
      </button>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight" style={{ color: "#eeeef5" }}>{title}</h1>
        {description && <p className="text-xs mt-0.5" style={{ color: "#6b6b88" }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#6b6b88" }} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none transition-all"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "#eeeef5",
        }}
      />
    </div>
  );
}

function Table({
  cols,
  children,
  loading,
  skeletonRows = 5,
}: {
  cols: string[];
  children: React.ReactNode;
  loading?: boolean;
  skeletonRows?: number;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              {cols.map(c => (
                <th key={c} className="px-4 py-3 text-left font-semibold" style={{ color: "#6b6b88" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => <SkeletonRow key={i} cols={cols.length} />)
              : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Td({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`px-4 py-3 ${className}`}
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#eeeef5", ...style }}
    >
      {children}
    </td>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "#6b6b88" }}>{label}</span>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight" style={{ color: "#eeeef5" }}>{value}</p>
        {subtext && <p className="text-xs mt-0.5" style={{ color: "#6b6b88" }}>{subtext}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal shell
// ─────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`w-full ${width} rounded-2xl overflow-hidden flex flex-col`}
        style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <h2 className="font-bold text-sm" style={{ color: "#eeeef5" }}>{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70 transition-opacity" style={{ color: "#6b6b88" }}>
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION: Dashboard overview
// ─────────────────────────────────────────────

function DashboardSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<null | {
    orders: number; revenue: number; beats: number; users: number;
  }>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<{ label: string; time: string; type: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch pending beats count (existing endpoint)
      const res = await fetch(`${API_BASE}/api/admin/tracks/pending`, { headers: authHeader() });
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : data.tracks ?? [];
        setPendingCount(arr.length);
        setRecentActivity(
          arr.slice(0, 5).map((b: Beat) => ({
            label: `Beat mới: "${b.title}" từ ${b.producer}`,
            time: b.uploadedAt,
            type: "beat",
          }))
        );
      }
      // Stats: will show zeros until backend provides dedicated endpoint
      setStats({ orders: 0, revenue: 0, beats: 0, users: 0 });
    } catch {
      setError("Không thể kết nối backend. Kiểm tra VITE_API_BASE_URL.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div>
        <SectionHeader title="Dashboard" description="Tổng quan hệ thống" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (error) return <div><SectionHeader title="Dashboard" /><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div>
      <SectionHeader title="Dashboard" description="Tổng quan hệ thống — kết nối backend để xem dữ liệu thực" />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Tổng đơn hàng" value={stats?.orders ?? 0} icon={ShoppingCart} color={GREEN} subtext="Chờ dữ liệu backend" />
        <StatCard label="Doanh thu" value={stats ? formatVND(stats.revenue) : "—"} icon={DollarSign} color={PURPLE} subtext="Chờ dữ liệu backend" />
        <StatCard label="Tổng beat" value={stats?.beats ?? 0} icon={Music2} color={AMBER} subtext="Chờ dữ liệu backend" />
        <StatCard label="Người dùng" value={stats?.users ?? 0} icon={Users} color={BLUE} subtext="Chờ dữ liệu backend" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Pending beats */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm" style={{ color: "#eeeef5" }}>Beat chờ duyệt</h3>
            {pendingCount !== null && (
              <Badge label={`${pendingCount} beat`} color={AMBER} />
            )}
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={Music2}
              title="Không có beat chờ duyệt"
              description="Khi producer gửi beat mới, chúng sẽ xuất hiện ở đây."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {recentActivity.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${AMBER}18` }}>
                      <Music2 size={13} style={{ color: AMBER }} />
                    </div>
                    <p className="text-xs" style={{ color: "#eeeef5" }}>{item.label}</p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "#6b6b88" }}>{timeAgo(item.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <h3 className="font-bold text-sm mb-4" style={{ color: "#eeeef5" }}>Hành động nhanh</h3>
          <div className="flex flex-col gap-2">
            {[
              { label: "Duyệt beat đang chờ", icon: CheckCircle2, color: GREEN, section: "beats" },
              { label: "Xem đơn hàng mới", icon: ShoppingCart, color: BLUE, section: "orders" },
              { label: "Quản lý người dùng", icon: Users, color: PURPLE, section: "users" },
              { label: "Cấu hình thanh toán", icon: Banknote, color: AMBER, section: "payments" },
            ].map(item => (
              <button
                key={item.section}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:opacity-80"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${item.color}18` }}>
                  <item.icon size={13} style={{ color: item.color }} />
                </div>
                <span className="text-xs" style={{ color: "#eeeef5" }}>{item.label}</span>
                <ChevronRight size={12} className="ml-auto" style={{ color: "#6b6b88" }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Backend status note */}
      <div
        className="mt-4 rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: `${AMBER}0d`, border: `1px solid ${AMBER}30` }}
      >
        <AlertCircle size={14} style={{ color: AMBER, marginTop: 1, flexShrink: 0 }} />
        <p className="text-xs" style={{ color: AMBER }}>
          Một số thẻ thống kê đang hiển thị giá trị mặc định (0) vì backend chưa cung cấp endpoint tổng hợp.
          Kết nối Railway backend để xem dữ liệu thực.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION: Orders
// ─────────────────────────────────────────────

function OrdersSection() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/orders`, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : data.orders ?? []);
    } catch (e: any) {
      if (e.message?.includes("404")) setOrders([]);
      else setError(e.message ?? "Lỗi tải đơn hàng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchQ = !q || o.id.toLowerCase().includes(q) || o.buyer.toLowerCase().includes(q) || o.beat.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || o.status === statusFilter;
    return matchQ && matchS;
  });

  return (
    <div>
      <SectionHeader
        title="Đơn hàng"
        description="Tất cả giao dịch mua beat trên nền tảng"
        action={
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}
          >
            <RefreshCw size={12} /> Làm mới
          </button>
        }
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <SearchBar value={search} onChange={setSearch} placeholder="Tìm mã đơn, người mua, beat..." />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#eeeef5" }}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="completed">Hoàn thành</option>
          <option value="pending">Chờ xử lý</option>
          <option value="failed">Thất bại</option>
          <option value="refunded">Hoàn tiền</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Table
          cols={["Mã đơn", "Người mua", "Beat", "Producer", "Giấy phép", "Số tiền", "Trạng thái", "Thời gian", ""]}
          loading={loading}
        >
          {filtered.length === 0 && !loading ? (
            <tr><td colSpan={9}>
              <EmptyState
                icon={ShoppingCart}
                title="Chưa có đơn hàng nào"
                description="Đơn hàng sẽ xuất hiện ở đây khi khách hàng mua beat. Kết nối backend để xem dữ liệu thực."
              />
            </td></tr>
          ) : (
            filtered.map(o => (
              <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                <Td><code className="text-xs" style={{ color: GREEN }}>{o.id.slice(0, 8)}…</code></Td>
                <Td>{o.buyer}<br /><span className="text-xs" style={{ color: "#6b6b88" }}>{o.buyerEmail}</span></Td>
                <Td>{o.beat}</Td>
                <Td>{o.producer}</Td>
                <Td><Badge label={o.license} color={BLUE} /></Td>
                <Td><span className="font-semibold" style={{ color: GREEN }}>{formatVND(o.amount)}</span></Td>
                <Td><StatusBadge status={o.status} /></Td>
                <Td style={{ color: "#6b6b88" }}>{timeAgo(o.createdAt)}</Td>
                <Td>
                  <button onClick={() => setDetail(o)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "#6b6b88" }}>
                    <Eye size={13} />
                  </button>
                </Td>
              </tr>
            ))
          )}
        </Table>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Chi tiết đơn hàng">
        {detail && (
          <div className="flex flex-col gap-4">
            {[
              ["Mã đơn", detail.id],
              ["Người mua", `${detail.buyer} (${detail.buyerEmail})`],
              ["Beat", detail.beat],
              ["Producer", detail.producer],
              ["Giấy phép", detail.license],
              ["Số tiền", formatVND(detail.amount)],
              ["Trạng thái", detail.status],
              ["Thời gian", new Date(detail.createdAt).toLocaleString("vi-VN")],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span style={{ color: "#6b6b88" }}>{k}</span>
                <span className="font-semibold" style={{ color: "#eeeef5" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION: Beats
// ─────────────────────────────────────────────

function BeatsSection() {
  const [beats, setBeats] = useState<Beat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Pending" | "Approved" | "Rejected">("all");
  const [detail, setDetail] = useState<Beat | null>(null);
  const [rejectModal, setRejectModal] = useState<Beat | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actioning, setActioning] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/tracks/pending`, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const pending: Beat[] = Array.isArray(data) ? data : data.tracks ?? [];

      // Also load approved
      const res2 = await fetch(`${API_BASE}/api/admin/beats/approved`, { headers: authHeader() }).catch(() => null);
      const approved: Beat[] = res2?.ok ? await res2.json().then((d: any) => Array.isArray(d) ? d : d.beats ?? []).catch(() => []) : [];

      setBeats([...pending, ...approved]);
    } catch (e: any) {
      if (e.message?.includes("404")) setBeats([]);
      else setError(e.message ?? "Lỗi tải beat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApprove(beat: Beat) {
    setActioning(beat.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/tracks/${beat.id}/approve`, {
        method: "POST",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error("Lỗi duyệt beat");
      setBeats(prev => prev.filter(b => b.id !== beat.id));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActioning(null);
    }
  }

  async function handleReject(beat: Beat) {
    if (!rejectReason.trim()) return;
    setActioning(beat.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/tracks/${beat.id}/reject`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error("Lỗi từ chối beat");
      setBeats(prev => prev.filter(b => b.id !== beat.id));
      setRejectModal(null);
      setRejectReason("");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActioning(null);
    }
  }

  function togglePlay(beat: Beat) {
    if (!beat.mp3Url) return;
    if (playingId === beat.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      audioRef.current = new Audio(beat.mp3Url);
      audioRef.current.play();
      audioRef.current.onended = () => setPlayingId(null);
      setPlayingId(beat.id);
    }
  }

  const filtered = beats.filter(b => {
    const q = search.toLowerCase();
    const matchQ = !q || b.title.toLowerCase().includes(q) || b.producer.toLowerCase().includes(q);
    const matchS = statusFilter === "all" || b.status === statusFilter;
    return matchQ && matchS;
  });

  const pendingCount = beats.filter(b => b.status === "Pending").length;

  return (
    <div>
      <SectionHeader
        title="Beats"
        description="Quản lý tất cả beat trên nền tảng"
        action={
          <div className="flex items-center gap-2">
            {pendingCount > 0 && <Badge label={`${pendingCount} chờ duyệt`} color={AMBER} />}
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-80"
              style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}>
              <RefreshCw size={12} /> Làm mới
            </button>
          </div>
        }
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <SearchBar value={search} onChange={setSearch} placeholder="Tìm tên beat, producer..." />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 rounded-xl text-xs outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#eeeef5" }}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="Pending">Chờ duyệt</option>
          <option value="Approved">Đã duyệt</option>
          <option value="Rejected">Từ chối</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Table
          cols={["Beat", "Producer", "BPM / Key", "Giá", "Trạng thái", "Ngày gửi", "Hành động"]}
          loading={loading}
        >
          {filtered.length === 0 && !loading ? (
            <tr><td colSpan={7}>
              <EmptyState
                icon={Music2}
                title="Không có beat nào"
                description={statusFilter === "Pending" ? "Không có beat nào đang chờ duyệt." : "Chưa có beat nào trong danh mục này."}
              />
            </td></tr>
          ) : (
            filtered.map(b => (
              <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                <Td>
                  <div className="font-medium text-xs" style={{ color: "#eeeef5" }}>{b.title}</div>
                  {b.genre && <div className="text-xs" style={{ color: "#6b6b88" }}>{b.genre}</div>}
                </Td>
                <Td>{b.producer}</Td>
                <Td style={{ color: "#6b6b88" }}>{b.bpm} BPM · {b.key}</Td>
                <Td><span className="font-semibold" style={{ color: GREEN }}>{formatVND(b.price)}</span></Td>
                <Td><StatusBadge status={b.status} /></Td>
                <Td style={{ color: "#6b6b88" }}>{timeAgo(b.uploadedAt)}</Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDetail(b)} className="p-1.5 rounded-lg hover:opacity-70" title="Chi tiết" style={{ color: "#6b6b88" }}>
                      <Eye size={13} />
                    </button>
                    {b.status === "Pending" && (
                      <>
                        <button
                          onClick={() => handleApprove(b)}
                          disabled={actioning === b.id}
                          className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                          title="Duyệt"
                          style={{ color: GREEN }}
                        >
                          {actioning === b.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        </button>
                        <button
                          onClick={() => { setRejectModal(b); setRejectReason(""); }}
                          disabled={actioning === b.id}
                          className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
                          title="Từ chối"
                          style={{ color: RED }}
                        >
                          <XCircle size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))
          )}
        </Table>
      )}

      {/* Beat detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Chi tiết Beat">
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${PURPLE}18` }}>
                <Music2 size={22} style={{ color: PURPLE }} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "#eeeef5" }}>{detail.title}</p>
                <p className="text-xs" style={{ color: "#6b6b88" }}>{detail.producer}</p>
              </div>
              <StatusBadge status={detail.status} />
            </div>
            {[
              ["BPM", detail.bpm],
              ["Key", detail.key],
              ["Genre", detail.genre],
              ["Giá", formatVND(detail.price)],
              ["Ngày gửi", new Date(detail.uploadedAt).toLocaleString("vi-VN")],
              detail.rejectReason ? ["Lý do từ chối", detail.rejectReason] : null,
            ].filter(Boolean).map(([k, v]) => (
              <div key={String(k)} className="flex justify-between text-xs">
                <span style={{ color: "#6b6b88" }}>{k}</span>
                <span className="font-semibold text-right max-w-xs" style={{ color: "#eeeef5" }}>{String(v)}</span>
              </div>
            ))}
            {detail.mp3Url && (
              <div>
                <p className="text-xs mb-2" style={{ color: "#6b6b88" }}>Nghe thử MP3</p>
                <audio controls src={detail.mp3Url} className="w-full" style={{ height: 36 }} />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Reject reason modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Từ chối Beat">
        {rejectModal && (
          <div className="flex flex-col gap-4">
            <p className="text-xs" style={{ color: "#6b6b88" }}>
              Bạn đang từ chối beat <strong style={{ color: "#eeeef5" }}>"{rejectModal.title}"</strong> của {rejectModal.producer}.
            </p>
            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: "#eeeef5" }}>Lý do từ chối *</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Ví dụ: Chất lượng âm thanh không đạt yêu cầu..."
                className="w-full px-3 py-2 rounded-xl text-xs outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#eeeef5" }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 rounded-xl text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}>
                Hủy
              </button>
              <button
                onClick={() => handleReject(rejectModal)}
                disabled={!rejectReason.trim() || actioning === rejectModal.id}
                className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                style={{ background: RED, color: "#fff" }}
              >
                {actioning === rejectModal.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Từ chối beat
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION: Users
// ─────────────────────────────────────────────

function UsersSection() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [detail, setDetail] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : data.users ?? []);
    } catch (e: any) {
      if (e.message?.includes("404")) setUsers([]);
      else setError(e.message ?? "Lỗi tải người dùng");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchQ = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchR = roleFilter === "all" || u.role === roleFilter;
    return matchQ && matchR;
  });

  return (
    <div>
      <SectionHeader
        title="Người dùng"
        description="Tất cả tài khoản đã đăng ký"
        action={
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}>
            <RefreshCw size={12} /> Làm mới
          </button>
        }
      />

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex-1 min-w-48">
          <SearchBar value={search} onChange={setSearch} placeholder="Tìm tên, email..." />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#eeeef5" }}
        >
          <option value="all">Tất cả vai trò</option>
          <option value="admin">Admin</option>
          <option value="producer">Producer</option>
          <option value="user">Buyer</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Table
          cols={["Người dùng", "Email", "Vai trò", "Đã xác minh", "Beats", "Đơn hàng", "Ngày tham gia", ""]}
          loading={loading}
        >
          {filtered.length === 0 && !loading ? (
            <tr><td colSpan={8}>
              <EmptyState
                icon={Users}
                title="Chưa có người dùng nào"
                description="Người dùng đăng ký sẽ xuất hiện ở đây sau khi backend được kết nối."
              />
            </td></tr>
          ) : (
            filtered.map(u => (
              <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: `${BLUE}20`, color: BLUE }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-xs">{u.name}</span>
                  </div>
                </Td>
                <Td style={{ color: "#6b6b88" }}>{u.email}</Td>
                <Td><RoleBadge role={u.role} /></Td>
                <Td>
                  {u.isVerified
                    ? <CheckCircle2 size={14} style={{ color: GREEN }} />
                    : <XCircle size={14} style={{ color: "#6b6b88" }} />}
                </Td>
                <Td style={{ color: "#6b6b88" }}>{u.beatCount ?? "—"}</Td>
                <Td style={{ color: "#6b6b88" }}>{u.orderCount ?? "—"}</Td>
                <Td style={{ color: "#6b6b88" }}>{timeAgo(u.joinedAt)}</Td>
                <Td>
                  <button onClick={() => setDetail(u)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "#6b6b88" }}>
                    <Eye size={13} />
                  </button>
                </Td>
              </tr>
            ))
          )}
        </Table>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Chi tiết người dùng">
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ background: `${BLUE}20`, color: BLUE }}>
                {detail.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "#eeeef5" }}>{detail.name}</p>
                <p className="text-xs" style={{ color: "#6b6b88" }}>{detail.email}</p>
              </div>
              <RoleBadge role={detail.role} />
            </div>
            {[
              ["ID", detail.id],
              ["Xác minh", detail.isVerified ? "Đã xác minh" : "Chưa xác minh"],
              ["Beats đã đăng", detail.beatCount ?? "—"],
              ["Đơn hàng", detail.orderCount ?? "—"],
              ["Ngày tham gia", new Date(detail.joinedAt).toLocaleString("vi-VN")],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between text-xs">
                <span style={{ color: "#6b6b88" }}>{k}</span>
                <span className="font-semibold" style={{ color: "#eeeef5" }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION: Artists / Producers
// ─────────────────────────────────────────────

function ArtistsSection() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Artist | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/producers`, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setArtists(Array.isArray(data) ? data : data.producers ?? []);
    } catch (e: any) {
      if (e.message?.includes("404")) setArtists([]);
      else setError(e.message ?? "Lỗi tải danh sách producer");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = artists.filter(a => {
    const q = search.toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
  });

  return (
    <div>
      <SectionHeader
        title="Artists / Producers"
        description="Danh sách producer đã đăng ký trên nền tảng"
        action={
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.06)", color: "#eeeef5" }}>
            <RefreshCw size={12} /> Làm mới
          </button>
        }
      />

      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Tìm tên producer, email..." />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <Table
          cols={["Producer", "Beats tổng", "Đã duyệt", "Chờ duyệt", "Tổng thu nhập", "Xác minh", "Ngày tham gia", ""]}
          loading={loading}
        >
          {filtered.length === 0 && !loading ? (
            <tr><td colSpan={8}>
              <EmptyState
                icon={Mic2}
                title="Chưa có producer nào"
                description="Producer đăng ký và gửi beat sẽ xuất hiện ở đây."
              />
            </td></tr>
          ) : (
            filtered.map(a => (
              <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: `${PURPLE}20`, color: PURPLE }}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-xs" style={{ color: "#eeeef5" }}>{a.name}</p>
                      <p className="text-xs" style={{ color: "#6b6b88" }}>{a.email}</p>
                    </div>
                  </div>
                </Td>
                <Td style={{ color: "#eeeef5" }}>{a.beatCount}</Td>
                <Td><span style={{ color: GREEN }}>{a.approvedBeats}</span></Td>
                <Td><span style={{ color: AMBER }}>{a.pendingBeats}</span></Td>
                <Td><span className="font-semibold" style={{ color: GREEN }}>{formatVND(a.totalEarnings)}</span></Td>
                <Td>
                  {a.isVerified
                    ? <CheckCircle2 size={14} style={{ color: GREEN }} />
                    : <XCircle size={14} style={{ color: "#6b6b88" }} />}
                </Td>
                <Td style={{ color: "#6b6b88" }}>{timeAgo(a.joinedAt)}</Td>
                <Td>
                  <button onClick={() => setDetail(a)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: "#6b6b88" }}>
                    <Eye size={13} />
                  </button>
                </Td>
              </tr>
            ))
          )}
        </Table>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Chi tiết Producer">
        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ background: `${PURPLE}20`, color: PURPLE }}>
                {detail.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "#eeeef5" }}>{detail.name}</p>
                <p className="text-xs" style={{ color: "#6b6b88" }}>{detail.email}</p>
              </div>
            </div>
            {[
              ["Beats tổng", detail.beatCount],
              ["Đã duyệt", detail.approvedBeats],
              ["Chờ duyệt", detail.pendingBeats],
              ["Tổng thu nhập", formatVND(detail.totalEarnings)],
              ["Xác minh", detail.isVerified ? "Đã xác minh" : "Chưa xác minh"],
              ["Ngày tham gia", new Date(detail.joinedAt).toLocaleString("vi-VN")],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between text-xs">
                <span style={{ color: "#6b6b88" }}>{k}</span>
                <span className="font-semibold" style={{ color: "#eeeef5" }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION: Payments
// ─────────────────────────────────────────────

function PaymentsSection() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"history" | "config">("history");

  // Payment config state
  const [commission, setCommission] = useState("15");
  const [accountName, setAccountName] = useState("LE HAI ANH");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/payments`, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : data.payments ?? []);
    } catch (e: any) {
      if (e.message?.includes("404")) setPayments([]);
      else setError(e.message ?? "Lỗi tải lịch sử thanh toán");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === "history") load(); }, [load, tab]);

  async function saveConfig() {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/admin/payment-config`, {
        method: "PUT",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ commission: parseFloat(commission), accountName }),
      });
      alert("Đã lưu cấu hình thanh toán");
    } catch {
      alert("Lỗi lưu cấu hình");
    } finally {
      setSaving(false);
    }
  }

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    return !q || p.orderId.toLowerCase().includes(q) || p.buyer.toLowerCase().includes(q);
  });

  return (
    <div>
      <SectionHeader title="Thanh toán" description="Lịch sử giao dịch và cấu hình thanh toán" />

      <div className="flex gap-2 mb-5">
        {[
          { key: "history", label: "Lịch sử" },
          { key: "config", label: "Cấu hình QR" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: tab === t.key ? GREEN : "rgba(255,255,255,0.05)",
              color: tab === t.key ? "#020910" : "#eeeef5",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "history" && (
        <>
          <div className="mb-4">
            <SearchBar value={search} onChange={setSearch} placeholder="Tìm mã đơn, người mua..." />
          </div>
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : (
            <Table
              cols={["Mã đơn", "Người mua", "Producer", "Tổng tiền", "Phí nền tảng", "Producer nhận", "Trạng thái", "Thời gian"]}
              loading={loading}
            >
              {filtered.length === 0 && !loading ? (
                <tr><td colSpan={8}>
                  <EmptyState
                    icon={Banknote}
                    title="Chưa có giao dịch nào"
                    description="Lịch sử thanh toán sẽ xuất hiện ở đây sau khi có đơn hàng."
                  />
                </td></tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <Td><code className="text-xs" style={{ color: GREEN }}>{p.orderId.slice(0, 8)}…</code></Td>
                    <Td>{p.buyer}</Td>
                    <Td>{p.producer}</Td>
                    <Td><span className="font-semibold" style={{ color: GREEN }}>{formatVND(p.amount)}</span></Td>
                    <Td><span style={{ color: AMBER }}>-{formatVND(p.platformFee)}</span></Td>
                    <Td><span style={{ color: PURPLE }}>{formatVND(p.producerShare)}</span></Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td style={{ color: "#6b6b88" }}>{timeAgo(p.createdAt)}</Td>
                  </tr>
                ))
              )}
            </Table>
          )}
        </>
      )}

      {tab === "config" && (
        <div
          className="rounded-2xl p-6 max-w-lg flex flex-col gap-5"
          style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${GREEN}18` }}>
              <QrCode size={20} style={{ color: GREEN }} />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: "#eeeef5" }}>Cấu hình nhận tiền</p>
              <p className="text-xs" style={{ color: "#6b6b88" }}>Thông tin hiển thị trên màn hình checkout</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: "#6b6b88" }}>Tên người nhận</label>
              <input
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                placeholder="LE HAI ANH"
                className="w-full px-3 py-2.5 rounded-xl text-xs outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#eeeef5" }}
              />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: "#6b6b88" }}>
                Hoa hồng nền tảng (%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={commission}
                  onChange={e => setCommission(e.target.value)}
                  min="0" max="100" step="0.5"
                  className="w-24 px-3 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#eeeef5" }}
                />
                <span className="text-xs" style={{ color: "#6b6b88" }}>
                  Producer nhận <strong style={{ color: GREEN }}>{100 - parseFloat(commission || "0")}%</strong>
                </span>
              </div>
            </div>

            <div
              className="rounded-xl p-3"
              style={{ background: `${AMBER}0d`, border: `1px solid ${AMBER}25` }}
            >
              <p className="text-xs" style={{ color: AMBER }}>
                Để thay đổi ảnh QR, upload file mới vào <code>src/imports/</code> và cập nhật import trong App.tsx.
              </p>
            </div>

            <button
              onClick={saveConfig}
              disabled={saving}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
              style={{ background: GREEN, color: "#020910" }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Lưu cấu hình
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SECTION: Settings
// ─────────────────────────────────────────────

function SettingsSection() {
  const [siteName, setSiteName] = useState("MathuatSound");
  const [contactEmail, setContactEmail] = useState("");
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/admin/settings`, {
        method: "PUT",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ siteName, contactEmail, allowRegistration, maintenanceMode }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, child: React.ReactNode, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold" style={{ color: "#6b6b88" }}>{label}</label>
      {child}
      {hint && <p className="text-xs" style={{ color: "#6b6b88" }}>{hint}</p>}
    </div>
  );

  const inputClass = "w-full px-3 py-2.5 rounded-xl text-xs outline-none";
  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#eeeef5" };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className="relative w-10 h-5 rounded-full transition-all"
      style={{ background: value ? GREEN : "rgba(255,255,255,0.1)" }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{ background: "#fff", left: value ? "calc(100% - 18px)" : "2px" }}
      />
    </button>
  );

  return (
    <div>
      <SectionHeader title="Cài đặt" description="Cấu hình chung của nền tảng" />

      <div className="max-w-lg flex flex-col gap-5">
        <div className="rounded-2xl p-5 flex flex-col gap-5"
          style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b6b88" }}>Thông tin nền tảng</p>

          {field("Tên nền tảng",
            <input value={siteName} onChange={e => setSiteName(e.target.value)}
              className={inputClass} style={inputStyle} placeholder="MathuatSound" />
          )}

          {field("Email liên hệ",
            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
              type="email" className={inputClass} style={inputStyle} placeholder="admin@mathuatbeat.xyz" />
          )}
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#6b6b88" }}>Kiểm soát truy cập</p>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold" style={{ color: "#eeeef5" }}>Cho phép đăng ký mới</p>
              <p className="text-xs" style={{ color: "#6b6b88" }}>Tắt để ngừng nhận thành viên mới</p>
            </div>
            <Toggle value={allowRegistration} onChange={setAllowRegistration} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold" style={{ color: "#eeeef5" }}>Chế độ bảo trì</p>
              <p className="text-xs" style={{ color: "#6b6b88" }}>Hiện thông báo bảo trì cho người dùng</p>
            </div>
            <Toggle value={maintenanceMode} onChange={setMaintenanceMode} />
          </div>
        </div>

        <div className="rounded-2xl p-4"
          style={{ background: `${BLUE}0d`, border: `1px solid ${BLUE}25` }}>
          <p className="text-xs" style={{ color: BLUE }}>
            Một số cài đặt yêu cầu backend <code>/api/admin/settings</code> endpoint.
            Lưu sẽ không ảnh hưởng nếu endpoint chưa tồn tại.
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: saved ? `${GREEN}cc` : GREEN, color: "#020910" }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Đã lưu!" : "Lưu cài đặt"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Admin Layout (sidebar + header)
// ─────────────────────────────────────────────

const NAV_ITEMS = [
  { key: "dashboard",  label: "Dashboard",     icon: LayoutDashboard },
  { key: "orders",     label: "Đơn hàng",      icon: ShoppingCart    },
  { key: "beats",      label: "Beats",         icon: Music2          },
  { key: "users",      label: "Người dùng",    icon: Users           },
  { key: "artists",    label: "Artists",       icon: Mic2            },
  { key: "payments",   label: "Thanh toán",    icon: Banknote        },
  { key: "settings",   label: "Cài đặt",       icon: Settings        },
];

function Sidebar({
  section,
  onSection,
  mobileOpen,
  onClose,
}: {
  section: string;
  onSection: (s: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-30 lg:hidden transition-opacity duration-200"
        style={{
          background: "rgba(0,0,0,0.6)",
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? "auto" : "none",
        }}
        onClick={onClose}
      />

      <aside
        className={`fixed left-0 top-0 h-full z-40 flex flex-col transition-transform duration-[250ms] lg:!translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 224, background: "#0c0c16", borderRight: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm"
            style={{ background: GREEN, color: "#020910" }}>
            M
          </div>
          <div>
            <p className="text-sm font-extrabold tracking-tight" style={{ color: "#eeeef5" }}>MathuatSound</p>
            <p className="text-xs" style={{ color: "#6b6b88" }}>Admin Panel</p>
          </div>
          <button onClick={onClose} className="ml-auto lg:hidden p-1 rounded-lg" style={{ color: "#6b6b88" }}>
            <X size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const active = section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => { onSection(item.key); onClose(); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-left w-full transition-all"
                style={{
                  background: active ? `${GREEN}18` : "transparent",
                  color: active ? GREEN : "#6b6b88",
                }}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          <a
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold w-full transition-all hover:opacity-80"
            style={{ color: "#6b6b88" }}
          >
            <ExternalLink size={15} /> Về trang chủ
          </a>
          <button
            onClick={() => { localStorage.removeItem("auth_token"); window.location.href = "/"; }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold w-full transition-all hover:opacity-80"
            style={{ color: RED }}
          >
            <LogOut size={15} /> Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
}

function AdminHeader({
  section,
  user,
  onToggleSidebar,
}: {
  section: string;
  user: AdminUser | null;
  onToggleSidebar: () => void;
}) {
  const [globalSearch, setGlobalSearch] = useState("");
  const active = NAV_ITEMS.find(n => n.key === section);

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-4 px-5 py-3"
      style={{
        background: "rgba(8,9,13,0.9)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(12px)",
      }}
    >
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-2 rounded-xl hover:opacity-70"
        style={{ color: "#6b6b88" }}
      >
        <Menu size={18} />
      </button>

      <div className="flex items-center gap-2">
        {active && <active.icon size={16} style={{ color: GREEN }} />}
        <h1 className="text-sm font-bold" style={{ color: "#eeeef5" }}>{active?.label ?? "Admin"}</h1>
      </div>

      <div className="flex-1 max-w-xs hidden sm:block">
        <SearchBar value={globalSearch} onChange={setGlobalSearch} placeholder="Tìm kiếm toàn bộ..." />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: `${GREEN}20`, color: GREEN }}
          >
            {(user?.name ?? "A").charAt(0).toUpperCase()}
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-semibold leading-tight" style={{ color: "#eeeef5" }}>{user?.name ?? "Admin"}</p>
            <p className="text-xs leading-tight" style={{ color: "#6b6b88" }}>Administrator</p>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// Auth screens
// ─────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#08090d" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl"
          style={{ background: GREEN, color: "#020910" }}>M</div>
        <Loader2 size={20} className="animate-spin" style={{ color: GREEN }} />
        <p className="text-xs" style={{ color: "#6b6b88" }}>Đang xác thực...</p>
      </div>
    </div>
  );
}

function ForbiddenScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#08090d" }}>
      <div className="flex flex-col items-center gap-4 text-center p-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: `${RED}15`, border: `1px solid ${RED}30` }}>
          <Shield size={28} style={{ color: RED }} />
        </div>
        <h1 className="text-lg font-bold" style={{ color: "#eeeef5" }}>Không có quyền truy cập</h1>
        <p className="text-xs max-w-xs" style={{ color: "#6b6b88" }}>
          Trang này chỉ dành cho Admin. Tài khoản của bạn không có quyền này.
        </p>
        <a
          href="/"
          className="px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: GREEN, color: "#020910" }}
        >
          Về trang chủ
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// OAuth helpers (mirrors App.tsx startGoogleOAuth / startGitHubOAuth)
// Sets a sessionStorage flag so applyAuthSuccess in App.tsx can redirect
// back to /admin after the token is stored.
// ─────────────────────────────────────────────

const GITHUB_CLIENT_ID =
  (import.meta as Record<string, any>).env?.VITE_GITHUB_CLIENT_ID ?? "Ov23liYaGvEJVERRpbVE";

function startAdminGoogleOAuth() {
  // No sessionStorage flag needed — backend resolves role from DB and sets auth_redirect=/admin
  try { (window as any).google?.accounts.id.cancel(); } catch { /* ignore */ }
  window.location.href = `${API_BASE}/api/auth/google`;
}

function startAdminGitHubOAuth() {
  const state = `gh_admin_${crypto.randomUUID()}`;
  sessionStorage.setItem("post_auth_redirect", "/admin");
  sessionStorage.setItem("oauth_state", state);
  sessionStorage.setItem("oauth_action", "login");
  sessionStorage.setItem("oauth_provider", "github");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${window.location.origin}/auth/github/callback`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  window.location.href = url.toString();
}

// ─────────────────────────────────────────────
// Admin Login Page  (exported so App.tsx can mount it at /admin/login)
// ─────────────────────────────────────────────

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  // If already authenticated as Admin, skip login
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token && decodeJwtRole(token) === "admin") {
      navigate("/admin", { replace: true });
    } else {
      setChecking(false);
    }
  }, [navigate]);

  if (checking) return <LoadingScreen />;

  // Check if we're coming back from OAuth with an error
  const urlParams = new URLSearchParams(window.location.search);
  const authError = urlParams.get("auth_error");

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#08090d" }}
    >
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 30% 20%, ${GREEN}08 0%, transparent 50%),
                            radial-gradient(circle at 70% 80%, ${PURPLE}06 0%, transparent 50%)`,
        }}
      />

      <div
        className="relative w-full max-w-sm rounded-3xl p-8 flex flex-col gap-6"
        style={{ background: "#0f0f1a", border: "1px solid rgba(255,255,255,0.09)" }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl"
            style={{ background: GREEN, color: "#020910" }}
          >
            M
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight" style={{ color: "#eeeef5" }}>
              MathuatSound
            </h1>
            <p className="text-xs font-semibold mt-0.5" style={{ color: "#6b6b88" }}>
              Admin Portal
            </p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

        {/* Error from OAuth */}
        {authError && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-2.5"
            style={{ background: `${RED}0f`, border: `1px solid ${RED}30` }}
          >
            <AlertCircle size={14} style={{ color: RED, flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs" style={{ color: RED }}>
              {decodeURIComponent(authError)}
            </p>
          </div>
        )}

        {/* Info */}
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-2.5"
          style={{ background: `${AMBER}0d`, border: `1px solid ${AMBER}28` }}
        >
          <Shield size={14} style={{ color: AMBER, flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-relaxed" style={{ color: AMBER }}>
            Chỉ tài khoản có quyền <strong>Admin</strong> mới truy cập được trang quản trị.
          </p>
        </div>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-3">
          <p className="text-xs text-center font-semibold" style={{ color: "#6b6b88" }}>
            Đăng nhập để tiếp tục
          </p>

          {/* Google */}
          <button
            onClick={startAdminGoogleOAuth}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#fff", color: "#111" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Tiếp tục với Google
          </button>

          {/* GitHub */}
          <button
            onClick={startAdminGitHubOAuth}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#24292e", color: "#fff" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Tiếp tục với GitHub
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <a
            href="/"
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "#6b6b88" }}
          >
            ← Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Root admin page
// ─────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { status, user } = useAdminAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect unauthenticated visitors to the admin login page (not the customer site)
  useEffect(() => {
    if (status === "unauth") navigate("/admin/login", { replace: true });
  }, [status, navigate]);

  if (status === "loading" || status === "unauth") return <LoadingScreen />;
  if (status === "forbidden") return <ForbiddenScreen />;

  return (
    <div className="min-h-screen" style={{ background: "#08090d" }}>
      <Sidebar
        section={section}
        onSection={setSection}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area — offset by sidebar on large screens only */}
      <div className="min-h-screen flex flex-col lg:ml-56">
        <AdminHeader section={section} user={user} onToggleSidebar={() => setSidebarOpen(v => !v)} />
        <main className="flex-1 px-5 py-6 w-full mx-auto" style={{ maxWidth: 1280 }}>
          {section === "dashboard" && <DashboardSection />}
          {section === "orders"    && <OrdersSection />}
          {section === "beats"     && <BeatsSection />}
          {section === "users"     && <UsersSection />}
          {section === "artists"   && <ArtistsSection />}
          {section === "payments"  && <PaymentsSection />}
          {section === "settings"  && <SettingsSection />}
        </main>
      </div>
    </div>
  );
}
