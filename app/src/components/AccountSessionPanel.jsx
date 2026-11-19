import { useEffect, useState } from 'react';
import { Check, KeyRound, Link2, LogIn, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { googleAuth } from '../api/googleAuth.js';
import { formatCopy, getCopy } from '../i18n.js';
import { formatLocaleNumber, getLocaleConfig } from '../locales.js';

export function getLocalizedAccountError(error, copy) {
  if (error?.code === 'NETWORK_ERROR') return copy.network_error;
  if (error?.code === 'REQUEST_ABORTED') return copy.request_aborted;
  if (error?.code === 'SESSION_SUPERSEDED') return copy.session_changed;
  if (error?.code === 'CONVERSION_RECOVERY_EXPIRED') return copy.recovery_window_expired;
  if (error?.status === 401 || error?.status === 403) return copy.authorization_failed;
  if (error?.status === 409) return copy.conflict;
  if (error?.status === 400 || error?.status === 422) return copy.invalid_input;
  if (error?.status === 429) return copy.rate_limited;
  if (Number(error?.status) >= 500) return copy.server_error;
  return copy.generic_error;
}


export function AccountSessionPanel({
  lifecycle,
  sessionState,
  language,
  resetToken = null,
  onResetTokenConsumed = () => {},
}) {
  const copy = getCopy(language);
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
      setNotice(copy.account.you_are_now_signed_in_to_nexira);
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
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
        ? (copy.account.account_created_a_verification_email_was_sent)
        : next.emailVerification?.delivery === 'NOT_CONFIGURED'
          ? (copy.account.account_created_email_delivery_is_not_configured)
          : (copy.account.account_created_check_the_email_delivery_status));
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
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
      setNotice(copy.account.your_account_was_created_check_your_email_to_ver);
      setEmail('');
      setUsername('');
      setDisplayName(next.account?.displayName ?? next.account?.user?.displayName ?? displayName);
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    clearFeedback();
    setGoogleBusy(true);
    try {
      const challenge = await lifecycle.createGoogleChallenge();
      const identity = await googleAuth.getIdentity(challenge.nonce);
      await lifecycle.signInWithGoogle(identity);
      setNotice(copy.account.you_are_signed_in_with_google);
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function linkGoogle() {
    clearFeedback();
    setGoogleBusy(true);
    try {
      const challenge = await lifecycle.createGoogleChallenge();
      const identity = await googleAuth.getIdentity(challenge.nonce);
      const result = await lifecycle.linkGoogleIdentity(identity);
      setNotice(result.alreadyLinked
        ? (copy.account.this_google_account_is_already_linked)
        : (copy.account.google_account_linked_successfully));
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
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
      setNotice(copy.account.if_an_eligible_account_exists_for_this_email_pas);
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
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
      setNotice(copy.account.password_updated_previous_sessions_were_revoked_);
      onResetTokenConsumed();
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordSetup() {
    clearFeedback();
    setBusy(true);
    try {
      await lifecycle.requestPasswordReset(sessionState.account?.email ?? '');
      setNotice(copy.account.if_this_account_is_eligible_a_password_setup_lin);
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
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
      setNotice(formatCopy(copy.account.password_changed_result_sessionsrevoked_other_se, { sessionsRevoked: formatLocaleNumber(result.sessionsRevoked, language), revokedSessions: formatLocaleNumber(result.revokedSessions, language) }));
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    clearFeedback();
    setResending(true);
    try {
      const result = await lifecycle.resendVerification();
      setNotice(result.emailVerification?.delivery === 'SENT'
        ? (copy.account.verification_email_sent_again)
        : (copy.account.email_delivery_is_currently_unavailable));
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
    } finally {
      setResending(false);
    }
  }

  async function revokeSession(sessionId) {
    clearFeedback();
    setSessionBusy(sessionId);
    try {
      await lifecycle.revokeSession(sessionId);
      setNotice(copy.account.the_selected_session_was_revoked);
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
    } finally {
      setSessionBusy('');
    }
  }

  async function logoutAll() {
    clearFeedback();
    if (!globalThis.confirm(copy.account.sign_out_all_sessions_including_this_device)) return;
    setSessionBusy('all');
    try {
      const result = await lifecycle.logoutAll();
      setMode('login');
      setNotice(formatCopy(copy.account.all_sessions_were_revoked_result_revokedsessions, { sessionsRevoked: result.sessionsRevoked, revokedSessions: result.revokedSessions }));
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
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
      setNotice(copy.account.you_have_signed_out);
    } catch (cause) {
      setError(getLocalizedAccountError(cause, copy.account));
    } finally {
      setBusy(false);
    }
  }

  if (!guest && !authenticated && !signedOut) return null;

  return <section className="account-session-panel" aria-labelledby="account-session-title">
    <div className="account-session-heading">
      <span className="operator-mark"><ShieldCheck size={18} /></span>
      <span>
        <strong id="account-session-title">{copy.account.account_management}</strong>
        <small>{authenticated
          ? (copy.account.your_registered_nexira_account_is_connected)
          : guest
            ? (copy.account.guest_account_active_sign_in_or_make_it_permanen)
            : (copy.account.sign_in_to_your_nexira_account)}</small>
      </span>
    </div>

    {authenticated && <div className="account-signed-in">
      <p className="panel-note"><Check size={14} /> {copy.account.permanent_account_connected}</p>
      {sessionState.account?.email && <p className="account-email">{sessionState.account.email}</p>}
      {sessionState.authentication && <p className="panel-note account-auth-methods">
        {copy.account.sign_in_methods} {[
          ...(sessionState.authentication.passwordEnabled ? [copy.account.password] : []),
          ...(sessionState.authentication.providers ?? []),
        ].join(' · ') || (copy.account.not_available)}
      </p>}
      {!googleLinked && sessionState.emailVerification?.verified && <button type="button" className="secondary-action" disabled={googleBusy} onClick={linkGoogle}>
        <Link2 size={15} /> {googleBusy ? (copy.account.linking) : (copy.account.link_google_account)}
      </button>}
      {!googleLinked && !sessionState.emailVerification?.verified && <p className="panel-note account-warning">
        {copy.account.verify_your_nexira_account_email_before_linking_}
      </p>}
      {!sessionState.authentication?.passwordEnabled && sessionState.account?.email && <button type="button" className="secondary-action" disabled={busy} onClick={requestPasswordSetup}>
        <Mail size={15} /> {copy.account.set_a_password_by_email}
      </button>}
      <div className="account-password-management">
        <button type="button" className="secondary-action" onClick={() => setPasswordChangeOpen((open) => !open)}>
          <KeyRound size={15} /> {passwordChangeOpen
            ? (copy.account.close_password_change)
            : (copy.account.change_password)}
        </button>
        {passwordChangeOpen && <form className="account-conversion-form" onSubmit={changePassword}>
          <label className="field-label" htmlFor="account-current-password">{copy.account.current_password}</label>
          <input id="account-current-password" className="text-input" type="password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <label className="field-label" htmlFor="account-new-password">{copy.account.new_password_12_characters_minimum}</label>
          <input id="account-new-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <button className="primary-button account-submit" type="submit" disabled={busy}>
            <span className="play-mark"><KeyRound size={15} /></span>
            <span className="primary-label">{busy ? (copy.account.updating) : (copy.account.update_password)}</span>
          </button>
        </form>}
      </div>
      <div className="account-session-list">
        <strong>{copy.account.active_and_recent_sessions}</strong>
        {sessionState.sessions?.length
          ? sessionState.sessions.map((item) => <div className="account-session-row" key={item.sessionId}>
              <span>
                <b>{item.isCurrent ? (copy.account.this_device) : (copy.account.another_device)}</b>
                <small>{new Date(item.createdAt).toLocaleString(getLocaleConfig(language).intlLocale)} · {(item.status === 'ACTIVE' ? copy.account.session_active : item.status === 'REVOKED' ? copy.account.session_revoked : item.status === 'EXPIRED' ? copy.account.session_expired : copy.account.session_unknown)}</small>
              </span>
              {item.status === 'ACTIVE' && !item.isCurrent && <button type="button" className="text-action" disabled={Boolean(sessionBusy)} onClick={() => revokeSession(item.sessionId)}>
                {sessionBusy === item.sessionId ? (copy.account.revoking) : (copy.account.revoke_session)}
              </button>}
            </div>)
          : <p className="panel-note">{sessionState.accountDataError ? copy.account.account_data_unavailable : copy.account.no_sessions_to_display}</p>}
        {sessionState.accountDataError && <p className="account-feedback account-feedback--error" role="status">{copy.account.account_data_unavailable}</p>}
        <button type="button" className="secondary-action" disabled={Boolean(sessionBusy)} onClick={logoutAll}>
          {sessionBusy === 'all' ? (copy.account.signing_out) : (copy.account.sign_out_all_devices)}
        </button>
      </div>
      {sessionState.emailVerification?.required && !sessionState.emailVerification?.verified && <div className="account-verification">
        <p className="panel-note">{copy.account.verify_your_email_to_complete_account_security}</p>
        <button type="button" className="secondary-action" disabled={busy || resending} onClick={resendVerification}>
          {resending ? (copy.account.sending) : (copy.account.resend_verification_email)}
        </button>
      </div>}
      <button type="button" className="secondary-action" disabled={busy} onClick={logout}>
        <LogOut size={15} /> {copy.account.sign_out}
      </button>
    </div>}

    {(guest || signedOut) && <>
      {guest && mode !== 'reset' && <div className="account-mode-switch" role="group" aria-label={copy.account.account_action}>
        <button type="button" className={mode === 'convert' ? 'is-selected' : ''} aria-pressed={mode === 'convert'} onClick={() => { setMode('convert'); clearFeedback(); }}>
          {copy.account.create_account}
        </button>
        <button type="button" className={mode === 'login' ? 'is-selected' : ''} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); clearFeedback(); }}>
          {copy.account.sign_in}
        </button>
      </div>}
      {signedOut && !['reset', 'forgot'].includes(mode) && <>
        {['offline', 'error'].includes(sessionState.status) && <p className="panel-note account-warning">{copy.account.account_connection_is_unavailable_a_server_conne}</p>}
        <div className="account-mode-switch" role="group" aria-label={copy.account.sign_in_or_create_account}>
          <button type="button" className={mode === 'login' ? 'is-selected' : ''} aria-pressed={mode === 'login'} onClick={() => { setMode('login'); clearFeedback(); }}>{copy.account.sign_in_2}</button>
          <button type="button" className={mode === 'register' ? 'is-selected' : ''} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); clearFeedback(); }}>{copy.account.create_account_2}</button>
        </div>
      </>}

      {mode === 'login' && <form className="account-conversion-form" onSubmit={login}>
        {guest && <p className="panel-note account-warning">{copy.account.signing_in_replaces_this_device_s_guest_session_}</p>}
        <label className="field-label" htmlFor="account-login-email">{copy.account.email}</label>
        <input id="account-login-email" className="text-input" type="email" autoComplete="username" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="field-label" htmlFor="account-login-password">{copy.account.password}</label>
        <input id="account-login-password" className="text-input" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><LogIn size={15} /></span>
          <span className="primary-label">{busy ? (copy.account.signing_in) : (copy.account.sign_in_to_nexira)}</span>
        </button>
        <button type="button" className="text-action account-forgot-link" onClick={() => { setMode('forgot'); clearFeedback(); }}>
          <Mail size={14} /> {copy.account.forgot_password}
        </button>
      </form>}

      {mode === 'register' && signedOut && <form className="account-conversion-form" onSubmit={register}>
        <p className="panel-note">{copy.account.create_an_independent_account_a_guest_account_is}</p>
        <label className="field-label" htmlFor="account-register-email">{copy.account.email}</label>
        <input id="account-register-email" className="text-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="field-label" htmlFor="account-register-username">{copy.account.username}</label>
        <input id="account-register-username" className="text-input" autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" required value={username} onChange={(event) => setUsername(event.target.value)} />
        <label className="field-label" htmlFor="account-register-display-name">{copy.account.display_name}</label>
        <input id="account-register-display-name" className="text-input" minLength={1} maxLength={40} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <label className="field-label" htmlFor="account-register-password">{copy.account.password_12_characters_minimum}</label>
        <input id="account-register-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><UserRound size={15} /></span>
          <span className="primary-label">{busy ? (copy.account.creating_account) : (copy.account.create_nexira_account)}</span>
        </button>
      </form>}

      {mode === 'convert' && guest && <form className="account-conversion-form" onSubmit={convert}>
        <p className="panel-note">{copy.account.convert_your_guest_identity_to_a_permanent_accou}</p>
        <label className="field-label" htmlFor="account-email">{copy.account.email}</label>
        <input id="account-email" className="text-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="field-label" htmlFor="account-username">{copy.account.username}</label>
        <input id="account-username" className="text-input" autoComplete="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" required value={username} onChange={(event) => setUsername(event.target.value)} />
        <label className="field-label" htmlFor="account-display-name">{copy.account.display_name}</label>
        <input id="account-display-name" className="text-input" minLength={1} maxLength={40} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <label className="field-label" htmlFor="account-password">{copy.account.password_12_characters_minimum}</label>
        <input id="account-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><UserRound size={15} /></span>
          <span className="primary-label">{busy ? (copy.account.creating) : (copy.account.create_permanent_account)}</span>
        </button>
      </form>}

      {mode === 'forgot' && signedOut && <form className="account-conversion-form" onSubmit={requestPasswordReset}>
        <p className="panel-note">{copy.account.enter_your_account_email_if_an_eligible_account_}</p>
        <label className="field-label" htmlFor="account-forgot-email">{copy.account.email}</label>
        <input id="account-forgot-email" className="text-input" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><Mail size={15} /></span>
          <span className="primary-label">{busy ? (copy.account.sending) : (copy.account.send_recovery_link)}</span>
        </button>
        <button type="button" className="text-action" onClick={() => { setMode('login'); clearFeedback(); }}>{copy.account.back_to_sign_in}</button>
      </form>}

      {mode === 'reset' && resetToken && <form className="account-conversion-form" onSubmit={resetPassword}>
        <p className="panel-note">{copy.account.choose_a_new_password_with_at_least_12_character}</p>
        <label className="field-label" htmlFor="account-reset-password">{copy.account.new_password}</label>
        <input id="account-reset-password" className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button className="primary-button account-submit" type="submit" disabled={busy}>
          <span className="play-mark"><KeyRound size={15} /></span>
          <span className="primary-label">{busy ? (copy.account.resetting) : (copy.account.set_new_password)}</span>
        </button>
      </form>}
    </>}

    {(guest || signedOut) && mode !== 'reset' && <div className="account-google-entry">
      {guest && <p className="panel-note account-warning">{copy.account.google_sign_in_replaces_this_guest_session_guest}</p>}
      <button type="button" className="secondary-action account-google-button" disabled={googleBusy} onClick={signInWithGoogle}>
        <span className="google-mark" aria-hidden="true">G</span>
        {googleBusy ? (copy.account.connecting_to_google) : (copy.account.continue_with_google)}
      </button>
    </div>}

    {sessionState.emailVerification?.verified && authenticated && <p className="account-feedback" role="status">{copy.account.account_email_is_verified}</p>}
    {sessionState.accountDataError && !authenticated && <p className="account-feedback account-feedback--error" role="status">{copy.account.account_data_unavailable}</p>}
    {error && <p className="account-feedback account-feedback--error" role="alert">{error}</p>}
    {notice && <p className="account-feedback" role="status">{notice}</p>}
  </section>;
}
