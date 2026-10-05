import { useMemo, useState, useEffect } from 'react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  (import.meta.env.VITE_API_URL as string) ||
  'https://idenity-backend.duckdns.org';

// Для продакшена / batch mint можно поставить VITE_SOLANA_RPC=<helius|quicknode|triton>.
// По умолчанию Solana RPC идет через backend proxy, чтобы браузер не ловил 403.
const SOLANA_RPC =
  (import.meta.env.VITE_SOLANA_RPC as string) || `${API_BASE_URL}/api/solana-rpc`;

if (!import.meta.env.VITE_SOLANA_RPC) {
  console.warn(
    '[useUmi] VITE_SOLANA_RPC не задан — используется backend Solana RPC proxy.',
  );
}

function getPhantom(): any {
  return (window as any).phantom?.solana ?? (window as any).solana ?? null;
}

export function useUmi() {
  const phantomWallet = getPhantom();

  const [publicKeyStr, setPublicKeyStr] = useState<string>(
    () => phantomWallet?.publicKey?.toString() ?? ''
  );

  useEffect(() => {
    const wallet = getPhantom();
    if (!wallet) return;

    const onConnect = (pk: any) =>
      setPublicKeyStr(pk?.toString() ?? wallet.publicKey?.toString() ?? '');
    const onDisconnect = () => setPublicKeyStr('');

    wallet.on?.('connect', onConnect);
    wallet.on?.('disconnect', onDisconnect);

    if (wallet.publicKey) {
      setPublicKeyStr(wallet.publicKey.toString());
    }

    return () => {
      wallet.off?.('connect', onConnect);
      wallet.off?.('disconnect', onDisconnect);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const umi = useMemo(() => {
    const instance = createUmi(SOLANA_RPC).use(mplTokenMetadata());
    if (phantomWallet && publicKeyStr) {
      instance.use(walletAdapterIdentity(phantomWallet));
    }
    return instance;
  }, [publicKeyStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (): Promise<string> => {
    const wallet = getPhantom();
    if (!wallet) {
      throw new Error(
        'Phantom не найден. Установи расширение Phantom для браузера и перезагрузи страницу.'
      );
    }
    const resp = await wallet.connect();
    const pk = resp?.publicKey?.toString() ?? wallet.publicKey?.toString() ?? '';
    if (!pk) throw new Error('Phantom не вернул publicKey.');
    setPublicKeyStr(pk);
    return pk;
  };

  const disconnect = async () => {
    const wallet = getPhantom();
    try { await wallet?.disconnect?.(); } catch { /* noop */ }
    setPublicKeyStr('');
  };

  const isReady = Boolean(phantomWallet && publicKeyStr);

  return { umi, isReady, phantomWallet, connect, disconnect, publicKey: publicKeyStr };
}
