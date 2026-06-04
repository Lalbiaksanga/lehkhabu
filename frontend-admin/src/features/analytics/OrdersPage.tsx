import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Download, Eye, XCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminContext } from '../../components/layout/AdminLayout';
import { format, formatDistanceToNow } from 'date-fns';

type PurchaseStatus = 'COMPLETED' | 'REFUNDED' | 'PENDING' | 'FAILED';

interface Purchase {
  id: string;
  amount: number;
  status: PurchaseStatus;
  purchasedAt: string;
  userName: string;
  userEmail: string;
  bookTitle: string;
  coverColor: string;
}

const STATUS_TABS: { key: 'all' | PurchaseStatus; label: string }[] = [
  { key: 'all', label: 'All Orders' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: 'FAILED', label: 'Failed' },
];

const AVATAR_COLORS = ['gold', 'blue', 'green', 'purple', 'red', 'cyan'];

export default function OrdersPage() {
  const { addToast } = useAdminContext();
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<'all' | PurchaseStatus>('all');
  const [search, setSearch] = useState('');
  const [viewOrder, setViewOrder] = useState<Purchase | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase
        .from('purchases')
        .select(`
          id, amount, status, purchased_at,
          users!purchases_user_id_fkey ( full_name, username, email ),
          books!purchases_book_id_fkey ( title, cover_color_primary )
        `)
        .order('purchased_at', { ascending: false })
        .limit(200);

      if (dbErr) throw dbErr;

      setOrders((data ?? []).map((p: any): Purchase => ({
        id: p.id,
        amount: p.amount ?? 0,
        status: p.status,
        purchasedAt: p.purchased_at,
        userName: p.users?.full_name ?? p.users?.username ?? 'Unknown',
        userEmail: p.users?.email ?? '',
        bookTitle: p.books?.title ?? 'Deleted Book',
        coverColor: p.books?.cover_color_primary ?? '#C17817',
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders
    .filter(o => activeStatus === 'all' || o.status === activeStatus)
    .filter(o =>
      o.userName.toLowerCase().includes(search.toLowerCase()) ||
      o.bookTitle.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase())
    );

  const totalRevenue = orders.filter(o => o.status === 'COMPLETED').reduce((s, o) => s + o.amount, 0);
  const totalRefunds = orders.filter(o => o.status === 'REFUNDED').reduce((s, o) => s + o.amount, 0);

  const tabCounts = STATUS_TABS.map(t => ({
    ...t,
    count: t.key === 'all' ? orders.length : orders.filter(o => o.status === t.key).length,
  }));

  function downloadCSV() {
    const rows = [
      ['Order ID', 'Customer', 'Email', 'Book', 'Amount', 'Status', 'Date'].join(','),
      ...filtered.map(o => [
        o.id, `"${o.userName}"`, o.userEmail, `"${o.bookTitle}"`,
        o.amount, o.status, format(new Date(o.purchasedAt), 'yyyy-MM-dd HH:mm'),
      ].join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orders-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Orders exported to CSV!', 'success');
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-inner">
          <div>
            <h1>Orders</h1>
            <p>Track all book purchases, refunds and payment records.</p>
          </div>
          <div className="page-header-actions">
            <button className="btn btn-secondary btn-sm" onClick={load} id="refresh-orders-btn">
              <RefreshCw size={14} /> Refresh
            </button>
            <button className="btn btn-secondary" id="export-orders-btn" onClick={downloadCSV}>
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="announcement-banner" style={{ marginBottom: 'var(--space-md)', borderColor: 'var(--color-red)', background: 'rgba(239,68,68,0.06)' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-red)' }}>{error}</span>
          <button className="btn btn-secondary btn-sm" onClick={load}>Retry</button>
        </div>
      )}

      {/* Summary */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 'var(--space-md)' }}>
        {[
          { label: 'Total Orders', value: loading ? '…' : orders.length, color: 'var(--color-blue)', dim: 'var(--color-blue-dim)' },
          { label: 'Completed', value: loading ? '…' : orders.filter(o => o.status === 'COMPLETED').length, color: 'var(--color-green)', dim: 'var(--color-green-dim)' },
          { label: 'Total Revenue', value: loading ? '…' : `₹${totalRevenue.toLocaleString('en-IN')}`, color: 'var(--color-gold)', dim: 'var(--color-gold-dim)' },
          { label: 'Refunds', value: loading ? '…' : `₹${totalRefunds.toLocaleString('en-IN')}`, color: 'var(--color-red)', dim: 'var(--color-red-dim)' },
        ].map((s, i) => (
          <div key={s.label} className={`stat-card animate-fade-in-up stagger-${i + 1}`}>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value" style={{ fontSize: '1.5rem', color: s.color }}>{s.value}</div>
            <div className="stat-card-glow" style={{ background: s.color }} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)', alignItems: 'center' }}>
        <div className="filter-tabs">
          {tabCounts.map(t => (
            <button key={t.key} className={`filter-tab${activeStatus === t.key ? ' active' : ''}`}
              onClick={() => setActiveStatus(t.key)} id={`order-tab-${t.key}`}>
              {t.label}
              {t.count > 0 && (
                <span style={{ marginLeft: 4, fontSize: '0.68rem', fontWeight: 700, background: activeStatus === t.key ? 'var(--color-gold-dim)' : 'var(--bg-elevated)', color: activeStatus === t.key ? 'var(--color-gold)' : 'var(--text-muted)', borderRadius: 'var(--radius-full)', padding: '1px 6px' }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
          <Search />
          <input className="search-input" placeholder="Search by user, book or order ID…"
            value={search} onChange={e => setSearch(e.target.value)} id="orders-search" />
        </div>
      </div>

      {/* Table */}
      <div className="section-card animate-fade-in">
        <div className="table-wrapper" style={{ border: 'none' }}>
          {loading ? (
            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading orders…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><Filter size={40} /><p>No orders found.</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Book</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, i) => (
                  <tr key={order.id} className={`animate-fade-in-up stagger-${Math.min(i + 1, 8)}`}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        #{order.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={`avatar avatar-sm avatar-${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>{order.userName[0]}</div>
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{order.userName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{order.userEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 34, borderRadius: '2px 4px 4px 2px', background: order.coverColor, flexShrink: 0, boxShadow: '1px 1px 4px rgba(0,0,0,0.3)' }} />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{order.bookTitle}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-gold)', fontSize: '0.95rem' }}>
                        ₹{order.amount}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${order.status === 'COMPLETED' ? 'approved' : order.status === 'REFUNDED' ? 'rejected' : 'pending'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      <div>{format(new Date(order.purchasedAt), 'MMM d, yyyy')}</div>
                      <div style={{ fontSize: '0.68rem' }}>{format(new Date(order.purchasedAt), 'HH:mm')}</div>
                    </td>
                    <td>
                      <button className="btn-icon" onClick={() => setViewOrder(order)} id={`view-order-${order.id}`}>
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Order Detail Modal */}
      {viewOrder && (
        <div className="modal-backdrop" onClick={() => setViewOrder(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div>
                <h3>Order Details</h3>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>#{viewOrder.id}</div>
              </div>
              <button className="btn-icon" onClick={() => setViewOrder(null)} id="close-order-modal"><XCircle size={16} /></button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { label: 'Customer', value: viewOrder.userName },
                { label: 'Email', value: viewOrder.userEmail },
                { label: 'Book', value: viewOrder.bookTitle },
                { label: 'Amount', value: `₹${viewOrder.amount}` },
                { label: 'Status', value: viewOrder.status },
                { label: 'Order Date', value: format(new Date(viewOrder.purchasedAt), 'PPPp') },
                { label: 'Time Since', value: formatDistanceToNow(new Date(viewOrder.purchasedAt), { addSuffix: true }) },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{item.label}</span>
                  {item.label === 'Status' ? (
                    <span className={`badge badge-${viewOrder.status === 'COMPLETED' ? 'approved' : viewOrder.status === 'REFUNDED' ? 'rejected' : 'pending'}`}>
                      {viewOrder.status}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{item.value}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewOrder(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
