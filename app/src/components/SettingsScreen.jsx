import { useLayoutEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Bell, Check, ChevronRight, CircleHelp, Clock3, Globe2,
  Headphones, Info, Languages, RotateCcw, ShieldCheck, Sparkles, Volume2,
} from 'lucide-react';
import packageJson from '../../package.json';
import { SETTINGS_COPY } from './settingsCopy.js';
import './settings.css';

function Toggle({ checked, label, onChange, disabled = false }) {
  return <button
    type="button"
    className={`settings-toggle${checked ? ' is-on' : ''}`}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
  ><i /></button>;
}

function SettingRow({ icon: Icon, title, description, action }) {
  return <div className="settings-row">
    <span className="settings-row-icon"><Icon size={18} /></span>
    <span className="settings-row-copy"><strong>{title}</strong><small>{description}</small></span>
    {action}
  </div>;
}

function SectionCard({ title, description, children, className = '' }) {
  return <section className={`settings-section-card ${className}`}>
    <header><h2>{title}</h2>{description && <p>{description}</p>}</header>
    <div className="settings-section-content">{children}</div>
  </section>;
}

export function SettingsScreen({
  language, localeName, reducedMotion, saved, onBack, onLanguage,
  onToggleReducedMotion, onReset, supportEmail, privacyPolicyUrl, termsUrl,
  onRegisterSystemBack,
}) {
  const copy = SETTINGS_COPY[language] ?? SETTINGS_COPY.en;
  const [page, setPage] = useState('main');
  const [showReset, setShowReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const supportDetails = useMemo(() => [
    'NEXIRA support request',
    `App version: ${packageJson.version}`,
    `Language: ${language}`,
    'Platform: Android / Web',
  ].join('\n'), [language]);

  const goBack = () => page === 'main' ? onBack() : setPage('main');

  useLayoutEffect(() => {
    const handleSystemBack = page === 'main' ? null : () => setPage('main');
    onRegisterSystemBack?.(handleSystemBack);
    return () => onRegisterSystemBack?.(null);
  }, [page, onRegisterSystemBack]);
  const pageTitle = page === 'faq' ? copy.faq : page === 'contact' ? copy.contact : page === 'about' ? copy.about : copy.title;

  return <main className="screen screen-frame info-screen settings-hub screen-enter">
    <button className="back-link" onClick={goBack}><ArrowLeft size={15} /> {page === 'main' ? copy.home : copy.back}</button>
    <div className="section-heading">
      <span className="eyebrow"><span className="live-dot" /> {page === 'main' ? copy.eyebrow : copy.title}</span>
      <h1>{pageTitle} {page === 'main' && <span>{copy.accent}</span>}</h1>
      {page === 'main' && <p>{copy.description}</p>}
    </div>

    {page === 'main' && <>
      <SectionCard title={copy.display} description={copy.displayDescription}>
        <SettingRow icon={Globe2} title={copy.language} description={`${copy.languageDescription} · ${localeName}`}
          action={<button className="settings-row-action" onClick={onLanguage}>{localeName}<ChevronRight size={16} /></button>} />
        <SettingRow icon={Sparkles} title={copy.reducedMotion} description={copy.reducedMotionDescription}
          action={<Toggle checked={reducedMotion} label={copy.reducedMotion} onChange={onToggleReducedMotion} />} />
      </SectionCard>

      <SectionCard title={copy.audio} description={copy.audioDescription}>
        <SettingRow icon={Volume2} title={copy.music} description={copy.audioComingSoon}
          action={<span className="settings-status">{copy.comingSoon}</span>} />
        <SettingRow icon={Volume2} title={copy.soundEffects} description={copy.audioComingSoon}
          action={<span className="settings-status">{copy.comingSoon}</span>} />
      </SectionCard>

      <SectionCard title={copy.notifications} description={copy.notificationsDescription}>
        <SettingRow icon={Bell} title={copy.notifications} description={copy.notificationsComingSoon}
          action={<span className="settings-status">{copy.comingSoon}</span>} />
      </SectionCard>

      <SectionCard title={copy.help} description={copy.helpDescription}>
        <button className="settings-link-row" onClick={() => setPage('faq')}>
          <span className="settings-row-icon"><CircleHelp size={18} /></span><span><strong>{copy.faq}</strong><small>{copy.faqDescription}</small></span><ChevronRight size={17} />
        </button>
        <button className="settings-link-row" onClick={() => setPage('contact')}>
          <span className="settings-row-icon"><Headphones size={18} /></span><span><strong>{copy.contact}</strong><small>{copy.contactDescription}</small></span><ChevronRight size={17} />
        </button>
      </SectionCard>

      <SectionCard title={copy.about} description={copy.aboutDescription}>
        <button className="settings-link-row" onClick={() => setPage('about')}>
          <span className="settings-row-icon"><Info size={18} /></span><span><strong>{copy.about}</strong><small>{copy.appVersion}: {packageJson.version}</small></span><ChevronRight size={17} />
        </button>
      </SectionCard>

      <SectionCard title={copy.reset} description={copy.resetDescription}>
        {!showReset ? <button className="settings-reset-button" onClick={() => setShowReset(true)}><RotateCcw size={16} />{copy.reset}</button> : <div className="settings-reset-confirm" role="group" aria-label={copy.resetConfirmTitle}>
          <strong>{copy.resetConfirmTitle}</strong><p>{copy.resetConfirmDescription}</p>
          <div><button onClick={() => setShowReset(false)}>{copy.cancel}</button><button className="is-danger" onClick={() => { onReset(); setShowReset(false); }}>{copy.confirmReset}</button></div>
        </div>}
      </SectionCard>
      <p className="settings-save-note" role="status"><Check size={14} /> {saved ? copy.saved : copy.saveFailed}</p>
    </>}

    {page === 'faq' && <SectionCard title={copy.faq} description={copy.faqDescription} className="settings-detail-card">
      <div className="settings-faq-list">
        {copy.faqItems.map(([question, answer]) => <details key={question} className="settings-faq-item">
          <summary>{question}<ChevronRight size={16} /></summary><p>{answer}</p>
        </details>)}
      </div>
    </SectionCard>}

    {page === 'contact' && <SectionCard title={copy.contact} description={copy.contactDescription} className="settings-detail-card">
      {supportEmail ? <>
        <p className="settings-detail-text">{copy.contactDescription}</p>
        <a className="settings-primary-link" href={`mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent('NEXIRA support request')}`}>{supportEmail}</a>
        <button className="settings-secondary-button" onClick={async () => {
          try { await navigator.clipboard.writeText(supportDetails); setCopied(true); } catch { setCopied(false); }
        }}>{copied ? <Check size={15} /> : <ShieldCheck size={15} />}{copied ? copy.copied : copy.copyDetails}</button>
      </> : <p className="settings-detail-text">{copy.contactUnavailable}</p>}
    </SectionCard>}

    {page === 'about' && <SectionCard title="NEXIRA" description={copy.aboutDescription} className="settings-detail-card">
      <div className="settings-about-meta"><span>{copy.appVersion}</span><strong>{packageJson.version}</strong></div>
      <div className="settings-about-meta"><span>{copy.platform}</span><strong>Android · Web</strong></div>
      <div className="settings-policy-links">
        {privacyPolicyUrl ? <a href={privacyPolicyUrl} target="_blank" rel="noreferrer">{copy.privacy}<ChevronRight size={15} /></a> : <p>{copy.privacy}: {copy.policyUnavailable}</p>}
        {termsUrl ? <a href={termsUrl} target="_blank" rel="noreferrer">{copy.terms}<ChevronRight size={15} /></a> : <p>{copy.terms}: {copy.policyUnavailable}</p>}
      </div>
    </SectionCard>}
  </main>;
}
