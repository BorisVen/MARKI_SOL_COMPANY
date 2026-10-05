import { ReactNode } from 'react';
import { Icon } from './icons';
import { useAuth } from './auth';

export type PageId =
  | 'dashboard'
  | 'crm'
  | 'nfts'
  | 'marketplace'
  | 'feed'
  | 'wallets'
  | 'notifications'
  | 'profile';

type NavItem = {
  id: PageId;
  label: string;
  icon: ReactNode;
  /** Whether to surface in the mobile bottom-nav (limited to 5). */
  mobile?: boolean;
};

const NAV: NavItem[] = [
  { id: 'dashboard',     label: 'Dashboard',     icon: <Icon.Dashboard />, mobile: true  },
  { id: 'crm',           label: 'CRM',           icon: <Icon.Truck />,     mobile: true  },
  { id: 'nfts',          label: 'NFTs',          icon: <Icon.Box />,       mobile: true  },
  { id: 'marketplace',   label: 'Marketplace',   icon: <Icon.Store />,     mobile: true  },
  { id: 'feed',          label: 'Feed',          icon: <Icon.Feed />,      mobile: false },
  { id: 'wallets',       label: 'Wallets',       icon: <Icon.Wallet />,    mobile: false },
  { id: 'notifications', label: 'Notifications', icon: <Icon.Bell />,      mobile: false },
  { id: 'profile',       label: 'Profile',       icon: <Icon.User />,      mobile: true  },
];

type Props = {
  page: PageId;
  setPage: (p: PageId) => void;
  title: string;
  children: ReactNode;
};

export default function Shell({ page, setPage, title, children }: Props) {
  const { fbUser, user, logout } = useAuth();
  const displayName = user?.companyName || user?.name || fbUser?.email || 'You';

  const mobileItems = NAV.filter(n => n.mobile);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Marki · Business</div>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="ic">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="who">
            <span>{displayName}</span>
            <button className="logout" onClick={logout}>Sign out</button>
          </div>
        </header>

        <div className="content">{children}</div>
      </main>

      <nav className="mobile-nav">
        {mobileItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="ic">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
