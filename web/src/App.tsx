import { useEffect, useState } from 'react';
import { useAuth, hasCompanyAccess } from './auth';
import Login from './Login';
import AccessDenied from './AccessDenied';
import Shell, { PageId } from './Shell';
import Dashboard from './pages/Dashboard';
import CrmPage from './pages/CrmPage';
import NftsPage from './pages/NftsPage';
import MarketplacePage from './pages/MarketplacePage';
import FeedPage from './pages/FeedPage';
import WalletsPage from './pages/WalletsPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import NftViewerPage from './pages/NftViewerPage';

const PAGE_TITLES: Record<PageId, string> = {
  dashboard:     'Dashboard',
  crm:           'CRM — Заказы и доставки',
  nfts:          'NFT',
  marketplace:   'Маркетплейс',
  feed:          'Лента',
  wallets:       'Кошельки',
  notifications: 'Уведомления',
  profile:       'Профиль компании',
};

type ViewerSource =
  | { kind: 'id'; id: string }
  | { kind: 'nfc'; uid: string };

function readViewerSourceFromUrl(): ViewerSource | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const id  = params.get('nft');
  const uid = params.get('nfc');
  if (id)  return { kind: 'id',  id };
  if (uid) return { kind: 'nfc', uid };
  return null;
}

export default function App() {
  const { fbUser, user, loading, error } = useAuth();
  const [page, setPage] = useState<PageId>('dashboard');
  const [viewer, setViewer] = useState<ViewerSource | null>(() => readViewerSourceFromUrl());

  useEffect(() => {
    const onPop = () => setViewer(readViewerSourceFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const closeViewer = () => {
    setViewer(null);
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  if (loading && !user) return <div className="spinner">Loading…</div>;
  if (!fbUser) return <Login />;
  if (error && !user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Ошибка</h2>
          <p className="sub">{error}</p>
        </div>
      </div>
    );
  }
  if (!hasCompanyAccess(user)) return <AccessDenied />;

  if (viewer) {
    return <NftViewerPage source={viewer} onClose={closeViewer} />;
  }

  return (
    <Shell page={page} setPage={setPage} title={PAGE_TITLES[page]}>
      {page === 'dashboard'     && <Dashboard onJumpTo={setPage} />}
      {page === 'crm'           && <CrmPage />}
      {page === 'nfts'          && <NftsPage />}
      {page === 'marketplace'   && <MarketplacePage />}
      {page === 'feed'          && <FeedPage />}
      {page === 'wallets'       && <WalletsPage />}
      {page === 'notifications' && <NotificationsPage />}
      {page === 'profile'       && <ProfilePage />}
    </Shell>
  );
}
