import { useCallback, useEffect, useState } from 'react';
import {
  apiCreatePost,
  apiDeletePost,
  apiGetNFTs,
  apiGetPosts,
  type NFT,
  type Post,
} from '../api';
import { useAuth } from '../auth';
import { Icon } from '../icons';

export default function MarketplacePage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, n] = await Promise.all([apiGetPosts(), apiGetNFTs()]);
      setPosts(p);
      setNfts(n);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const myListings = posts.filter(p => p.userId === user?.uid && p.forSale);

  const onDelete = async (id: string) => {
    if (!confirm('Снять с продажи?')) return;
    try {
      await apiDeletePost(id);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Delete failed');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Маркетплейс</h2>
          <p>Твои товары, выставленные на продажу.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={reload}><Icon.Refresh /> Обновить</button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon.Plus /> Выставить
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="spinner">Загрузка…</div>
      ) : myListings.length === 0 ? (
        <div className="empty">Пока ничего не выставлено.</div>
      ) : (
        <div className="grid grid-3">
          {myListings.map(p => (
            <div className="card" key={p.id}>
              {p.nftImage && (
                <img src={p.nftImage} alt={p.nftTitle ?? 'NFT'}
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, marginBottom: 12 }}
                />
              )}
              <h3>{p.nftTitle}</h3>
              <p className="sub" style={{ fontSize: 12 }}>{p.text}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span className="badge badge-success">{p.price} {p.currency}</span>
                <button className="btn btn-danger" onClick={() => onDelete(p.id)}><Icon.Trash /> снять</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateListingModal
          nfts={nfts}
          onClose={() => setCreating(false)}
          onDone={async () => { setCreating(false); await reload(); }}
        />
      )}
    </div>
  );
}

function CreateListingModal({ nfts, onClose, onDone }: { nfts: NFT[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [nftId, setNftId] = useState('');
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USDC');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!nftId || !price.trim()) {
      setErr('Выбери NFT и укажи цену.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const nft = nfts.find(n => n.id === nftId);
      await apiCreatePost({
        nftId,
        nftTitle: nft?.title,
        nftImage: nft?.imageUrl || nft?.image,
        text: text.trim(),
        forSale: true,
        price: parseFloat(price),
        currency,
      });
      await onDone();
    } catch (e: any) {
      setErr(e?.message ?? 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Выставить на продажу</h3>

        <div className="field">
          <label>NFT</label>
          <select value={nftId} onChange={e => setNftId(e.target.value)}>
            <option value="">— выбрать —</option>
            {nfts.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
          <div className="field">
            <label>Цена</label>
            <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" />
          </div>
          <div className="field">
            <label>Валюта</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="USDC">USDC</option>
              <option value="SOL">SOL</option>
              <option value="USD">USD</option>
              <option value="UAH">UAH</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Описание</label>
          <textarea value={text} onChange={e => setText(e.target.value)} />
        </div>

        {err && <div className="error-banner">{err}</div>}

        <div className="actions">
          <button className="btn" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Создание…' : 'Выставить'}
          </button>
        </div>
      </div>
    </div>
  );
}
