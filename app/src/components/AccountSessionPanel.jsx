import { useEffect, useState } from 'react';
import { Check, KeyRound, Link2, LogIn, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { googleAuth } from '../api/googleAuth.js';

export function AccountSessionPanel({
  lifecycle,
  sessionState,
  language,
  resetToken = null,
  onResetTokenConsumed = () => {},
}) {
  const isFa = language === 'fa';
  const [mode, setMode] = useState(resetToken ? 'reset' : sessionState.status === 'signed-out' ? 'login' : 'convert');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resending, setResending] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState('');
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);

  const guest = sessionState.status === 'guest';
  const authenticated = sessionState.status === 'authenticated';
  const signedOut = ['signed-out', 'offline', 'error'].includes(sessionState.status);
  const googleLinked = (sessionState.authentication?.providers ?? [])
    .some((provider) => String(provider).toUpperCase() === 'GOOGLE');

  useEffect(() => {
    if (resetToken) {
      setMode('reset');
      setPassword('');
      clearFeedback();
    }
  }, [resetToken]);

  useEffect(() => {
    if (['offline', 'error'].includes(sessionState.status) && !resetToken) setMode('register');
  }, [sessionState.status, resetToken]);

  useEffect(() => {
    if (guest || authenticated) void lifecycle.loadAccountData();
  }, [lifecycle, guest, authenticated]);

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

  async function register(event) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const next = await lifecycle.register({
        email: email.trim(),
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      });
      setPassword('');
      setNotice(next.emailVerification?.delivery === 'SENT'
        ? (isFa ? 'حساب ساخته شد؛ لینک تأیید به ایمیل شما ارسال شد.' : 'Account created; a verification email was sent.')
        : next.emailVerification?.delivery === 'NOT_CONFIGURED'
          ? (isFa ? 'حساب ساخته شد؛ ارسال ایمیل هنوز روی سرور پیکربندی نشده است.' : 'Account created; email delivery is not configured yet.')
          : (isFa ? 'حساب ساخته شد؛ وضعیت ارسال ایمیل را بررسی کنید.' : 'Account created; check the email delivery status.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'ثبت‌نام انجام نشد.' : 'Registration failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function convert(event) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const next = await lifecycle.convertGuest({
        email: email.trim(),
        username: username.trim(),
        displayName: displayName.trim(),
        password,
      });
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

  async function signInWithGoogle() {
    clearFeedback();
    setGoogleBusy(true);
    try {
      const idToken = await googleAuth.getIdToken();
      await lifecycle.signInWithGoogle(idToken);
      setNotice(isFa ? 'ورود با حساب Google موفق بود.' : 'You are signed in with Google.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'ورود با Google انجام نشد.' : 'Google sign-in failed.'));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function linkGoogle() {
    clearFeedback();
    setGoogleBusy(true);
    try {
      const idToken = await googleAuth.getIdToken();
      const result = await lifecycle.linkGoogleIdentity(idToken);
      setNotice(result.alreadyLinked
        ? (isFa ? 'این حساب Google از قبل متصل است.' : 'This Google account is already linked.')
        : (isFa ? 'حساب Google با موفقیت متصل شد.' : 'Google account linked successfully.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'اتصال Google انجام نشد.' : 'Could not link Google.'));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      await lifecycle.requestPasswordReset(email.trim());
      setNotice(isFa
        ? 'اگر حساب واجد شرایطی با این ایمیل وجود داشته باشد، دستور بازیابی ارسال می‌شود.'
        : 'If an eligible account exists for this email, password recovery instructions will be sent.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'درخواست بازیابی ثبت نشد.' : 'Could not submit the recovery request.'));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      await lifecycle.resetPassword(resetToken, password);
      setPassword('');
      setMode('login');
      setNotice(isFa
        ? 'رمز عبور تغییر کرد. نشست‌های قبلی بسته شدند؛ اکنون با رمز جدید وارد شوید.'
        : 'Password updated. Previous sessions were revoked; sign in with your new password.');
      onResetTokenConsumed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'بازنشانی رمز انجام نشد.' : 'Password reset failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    clearFeedback();
    setBusy(true);
    try {
      const result = await lifecycle.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordChangeOpen(false);
      setNotice(isFa
        ? `رمز عبور تغییر کرد و ${result.sessionsRevoked} نشست دیگر بسته شد.`
        : `Password changed; ${result.sessionsRevoked} other session(s) revoked.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'تغییر رمز انجام نشد.' : 'Password change failed.'));
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

  async function revokeSession(sessionId) {
    clearFeedback();
    setSessionBusy(sessionId);
    try {
      await lifecycle.revokeSession(sessionId);
      setNotice(isFa ? 'نشست انتخاب‌شده باطل شد.' : 'The selected session was revoked.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'ابطال نشست ناموفق بود.' : 'Could not revoke the session.'));
    } finally {
      setSessionBusy('');
    }
  }

  async function logoutAll() {
    clearFeedback();
    if (!globalThis.confirm(isFa
      ? 'همه نشست‌ها، از جمله این دستگاه، خارج شوند؟'
      : 'Sign out all sessions, including this device?')) return;
    setSessionBusy('all');
    try {
      const result = await lifecycle.logoutAll();
      setMode('login');
      setNotice(isFa
        ? `همه نشست‌ها باطل شدند (${result.revokedSessions}).`
        : `All sessions were revoked (${result.revokedSessions}).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isFa ? 'خروج از همه دستگاه‌ها ناموفق بود.' : 'Could not sign out all devices.'));
    } finally {
      setSessionBusy('');
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
      {sessionState.authentication && <p className="panel-note account-auth-methods">
        {isFa ? 'روش‌های ورود:' : 'Sign-in methods:'} {[
          ...(sessionState.authentication.passwordEnabled ? [isFa ? 'رمز عبور' : 'Password'] : []),
          ...(sessionState.authentication.providers ?? []),
        ].join(' · ') || (isFa ? 'نامشخص' : 'Not available')}
      </p>}
      {!googleLinked && sessionState.emailVerification?.verified && <button type="button" className="secondary-action" disabled={googleBusy} onClick={linkGoogle}>
        <Link2 size={15} /> {googleBusy ? (isFa ? 'در حال اتصال…' : 'Linking…') : (isFa ? 'اتصال حساب Google' : 'Link Google account')}
      </button>}
      {!googleLinked && !sessionState.emailVerification?.verified && <p className="panel-note account-warning">
        {isFa ? 'برای اتصال Google ابتدا ایمیل حساب نکسیرا را تأیید کنید.' : 'Verify your NEXIRA account email before linking Google.'}
      </p>}
      <div className="account-password-management">
        <button type="button" className="secondary-action" onClick={() => setPasswordChangeOpen((open) => !open)}>
          <KeyRound size={15} /> {passwordChangeOpen
            ? (isFa ? 'بستن تغییر رمز' : 'Close password change')
            : (isFa ? 'تغییر رمز عبور' : 'Change password')}
        </button>
        {passwordChangeOpen && <form className="account-conversion-form" onSubmit={changePassword}>
          <label className="field-label" htmlFor="account-current-password">{isFa ? 'رمز فعلی' : 'Current password'}</label>
          <input id="account-current-password" className="text-input" type="password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <label className="field-label" htmlFor="account-new-password">{isFa ? 'رمز جدید (حداقل ۱۲ کاراکتر)' : 'New password (12 characters minimum)'}</label>
          <input id="account-new-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <button className="primary-button account-submit" type="submit" disabled={busy}>
            <span className="play-mark"><KeyRound size={15} /></span>
            <span className="primary-label">{busy ? (isFa ? 'در حال تغییر…' : 'Updating…') : (isFa ? 'ثبت رمز جدید' : 'Update password')}</span>
          </button>
        </form>}
      </div>
      <div className="account-session-list">
        <strong>{isFa ? 'نشست‌های فعال و اخیر' : 'Active and recent sessions'}</strong>
        {sessionState.sessions?.length
          ? sessionState.sessions.map((item) => <div className="account-session-row" key={item.sessionId}>
              <span>
                <b>{item.isCurrent ? (isFa ? 'این دستگاه' : 'This device') : (isFa ? 'دستگاه دیگر' : 'Another device')}</b>
                <small>{new Date(item.createdAt).toLocaleString(isFa ? 'fa-IR' : 'en-US')} · {item.status}</small>
              </span>
              {item.status === 'ACTIVE' && !item.isCurrent && <button type="button" className="text-action" disabled={Boolean(sessionBusy)} onClick={() => revokeSession(item.sessionId)}>
                {sessionBusy === item.sessionId ? (isFa ? 'در حال ابطال…' : 'Revoking…') : (isFa ? 'ابطال نشست' : 'Revoke session')}
              </button>}
            </div>)
          : <p className="panel-note">{sessionState.accountDataError || (isFa ? 'نشستی برای نمایش وجود ندارد.' : 'No sessions to display.')}</p>}
        {sessionState.accountDataError && <p className="account-feedback account-feedback--error" role="status">{sessionState.accountDataError}</p>}
        <button type="button" className="secondary-action" disabled={Boolean(sessionBusy)} onClick={logoutAll}>
          {sessionBusy === 'all' ? (isFa ? 'در حال خروج…' : 'Signing out…') : (isFa ? 'خروج از همه دستگاه‌ها' : 'Sign out all devices')}
        </button>
      </div>
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
      {signedOut && !['reset', 'forgot'].includes(mode) && <>
        {['offline', 'error'].includes(sessionState.status) && <p className="panel-note account-warning">{isFa ? 'اتصال حساب هنوز برقرار نشده است. برای ارسال فرم، اتصال سرور لازم است.' : 'Account connection is unavailable. A server connection is required to submit this form.'}</p>}
        <div className="account-mode-switch" role="group" aria-label={isFa ? 'ورود یا ثبت‌نام مستقل' : 'Sign in or create account'}>
          <button type="button" className={mode === 'login' ? 'is-selected' : ''} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); clearFeedback(); }}>{isFa ? 'ورود' : 'Sign in'}</button>
          <button type="button" className={mode === 'register' ? 'is-selected' : ''} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); clearFeedback(); }}>{isFa ? 'ساخت حساب جدید' : 'Create account'}</button>
        </div>
      </>}

      {mode === 'login' && <form className="account-conversion-form" onSubmit={login}>
        {guest && <p className="panel-note account-warning">{isFa
          ? 'با ورود به حساب موجود، نشست مهمان این دستگاه جایگزین می‌شود؛ پیشرفت مهمان به حساب دیگر منتقل نخواهد شد.'
          : 'Signing in replaces this device’s guest session. Guest progress is not transferred to the other account.'}</p>}
        <label className="field-label" htmlFor="account-login-email">{isFa ? 'ایمیل' : 'Email'}</label>
        <input id="account-login-email" className="text-input" type="email" autoComplete="username" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="field-label" htmlFor="account-login-password">{isFa ? 'رمز عبور' : 'Password'}</label>
        <input id="account-login-password" className="text-input" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><LogIn size={15} /></span>
          <span className="primary-label">{busy ? (isFa ? 'در حال ورود…' : 'Signing in…') : (isFa ? 'ورود به نکسیرا' : 'Sign in to NEXIRA')}</span>
        </button>
        <button type="button" className="text-action account-forgot-link" onClick={() => { setMode('forgot'); clearFeedback(); }}>
          <Mail size={14} /> {isFa ? 'رمز عبور را فراموش کرده‌اید؟' : 'Forgot password?'}
        </button>
      </form>}

      {mode === 'register' && signedOut && <form className="account-conversion-form" onSubmit={register}>
        <p className="panel-note">{isFa ? 'یک حساب مستقل بساز؛ برای ثبت‌نام نیازی به حساب مهمان نیست.' : 'Create an independent account. A guest account is not required.'}</p>
        <label className="field-label" htmlFor="account-register-email">{isFa ? 'ایمیل' : 'Email'}</label>
        <input id="account-register-email" className="text-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="field-label" htmlFor="account-register-username">{isFa ? 'نام کاربری' : 'Username'}</label>
        <input id="account-register-username" className="text-input" autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" required value={username} onChange={(event) => setUsername(event.target.value)} />
        <label className="field-label" htmlFor="account-register-display-name">{isFa ? 'نام نمایشی' : 'Display name'}</label>
        <input id="account-register-display-name" className="text-input" minLength={1} maxLength={40} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <label className="field-label" htmlFor="account-register-password">{isFa ? 'رمز عبور (حداقل ۱۲ کاراکتر)' : 'Password (12 characters minimum)'}</label>
        <input id="account-register-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><UserRound size={15} /></span>
          <span className="primary-label">{busy ? (isFa ? 'در حال ثبت‌نام…' : 'Creating account…') : (isFa ? 'ساخت حساب نکسیرا' : 'Create NEXIRA account')}</span>
        </button>
      </form>}

      {mode === 'convert' && guest && <form className="account-conversion-form" onSubmit={convert}>
        <p className="panel-note">{isFa
          ? 'برای ذخیره امن پیشرفت و استفاده از حسابت روی دستگاه‌های دیگر، حساب مهمان را به حساب دائمی تبدیل کن.'
          : 'Convert your guest identity to a permanent account to protect progress and use it across devices.'}</p>
        <label className="field-label" htmlFor="account-email">{isFa ? 'ایمیل' : 'Email'}</label>
        <input id="account-email" className="text-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="field-label" htmlFor="account-username">{isFa ? 'نام کاربری' : 'Username'}</label>
        <input id="account-username" className="text-input" autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" required value={username} onChange={(event) => setUsername(event.target.value)} />
        <label className="field-label" htmlFor="account-display-name">{isFa ? 'نام نمایشی' : 'Display name'}</label>
        <input id="account-display-name" className="text-input" minLength={1} maxLength={40} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <label className="field-label" htmlFor="account-password">{isFa ? 'رمز عبور (حداقل ۱۲ کاراکتر)' : 'Password (12 characters minimum)'}</label>
        <input id="account-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><UserRound size={15} /></span>
          <span className="primary-label">{busy ? (isFa ? 'در حال ساخت…' : 'Creating…') : (isFa ? 'تبدیل به حساب دائمی' : 'Create permanent account')}</span>
        </button>
      </form>}

      {mode === 'forgot' && signedOut && <form className="account-conversion-form" onSubmit={requestPasswordReset}>
        <p className="panel-note">{isFa ? 'ایمیل حساب را وارد کنید تا در صورت وجود حساب واجد شرایط، لینک بازیابی ارسال شود.' : 'Enter your account email. If an eligible account exists, a recovery link will be sent.'}</p>
        <label className="field-label" htmlFor="account-forgot-email">{isFa ? 'ایمیل' : 'Email'}</label>
        <input id="account-forgot-email" className="text-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><Mail size={15} /></span>
          <span className="primary-label">{busy ? (isFa ? 'در حال ارسال…' : 'Sending…') : (isFa ? 'ارسال لینک بازیابی' : 'Send recovery link')}</span>
        </button>
        <button type="button" className="text-action" onClick={() => { setMode('login'); clearFeedback(); }}>{isFa ? 'بازگشت به ورود' : 'Back to sign in'}</button>
      </form>}

      {mode === 'reset' && resetToken && <form className="account-conversion-form" onSubmit={resetPassword}>
        <p className="panel-note">{isFa ? 'رمز جدیدی با حداقل ۱۲ کاراکتر انتخاب کنید.' : 'Choose a new password with at least 12 characters.'}</p>
        <label className="field-label" htmlFor="account-reset-password">{isFa ? 'رمز عبور جدید' : 'New password'}</label>
        <input id="account-reset-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><KeyRound size={15} /></span>
          <span className="primary-label">{busy ? (isFa ? 'در حال بازنشانی…' : 'Resetting…') : (isFa ? 'ثبت رمز جدید' : 'Set new password')}</span>
        </button>
      </form>}
    </>}

    {(guest || signedOut) && mode !== 'reset' && <div className="account-google-entry">
      {guest && <p className="panel-note account-warning">{isFa ? 'ورود با Google نشست مهمان را با حساب Google جایگزین می‌کند و پیشرفت مهمان منتقل نمی‌شود.' : 'Google sign-in replaces this guest session; guest progress is not transferred.'}</p>}
      <button type="button" className="secondary-action account-google-button" disabled={googleBusy} onClick={signInWithGoogle}>
        <span className="google-mark" aria-hidden="true">G</span>
        {googleBusy ? (isFa ? 'در حال اتصال به Google…' : 'Connecting to Google…') : (isFa ? 'ادامه با Google' : 'Continue with Google')}
      </button>
    </div>}

    {sessionState.emailVerification?.verified && authenticated && <p className="account-feedback" role="status">{isFa ? 'ایمیل حساب تأیید شده است.' : 'Account email is verified.'}</p>}
    {sessionState.accountDataError && !authenticated && <p className="account-feedback account-feedback--error" role="status">{sessionState.accountDataError}</p>}
    {error && <p className="account-feedback account-feedback--error" role="alert">{error}</p>}
    {notice && <p className="account-feedback" role="status">{notice}</p>}
  </section>;
}
