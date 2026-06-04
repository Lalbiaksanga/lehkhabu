import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, Users, BookOpen, ShoppingCart } from 'lucide-react';
import { fetchDashboardStats, type DashboardStats } from '../../services/analytics.service';
import { useAdminContext } from '../../components/layout/AdminLayout';

// Mock chart data for things not natively aggregated in Postgres yet
const weeklyUsers = [
  { day: 'Mon', new: 3, returning: 18 },
  { day: 'Tue', new: 5, returning: 22 },
  { day: 'Wed', new: 2, returning: 15 },
  { day: 'Thu', new: 7, returning: 31 },
  { day: 'Fri', new: 9, returning: 28 },
  { day: 'Sat', new: 11, returning: 35 },
  { day: 'Sun', new: 6, returning: 24 },
];

const monthlyRevenue = [
  { month: 'Jan', revenue: 42000 },
  { month: 'Feb', revenue: 58000 },
  { month: 'Mar', revenue: 71000 },
  { month: 'Apr', revenue: 103520, current: true },
];

const revenueChartData = [
  { date: 'Mon', revenue: 1250, orders: 8 },
  { date: 'Tue', revenue: 2100, orders: 15 },
  { date: 'Wed', revenue: 1800, orders: 12 },
  { date: 'Thu', revenue: 3400, orders: 24 },
  { date: 'Fri', revenue: 4200, orders: 32 },
  { date: 'Sat', revenue: 5100, orders: 40 },
  { date: 'Sun', revenue: 3800, orders: 28 },
];

const genreData = [
  { name: 'Fiction', value: 45, color: 'var(--color-blue)' },
  { name: 'Non-Fiction', value: 30, color: 'var(--color-green)' },
  { name: 'Poetry', value: 15, color: 'var(--color-purple)' },
  { name: 'Biography', value: 10, color: 'var(--color-gold)' },
];

function CustomTooltipRevenue({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '10px 14px', boxShadow: 'var(--shadow-lg)' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontSize: '0.9rem', fontWeight: 700, color: p.color }}>
          {p.name}: {p.dataKey === 'revenue' ? `₹${p.value.toLocaleString('en-IN')}` : p.value}
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { addToast } = useAdminContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (e: any) {
      addToast(e.message ?? 'Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const totalRev = stats?.totalRevenue ?? 0;
  const avgOrder = stats?.totalPurchases ? (totalRev / stats.totalPurchases) : 0;
  const convRate = stats?.totalUsers ? ((stats.totalPurchases / stats.totalUsers) * 100).toFixed(1) : '0';

  if (loading) {
    return <div style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading analytics…</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Analytics</h1>
            <p>Platform-wide revenue, user growth, and book performance insights.</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid animate-fade-in-up">
        {[
          { label: 'Total Revenue', value: `₹${(totalRev / 1000).toFixed(1)}K`, sub: '↑ 23% from last month', icon: TrendingUp, color: 'var(--color-gold)', dim: 'var(--color-gold-dim)' },
          { label: 'Avg. Order Value', value: `₹${avgOrder.toFixed(0)}`, sub: '↑ 4% from last month', icon: ShoppingCart, color: 'var(--color-green)', dim: 'var(--color-green-dim)' },
          { label: 'Total Authors', value: stats?.totalAuthors ?? 0, sub: `${stats?.totalUsers ?? 0} total users`, icon: Users, color: 'var(--color-blue)', dim: 'var(--color-blue-dim)' },
          { label: 'Conversion Rate', value: `${convRate}%`, sub: 'Users → Buyers', icon: BookOpen, color: 'var(--color-purple)', dim: 'var(--color-purple-dim)' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`stat-card animate-fade-in-up stagger-${i + 1}`}>
              <div className="stat-card-icon" style={{ background: s.dim }}>
                <Icon size={20} style={{ color: s.color }} />
              </div>
              <div>
                <div className="stat-card-label">{s.label}</div>
                <div className="stat-card-value">{s.value}</div>
                <div className="stat-card-sub" style={{ color: 'var(--color-green)' }}>{s.sub}</div>
              </div>
              <div className="stat-card-glow" style={{ background: s.color }} />
            </div>
          );
        })}
      </div>

      {/* Revenue Over Time (daily) */}
      <div className="content-grid animate-fade-in-up stagger-3" style={{ marginBottom: 'var(--space-md)' }}>
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Daily Revenue — This Week</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-green)' }}>
              ₹{revenueChartData.reduce((s, d) => s + d.revenue, 0).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="section-card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-gold)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-gold)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip content={<CustomTooltipRevenue />} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-gold)" strokeWidth={2} fillOpacity={1} fill="url(#revGrad2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">User Signups</span>
          </div>
          <div className="section-card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyUsers} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} dy={8} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'var(--bg-elevated)' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.8rem', paddingTop: 10 }} />
                <Bar dataKey="new" name="New Users" stackId="a" fill="var(--color-blue)" radius={[0, 0, 4, 4]} />
                <Bar dataKey="returning" name="Returning Users" stackId="a" fill="rgba(88, 166, 255, 0.2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="content-grid animate-fade-in-up stagger-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Sales by Genre</span>
          </div>
          <div className="section-card-body" style={{ paddingTop: 0, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={genreData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                  {genreData.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, paddingLeft: 'var(--space-md)' }}>
              {genreData.map(g => (
                <div key={g.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.color }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{g.name}</span>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{g.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Monthly Revenue Trend</span>
          </div>
          <div className="section-card-body" style={{ paddingTop: 0 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyRevenue} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} dy={8} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }} formatter={(v: any) => `₹${Number(v).toLocaleString()}`} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {monthlyRevenue.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.current ? 'var(--color-gold)' : 'var(--color-blue-dim)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
