import { useState } from 'react';
import { Check, LogOut, ShieldCheck, UserRound } from 'lucide-react';

export function AccountSessionPanel({ lifecycle, sessionState, language }) {
  const isFa = language === 'fa';
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState(false);

  const guest = sessionState.status === 'guest';
  const authenticated = sessionState.status === 'authenticated';

  async function convert(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const next = await lifecycle.convertGuest({ email, username, displayName, password });
      setPassword('');
      const delivery = next.emailVerification?.delivery;
      setNotice(delivery === 'SENT'
        ? (isFa ? 'حساب ساخته شد؛ لینک تأیید به ایمیل شما ارسال شد.' : 'Account created; a verification link was sent to your email.')
        : delivery === 'NOT_CONFIGURED'
          ? (isFa ? 'حساب ساخته شد، اما ارسال ایمیل هنوز روی سرور پیکربندی نشده است.' : 'Account created, but email delivery is not configured on the server yet.')
          : (isFa ? 'حساب ساخته شد، اما ارسال ایمیل ناموفق بود. می‌توانید دوباره درخواست دهید.' : 'Account created, but email delivery failed. You can request another email.'));
      setEmail('');
      setUsername('');
      setDisplayName(next.account?.displayName ?? displayName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'تبدیل حساب انجام نشد.' : 'Account conversion failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setError('');
    setNotice('');
    setResending(true);
    try {
      const result = await lifecycle.resendVerification();
      setNotice(result.delivery === 'SENT'
        ? (isFa ? 'ایمیل تأیید دوباره ارسال شد.' : 'Verification email sent again.')
        : (isFa ? 'ارسال ایمیل فعلاً در دسترس نیست.' : 'Email delivery is currently unavailable.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'ارسال ایمیل ناموفق بود.' : 'Could not resend verification email.'));
    } finally {
      setResending(false);
    }
  }

  async function logout() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await lifecycle.logout();
      setNotice(isFa ? 'از حساب خارج شدید.' : 'You have signed out.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'خروج انجام نشد.' : 'Sign out failed.'));
    } finally {
      setBusy(false);
    }
  }

  if (!guest && !authenticated) return null;

  return <section className="account-session-panel" aria-labelledby="account-session-title">
    <div className="account-session-heading">
      <span className="operator-mark"><ShieldCheck size={18} /></span>
      <span>
        <strong id="account-session-title">{isFa ? 'مدیریت حساب' : 'Account management'}</strong>
        <small>{guest
          ? (isFa ? 'حساب مهمان؛ پیشرفتت روی همین هویت ثبت می‌شود.' : 'Guest account; your progress belongs to this identity.')
          : (isFa ? 'حساب دائمی نکسیرا متصل است.' : 'Your registered NEXIRA account is connected.')}</small>
      </span>
    </div>

    {guest && <form className="account-conversion-form" onSubmit={convert}>
      <p className="panel-note">{isFa
        ? 'برای ذخیره امن پیشرفت و استفاده از حسابت روی دستگاه‌های دیگر، حساب مهمان را به حساب دائمی تبدیل کن.'
        : 'Convert your guest identity to a permanent account to protect progress and use it across devices.'}</p>
      <label className="field-label" htmlFor="account-email">{isFa ? 'ایمیل' : 'Email'}</label>
      <input id="account-email" className="text-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} />
      <label className="field-label" htmlFor="account-username">{isFa ? 'نام کاربری' : 'Username'}</label>
      <input id="account-username" className="text-input" autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" required value={username} onChange={event => setUsername(event.target.value)} />
      <label className="field-label" htmlFor="account-display-name">{isFa ? 'نام نمایشی' : 'Display name'}</label>
      <input id="account-display-name" className="text-input" minLength={1} maxLength={40} required value={displayName} onChange={event => setDisplayName(event.target.value)} />
      <label className="field-label" htmlFor="account-password">{isFa ? 'رمز عبور (حداقل ۱۲ کاراکتر)' : 'Password (12 characters minimum)'}</label>
      <input id="account-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} />
      <button className="primary-button account-submit" type="submit" disabled={busy}>
        <span className="play-mark"><UserRound size={15} /></span>
        <span className="primary-label">{busy ? (isFa ? 'در حال ساخت…' : 'Creating…') : (isFa ? 'تبدیل به حساب دائمی' : 'Create permanent account')}</span>
      </button>
    </form>}

    {authenticated && <div className="account-signed-in">
      <p className="panel-note"><Check size={14} /> {isFa ? 'حساب دائمی متصل است.' : 'Permanent account connected.'}</p>
      {sessionState.emailVerification?.required && !sessionState.emailVerification?.verified && <div className="account-verification">
        <p className="panel-note">{isFa ? 'برای تکمیل امنیت حساب، ایمیل خود را تأیید کنید.' : 'Verify your email to complete account security.'}</p>
        <button type="button" className="secondary-action" disabled={busy || resending} onClick={resendVerification}>
          {resending ? (isFa ? 'در حال ارسال…' : 'Sending…') : (isFa ? 'ارسال دوباره ایمیل تأیید' : 'Resend verification email')}
        </button>
      </div>}
      <button type="button" className="secondary-action" disabled={busy} onClick={logout}>
        <LogOut size={15} /> {isFa ? 'خروج از حساب' : 'Sign out'}
      </button>
    </div>}

    {error && <p className="account-feedback account-feedback--error" role="alert">{error}</p>}
    {notice && <p className="account-feedback" role="status">{notice}</p>}
  </section>;
}
