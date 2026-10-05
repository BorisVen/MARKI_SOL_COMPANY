import { useCallback, useEffect, useState } from 'react';
import {
  apiAddCryptoWallet,
  apiGetCryptoWallets,
  apiGetMarkiWallet,
  apiRefreshWalletBalance,
  apiRemoveCryptoWallet,
  apiUpdateFingerprint,
  apiUpdateMarkiEmail,
  type CryptoWallet,
  type MarkiWallet,
} from '../api';
import { Icon } from '../icons';

export default function WalletsPage() {
  const [marki, setMarki] = useState<MarkiWallet | null>(null);
  const [cryptos, setCryptos] = useState<CryptoWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, c] = await Promise.all([
        apiGetMarkiWallet().catch(() => null),
        apiGetCryptoWallets().catch(() => []),
      ]);
      setMarki(m);
      setCryptos(c);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Кошельки</h2>
          <p>Marki Wallet и подключённые крипто-кошельки.</p>
        </div>
        <button className="btn" onClick={reload}><Icon.Refresh /> Обновить</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="spinner">Загрузка…</div>}

      {!loading && marki && <MarkiCard wallet={marki} reload={reload} />}

      {!loading && (
        <>
          <h3 style={{ margin: '24px 0 12px' }}>Crypto-кошельки</h3>
          <CryptoList wallets={cryptos} reload={reload} />
        </>
      )}
    </div>
  );
}

function MarkiCard({ wallet, reload }: { wallet: MarkiWallet; reload: () => Promise<void> }) {
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState(wallet.email);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const saveEmail = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiUpdateMarkiEmail(emailValue.trim());
      setEditingEmail(false);
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleFp = async (enabled: boolean) => {
    try {
      await apiUpdateFingerprint(enabled);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Update failed');
    }
  };

  const balanceRows = Object.entries(wallet.balance || {});

  return (
    <div className="card">
      <h3>Marki Wallet</h3>
      <p className="sub" style={{ marginBottom: 16 }}>Custodial — управляется через сервис.</p>

      <div className="field">
        <label>Email</label>
        {editingEmail ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={emailValue} onChange={e => setEmailValue(e.target.value)} />
            <button className="btn btn-primary" onClick={saveEmail} disabled={busy}>OK</button>
            <button className="btn" onClick={() => { setEditingEmail(false); setEmailValue(wallet.email); }} disabled={busy}>×</button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{wallet.email}</span>
            <button className="btn" onClick={() => setEditingEmail(true)}>Изменить</button>
          </div>
        )}
      </div>

      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={wallet.fingerprintEnabled}
            onChange={e => toggleFp(e.target.checked)}
          />
          Подтверждение отпечатком при переводах
        </label>
      </div>

      {balanceRows.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, margin: '14px 0 8px' }}>Баланс</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {balanceRows.map(([cur, amt]) => (
              <div key={cur} className="card" style={{ background: 'var(--bg-soft)', padding: '10px 16px' }}>
                <div className="sub" style={{ fontSize: 11 }}>{cur}</div>
                <div style={{ fontWeight: 600 }}>{amt}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {err && <div className="error-banner" style={{ marginTop: 12 }}>{err}</div>}
    </div>
  );
}

function CryptoList({ wallets, reload }: { wallets: CryptoWallet[]; reload: () => Promise<void> }) {
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!address.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await apiAddCryptoWallet({ address: address.trim(), label: label.trim() || undefined });
      setAddress(''); setLabel('');
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? 'Add failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Удалить кошелёк?')) return;
    try {
      await apiRemoveCryptoWallet(id);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Delete failed');
    }
  };

  const refresh = async (id: string) => {
    try {
      await apiRefreshWalletBalance(id);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Refresh failed');
    }
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 14 }}>Добавить Solana-кошелёк</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, marginTop: 10 }}>
          <input
            placeholder="Адрес"
            value={address}
            onChange={e => setAddress(e.target.value)}
            style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)' }}
          />
          <input
            placeholder="Метка"
            value={label}
            onChange={e => setLabel(e.target.value)}
            style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text)' }}
          />
          <button className="btn btn-primary" onClick={add} disabled={busy || !address.trim()}>Добавить</button>
        </div>
        {err && <div className="error-banner" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {wallets.length === 0 ? (
        <div className="empty">Пока ни одного кошелька.</div>
      ) : (
        <div className="grid grid-2">
          {wallets.map(w => (
            <div key={w.id} className="card">
              <h3>{w.label || 'Без метки'}</h3>
              <div className="sub" style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{w.address}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span>
                  {w.balance != null ? <strong>{w.balance.toFixed(4)} SOL</strong> : <span className="sub">—</span>}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => refresh(w.id)}><Icon.Refresh /></button>
                  <button className="btn btn-danger" onClick={() => remove(w.id)}><Icon.Trash /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
