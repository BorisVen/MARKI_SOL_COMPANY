import { useEffect, useState } from 'react';
import { apiGetNFT, apiVerifyNfc, type NFT } from '../api';
import { Icon } from '../icons';

type Source =
  | { kind: 'id'; id: string }
  | { kind: 'nfc'; uid: string };

type Props = {
  source: Source;
  onClose: () => void;
};

export default function NftViewerPage({ source, onClose }: Props) {
  const [nft, setNft] = useState<NFT | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        if (source.kind === 'id') {
          const data = await apiGetNFT(source.id);
          if (!cancelled) setNft(data);
        } else {
          const verified = await apiVerifyNfc(source.uid);
          if (!cancelled) {
            setOwnerName(verified.ownerName);
            const data = await apiGetNFT(verified.nftId);
            if (!cancelled) setNft(data);
          }
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Не удалось загрузить NFT');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source]);

  const explorerUrl = nft?.mintAddress
    ? `https://explorer.solana.com/address/${nft.mintAddress}`
    : null;

  return (
    <div className="viewer-wrap">
      <header className="viewer-topbar">
        <button className="btn" onClick={onClose}>
          <Icon.ChevronRight size={16} /> <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}>›</span> К панели
        </button>
        <div className="brand-mini">Marki · Business</div>
        <span />
      </header>

      <div className="viewer-content">
        {loading && <div className="spinner">Загрузка…</div>}

        {!loading && err && (
          <div className="card" style={{ maxWidth: 560, margin: '40px auto' }}>
            <h3>Ошибка</h3>
            <p className="sub">{err}</p>
            <button className="btn" onClick={onClose}>Назад</button>
          </div>
        )}

        {!loading && !err && nft && (
          <div className="viewer-grid">
            <div className="viewer-art">
              {nft.imageUrl || nft.image ? (
                <img src={nft.imageUrl || nft.image} alt={nft.title} />
              ) : (
                <div className="viewer-art-empty">Нет изображения</div>
              )}
            </div>

            <div>
              <h1 className="viewer-title">{nft.title}</h1>

              <div className="viewer-badges">
                {nft.forSale && <span className="badge badge-success">on sale · {nft.price} {nft.currency}</span>}
                {nft.mintAddress && <span className="badge badge-info">on-chain</span>}
                {nft.nfcUid && <span className="badge badge-info">NFC verified</span>}
                {nft.category && <span className="badge badge-muted">{nft.category}</span>}
                {source.kind === 'nfc' && <span className="badge badge-success">scan OK</span>}
              </div>

              {nft.description && (
                <div className="viewer-section">
                  <div className="viewer-section-label">Описание</div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{nft.description}</p>
                </div>
              )}

              {nft.tags && nft.tags.length > 0 && (
                <div className="viewer-section">
                  <div className="viewer-section-label">Теги</div>
                  <div>
                    {nft.tags.map(t => <span key={t} className="tag-badge" style={{ background: 'var(--bg-soft)', color: 'var(--muted)' }}>#{t}</span>)}
                  </div>
                </div>
              )}

              <div className="viewer-section">
                <div className="viewer-section-label">Метаданные</div>
                <div className="meta-table">
                  {nft.category && <MetaRow label="Категория" value={nft.category} />}
                  {nft.blockchain && <MetaRow label="Блокчейн" value={nft.blockchain} />}
                  {typeof nft.royalty === 'number' && <MetaRow label="Роялти" value={`${nft.royalty}%`} />}
                  {nft.currency && <MetaRow label="Валюта" value={nft.currency} />}
                  {nft.forSale && nft.price !== undefined && (
                    <MetaRow label="Цена" value={`${nft.price} ${nft.currency ?? ''}`} highlight />
                  )}
                  {nft.userId && <MetaRow label="Owner" value={ownerName || nft.userId} mono />}
                  {nft.createdAt && <MetaRow label="Создан" value={new Date(nft.createdAt).toLocaleString('ru-RU')} />}
                </div>
              </div>

              {(nft.mintAddress || nft.metadataUri || nft.nfcUid) && (
                <div className="viewer-section">
                  <div className="viewer-section-label">On-chain</div>
                  <div className="meta-table">
                    {nft.mintAddress && (
                      <MetaRow
                        label="Mint address"
                        value={nft.mintAddress}
                        mono
                        href={explorerUrl ?? undefined}
                      />
                    )}
                    {nft.metadataUri && (
                      <MetaRow
                        label="Metadata URI"
                        value={nft.metadataUri}
                        mono
                        href={nft.metadataUri}
                      />
                    )}
                    {nft.nfcUid && <MetaRow label="NFC UID" value={nft.nfcUid} mono />}
                  </div>
                </div>
              )}

              {nft.attributes && nft.attributes.length > 0 && (
                <div className="viewer-section">
                  <div className="viewer-section-label">Атрибуты</div>
                  <div className="attr-grid">
                    {nft.attributes.map((a, i) => (
                      <div key={i} className="attr-cell">
                        <div className="attr-key">{a.trait_type}</div>
                        <div className="attr-val">{a.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 24 }}>
                <button className="btn" onClick={onClose}>← Закрыть</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({
  label, value, mono, href, highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
  highlight?: boolean;
}) {
  const inner = (
    <span style={{
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
      fontSize: mono ? 12 : 14,
      color: highlight ? 'var(--primary)' : 'var(--text)',
      fontWeight: highlight ? 600 : 400,
      wordBreak: 'break-all',
    }}>{value}</span>
  );

  return (
    <div className="meta-row">
      <div className="meta-label">{label}</div>
      <div className="meta-val">
        {href ? <a href={href} target="_blank" rel="noreferrer">{inner}</a> : inner}
      </div>
    </div>
  );
}
