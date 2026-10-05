import { useCallback, useEffect, useState } from 'react';
import {
  apiDeleteNotification,
  apiGetNotifications,
  apiMarkAllRead,
  apiMarkRead,
  type Notification,
} from '../api';
import { Icon } from '../icons';

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiGetNotifications());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const markRead = async (id: string) => {
    try { await apiMarkRead(id); await reload(); } catch (e: any) { alert(e?.message ?? 'Failed'); }
  };

  const markAll = async () => {
    try { await apiMarkAllRead(); await reload(); } catch (e: any) { alert(e?.message ?? 'Failed'); }
  };

  const remove = async (id: string) => {
    try { await apiDeleteNotification(id); await reload(); } catch (e: any) { alert(e?.message ?? 'Failed'); }
  };

  const unreadCount = items.filter(i => !i.read).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Уведомления</h2>
          <p>{unreadCount} непрочитанных.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={reload}><Icon.Refresh /> Обновить</button>
          <button className="btn btn-primary" disabled={unreadCount === 0} onClick={markAll}>
            <Icon.Check /> Отметить все
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="spinner">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="empty">Пусто.</div>
      ) : (
        items.map(n => (
          <div
            key={n.id}
            className="card"
            style={{
              borderLeft: n.read ? undefined : '3px solid var(--primary)',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 14 }}>{n.title}</h3>
                <p className="sub" style={{ fontSize: 13, margin: '4px 0' }}>{n.body}</p>
                <div className="sub" style={{ fontSize: 11 }}>
                  {new Date(n.createdAt).toLocaleString()} · {n.type}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                {!n.read && <button className="btn" onClick={() => markRead(n.id)}><Icon.Check /></button>}
                <button className="btn btn-danger" onClick={() => remove(n.id)}><Icon.Trash /></button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
