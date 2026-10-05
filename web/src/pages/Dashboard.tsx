import { useEffect, useState } from 'react';
import {
  apiGetNFTs,
  apiGetNotifications,
  apiListCodOrders,
  apiListDeliveries,
  type Delivery,
} from '../api';
import { PageId } from '../Shell';

type Stats = {
  pendingOrders: number;
  inDelivery: number;
  completed: number;
  nftCount: number;
  unreadNotifications: number;
};

const TILE_PAGE: Record<string, PageId> = {
  pendingOrders:        'crm',
  inDelivery:           'crm',
  completed:            'crm',
  nftCount:             'nfts',
  unreadNotifications:  'notifications',
};

type Props = { onJumpTo: (p: PageId) => void };

export default function Dashboard({ onJumpTo }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [orders, deliveries, nfts, notes] = await Promise.all([
          apiListCodOrders().catch(() => []),
          apiListDeliveries().catch(() => []),
          apiGetNFTs().catch(() => []),
          apiGetNotifications().catch(() => []),
        ]);
        if (cancelled) return;
        setStats({
          pendingOrders: orders.filter(o => o.status === 'pending').length,
          inDelivery:    deliveries.filter(d => !['delivered', 'completed', 'cancelled'].includes(d.status)).length,
          completed:     deliveries.filter(d => ['delivered', 'completed'].includes(d.status)).length,
          nftCount:      nfts.length,
          unreadNotifications: notes.filter(n => !n.read).length,
        });
        setRecent(
          [...deliveries]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 5),
        );
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="spinner">Загрузка…</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return null;

  const tiles: { key: keyof Stats; label: string; value: number; tone?: string }[] = [
    { key: 'pendingOrders',       label: 'Заказы ждут обработки', value: stats.pendingOrders,       tone: 'badge-pending' },
    { key: 'inDelivery',          label: 'В доставке',            value: stats.inDelivery,          tone: 'badge-info' },
    { key: 'completed',           label: 'Доставлено',            value: stats.completed,           tone: 'badge-success' },
    { key: 'nftCount',            label: 'NFT в кошельке',        value: stats.nftCount,            tone: 'badge-info' },
    { key: 'unreadNotifications', label: 'Новых уведомлений',     value: stats.unreadNotifications, tone: 'badge-pending' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Сводка</h2>
          <p>Краткий обзор бизнес-активности.</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {tiles.map(t => (
          <button
            key={t.key}
            className="card"
            onClick={() => onJumpTo(TILE_PAGE[t.key])}
            style={{ textAlign: 'left', cursor: 'pointer' }}
          >
            <div className="sub" style={{ marginBottom: 6 }}>{t.label}</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{t.value}</div>
          </button>
        ))}
      </div>

      <h3 style={{ margin: '0 0 12px' }}>Последние доставки</h3>
      {recent.length === 0 ? (
        <div className="empty">Пока ничего.</div>
      ) : (
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>NFT</th>
                  <th>Покупатель</th>
                  <th>Адрес</th>
                  <th>Статус</th>
                  <th>Создана</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(d => (
                  <tr key={d.id}>
                    <td>{d.nftTitle}</td>
                    <td>{d.buyerName}</td>
                    <td style={{ maxWidth: 280 }}>{d.deliveryAddress}</td>
                    <td><span className="badge badge-info">{d.status}</span></td>
                    <td>{new Date(d.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
