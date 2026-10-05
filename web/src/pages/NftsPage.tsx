import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  apiAiGenerateImage,
  apiBatchCreateNFTs,
  apiCreateEditionNFTs,
  apiCreateNFT,
  apiCreatePost,
  apiDeleteNFT,
  apiGenerateMissingQr,
  apiGenerateNFTQr,
  apiRegenerateAllQr,
  apiGetMintInfo,
  apiGetNFTs,
  apiUpdateNFT,
  type NFT,
} from '../api';
import { Icon } from '../icons';
import { useUmi } from '../hooks/useUmi';
import {
  generateSigner,
  percentAmount,
  lamports,
  publicKey as umiPublicKey,
} from '@metaplex-foundation/umi';
import { createNft } from '@metaplex-foundation/mpl-token-metadata';
import { transferSol } from '@metaplex-foundation/mpl-toolbox';

const PLATFORM_TREASURY = umiPublicKey('2wZ2vKzRzY7ZxkRTRgTKVBDBVTqk1NfvGbQFgDxJAr9X');
// Temporarily disabled: keep treasury/commission code in place, but do not add
// platform-fee transfers to mint transactions until the treasury wallet is final.
const PLATFORM_FEE_ENABLED = false;

const CATEGORIES = ['Art', 'Music', 'Photography', 'Gaming', '3D', 'Collectible', 'Sports', 'Meme'];
const CURRENCIES = ['SOL', 'UAH', 'USD', 'USDC'];
const BLOCKCHAINS = [{ id: 'solana', name: 'Solana', icon: '◎', currency: 'SOL', fee: '~$0.01' }];

type Mode = 'list' | 'create' | 'batch';
type Step = 1 | 2 | 3;

async function rpcWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts = 5,
): Promise<T> {
  let lastErr: any;
  for (let a = 0; a < attempts; a++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e ?? '');
      const is429 = msg.includes('429') || /too many|rate.?limit/i.test(msg);
      if (!is429 || a === attempts - 1) throw e;
      const delay = 500 * Math.pow(2, a) + Math.random() * 300;
      console.warn(`[NFTs] ${label}: 429, retry in ${Math.round(delay)}ms (${a + 1}/${attempts})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function sendCommission(umi: any, commissionLamports: number): Promise<void> {
  try {
    const feeBlockhash = await rpcWithRetry<any>(() => umi.rpc.getLatestBlockhash(), 'commission blockhash');
    await rpcWithRetry(
      () => transferSol(umi, {
        destination: PLATFORM_TREASURY,
        amount: lamports(commissionLamports),
      })
        .setBlockhash(feeBlockhash)
        .sendAndConfirm(umi, { confirm: { strategy: { type: 'blockhash', ...feeBlockhash } } }),
      'commission send',
    );
  } catch (feeErr: any) {
    console.warn('[NFTs] commission transfer skipped:', feeErr?.message);
  }
}

function compressImage(file: File, maxPx = 1080, quality = 0.8): Promise<File> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          const name = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function NftsPage() {
  const [mode, setMode] = useState<Mode>('list');
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<NFT | null>(null);
  const [qrFor, setQrFor] = useState<NFT | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNfts(await apiGetNFTs());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const onDelete = async (id: string) => {
    if (!confirm('Удалить этот NFT?')) return;
    try {
      await apiDeleteNFT(id);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Delete failed');
    }
  };

  const onGenerateMissingQr = async () => {
    if (!confirm('Сгенерировать QR-коды для всех NFT, у которых их ещё нет?')) return;
    setGeneratingQr(true);
    try {
      const result = await apiGenerateMissingQr();
      alert(`Сгенерировано QR-кодов: ${result.generated}`);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'QR generation failed');
    } finally {
      setGeneratingQr(false);
    }
  };

  const onRegenerateAllQr = async () => {
    if (!confirm('ПЕРЕгенерировать ВСЕ QR-коды заново?\nЭто заменит существующие QR на новые с правильным URL.')) return;
    setGeneratingQr(true);
    try {
      const result = await apiRegenerateAllQr();
      alert(`Перегенерировано QR-кодов: ${result.regenerated}`);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'QR regeneration failed');
    } finally {
      setGeneratingQr(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>NFT</h2>
          <p>Коллекция, минт и массовый выпуск.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={reload}><Icon.Refresh /> Обновить</button>
          {mode === 'list' && (
            <>
              <button className="btn" onClick={onGenerateMissingQr} disabled={generatingQr}>
                <Icon.QrCode /> {generatingQr ? 'Генерация…' : 'QR всех'}
              </button>
              <button className="btn" onClick={onRegenerateAllQr} disabled={generatingQr} title="Пересоздать все QR с продакшен-ссылкой">
                <Icon.Refresh /> {generatingQr ? 'Генерация…' : 'Обновить QR'}
              </button>
              <button className="btn btn-primary" onClick={() => setMode('create')}>
                <Icon.Plus /> Создать NFT
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mode-tabs" role="tablist">
        <button className={`mode-tab ${mode === 'list' ? 'active' : ''}`} onClick={() => setMode('list')}>
          Коллекция
        </button>
        <button className={`mode-tab ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>
          Создать
        </button>
        <button className={`mode-tab ${mode === 'batch' ? 'active' : ''}`} onClick={() => setMode('batch')}>
          Массово <span className="pill">BIZ</span>
        </button>
      </div>

      {mode === 'create' && (
        <CreateNftWizard onDone={async () => { await reload(); setMode('list'); }} />
      )}

      {mode === 'batch' && (
        <BatchNftForm onDone={async () => { await reload(); setMode('list'); }} />
      )}

      {mode === 'list' && (
        <>
          {error && <div className="error-banner">{error}</div>}
          {loading ? <div className="spinner">Загрузка…</div> : (
            nfts.length === 0 ? <div className="empty">У тебя пока нет NFT.</div> : (
              <div className="grid grid-3">
                {nfts.map(n => (
                  <NftCard
                    key={n.id}
                    nft={n}
                    onEdit={() => setEditing(n)}
                    onDelete={() => onDelete(n.id)}
                    onShowQr={() => setQrFor(n)}
                  />
                ))}
              </div>
            )
          )}
        </>
      )}

      {editing && (
        <EditNftModal
          nft={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}

      {qrFor && <QrModal nft={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  );
}

function NftCard({ nft, onEdit, onDelete, onShowQr }: {
  nft: NFT;
  onEdit: () => void;
  onDelete: () => void;
  onShowQr: () => void;
}) {
  return (
    <div className="card">
      {nft.imageUrl || nft.image ? (
        <img
          src={nft.imageUrl || nft.image}
          alt={nft.title}
          style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, marginBottom: 12 }}
        />
      ) : (
        <div
          style={{
            aspectRatio: '1 / 1',
            background: 'var(--bg-soft)',
            borderRadius: 10,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          No image
        </div>
      )}
      <h3>{nft.title}</h3>
      {nft.description && (
        <p className="sub" style={{ fontSize: 12 }}>
          {nft.description.slice(0, 100)}{nft.description.length > 100 ? '…' : ''}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {nft.forSale && <span className="badge badge-success">on sale · {nft.price} {nft.currency}</span>}
        {nft.nfcUid && <span className="badge badge-info">NFC</span>}
        {nft.mintAddress && <span className="badge badge-muted">on-chain</span>}
        {nft.category && <span className="badge badge-muted">{nft.category}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn" onClick={onEdit}>Изменить</button>
        <button className="btn" onClick={onShowQr} title="QR-код товара">
          <Icon.QrCode /> QR
        </button>
        <button className="btn btn-danger" onClick={onDelete}><Icon.Trash /></button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CREATE WIZARD
// ────────────────────────────────────────────────────────────────────────────

function CreateNftWizard({ onDone }: { onDone: () => Promise<void> }) {
  const { umi, isReady: walletReady, connect: connectPhantom, publicKey } = useUmi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collectionInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [category, setCategory] = useState('Art');
  const [forSale, setForSale] = useState(false);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('SOL');
  const [blockchain, setBlockchain] = useState('solana');
  const [royalty, setRoyalty] = useState('10');
  const [editionCount, setEditionCount] = useState('1');

  const [isCollection, setIsCollection] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [collectionFiles, setCollectionFiles] = useState<File[]>([]);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);

  const handleAiGenerate = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiGenerating(true);
    setAiError('');
    try {
      const blob = await apiAiGenerateImage(prompt);
      const seed = Math.floor(Math.random() * 1_000_000);
      const file = new File([blob], `ai-nft-${seed}.jpg`, { type: 'image/jpeg' });
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setShowAiPanel(false);
    } catch (e: any) {
      setAiError(e?.message ?? 'Generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) { alert('Загрузи изображение'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Файл слишком большой (макс 10MB).'); return; }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t) && tags.length < 8) {
      setTags([...tags, t]);
      setTagInput('');
    }
  };

  const canGoNext = () => {
    if (step === 1) {
      const hasFile = isCollection ? collectionFiles.length > 0 : !!selectedFile;
      return hasFile && !!title.trim() && !!description.trim();
    }
    if (step === 2) return !!blockchain;
    return true;
  };

  const handleSubmit = async () => {
    if (!walletReady) {
      alert('Подключи Phantom-кошелёк, чтобы выпустить NFT в чейне.');
      return;
    }
    if (!umi?.identity?.publicKey) {
      alert('Signer не готов — переподключи Phantom.');
      return;
    }
    if (isCollection && collectionFiles.length === 0) {
      alert('Выбери файлы для коллекции');
      return;
    }
    if (!isCollection && !selectedFile) {
      alert('Выбери изображение');
      return;
    }

    setLoading(true);
    setErr(null);
    setUploadProgress('');

    try {
      if (isCollection) {
        const totalItems = collectionFiles.length;
        setUploadProgress(`Шаг 1/${totalItems + 3} — Сжатие ${totalItems} файлов…`);
        const items = collectionFiles.map((f, i) => ({
          title: f.name.replace(/\.[^.]+$/, '') || `${collectionName.trim() || 'Collection'} #${i + 1}`,
          description: description.trim(),
          ...(forSale && price ? { price: parseFloat(price) } : {}),
        }));
        const compressedFiles = await Promise.all(collectionFiles.map(f => compressImage(f)));

        const form = new FormData();
        compressedFiles.forEach(f => form.append('images[]', f));
        form.append('metadata', JSON.stringify({
          batchName: collectionName.trim() || title.trim() || 'Collection',
          blockchain,
          currency,
          royalty: parseFloat(royalty),
          forSale,
          tags,
          items,
        }));

        setUploadProgress(`Шаг 1/${totalItems + 3} — Загрузка ${totalItems} изображений…`);
        const colRes: any = await apiBatchCreateNFTs(form);
        const successful: any[] = (colRes?.results ?? []).filter((r: any) => r.status === 'ok' && r.id && r.metadataUri);
        if (successful.length === 0) throw new Error('Бекенд не принял ни одного файла.');

        setUploadProgress('Проверяю комиссию…');
        const mintInfo = await apiGetMintInfo();
        let feeCharged = false;

        const collectionImageUrls: string[] = [];
        const collectionNftIds: string[] = [];

        for (let i = 0; i < successful.length; i++) {
          const item = successful[i];
          const stepNum = i + 2;
          const stepTotal = successful.length + 3;
          const itemTitle = items[item.index]?.title ?? `${collectionName.trim() || 'Collection'} #${item.index + 1}`;

          const chargeCommission = PLATFORM_FEE_ENABLED && !mintInfo.isFree && !feeCharged && mintInfo.commissionLamports > 0;
          if (chargeCommission) {
            setUploadProgress(`Шаг ${stepNum}/${stepTotal} — Платформенный сбор — подтверди в Phantom…`);
            await sendCommission(umi, mintInfo.commissionLamports);
            feeCharged = true;
          }

          setUploadProgress(`Шаг ${stepNum}/${stepTotal} — Минт элемента ${i + 1}/${successful.length} — подтверди в Phantom…`);
          const mint = generateSigner(umi);
          const latestBlockhash = await umi.rpc.getLatestBlockhash();

          await createNft(umi, {
            mint,
            name: itemTitle,
            uri: item.metadataUri,
            sellerFeeBasisPoints: percentAmount(parseFloat(royalty)),
          })
            .setBlockhash(latestBlockhash)
            .sendAndConfirm(umi, { confirm: { strategy: { type: 'blockhash', ...latestBlockhash } } });

          await apiUpdateNFT(item.id, { mintAddress: mint.publicKey });
          collectionImageUrls.push(item.imageUrl);
          collectionNftIds.push(item.id);
        }

        setUploadProgress(`Шаг ${successful.length + 2}/${successful.length + 3} — Публикация в ленту…`);
        await apiCreatePost({
          nftImages: collectionImageUrls,
          walletNftIds: collectionNftIds,
          title: collectionName.trim() || title.trim(),
          description: description.trim(),
          tags,
          forSale,
          price: forSale && price ? parseFloat(price) : null,
          currency,
        });
      } else {
        const numEditions = Math.max(1, parseInt(editionCount) || 1);
        const baseMetadata: any = {
          title: title.trim(),
          description: description.trim(),
          tags,
          category,
          blockchain,
          royalty: parseFloat(royalty),
          forSale,
          currency,
        };
        if (forSale && price) baseMetadata.price = parseFloat(price);

        setUploadProgress('Проверяю комиссию…');
        const mintInfo = await apiGetMintInfo();

        if (numEditions > 1) {
          setUploadProgress('Шаг 1/4 — Сжатие и загрузка изображения…');
          const editionForm = new FormData();
          editionForm.append('image', await compressImage(selectedFile!));
          editionForm.append('metadata', JSON.stringify({
            ...baseMetadata,
            batchName: collectionName.trim() || title.trim(),
            editionCount: numEditions,
          }));
          const edResult = await apiCreateEditionNFTs(editionForm);
          const { metadataUri, imageUrl, editionIds } = edResult;

          if (PLATFORM_FEE_ENABLED && !mintInfo.isFree && mintInfo.commissionLamports > 0) {
            setUploadProgress('Шаг 2/4 — Платформенный сбор — подтверди в Phantom…');
            await sendCommission(umi, mintInfo.commissionLamports);
          }

          setUploadProgress(`Шаг 3/4 — Строю ${numEditions} транзакций…`);
          const sharedBlockhash = await rpcWithRetry<any>(() => umi.rpc.getLatestBlockhash(), 'editions blockhash');
          const editionMintSigners: any[] = [];
          const partiallySignedTxs: any[] = [];

          for (let i = 0; i < numEditions; i++) {
            const mintSigner = generateSigner(umi);
            editionMintSigners.push(mintSigner);
            const builtTx = createNft(umi, {
              mint: mintSigner,
              name: `${title.trim()} #${i + 1}/${numEditions}`,
              uri: metadataUri,
              sellerFeeBasisPoints: percentAmount(parseFloat(royalty)),
            }).setBlockhash(sharedBlockhash).build(umi);
            partiallySignedTxs.push(await mintSigner.signTransaction(builtTx));
          }

          setUploadProgress(`Шаг 3/4 — Подтверди все ${numEditions} editions в Phantom (один клик)…`);
          const fullySignedTxs = await (umi.identity as any).signAllTransactions(partiallySignedTxs);

          setUploadProgress(`Шаг 4/4 — Отправка ${numEditions} транзакций параллельно…`);
          const sendResults = await Promise.allSettled(
            fullySignedTxs.map((tx: any, i: number) =>
              rpcWithRetry(() => umi.rpc.sendTransaction(tx), `send #${i + 1}`),
            ),
          );

          const sentSigs: { i: number; sig: Uint8Array }[] = [];
          const sendErrors: { i: number; err: string }[] = [];
          sendResults.forEach((r, i) => {
            if (r.status === 'fulfilled') sentSigs.push({ i, sig: r.value });
            else sendErrors.push({ i, err: String((r as any).reason?.message ?? (r as any).reason) });
          });

          if (sentSigs.length === 0) {
            throw new Error(`Все ${numEditions} editions провалились при отправке: ${sendErrors[0]?.err ?? 'unknown'}`);
          }

          setUploadProgress(`Шаг 4/4 — Подтверждение ${sentSigs.length} транзакций…`);
          const confirmResults = await Promise.allSettled(
            sentSigs.map(({ sig }, idx) =>
              rpcWithRetry(
                () => umi.rpc.confirmTransaction(sig, {
                  strategy: { type: 'blockhash', ...sharedBlockhash },
                }),
                `confirm #${idx + 1}`,
              ),
            ),
          );

          const confirmErrors: { i: number; err: string }[] = [];
          confirmResults.forEach((r, idx) => {
            const i = sentSigs[idx].i;
            const onchainErr = r.status === 'fulfilled' ? (r.value as any)?.value?.err : null;
            if (r.status === 'fulfilled' && !onchainErr) {
              return;
            } else {
              const reason = r.status === 'rejected' ? (r as any).reason : onchainErr;
              confirmErrors.push({ i, err: String(reason?.message ?? JSON.stringify(reason) ?? reason) });
            }
          });

          const sentIndices = sentSigs.map(({ i }) => i).sort((a, b) => a - b);

          setUploadProgress(`Шаг 4/4 — Запись адресов (${sentIndices.length}/${numEditions})…`);
          await Promise.allSettled(
            sentIndices.map(i =>
              apiUpdateNFT(editionIds[i], { mintAddress: editionMintSigners[i].publicKey }),
            ),
          );

          const failedCount = numEditions - sentIndices.length;
          if (failedCount === numEditions) {
            throw new Error(`Все ${numEditions} editions провалились при отправке. Первая ошибка: ${sendErrors[0]?.err ?? 'unknown'}`);
          }
          if (failedCount > 0 || confirmErrors.length > 0) {
            console.warn(`[NFTs] ${failedCount}/${numEditions} editions failed:`, { sendErrors, confirmErrors });
          }

          const successfulEditionIds = sentIndices.map(i => editionIds[i]);

          setUploadProgress('Шаг 4/4 — Публикация в ленту…');
          await apiCreatePost({
            nftImages: successfulEditionIds.map(() => imageUrl),
            walletNftIds: successfulEditionIds,
            title: failedCount > 0
              ? `${title.trim()} (${successfulEditionIds.length}/${numEditions} editions)`
              : `${title.trim()} (${numEditions} editions)`,
            description: description.trim(),
            tags,
            forSale,
            price: forSale && price ? parseFloat(price) : null,
            currency,
            blockchain,
          });
        } else {
          setUploadProgress('Шаг 1/4 — Сжатие и загрузка…');
          const form = new FormData();
          form.append('image', await compressImage(selectedFile!));
          form.append('metadata', JSON.stringify(baseMetadata));
          const result: any = await apiCreateNFT(form);
          const nftId = result?.id;
          const metadataUri = result?.metadataUri;
          if (!nftId || !metadataUri) throw new Error('Бекенд не вернул id/metadataUri');

          if (PLATFORM_FEE_ENABLED && !mintInfo.isFree && mintInfo.commissionLamports > 0) {
            setUploadProgress('Шаг 2/4 — Платформенный сбор — подтверди в Phantom…');
            await sendCommission(umi, mintInfo.commissionLamports);
          }

          setUploadProgress('Шаг 2/4 — Минт — подтверди в Phantom…');
          const mint = generateSigner(umi);
          const latestBlockhash = await umi.rpc.getLatestBlockhash();

          await createNft(umi, {
            mint,
            name: title.trim(),
            uri: metadataUri,
            sellerFeeBasisPoints: percentAmount(parseFloat(royalty)),
          })
            .setBlockhash(latestBlockhash)
            .sendAndConfirm(umi, { confirm: { strategy: { type: 'blockhash', ...latestBlockhash } } });

          setUploadProgress('Шаг 3/4 — Запись адреса в чейне…');
          await apiUpdateNFT(nftId, { mintAddress: mint.publicKey });

          setUploadProgress('Шаг 4/4 — Публикация в ленту…');
          await apiCreatePost({
            nftImage: result.image,
            title: title.trim(),
            description: description.trim(),
            tags,
            forSale,
            price: forSale && price ? parseFloat(price) : null,
            currency,
            walletNftId: nftId,
          });
        }
      }

      setSuccess(true);
      setUploadProgress('');
    } catch (e: any) {
      console.error('[NFTs] mint failed:', e);
      setErr(e?.message ?? 'Mint failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedFile(null);
    setPreviewUrl('');
    setTitle('');
    setDescription('');
    setTags([]);
    setCategory('Art');
    setForSale(false);
    setPrice('');
    setCurrency('SOL');
    setBlockchain('solana');
    setRoyalty('10');
    setEditionCount('1');
    setIsCollection(false);
    setCollectionName('');
    setCollectionFiles([]);
    setSuccess(false);
    setErr(null);
  };

  if (success) {
    return (
      <div className="success-box">
        <div className="circle">✨</div>
        <h2 style={{ margin: '0 0 8px' }}>{isCollection ? 'Коллекция создана!' : 'NFT создан!'}</h2>
        <p className="sub" style={{ margin: '0 auto 14px', maxWidth: 440 }}>
          «{isCollection ? collectionName.trim() || title.trim() : title.trim()}» добавлен в кошелёк
          {forSale && price ? ` и выставлен за ${price} ${currency}.` : '.'}
        </p>
        {previewUrl && <img src={previewUrl} alt={title} className="img-preview" />}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleReset}>
            <Icon.Plus /> Создать ещё
          </button>
          <button className="btn" onClick={onDone}>К списку</button>
        </div>
      </div>
    );
  }

  return (
    <div className="create-grid">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <div className="stepper">
            <div className={`dot ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>{step > 1 ? '✓' : 1}</div>
            <div className={`line ${step > 1 ? 'done' : ''}`} />
            <div className={`dot ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>{step > 2 ? '✓' : 2}</div>
            <div className={`line ${step > 2 ? 'done' : ''}`} />
            <div className={`dot ${step === 3 ? 'active' : ''}`}>3</div>
          </div>
          <WalletButton ready={walletReady} publicKey={publicKey} connect={connectPhantom} />
        </div>

        <div className="step-labels">
          <span className={step === 1 ? 'active' : ''}>Загрузка</span>
          <span className={step === 2 ? 'active' : ''}>Чейн</span>
          <span className={step === 3 ? 'active' : ''}>Цена</span>
        </div>

        {loading && uploadProgress && (
          <div className="progress-banner">
            <div className="mini-spin" />
            <div style={{ fontSize: 13 }}>{uploadProgress}</div>
          </div>
        )}

        {err && <div className="error-banner">{err}</div>}

        {step === 1 && (
          <div className="card">
            <h3>Загрузи NFT</h3>

            <div className="toggle-row">
              <div>
                <div className="lbl">Создать как коллекцию</div>
                <div className="sub">Группа связанных NFT — один пост в ленте</div>
              </div>
              <div className={`switch ${isCollection ? 'on' : ''}`} onClick={() => setIsCollection(!isCollection)}>
                <div className="knob" />
              </div>
            </div>

            {isCollection && (
              <div className="field">
                <label>Название коллекции</label>
                <input
                  value={collectionName}
                  maxLength={60}
                  placeholder="Cosmic Dreams Series"
                  onChange={e => setCollectionName(e.target.value)}
                />
                <div className="notice notice-warn" style={{ marginTop: 8 }}>
                  ⚠️ К продажам внутри коллекции применяется комиссия платформы 1%.
                </div>
              </div>
            )}

            {isCollection ? (
              <div className="field">
                <label>Изображения коллекции</label>
                <input
                  ref={collectionInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => setCollectionFiles(Array.from(e.target.files || []))}
                />
                <div className={`drop-zone ${collectionFiles.length > 0 ? 'has-file' : ''}`}
                     onClick={() => collectionInputRef.current?.click()}>
                  {collectionFiles.length > 0 ? (
                    <div style={{ width: '100%', padding: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                        {collectionFiles.slice(0, 8).map((f, i) => (
                          <div key={i} style={{ aspectRatio: '1 / 1', background: 'var(--bg-soft)', borderRadius: 8, overflow: 'hidden' }}>
                            <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                      <div className="sub" style={{ textAlign: 'center' }}>
                        {collectionFiles.length} файл(ов) — нажми, чтобы перевыбрать
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="ph-title">+ Выбери изображения</div>
                      <div className="ph-sub">PNG, JPG, GIF, WebP — до 10 MB каждый</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="field">
                <label>Изображение *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                />
                <div
                  className={`drop-zone ${dragOver ? 'over' : ''} ${selectedFile ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  {selectedFile && previewUrl ? (
                    <img src={previewUrl} alt="preview" className="preview" />
                  ) : (
                    <div>
                      <div className="ph-title">Перетащи изображение сюда</div>
                      <div className="ph-sub">или кликни, чтобы выбрать · PNG / JPG / GIF · до 10 MB</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn" onClick={() => setShowAiPanel(v => !v)}>
                    ✨ Сгенерировать AI
                  </button>
                  {selectedFile && (
                    <button type="button" className="btn" onClick={() => { setSelectedFile(null); setPreviewUrl(''); }}>
                      Убрать
                    </button>
                  )}
                </div>

                {showAiPanel && (
                  <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginTop: 10 }}>
                    <textarea
                      placeholder="Опиши NFT — напр. «cyberpunk astronaut neon city»"
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      style={{ width: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, minHeight: 60, resize: 'vertical' }}
                    />
                    {aiError && <div className="error-banner" style={{ marginTop: 8, marginBottom: 0 }}>{aiError}</div>}
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      style={{ marginTop: 8 }}
                      disabled={!aiPrompt.trim() || aiGenerating}
                      onClick={handleAiGenerate}
                    >
                      {aiGenerating ? 'Генерация… (~15–30 сек)' : 'Сгенерировать'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="field">
              <label>Название *</label>
              <input value={title} maxLength={60} onChange={e => setTitle(e.target.value)} />
              <div className="char-count">{title.length}/60</div>
            </div>

            <div className="field">
              <label>Описание *</label>
              <textarea value={description} maxLength={300} onChange={e => setDescription(e.target.value)} />
              <div className="char-count">{description.length}/300</div>
            </div>

            <div className="field">
              <label>Категория</label>
              <div className="chip-row">
                {CATEGORIES.map(c => (
                  <button
                    type="button"
                    key={c}
                    className={`chip ${category === c ? 'active' : ''}`}
                    onClick={() => setCategory(c)}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Теги (до 8)</label>
              <div className="tag-input-row">
                <input
                  placeholder="#tag"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                />
                <button type="button" className="btn" onClick={addTag}>Добавить</button>
              </div>
              {tags.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {tags.map(t => (
                    <span key={t} className="tag-badge">
                      #{t}
                      <button type="button" className="x" onClick={() => setTags(tags.filter(x => x !== t))}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="step-actions">
              <span />
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canGoNext()}
                onClick={() => setStep(2)}
              >Далее <Icon.ChevronRight /></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card">
            <h3>Блокчейн и параметры</h3>

            <div className="field">
              <label>Блокчейн</label>
              <div className="chip-row">
                {BLOCKCHAINS.map(b => (
                  <button
                    type="button"
                    key={b.id}
                    className={`chip ${blockchain === b.id ? 'active' : ''}`}
                    onClick={() => { setBlockchain(b.id); setCurrency(b.currency); }}
                  >
                    {b.icon} {b.name} · {b.fee}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Роялти: <strong style={{ color: 'var(--primary)' }}>{royalty}%</strong></label>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={royalty}
                onChange={e => setRoyalty(e.target.value)}
                className="slider"
              />
              <div className="sub" style={{ fontSize: 11 }}>
                Сколько ты получаешь при каждой перепродаже на маркетплейсе.
              </div>
            </div>

            {!isCollection && (
              <div className="field">
                <label>Editions (копий 1:N)</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={editionCount}
                  onChange={e => setEditionCount(e.target.value)}
                />
                <div className="sub" style={{ fontSize: 11 }}>
                  1 = уникальный 1-of-1. Больше — серия независимых токенов с одним арт-файлом.
                </div>
              </div>
            )}

            <div className="step-actions">
              <button type="button" className="btn" onClick={() => setStep(1)}>← Назад</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
                Далее <Icon.ChevronRight />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <h3>Выставить на продажу</h3>

            <div className="toggle-row">
              <div>
                <div className="lbl">Сразу листить на маркетплейс</div>
                <div className="sub">Можно включить позже, в редактировании.</div>
              </div>
              <div className={`switch ${forSale ? 'on' : ''}`} onClick={() => setForSale(!forSale)}>
                <div className="knob" />
              </div>
            </div>

            {forSale && (
              <>
                <div className="field">
                  <label>Валюта</label>
                  <div className="chip-row">
                    {CURRENCIES.map(c => (
                      <button
                        type="button"
                        key={c}
                        className={`chip ${currency === c ? 'active' : ''}`}
                        onClick={() => setCurrency(c)}
                      >{c}</button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Цена ({currency})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="0.5"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                  />
                  {price && parseFloat(price) > 0 && (
                    <div className="sub" style={{ fontSize: 11 }}>
                      Ты получишь <strong style={{ color: 'var(--primary)' }}>{parseFloat(price)} {currency}</strong>.
                      Покупатель доплачивает 1% платформенный сбор сверху.
                    </div>
                  )}
                </div>
              </>
            )}

            {!walletReady && (
              <div className="notice notice-warn">
                ⚠️ Phantom не подключён. Нажми «Подключить Phantom» сверху, чтобы выпустить токен в чейне.
              </div>
            )}

            <div className="step-actions">
              <button type="button" className="btn" onClick={() => setStep(2)}>← Назад</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || !walletReady}
                onClick={handleSubmit}
              >
                {loading ? 'Минт…' : isCollection ? `Выпустить коллекцию (${collectionFiles.length})` : 'Выпустить NFT'}
              </button>
            </div>
          </div>
        )}
      </div>

      <CreatePreview
        title={title}
        description={description}
        category={category}
        tags={tags}
        previewUrl={previewUrl}
        collectionFiles={collectionFiles}
        isCollection={isCollection}
        collectionName={collectionName}
        forSale={forSale}
        price={price}
        currency={currency}
        royalty={royalty}
        editionCount={editionCount}
      />
    </div>
  );
}

function CreatePreview(props: {
  title: string;
  description: string;
  category: string;
  tags: string[];
  previewUrl: string;
  collectionFiles: File[];
  isCollection: boolean;
  collectionName: string;
  forSale: boolean;
  price: string;
  currency: string;
  royalty: string;
  editionCount: string;
}) {
  const {
    title, description, category, tags, previewUrl, collectionFiles,
    isCollection, collectionName, forSale, price, currency, royalty, editionCount,
  } = props;

  const firstFile = collectionFiles[0];
  const firstUrl = useMemo(
    () => firstFile ? URL.createObjectURL(firstFile) : '',
    [firstFile]
  );

  const showImg = isCollection ? firstUrl : previewUrl;
  const showTitle = isCollection ? (collectionName || title || 'Без названия') : (title || 'Без названия');

  return (
    <div className="card" style={{ position: 'sticky', top: 80 }}>
      <div className="sub" style={{ marginBottom: 8 }}>Предпросмотр</div>
      {showImg ? (
        <img
          src={showImg}
          alt={showTitle}
          style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 10, marginBottom: 12 }}
        />
      ) : (
        <div style={{
          aspectRatio: '1 / 1', background: 'var(--bg-soft)', borderRadius: 10, marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12,
        }}>
          Без изображения
        </div>
      )}
      <h3 style={{ margin: '0 0 6px' }}>{showTitle}</h3>
      {description && <p className="sub" style={{ fontSize: 12, margin: '0 0 8px' }}>{description.slice(0, 140)}{description.length > 140 ? '…' : ''}</p>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {!isCollection && <span className="badge badge-muted">{category}</span>}
        {isCollection && <span className="badge badge-info">collection · {collectionFiles.length}</span>}
        {parseInt(editionCount) > 1 && !isCollection && <span className="badge badge-info">{editionCount} editions</span>}
        <span className="badge badge-muted">{royalty}% royalty</span>
        {forSale && price && <span className="badge badge-success">{price} {currency}</span>}
      </div>
      {tags.length > 0 && (
        <div>
          {tags.map(t => <span key={t} className="tag-badge" style={{ background: 'var(--bg-soft)', color: 'var(--muted)' }}>#{t}</span>)}
        </div>
      )}
    </div>
  );
}

function WalletButton({ ready, publicKey, connect }: { ready: boolean; publicKey: string; connect: () => Promise<string> }) {
  const [busy, setBusy] = useState(false);
  if (ready) {
    return (
      <span className="wallet-pill connected">
        <span className="dot-ind" />
        {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await connect(); } catch (e: any) { alert(e?.message ?? 'Connect failed'); }
        finally { setBusy(false); }
      }}
    >
      {busy ? 'Подключение…' : 'Подключить Phantom'}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BATCH MODE
// ────────────────────────────────────────────────────────────────────────────

function BatchNftForm({ onDone }: { onDone: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [blockchain, setBlockchain] = useState('solana');
  const [currency, setCurrency] = useState('SOL');
  const [royalty, setRoyalty] = useState('10');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [forSale, setForSale] = useState(false);
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t) && tags.length < 8) { setTags([...tags, t]); setTagInput(''); }
  };

  const submit = async () => {
    if (files.length === 0) { alert('Выбери файлы'); return; }
    setLoading(true);
    setErr(null);
    try {
      const items = files.map((f, i) => ({
        title: f.name.replace(/\.[^.]+$/, '') || `Batch NFT #${i + 1}`,
        description: `Batch upload item ${i + 1}`,
        price: forSale && price ? parseFloat(price) : undefined,
      }));
      const metadata = {
        batchName: 'Batch',
        blockchain,
        currency,
        royalty: parseFloat(royalty),
        forSale,
        tags,
        items,
      };
      const compressed = await Promise.all(files.map(f => compressImage(f)));
      const form = new FormData();
      compressed.forEach(f => form.append('images[]', f));
      form.append('metadata', JSON.stringify(metadata));

      const res: any = await apiBatchCreateNFTs(form);

      const successful = (res?.results ?? []).filter((r: any) => r.status === 'ok' && r.id && r.imageUrl);
      for (let i = 0; i < successful.length; i++) {
        const r = successful[i];
        const meta = items[r.index ?? i];
        await apiCreatePost({
          nftImage: r.imageUrl,
          title: meta?.title ?? `Batch NFT #${i + 1}`,
          description: meta?.description ?? '',
          tags,
          forSale,
          price: forSale && price ? parseFloat(price) : null,
          currency,
          walletNftId: r.id,
        });
      }
      setResult(res);
    } catch (e: any) {
      setErr(e?.message ?? 'Batch failed');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="success-box">
        <div className="circle">📦</div>
        <h2 style={{ margin: '0 0 8px' }}>Batch завершён</h2>
        <p className="sub">
          ✅ Создано: <strong style={{ color: 'var(--text)' }}>{result.created}</strong>
          {result.failed > 0 && <> &nbsp; ❌ Ошибок: <strong style={{ color: 'var(--danger)' }}>{result.failed}</strong></>}
        </p>
        {result.failed > 0 && (
          <div style={{ maxWidth: 560, margin: '14px auto 0', textAlign: 'left' }}>
            {result.results?.filter((r: any) => r.status === 'error').map((r: any) => (
              <div key={r.index} className="error-banner" style={{ marginBottom: 6 }}>
                Item #{r.index + 1}: {r.message || 'Unknown error'}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
          <button className="btn btn-primary" onClick={() => { setResult(null); setFiles([]); }}>
            <Icon.Plus /> Загрузить ещё пачку
          </button>
          <button className="btn" onClick={onDone}>К списку</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3>📦 Массовый выпуск</h3>
      <p className="sub" style={{ marginBottom: 16 }}>
        Загрузка нескольких NFT одной отправкой — для брендов и компаний.
      </p>

      <div className="notice notice-warn">
        ⚠️ К продажам каждого NFT в этой пачке применяется комиссия платформы 1%.
      </div>

      <div className="field">
        <label>Файлы *</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => setFiles(Array.from(e.target.files || []))}
        />
        <div className={`drop-zone ${files.length > 0 ? 'has-file' : ''}`} onClick={() => fileRef.current?.click()}>
          {files.length > 0 ? (
            <div style={{ width: '100%', padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 8 }}>
                {files.slice(0, 12).map((f, i) => (
                  <div key={i} style={{ aspectRatio: '1 / 1', background: 'var(--bg-soft)', borderRadius: 8, overflow: 'hidden' }}>
                    <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              <div className="sub" style={{ textAlign: 'center' }}>
                {files.length} файл(ов){files.length > 12 ? ` (показано 12)` : ''}
              </div>
            </div>
          ) : (
            <div>
              <div className="ph-title">+ Выбери несколько изображений</div>
              <div className="ph-sub">PNG / JPG / GIF · до 10 MB каждый</div>
            </div>
          )}
        </div>
      </div>

      <div className="field">
        <label>Блокчейн</label>
        <div className="chip-row">
          {BLOCKCHAINS.map(b => (
            <button
              type="button"
              key={b.id}
              className={`chip ${blockchain === b.id ? 'active' : ''}`}
              onClick={() => { setBlockchain(b.id); setCurrency(b.currency); }}
            >{b.icon} {b.name}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Валюта</label>
        <div className="chip-row">
          {CURRENCIES.map(c => (
            <button
              type="button"
              key={c}
              className={`chip ${currency === c ? 'active' : ''}`}
              onClick={() => setCurrency(c)}
            >{c}</button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Роялти: <strong style={{ color: 'var(--primary)' }}>{royalty}%</strong></label>
        <input
          type="range"
          min="0"
          max="30"
          step="1"
          value={royalty}
          onChange={e => setRoyalty(e.target.value)}
          className="slider"
        />
      </div>

      <div className="field">
        <label>Теги (применяются ко всем)</label>
        <div className="tag-input-row">
          <input
            placeholder="#tag"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
          />
          <button type="button" className="btn" onClick={addTag}>Добавить</button>
        </div>
        {tags.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {tags.map(t => (
              <span key={t} className="tag-badge">
                #{t}
                <button type="button" className="x" onClick={() => setTags(tags.filter(x => x !== t))}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="toggle-row">
        <div>
          <div className="lbl">Выставить всех на продажу</div>
          <div className="sub">Одна цена применяется ко всем NFT в пачке.</div>
        </div>
        <div className={`switch ${forSale ? 'on' : ''}`} onClick={() => setForSale(!forSale)}>
          <div className="knob" />
        </div>
      </div>

      {forSale && (
        <div className="field">
          <label>Цена ({currency})</label>
          <input type="number" min="0" step="0.001" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
        </div>
      )}

      {err && <div className="error-banner">{err}</div>}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={submit}
        disabled={files.length === 0 || loading}
      >
        {loading ? `Загрузка ${files.length}…` : `🚀 Выпустить ${files.length || 0} NFT`}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// QR MODAL
// ────────────────────────────────────────────────────────────────────────────

function QrModal({ nft, onClose }: { nft: NFT; onClose: () => void }) {
  const [src, setSrc] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const url = useMemo(() => {
    // Always use production URL for QR deep-links so printed codes work
    // regardless of whether the admin app is running on localhost.
    const base = 'https://alankharisov.github.io/idenity/';
    if (nft.nfcUid) return `${base}?nfc=${encodeURIComponent(nft.nfcUid)}`;
    return `${base}?nft=${encodeURIComponent(nft.id)}`;
  }, [nft.id, nft.nfcUid]);

  useEffect(() => {
    let cancelled = false;
    if (nft.qrImageUrl) {
      setSrc(nft.qrImageUrl);
      return;
    }
    setGenerating(true);
    apiGenerateNFTQr(nft.id)
      .then((updated: any) => {
        if (!cancelled) {
          setSrc(updated.qrImageUrl || '');
          setGenerating(false);
        }
      })
      .catch(() => {
        // Fallback: generate client-side if server generation fails
        if (!cancelled) {
          QRCode.toDataURL(url, {
            width: 320,
            margin: 3,
            color: { dark: '#0b0f14', light: '#ffffff' },
            errorCorrectionLevel: 'H',
          }).then(dataUrl => {
            if (!cancelled) {
              setSrc(dataUrl);
              setGenerating(false);
            }
          });
        }
      });
    return () => { cancelled = true; };
  }, [url, nft.qrImageUrl, nft.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  const download = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `qr-${nft.title.replace(/[^a-zа-я0-9_-]+/gi, '_')}.png`;
    a.click();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h3>QR-код товара</h3>
        <p className="sub">
          Скан открывает страницу с фото и метаданными «{nft.title}».
          {nft.nfcUid ? ' Код привязан к NFC.' : ''}
        </p>

        <div style={{ background: 'white', borderRadius: 14, padding: 16, display: 'flex', justifyContent: 'center', margin: '6px 0 14px' }}>
          {src ? (
            <img src={src} alt="QR" style={{ width: 280, height: 280, display: 'block' }} />
          ) : (
            <div style={{ width: 280, height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b0f14' }}>
              Генерация…
            </div>
          )}
        </div>

        <div className="field">
          <label>Ссылка</label>
          <input value={url} readOnly onFocus={e => e.currentTarget.select()} />
        </div>

        <div className="actions">
          <button className="btn" onClick={copy}>{copied ? 'Скопировано ✓' : 'Скопировать'}</button>
          <button className="btn" onClick={download} disabled={!src}>Скачать PNG</button>
          <button className="btn btn-primary" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EDIT MODAL
// ────────────────────────────────────────────────────────────────────────────

function EditNftModal({ nft, onClose, onSaved }: { nft: NFT; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(nft.title);
  const [description, setDescription] = useState(nft.description ?? '');
  const [forSale, setForSale] = useState(!!nft.forSale);
  const [price, setPrice] = useState(nft.price?.toString() ?? '');
  const [currency, setCurrency] = useState(nft.currency ?? 'USDC');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await apiUpdateNFT(nft.id, {
        title: title.trim(),
        description: description.trim(),
        forSale,
        price: forSale ? parseFloat(price) || 0 : undefined,
        currency: forSale ? currency : undefined,
      });
      await onSaved();
    } catch (e: any) {
      setErr(e?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Изменить NFT</h3>

        <div className="field">
          <label>Название</label>
          <input value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Описание</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={forSale} onChange={e => setForSale(e.target.checked)} />
            Выставить на продажу
          </label>
        </div>

        {forSale && (
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
        )}

        {err && <div className="error-banner">{err}</div>}

        <div className="actions">
          <button className="btn" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
