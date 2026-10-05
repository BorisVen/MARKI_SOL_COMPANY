import { useState } from 'react';
import { apiChangePassword, apiUpdateProfile, apiUploadAvatar } from '../api';
import { useAuth } from '../auth';

export default function ProfilePage() {
  const { user, reload } = useAuth();

  function ProfileForm() {
    const [name, setName] = useState(user!.name);
    const [username, setUsername] = useState(user!.username);
    const [bio, setBio] = useState(user!.bio ?? '');
    const [location, setLocation] = useState(user!.location ?? '');
    const [deliveryAddress, setDeliveryAddress] = useState(user!.deliveryAddress ?? '');
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      setMsg(null);
      try {
        if (avatarFile) {
          await apiUploadAvatar(user!.uid, avatarFile);
        }
        await apiUpdateProfile(user!.uid, {
          name: name.trim(),
          username: username.trim(),
          bio: bio.trim(),
          location: location.trim(),
          deliveryAddress: deliveryAddress.trim(),
        });
        await reload();
        setMsg('Сохранено.');
        setAvatarFile(null);
      } catch (e: any) {
        setErr(e?.message ?? 'Save failed');
      } finally {
        setBusy(false);
      }
    };

    return (
      <form onSubmit={submit} className="card">
        <h3>Профиль</h3>
        <p className="sub" style={{ marginBottom: 16 }}>Контакты, имя и аватар.</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          {user!.avatar && (
            <img src={user!.avatar} alt="avatar" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>Загрузить новый аватар</label>
            <input type="file" accept="image/*" onChange={e => setAvatarFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="field">
          <label>Имя</label>
          <input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label>Био</label>
          <textarea value={bio} onChange={e => setBio(e.target.value)} />
        </div>
        <div className="field">
          <label>Локация</label>
          <input value={location} onChange={e => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <label>Адрес доставки по умолчанию</label>
          <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
        </div>

        {msg && <div className="error-banner" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success)', borderColor: 'rgba(34,197,94,0.3)' }}>{msg}</div>}
        {err && <div className="error-banner">{err}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </form>
    );
  }

  function SecurityCard() {
    const [pw, setPw] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const submit = async () => {
      if (pw.length < 8) {
        setErr('Минимум 8 символов.');
        return;
      }
      setBusy(true);
      setErr(null);
      setMsg(null);
      try {
        await apiChangePassword(user!.uid, pw);
        setMsg('Пароль обновлён.');
        setPw('');
      } catch (e: any) {
        setErr(e?.message ?? 'Change failed');
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="card">
        <h3>Безопасность</h3>
        <p className="sub" style={{ marginBottom: 14 }}>Сменить пароль аккаунта.</p>
        <div className="field">
          <label>Новый пароль</label>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} />
        </div>
        {msg && <div className="error-banner" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success)', borderColor: 'rgba(34,197,94,0.3)' }}>{msg}</div>}
        {err && <div className="error-banner">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !pw} onClick={submit}>
          {busy ? 'Обновление…' : 'Сменить пароль'}
        </button>
      </div>
    );
  }

  function CompanyInfoCard() {
    if (!user!.companyApproved) return null;
    return (
      <div className="card">
        <h3>Компания</h3>
        <p className="sub" style={{ marginBottom: 14 }}>Данные, которые админ одобрил.</p>
        <Row label="Название" value={user!.companyName} />
        <Row label="Регистрационный номер" value={user!.registrationNumber} />
        <Row label="Контактный email" value={user!.contactEmail} />
        <Row label="Описание" value={user!.businessDescription} multiline />
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-success">Verified</span>
        </div>
      </div>
    );
  }

  function Row({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
    if (!value) return null;
    return (
      <div style={{ marginBottom: 10 }}>
        <div className="sub" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.04 }}>{label}</div>
        <div style={{ fontSize: 13, whiteSpace: multiline ? 'pre-wrap' : 'normal' }}>{value}</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <ProfileForm />
      <div>
        <SecurityCard />
        <div style={{ height: 12 }} />
        <CompanyInfoCard />
      </div>
    </div>
  );
}
