import { useAuth } from './auth';
import { apiRequestApproval } from './api';
import { useState } from 'react';

export default function AccessDenied() {
  const { user, logout, reload } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user) return null;

  if (user.banned) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Аккаунт заблокирован</h2>
          <p className="sub">
            Доступ к панели приостановлен.
            {user.banReason ? ` Причина: ${user.banReason}` : ''}
          </p>
          <button className="btn btn-block" onClick={logout}>Выйти</button>
        </div>
      </div>
    );
  }

  if (user.pendingApproval) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Заявка на рассмотрении</h2>
          <p className="sub">
            Мы получили твою заявку. Как только админ её подтвердит — здесь появится панель управления.
          </p>
          <button className="btn btn-block" style={{ marginBottom: 8 }} onClick={reload}>
            Проверить статус
          </button>
          <button className="btn btn-block" onClick={logout}>Выйти</button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Заявка отправлена</h2>
          <p className="sub">
            Админ рассмотрит её в ближайшее время. Можешь обновить статус кнопкой ниже.
          </p>
          <button className="btn btn-block" onClick={reload}>Проверить статус</button>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !regNumber.trim() || !contactEmail.trim()) {
      setError('Заполни обязательные поля.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequestApproval(user.uid, {
        companyName: companyName.trim(),
        registrationNumber: regNumber.trim(),
        contactEmail: contactEmail.trim(),
        description: description.trim(),
      });
      setDone(true);
      reload();
    } catch (err: any) {
      setError(err?.message ?? 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <h2>Подключи компанию</h2>
        <p className="sub">
          Чтобы открыть бизнес-панель, отправь заявку. Админ подтвердит её — и доступ появится автоматически.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label>Название компании *</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>
          <div className="field">
            <label>Регистрационный номер *</label>
            <input value={regNumber} onChange={e => setRegNumber(e.target.value)} />
          </div>
          <div className="field">
            <label>Контактный email *</label>
            <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Описание</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Отправка…' : 'Отправить заявку'}
          </button>
          {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}
          <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={logout}>
            Выйти
          </button>
        </form>
      </div>
    </div>
  );
}
