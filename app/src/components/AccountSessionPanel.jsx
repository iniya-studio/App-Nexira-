import { useState } from 'react';
import { Check, LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react';

export function AccountSessionPanel({ lifecycle, sessionState, language }) {
  const isFa = language === 'fa';
  const [mode, setMode] = useState('convert');
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
  const signedOut = sessionState.status === 'signed-out';

  function clearFeedback() {
    setError('');
    setNotice('');
  }

  async function login(event) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      await lifecycle.login({ email: email.trim(), password });
      setPassword('');
      setNotice(isFa ? 'با موفقیت وارد حساب نکسیرا شدید.' : 'You are now signed in to NEXIRA.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'ورود انجام نشد.' : 'Sign in failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function convert(event) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const next = await lifecycle.convertGuest({ email: email.trim(), username, displayName, password });
      setPassword('');
      const delivery = next.emailVerification?.delivery;
      setNotice(delivery === 'SENT'
        ? (isFa ? 'حساب ساخته شد؛ لینک تأیید به ایمیل شما ارسال شد.' : 'Account created; a verification link was sent to your email.')
        : delivery === 'NOT_CONFIGURED'
          ? (isFa ? 'حساب ساخته شد، اما ارسال ایمیل هنوز روی سرور پیکربندی نشده است.' : 'Account created, but email delivery is not configured on the server yet.')
          : (isFa ? 'حساب ساخته شد، اما ارسال ایمیل ناموفق بود. می‌توانید دوباره درخواست دهید.' : 'Account created, but email delivery failed. You can request another email.'));
      setEmail('');
      setUsername('');
      setDisplayName(next.account?.displayName ?? next.account?.user?.displayName ?? displayName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'تبدیل حساب انجام نشد.' : 'Account conversion failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    clearFeedback();
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
    clearFeedback();
    setBusy(true);
    try {
      await lifecycle.logout();
      setMode('login');
      setNotice(isFa ? 'از حساب خارج شدید.' : 'You have signed out.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'خروج انجام نشد.' : 'Sign out failed.'));
    } finally {
      setBusy(false);
    }
  }

  if (!guest && !authenticated && !signedOut) return null;

  return <section className="account-session-panel" aria-labelledby="account-session-title">
    <div className="account-session-heading">
      <span className="operator-mark"><ShieldCheck size={18} /></span>
      <span>
        <strong id="account-session-title">{isFa ? 'مدیریت حساب' : 'Account management'}</strong>
        <small>{authenticated
          ? (isFa ? 'حساب دائمی نکسیرا متصل است.' : 'Your registered NEXIRA account is connected.')
          : guest
            ? (isFa ? 'حساب مهمان فعال است؛ می‌توانی وارد حساب موجود شوی یا آن را دائمی کنی.' : 'Guest account active; sign in or make it permanent.')
            : (isFa ? 'برای ادامه با حساب نکسیرا وارد شوید.' : 'Sign in to your NEXIRA account.')}</small>
      </span>
    </div>

    {authenticated && <div className="account-signed-in">
      <p className="panel-note"><Check size={14} /> {isFa ? 'حساب دائمی متصل است.' : 'Permanent account connected.'}</p>
      {sessionState.account?.email && <p className="account-email">{sessionState.account.email}</p>}
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

    {(guest || signedOut) && <>
      {guest && <div className="account-mode-switch" role="group" aria-label={isFa ? 'روش ورود یا ثبت‌نام' : 'Account action'}>
        <button type="button" className={mode === 'convert' ? 'is-selected' : ''} aria-pressed={mode === 'convert'} onClick={() => { setMode('convert'); clearFeedback(); }}>
          {isFa ? 'ساخت حساب دائمی' : 'Create account'}
        </button>
        <button type="button" className={mode === 'login' ? 'is-selected' : ''} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); clearFeedback(); }}>
          {isFa ? 'ورود به حساب' : 'Sign in'}
        </button>
      </div>}

      {mode === 'login' && <form className="account-conversion-form" onSubmit={login}>
        {guest && <p className="panel-note account-warning">{isFa
          ? 'با ورود به حساب موجود، نشست مهمان این دستگاه جایگزین می‌شود؛ پیشرفت مهمان به حساب دیگر منتقل نخواهد شد.'
          : 'Signing in replaces this device’s guest session. Guest progress is not transferred to the other account.'}</p>}
        <label className="field-label" htmlFor="account-login-email">{isFa ? 'ایمیل' : 'Email'}</label>
        <input id="account-login-email" className="text-input" type="email" autoComplete="username" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} />
        <label className="field-label" htmlFor="account-login-password">{isFa ? 'رمز عبور' : 'Password'}</label>
        <input id="account-login-password" className="text-input" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><LogIn size={15} /></span>
          <span className="primary-label">{busy ? (isFa ? 'در حال ورود…' : 'Signing in…') : (isFa ? 'ورود به نکسیرا' : 'Sign in to NEXIRA')}</span>
        </button>
        <p className="panel-note account-recovery-note">{isFa
          ? 'بازیابی رمز عبور پس از آماده‌شدن مسیر امن بازیابی در سرور فعال می‌شود.'
          : 'Password recovery will be enabled once the secure server recovery flow is ready.'}</p>
      </form>}

      {mode === 'convert' && guest && <form className="account-conversion-form" onSubmit={convert}>
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
    </>}

    {error && <p className="account-feedback account-feedback--error" role="alert">{error}</p>}
    {notice && <p className="account-feedback" role="status">{notice}</p>}
  </section>;
}
