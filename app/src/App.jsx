import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, Brain, Check, Cpu,
  ChevronRight, Clock3, Flame, Globe2, Home, Languages, Medal, Play,
  RotateCcw, Scan, Settings, ShoppingCart, Sigma, Sparkles, Target, Timer,
  Trophy, UserRound, Zap, Atom,
} from 'lucide-react';
import {
  CATEGORIES, MODE_TIMES, completeLanguageSelection, hasCompletedLanguageSelection, loadProfile, saveProfile,
} from './game/data.js';
import { awardRun, categoryById, isValidAnswer, remainingTime, xpForNextLevel } from './game/scoring.js';
import { advanceChallenge, createChallenge, isPlayableChallenge, recordAnswer } from './game/session.js';
import { createLocalMatchAdapter } from './game/localMatchAdapter.js';
import { createOnlineMatchAdapter } from './game/onlineMatchAdapter.js';
import { createMatchApi } from './api/matchApi.js';
import { createMatchmakingApi } from './api/matchmakingApi.js';
import { createOnlineMatchmakingAdapter } from './game/onlineMatchmakingAdapter.js';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { formatCopy, getCopy, getQuestionCopy } from './i18n.js';
import { getHardwareBackDestination } from './navigation.js';
import { appSessionLifecycle } from './api/sessionLifecycle.js';
import { AccountSessionPanel } from './components/AccountSessionPanel.jsx';

const CATEGORY_ICONS = {
  brain: Brain,
  scan: Scan,
  sigma: Sigma,
  globe: Globe2,
  bolt: Zap,
  target: Target,
  languages: Languages,
  atom: Atom,
};

function makeRunId() {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Brand() {
  return <div className="brand" aria-label="NEXIRA">
    <span className="brand-glyph"><span /><span /><span /></span>
    <span className="brand-name">NEX<span>IRA</span></span>
  </div>;
}

function ProgressBar({ profile, label }) {
  const threshold = xpForNextLevel(profile.level);
  return <div className="rank-progress-block">
    <div className="rank-progress-heading">
      <span><Sparkles size={12} /> {label} <b>{profile.level}</b></span>
      <span>{profile.xp}<i> / {threshold} XP</i></span>
    </div>
    <span className="rank-track"><span style={{ width: `${Math.min(100, profile.xp / threshold * 100)}%` }} /></span>
  </div>;
}

function ScreenHeading({ eyebrow, title, accent, description }) {
  return <div className="section-heading">
    <span className="eyebrow"><span className="live-dot" /> {eyebrow}</span>
    <h1>{title} <span>{accent}</span></h1>
    {description && <p>{description}</p>}
  </div>;
}

function ScreenFrame({ children, className = '' }) {
  return <main className={`screen screen-frame ${className} screen-enter`}>{children}</main>;
}

function GlassPanel({ children, className = '', variant = 'info', ...attributes }) {
  const panelClass = variant === 'info' ? 'info-panel glass-panel' : 'design-panel glass-panel';
  return <section {...attributes} className={`${panelClass} ${className}`}>{children}</section>;
}

function StatCard({ icon: Icon, label, value, tone = 'cyan' }) {
  return <div className={`stat-card stat-card--${tone}`}>
    <span className="stat-card-icon"><Icon size={16} /></span>
    <strong>{value}</strong><small>{label}</small>
  </div>;
}

export default function App() {
  const [profile, setProfile] = useState(() => loadProfile());
  const [isInitialLanguageSelection, setIsInitialLanguageSelection] = useState(() => !hasCompletedLanguageSelection());
  const [screen, setScreen] = useState('splash');
  const [entryMatchMode, setEntryMatchMode] = useState(null);
  const [profileView, setProfileView] = useState('progress');
  const [resultsView, setResultsView] = useState('summary');
  const screenRef = useRef(screen);
  const [run, setRun] = useState(null);
  const [matchView, setMatchView] = useState(null);
  const [matchmakingView, setMatchmakingView] = useState(null);
  const [matchRemaining, setMatchRemaining] = useState(10);
  const [matchError, setMatchError] = useState('');
  const [matchBusy, setMatchBusy] = useState(false);
  const [onlineAnswerText, setOnlineAnswerText] = useState('');
  const [remaining, setRemaining] = useState(10);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => !document.hidden);
  const [storageFailed, setStorageFailed] = useState(false);
  const [sessionState, setSessionState] = useState(() => appSessionLifecycle.getState());
  const [splashExiting, setSplashExiting] = useState(false);
  const profileRef = useRef(profile);
  const runRef = useRef(run);
  const timerStartedAt = useRef(Date.now());
  const timerRemainingRef = useRef(10);
  const timerQuestionIndexRef = useRef(null);
  const matchAdapterRef = useRef(null);
  const onlineMatchAdapterRef = useRef(null);
  const onlineMatchmakingAdapterRef = useRef(null);
  const matchmakingTransitionRef = useRef(null);
  const matchTimerRemainingRef = useRef(10);
  const matchTimerKeyRef = useRef(null);
  if (!matchAdapterRef.current) matchAdapterRef.current = createLocalMatchAdapter();

  const language = profile.settings.language;
  const text = getCopy(language);
  const playerName = profile.playerName === 'OPERATOR' ? text.operatorDefault : profile.playerName;
  const prefersReducedMotion = profile.settings.reducedMotion;
  const threshold = xpForNextLevel(profile.level);
  const accuracy = profile.totalAnswers ? Math.round(profile.correctAnswers / profile.totalAnswers * 100) : 0;
  const playableRun = isPlayableChallenge(run);
  const question = playableRun
    ? getQuestionCopy(language, run.categoryId, run.questionIndex, run.questions[run.questionIndex])
    : null;
  const activeMode = run ? text.modeNames[run.categoryId]?.[run.modeIndex] ?? run.mode : '';

  useLayoutEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    const unsubscribe = appSessionLifecycle.subscribe(setSessionState);
    void appSessionLifecycle.initialize();
    return unsubscribe;
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.title = text.pageTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', text.pageDescription);
  }, [language]);

  useEffect(() => {
    if (screen !== 'splash') return undefined;
    const fadeTimer = window.setTimeout(() => setSplashExiting(true), prefersReducedMotion ? 0 : 1250);
    const finishTimer = window.setTimeout(() => {
      setScreen(hasCompletedLanguageSelection() ? 'home' : 'language');
    }, prefersReducedMotion ? 80 : 1750);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
    };
  }, [prefersReducedMotion, screen]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return undefined;
    let listener;
    let cancelled = false;
    CapacitorApp.addListener('backButton', () => {
      const currentScreen = screenRef.current;
      if (currentScreen === 'language' && !hasCompletedLanguageSelection()) return;
      if (currentScreen === 'match-game') {
        setShowExitConfirm(true);
        return;
      }
      if (currentScreen === 'match-results') {
        matchAdapterRef.current.reset();
        onlineMatchAdapterRef.current?.reset();
        setMatchView(null);
        setScreen('modes');
        return;
      }
      if (currentScreen === 'home') {
        void CapacitorApp.exitApp().catch((error) => console.error('Unable to exit the app.', error));
        return;
      }
      runRef.current = null;
      setRun(null);
      setScreen(getHardwareBackDestination(currentScreen));
    }).then((registeredListener) => {
      if (cancelled) {
        void registeredListener.remove();
      } else {
        listener = registeredListener;
      }
    }).catch((error) => console.error('Unable to register Android Back handler.', error));
    return () => {
      cancelled = true;
      if (listener) void listener.remove();
    };
  }, []);

  const updateProfile = useCallback((update) => {
    const next = typeof update === 'function' ? update(profileRef.current) : update;
    profileRef.current = next;
    setProfile(next);
    setStorageFailed(!saveProfile(next));
  }, []);

  const navigate = useCallback((destination) => setScreen(destination), []);

  const beginChallenge = useCallback((category, mode, modeIndex) => {
    matchAdapterRef.current.reset();
    setMatchView(null);
    setMatchError('');
    if (!category || !Array.isArray(category.modes)
        || !Number.isInteger(modeIndex)
        || category.modes[modeIndex] !== mode
        || !Array.isArray(category.questions)
        || category.questions.length === 0) {
      runRef.current = null;
      setRun(null);
      setScreen('game');
      return;
    }
    const next = createChallenge(category, mode, modeIndex, makeRunId());
    if (!isPlayableChallenge(next)) {
      runRef.current = null;
      setRun(null);
      setScreen('game');
      return;
    }
    runRef.current = next;
    setRun(next);
    setRemaining(next.timeLimit);
    timerRemainingRef.current = next.timeLimit;
    timerQuestionIndexRef.current = 0;
    timerStartedAt.current = Date.now();
    setScreen('game');
  }, []);

  const openMatchedOnlineMatch = useCallback(async (queueState) => {
    const matchId = queueState?.matchId;
    if (!matchId || matchmakingTransitionRef.current === matchId) return;
    matchmakingTransitionRef.current = matchId;
    setMatchBusy(true);
    try {
      const adapter = createOnlineMatchAdapter(createMatchApi(appSessionLifecycle.getHttpClient()));
      onlineMatchAdapterRef.current = adapter;
      const next = await adapter.resume(matchId, { mode: '1v1', language: queueState.language ?? profileRef.current.settings.language });
      onlineMatchmakingAdapterRef.current?.reset();
      onlineMatchmakingAdapterRef.current = null;
      setMatchmakingView(null);
      setMatchView(next);
      setOnlineAnswerText('');
      setMatchError('');
      setShowExitConfirm(false);
      setScreen(next.phase === 'complete' ? 'match-results' : 'match-game');
    } catch (error) {
      matchmakingTransitionRef.current = null;
      setMatchError(error instanceof Error ? error.message : 'Unable to restore the matched game.');
    } finally {
      setMatchBusy(false);
    }
  }, []);

  const beginMatch = useCallback(async (category, mode) => {
    setMatchBusy(true);
    setMatchError('');
    onlineMatchAdapterRef.current?.reset();
    onlineMatchAdapterRef.current = null;
    try {
      if (import.meta.env.PROD) {
        if (mode === '1v1') {
          const adapter = createOnlineMatchmakingAdapter(
            createMatchmakingApi(appSessionLifecycle.getHttpClient()),
          );
          onlineMatchmakingAdapterRef.current = adapter;
          matchmakingTransitionRef.current = null;
          const queue = await adapter.start({
            category: category?.id ?? 'general',
            language: profileRef.current.settings.language,
          });
          setMatchmakingView({ ...queue, categoryTitle: categoryById(queue.category)?.title ?? category?.title ?? category?.id ?? 'General' });
          setMatchError('');
          setScreen('matchmaking');
          return;
        }
        if (mode !== '1vAI') throw new Error('Unsupported online match mode.');
        const adapter = createOnlineMatchAdapter(
          createMatchApi(appSessionLifecycle.getHttpClient()),
        );
        onlineMatchAdapterRef.current = adapter;
        const next = await adapter.start({
          category: category?.id ?? 'general',
          language: profileRef.current.settings.language,
        });
        setMatchView(next);
        setOnlineAnswerText('');
        setMatchError('');
        setShowExitConfirm(false);
        setScreen('match-game');
        return;
      }

      const next = matchAdapterRef.current.start({
        category, mode, matchId: makeRunId(), language: profileRef.current.settings.language,
      });
      setMatchView(next);
      setMatchError('');
      matchTimerKeyRef.current = `${next.matchId}:${next.roundIndex}:${next.activeParticipantId}`;
      matchTimerRemainingRef.current = next.timeLimit;
      setMatchRemaining(next.timeLimit);
      setShowExitConfirm(false);
      setScreen('match-game');
    } catch (error) {
      setMatchView(onlineMatchAdapterRef.current?.getView() ?? null);
      setMatchError(error instanceof Error ? error.message : 'Unable to start the match.');
      setScreen(mode === '1v1' && import.meta.env.PROD ? 'categories' : 'match-game');
    } finally {
      setMatchBusy(false);
    }
  }, [openMatchedOnlineMatch]);

  const cancelMatchmaking = useCallback(async () => {
    const adapter = onlineMatchmakingAdapterRef.current;
    if (!adapter || matchBusy) return;
    setMatchBusy(true);
    setMatchError('');
    try {
      const next = await adapter.cancel();
      setMatchmakingView(next);
      if (next.status === 'MATCHED' && next.matchId) {
        await openMatchedOnlineMatch(next);
      } else {
        adapter.reset();
        onlineMatchmakingAdapterRef.current = null;
        matchmakingTransitionRef.current = null;
        setMatchmakingView(null);
        setScreen('categories');
      }
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'Unable to cancel matchmaking.');
    } finally {
      setMatchBusy(false);
    }
  }, [matchBusy, openMatchedOnlineMatch]);
  const handleMatchOption = useCallback(async (optionId) => {
    try {
      if (onlineMatchAdapterRef.current) {
        setMatchBusy(true);
        const next = await onlineMatchAdapterRef.current.submitAnswer(optionId);
        setMatchView(next);
        if (next.phase === 'complete') setScreen('match-results');
        return;
      }
      const current = matchAdapterRef.current.getView();
      if (!current || current.phase !== 'question') return;
      const elapsedMs = Math.min(
        current.timeLimit * 1000,
        Math.max(0, (current.timeLimit - matchTimerRemainingRef.current) * 1000),
      );
      const next = matchAdapterRef.current.submitOption(optionId, elapsedMs);
      setMatchView(next);
      if (next.status === 'complete') setScreen('match-results');
    } catch (error) {
      setMatchView(onlineMatchAdapterRef.current?.getView() ?? matchAdapterRef.current.getView());
      setMatchError(error instanceof Error ? error.message : 'Unable to submit the match answer.');
    } finally {
      setMatchBusy(false);
    }
  }, []);

  const handleOnlineAnswer = useCallback(async () => {
    const adapter = onlineMatchAdapterRef.current;
    if (!adapter || matchBusy) return;
    setMatchBusy(true);
    setMatchError('');
    try {
      const next = await adapter.submitAnswer(onlineAnswerText);
      setMatchView(next);
      setOnlineAnswerText('');
      if (next.phase === 'complete') setScreen('match-results');
    } catch (error) {
      setMatchView(adapter.getView());
      setMatchError(error instanceof Error ? error.message : 'Unable to submit the answer.');
    } finally {
      setMatchBusy(false);
    }
  }, [matchBusy, onlineAnswerText]);

  const handleMatchTimeout = useCallback(async () => {
    try {
      if (onlineMatchAdapterRef.current) {
        const next = await onlineMatchAdapterRef.current.refresh();
        if (next) setMatchView(next);
        if (next?.phase === 'complete') setScreen('match-results');
        return;
      }
      const next = matchAdapterRef.current.submitNoResponse();
      setMatchView(next);
      if (next.status === 'complete') setScreen('match-results');
    } catch (error) {
      setMatchView(onlineMatchAdapterRef.current?.getView() ?? matchAdapterRef.current.getView());
      setMatchError(error instanceof Error ? error.message : 'Unable to synchronize the match timeout.');
    }
  }, []);

  const continueMatch = useCallback(async () => {
    try {
      const next = onlineMatchAdapterRef.current
        ? await onlineMatchAdapterRef.current.continue()
        : matchAdapterRef.current.continue();
      setMatchView(next);
      setMatchError('');
      if (next?.phase === 'complete') setScreen('match-results');
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'Unable to continue the match.');
    }
  }, []);

  const leaveMatch = useCallback((destination = 'modes') => {
    matchAdapterRef.current.reset();
    onlineMatchAdapterRef.current?.reset();
    onlineMatchAdapterRef.current = null;
    setMatchView(null);
    setMatchError('');
    setOnlineAnswerText('');
    setMatchBusy(false);
    setShowExitConfirm(false);
    setScreen(destination);
  }, []);

  const handleAnswer = useCallback((answerIndex, timedOut = false) => {
    const current = runRef.current;
    if (!current || current.status !== 'active' || current.lastAnswer) return;
    const question = current.questions[current.questionIndex];
    if (!question || !Array.isArray(question.options)) return;
    if (!timedOut && !isValidAnswer(question, answerIndex)) return;
    const elapsed = timedOut
      ? current.timeLimit
      : Math.min(current.timeLimit, Math.max(0, current.timeLimit - timerRemainingRef.current));
    const expired = timedOut || elapsed >= current.timeLimit;
    const next = recordAnswer(current, expired ? null : answerIndex, elapsed, expired);
    if (next === current) return;
    runRef.current = next;
    setRun(next);
    setRemaining(remainingTime(current.timeLimit, elapsed));
  }, []);

  const finishOrAdvance = useCallback(() => {
    const current = runRef.current;
    const next = advanceChallenge(current);
    if (next === current) return;
    runRef.current = next;
    setRun(next);
    if (next.status === 'complete') {
      updateProfile((saved) => awardRun(saved, next));
      setScreen('results');
    }
  }, [updateProfile]);

  useEffect(() => {
    const syncVisibility = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  useEffect(() => {
    if (screen !== 'game' || !run || run.status !== 'active' || run.lastAnswer || showExitConfirm || !isPageVisible) return undefined;
    if (timerQuestionIndexRef.current !== run.questionIndex) {
      timerQuestionIndexRef.current = run.questionIndex;
      timerRemainingRef.current = run.timeLimit;
    }
    const started = Date.now();
    const startingRemaining = timerRemainingRef.current;
    timerStartedAt.current = started;
    const interval = window.setInterval(() => {
      const timeLeft = remainingTime(startingRemaining, (Date.now() - started) / 1000);
      timerRemainingRef.current = timeLeft;
      setRemaining(timeLeft);
      if (timeLeft <= 0) {
        window.clearInterval(interval);
        handleAnswer(null, true);
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [handleAnswer, isPageVisible, run?.lastAnswer, run?.questionIndex, run?.runId, run?.status, run?.timeLimit, screen, showExitConfirm]);

  useEffect(() => {
    if (screen !== 'game' && screen !== 'match-game') return undefined;
    window.history.pushState({ nexiraGame: true }, '', window.location.href);
    const handleHardwareBack = () => {
      setShowExitConfirm(true);
      window.history.pushState({ nexiraGame: true }, '', window.location.href);
    };
    window.addEventListener('popstate', handleHardwareBack);
    return () => window.removeEventListener('popstate', handleHardwareBack);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'match-game' || matchView?.phase !== 'question'
        || showExitConfirm || !isPageVisible) return undefined;
    const timerKey = `${matchView.matchId}:${matchView.roundId ?? matchView.roundIndex}:${matchView.activeParticipantId ?? ''}`;
    if (matchTimerKeyRef.current !== timerKey) {
      matchTimerKeyRef.current = timerKey;
      matchTimerRemainingRef.current = matchView.timeLimit;
    }
    const started = Date.now();
    const startingRemaining = matchTimerRemainingRef.current;
    const interval = window.setInterval(() => {
      const timeLeft = matchView.deadlineAt
        ? Math.max(0, (Date.parse(matchView.deadlineAt) - Date.now()) / 1000)
        : remainingTime(startingRemaining, (Date.now() - started) / 1000);
      matchTimerRemainingRef.current = timeLeft;
      setMatchRemaining(timeLeft);
      if (timeLeft <= 0) {
        window.clearInterval(interval);
        void handleMatchTimeout();
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [handleMatchTimeout, isPageVisible, matchView?.activeParticipantId, matchView?.deadlineAt, matchView?.matchId, matchView?.phase, matchView?.roundId, matchView?.roundIndex, matchView?.timeLimit, screen, showExitConfirm]);

  useEffect(() => {
    const adapter = onlineMatchAdapterRef.current;
    if (screen !== 'match-game' || !adapter || !matchView
        || !['waiting-question', 'waiting-result', 'submitting', 'submission-error'].includes(matchView.phase)) {
      return undefined;
    }
    let active = true;
    let inFlight = false;
    const synchronize = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await adapter.refresh();
        if (active && next) {
          setMatchView(next);
          if (next.phase === 'complete') setScreen('match-results');
        }
      } catch (error) {
        if (active) {
          setMatchView(adapter.getView());
          setMatchError(error instanceof Error ? error.message : 'Unable to synchronize the online match.');
        }
      } finally {
        inFlight = false;
      }
    };
    void synchronize();
    const interval = window.setInterval(synchronize, 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [screen, matchView?.matchId, matchView?.phase]);

  useEffect(() => {
    const adapter = onlineMatchmakingAdapterRef.current;
    if (screen !== 'matchmaking' || !adapter) return undefined;
    let active = true;
    let inFlight = false;
    const synchronize = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await adapter.refresh();
        if (active && next) {
          setMatchmakingView((previous) => ({ ...next, categoryTitle: categoryById(next.category)?.title ?? previous?.categoryTitle ?? 'General' }));
          if (next.status === 'MATCHED' && next.matchId) {
            await openMatchedOnlineMatch(next);
          } else if (['CANCELLED', 'EXPIRED', 'NOT_QUEUED'].includes(next.status)) {
            adapter.reset();
            onlineMatchmakingAdapterRef.current = null;
            setMatchError(language === 'fa' ? 'جست‌وجوی مسابقه پایان یافته است؛ دوباره تلاش کن.' : 'The matchmaking search has ended. Start a new search.');
            setScreen('categories');
          }
        }
      } catch (error) {
        if (active) setMatchError(error instanceof Error ? error.message : 'Unable to synchronize matchmaking.');
      } finally {
        inFlight = false;
      }
    };
    void synchronize();
    const interval = window.setInterval(synchronize, 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [language, openMatchedOnlineMatch, screen]);
  useEffect(() => {
    if (screen !== 'game' || !run?.lastAnswer || run.status !== 'active') return undefined;
    const advanceTimer = window.setTimeout(() => {
      finishOrAdvance();
    }, 650);
    return () => window.clearTimeout(advanceTimer);
  }, [finishOrAdvance, run?.lastAnswer, run?.questionIndex, run?.status, screen]);

  const category = run ? categoryById(run.categoryId) : null;
  const currentAnswer = run?.lastAnswer;

  return <div
    className={`app-shell${prefersReducedMotion ? ' reduced-motion' : ''}`}
    data-screen={screen}
    data-session-state={sessionState.status}
    dir={language === 'fa' ? 'rtl' : 'ltr'}
    style={{ '--page-background-image': `var(--background-${screen}, var(--nexira-background-image))` }}
  >
    <div className="ambient ambient--one" />
    <div className="ambient ambient--two" />
    {screen !== 'game' && screen !== 'match-game' && screen !== 'home' && <header className="topbar">
      <button className="brand-button" onClick={() => navigate('home')} aria-label={text.navHome}><Brand /></button>
      <button className="top-profile" onClick={() => navigate('profile')} aria-label={text.profile}>
        <span className="top-profile-avatar"><UserRound size={17} /></span>
        <span className="top-profile-copy"><span>{text.levelAbbr} {profile.level}</span><i className="mini-xp"><i style={{ width: `${Math.min(100, profile.xp / threshold * 100)}%` }} /></i></span>
      </button>
    </header>}

    {screen === 'splash' && <div className={`nexira-splash${splashExiting ? ' nexira-splash--exiting' : ''}`} role="status" aria-label="NEXIRA">
      <div className="splash-orbit splash-orbit--outer" />
      <div className="splash-orbit splash-orbit--inner" />
      <div className="splash-content">
        <Brand />
        <p>{text.splashTagline}</p>
        <span className="splash-loader" aria-hidden="true"><i /><i /><i /></span>
      </div>
    </div>}

    {screen === 'home' && <ScreenFrame className="home-screen home-reference-screen">
      <header className="reference-header">
        <button className="reference-brand-button" onClick={() => navigate('home')} aria-label="NEXIRA Home">
          <Brand />
          <span className="reference-tagline">PLAY · COMPETE · WIN</span>
        </button>
        <div className="reference-header-actions">
          <button className="reference-icon-button" onClick={() => navigate('settings')} aria-label={text.settings}><Settings size={22} /></button>
          <button className="reference-icon-button" onClick={() => navigate('profile')} aria-label={text.profile}><UserRound size={22} /></button>
        </div>
      </header>

      <section className="reference-player-panel" aria-label={text.profile}>
        <button className="reference-avatar" onClick={() => navigate('profile')} aria-label={text.profile}><UserRound size={34} /></button>
        <div className="reference-player-info">
          <strong>{playerName}</strong>
          <span className="reference-level">{text.level} {profile.level}</span>
          <div className="reference-xp-row">
            <span className="reference-xp-track"><i style={{ width: `${Math.min(100, profile.xp / threshold * 100)}%` }} /></span>
            <small>{profile.xp.toLocaleString(language === 'fa' ? 'fa-IR' : 'en-US')} / {threshold.toLocaleString(language === 'fa' ? 'fa-IR' : 'en-US')} XP</small>
          </div>
        </div>
        <button className="reference-settings-button" onClick={() => navigate('settings')} aria-label={text.settings}><Settings size={25} /></button>
      </section>

      <section className="reference-mode-grid" aria-label={language === 'fa' ? 'حالت مسابقه' : 'Match modes'}>
        <button className="reference-mode-card reference-mode-card--duel" onClick={() => { setEntryMatchMode('1v1'); navigate('categories'); }}>
          <span className="reference-mode-art reference-mode-art--duel"><UserRound size={54} /><UserRound size={36} /></span>
          <strong>1vs1</strong>
          <span>{language === 'fa' ? 'با بازیکنان دیگر رقابت کن' : 'Challenge a player from around the world!'}</span>
          <i aria-hidden="true">»»»</i>
        </button>
        <button className="reference-mode-card reference-mode-card--ai" onClick={() => { setEntryMatchMode('1vAI'); navigate('categories'); }}>
          <span className="reference-ai-art" aria-hidden="true"><span className="reference-ai-face"><i /><i /></span><Cpu size={24} /></span>
          <strong>1vsAI</strong>
          <span>{language === 'fa' ? 'مهارتت را مقابل هوش مصنوعی بسنج' : 'Test your skills against AI!'}</span>
          <i aria-hidden="true">»»»</i>
        </button>
      </section>

      <button className="reference-quick-battle" onClick={() => { setEntryMatchMode('1v1'); navigate('categories'); }}>
        <Zap size={34} fill="currentColor" />
        <span><strong>Quick Battle</strong><small>{import.meta.env.PROD
            ? (language === 'fa' ? 'موضوع را انتخاب کن و وارد صف رقابت جهانی شو' : 'Choose a category and enter the global matchmaking queue')
            : (language === 'fa' ? 'برای شروع، موضوع مسابقه را انتخاب کن' : 'Choose a category to start a local preview')}</small></span>
        <Clock3 size={30} />
      </button>

      <section className="reference-lower-grid">
        <div className="reference-stats-panel">
          <div className="reference-stats-heading"><Activity size={28} /><strong>{language === 'fa' ? 'آمار شما' : 'Your Stats'}</strong></div>
          <div className="reference-stats">
            <div><Trophy size={20} /><strong>{profile.battles.toLocaleString(language === 'fa' ? 'fa-IR' : 'en-US')}</strong><small>{language === 'fa' ? 'مسابقات' : 'Matches'}</small></div>
            <div><Flame size={20} /><strong>{profile.bestScore.toLocaleString(language === 'fa' ? 'fa-IR' : 'en-US')}</strong><small>{language === 'fa' ? 'بهترین امتیاز' : 'Best Score'}</small></div>
            <div><Target size={20} /><strong>{accuracy}%</strong><small>{language === 'fa' ? 'دقت پاسخ' : 'Accuracy'}</small></div>
          </div>
        </div>
        <button className="reference-store-card" onClick={() => navigate('store')}>
          <ShoppingCart size={42} />
          <strong>{language === 'fa' ? 'فروشگاه' : 'Store'}</strong>
        </button>
      </section>
    </ScreenFrame>}

    {screen === 'categories' && <ScreenFrame className="categories-screen">
      <button className="back-link" onClick={() => navigate('home')}><ArrowLeft size={15} /> {text.back}</button>
      <ScreenHeading eyebrow={text.categoryEyebrow} title={text.categoryTitle} accent={text.categoryAccent} description={text.categoryDescription} />
      <GlassPanel variant="feature" className="category-selection-panel">
        <div className="category-grid">
        {CATEGORIES.map((item, index) => {
          const Icon = CATEGORY_ICONS[item.icon] ?? Activity;
          const savedStats = profile.categoryStats[item.id];
          return <button key={item.id} className={`category-tile tone-${item.tone}`} onClick={() => {
            if (entryMatchMode) {
              const selectedMode = entryMatchMode;
              setEntryMatchMode(null);
              setRun({ categoryId: item.id });
              beginMatch(item, selectedMode);
              return;
            }
            runRef.current = null;
            setRun({ categoryId: item.id });
            setScreen('modes');
          }}>
            <span className="tile-top"><span className="tile-icon"><Icon size={20} /></span><span className="tile-index">0{index + 1}</span></span>
            <strong>{item.title}</strong><span className="tile-subtitle">{text.categorySubtitles[item.id] ?? item.subtitle}</span>
            <span className="tile-arrow"><ChevronRight size={16} /></span>
            {savedStats && <span className="tile-progress">{savedStats.battles} {text.battles.toLowerCase()} · {text.bestShort} {savedStats.bestScore}</span>}
          </button>;
        })}
        </div>
        {matchError && <p className="empty-state" role="alert">{matchError}</p>}
        <p className="category-foot"><Sparkles size={13} /> {text.categoryFoot} <span>·</span> {text.localArena}</p>
      </GlassPanel>
    </ScreenFrame>}

    {screen === 'modes' && (() => {
      const selectedCategory = categoryById(run?.categoryId);
      if (!selectedCategory) return <ScreenFrame className="categories-screen"><GlassPanel><p className="empty-state">{text.challengeUnavailable}</p><button className="secondary-action" onClick={() => navigate('categories')}>{text.back}</button></GlassPanel></ScreenFrame>;
      const Icon = CATEGORY_ICONS[selectedCategory.icon] ?? Activity;
      return <ScreenFrame className="categories-screen">
        <button className="back-link" onClick={() => navigate('categories')}><ArrowLeft size={15} /> {text.back}</button>
        <ScreenHeading eyebrow={`${selectedCategory.title.toUpperCase()} · ${text.modeEyebrow}`} title={text.modeTitle} accent={text.modeAccent} description={text.modeDescription} />
        <GlassPanel variant="feature" className="mode-selection-panel">
          <div className={`mode-category-card tone-${selectedCategory.tone}`}>
            <span className={`tile-icon tone-${selectedCategory.tone}`}><Icon size={22} /></span><span><strong>{selectedCategory.title}</strong><small>{text.categorySubtitles[selectedCategory.id] ?? selectedCategory.subtitle}</small></span>
            <span className="mode-question-count">{selectedCategory.questions.length}<small>{text.rounds}</small></span>
          </div>
          <div className="mode-list">
            {selectedCategory.modes.map((mode, index) => <button className="mode-option" key={mode} onClick={() => beginChallenge(selectedCategory, mode, index)}>
              <span className="mode-number">0{index + 1}</span><span className="mode-label">{text.modeNames[selectedCategory.id]?.[index] ?? mode}<small><Timer size={12} /> {MODE_TIMES[index]} {text.seconds}</small></span>
              <span className={`difficulty-badge difficulty-${index}`}>{text.difficulty[index]}</span>
              <span className="mode-arrow"><ChevronRight size={16} /></span>
            </button>)}
          </div>
          <div className="mode-list">
            <p className="eyebrow">{import.meta.env.PROD
              ? (language === 'fa' ? 'مسابقه رقابتی آنلاین' : 'ONLINE COMPETITIVE MATCH')
              : (language === 'fa' ? 'مسابقه رقابتی · پیش‌نمایش محلی' : 'COMPETITIVE MATCH · LOCAL PREVIEW')}</p>
            <button className="mode-option" onClick={() => beginMatch(selectedCategory, '1v1')}>
              <span className="mode-number">P1</span>
              <span className="mode-label">{import.meta.env.PROD
                ? (language === 'fa' ? '۱ در برابر ۱ · رقابت آنلاین' : '1vs1 · Online matchmaking')
                : (language === 'fa' ? 'دو نفره (۱ در برابر ۱)' : '1vs1 · Two local players')}
                <small>{import.meta.env.PROD
                  ? (language === 'fa' ? 'جست‌وجوی حریف با موضوع و زبان یکسان' : 'Find a compatible player worldwide')
                  : (language === 'fa' ? 'نوبتی روی همین دستگاه' : 'Pass-and-play on this device')}</small></span>
              <span className="difficulty-badge">{import.meta.env.PROD
                ? (language === 'fa' ? 'آنلاین' : 'ONLINE')
                : (language === 'fa' ? 'محلی' : 'LOCAL')}</span>
              <span className="mode-arrow"><ChevronRight size={16} /></span>
            </button>
            <button className="mode-option" onClick={() => beginMatch(selectedCategory, '1vAI')}>
              <span className="mode-number">AI</span>
              <span className="mode-label">{import.meta.env.PROD
                ? (language === 'fa' ? '۱ در برابر AI · آنلاین' : '1vsAI · Online AI match')
                : (language === 'fa' ? '۱ در برابر AI · پیش‌نمایش' : '1vsAI · Scripted preview')}
                <small>{import.meta.env.PROD
                  ? (language === 'fa' ? 'حریف و داوری از طریق سرور' : 'Server-based AI opponent and judging')
                  : (language === 'fa' ? 'حریف اسکریپت‌شده؛ نه AI واقعی' : 'Scripted opponent; not real AI')}</small></span>
              <span className="difficulty-badge">{import.meta.env.PROD
                ? (language === 'fa' ? 'آنلاین' : 'ONLINE')
                : (language === 'fa' ? 'آفلاین' : 'OFFLINE')}</span>
              <span className="mode-arrow"><ChevronRight size={16} /></span>
            </button>
            {matchError && <p className="empty-state" role="alert">{matchError}</p>}
          </div>
        </GlassPanel>
      </ScreenFrame>;
    })()}

    {screen === 'matchmaking' && <ScreenFrame className="categories-screen matchmaking-screen">
      <ScreenHeading eyebrow={language === 'fa' ? 'مسابقه آنلاین' : 'ONLINE COMPETITIVE MATCH'} title={language === 'fa' ? 'در حال یافتن حریف' : 'Finding your opponent'} accent="1vs1" description={language === 'fa' ? 'در حال جست‌وجوی بازیکنی با موضوع و زبان یکسان هستیم.' : 'Searching for a player with the same category and language.'} />
      <GlassPanel variant="feature" className="matchmaking-panel">
        <div className="matchmaking-search-state" role="status" aria-live="polite">
          <span className="live-dot" />
          <strong>{language === 'fa' ? 'جست‌وجو ادامه دارد…' : 'Search is active…'}</strong>
          <small>{matchmakingView?.categoryTitle ?? (language === 'fa' ? 'موضوع انتخاب‌شده' : 'Selected category')} · {language === 'fa' ? 'زبان' : 'Language'}: {(matchmakingView?.language ?? language) === 'fa' ? 'فارسی' : 'English'}</small>
          <p>{language === 'fa' ? 'اگر اتصال قطع شود، وضعیت صف و مسابقه از سرور بازیابی می‌شود.' : 'If your connection drops, queue and match state can be recovered from the server.'}</p>
        </div>
        {matchError && <p className="empty-state" role="alert">{matchError}</p>}
        <button className="secondary-action" disabled={matchBusy} onClick={() => { void cancelMatchmaking(); }}>
          {language === 'fa' ? 'لغو جست‌وجو' : 'Cancel search'}
        </button>
      </GlassPanel>
    </ScreenFrame>}
    {screen === 'game' && <ScreenFrame className="challenge-screen">
      {!playableRun || !question ? <GlassPanel variant="feature" className="game-error-panel" role="alert">
        <span className="game-error-icon"><Activity size={21} /></span>
        <h1>{text.challengeUnavailable}</h1>
        <p>{text.invalidChallenge}</p>
        <button className="primary-button" onClick={() => {
          const selectedCategory = categoryById(run?.categoryId);
          const selection = selectedCategory ? { categoryId: selectedCategory.id } : null;
          runRef.current = null;
          setRun(selection);
          navigate(selection ? 'modes' : 'categories');
        }}>
          <span className="primary-label">{text.backToChallenges}</span><ArrowRight className="primary-arrow" size={17} />
        </button>
      </GlassPanel> : <>
      <div className="challenge-head">
        <button className="back-link" onClick={() => setShowExitConfirm(true)}><ArrowLeft size={15} /> {text.backToChallenges}</button>
        <p>{category?.title ?? run.categoryTitle} <span>·</span> {activeMode}</p>
      </div>
      <div className="gameplay-hud">
        <div className="arena-timer">
          <div className={`arena-timer-ring${remaining <= 5 ? ' arena-timer-ring--urgent' : ''}`} style={{ '--timer-progress': `${Math.max(0, Math.min(100, remaining / run.timeLimit * 100))}%` }} role="timer" aria-label={formatCopy(text.timerLabel, { label: text.timeRemaining, seconds: `${Math.ceil(remaining)} ${text.secondsUnit}` })}>
            <span><small>{text.timeRemaining}</small><strong>{Math.ceil(remaining)}<i>{text.secondsShort}</i></strong></span>
          </div>
        </div>
        <div className="combatant-pair">
          <GlassPanel variant="feature" className="combatant-card combatant-card--player">
            <span className="combatant-avatar"><UserRound size={18} /></span>
            <span className="combatant-copy"><small>{text.navProfile}</small><strong>{playerName}</strong><i>{text.level} {profile.level}</i></span>
            <span className="combatant-score"><small>{text.score}</small><strong>{run.score}</strong><i>{text.correctAnswers}: {run.correct} · {text.incorrect}: {run.answers.filter((answer) => !answer.correct).length}</i></span>
          </GlassPanel>
          <span className="combatant-divider" aria-hidden="true">{text.versus}</span>
          <GlassPanel variant="feature" className="combatant-card combatant-card--solo">
            <span className="combatant-avatar"><Activity size={18} /></span>
            <span className="combatant-copy"><small>{text.localSession}</small><strong>{text.soloTraining}</strong><i>{text.localOnly}</i></span>
          </GlassPanel>
        </div>
      </div>
      <GlassPanel variant="feature" className="question-panel">
        <div className="question-panel-top">
          <span><span className="live-dot" /> {text.round} <i>{String(run.questionIndex + 1).padStart(2, '0')} / {String(run.total).padStart(2, '0')}</i></span>
        </div>
        <div className="round-track" aria-label={formatCopy(text.answeredProgress, { answered: run.answers.length, total: run.total })}>
          {run.questions.map((_, index) => <i key={index} className={index < run.answers.length ? (run.answers[index].correct ? 'round-correct' : 'round-wrong') : ''} />)}
        </div>
        <div className="question-copy">
          <span className="question-kicker"><Sparkles size={13} /> {text.chooseAnswer} <i>·</i> {text.answerHelp}</span>
          <h2>{question.prompt}</h2><p>{activeMode.toUpperCase()}</p>
        </div>
        <div className="answer-list">
          {question.options.map((option, index) => {
            const selected = currentAnswer?.answerIndex === index;
            const correct = currentAnswer?.correctIndex === index;
            const className = currentAnswer
              ? `answer-button${correct ? ' answer-button--correct' : selected ? ' answer-button--wrong' : ''}`
              : 'answer-button';
            return <button className={className} key={`${run.questionIndex}-${index}`} disabled={Boolean(currentAnswer)} onClick={() => handleAnswer(index)}>
              <span className="answer-key">{String.fromCharCode(65 + index)}</span><span className="answer-text">{option}</span>
              {currentAnswer && correct && <Check size={17} />}
            </button>;
          })}
        </div>
        {currentAnswer && <div className={`answer-feedback ${currentAnswer.correct ? 'feedback--correct' : 'feedback--wrong'}`} role="status">
          <strong>{currentAnswer.timedOut ? text.timedOut : currentAnswer.correct ? text.correct : text.incorrect}</strong>
          {!currentAnswer.correct && <span>{text.correct}: {question.options[currentAnswer.correctIndex]}</span>}
          <span>{currentAnswer.points > 0 ? `+${currentAnswer.points}` : currentAnswer.points} {text.score.toLowerCase()}{currentAnswer.speedBonus > 0 && ` · +${currentAnswer.speedBonus} ${text.speedBonus.toUpperCase()}`}</span>
        </div>}
        {currentAnswer && <p className="challenge-note" role="status">{text.continue}…</p>}
      </GlassPanel>
      </>}
    </ScreenFrame>}

    {screen === 'match-game' && <ScreenFrame className="challenge-screen">
      {!matchView ? <GlassPanel variant="feature" role="alert">
        <p>{matchError || (language === 'fa' ? 'مسابقه در دسترس نیست.' : 'The match is unavailable.')}</p>
        <button className="secondary-action" onClick={() => {
          const selectedCategory = categoryById(run?.categoryId);
          if (selectedCategory) void beginMatch(selectedCategory, '1vAI');
          else leaveMatch('categories');
        }}>{language === 'fa' ? 'تلاش دوباره' : 'Try again'}</button>
        <button className="secondary-action" onClick={leaveMatch}>{text.back}</button>
      </GlassPanel> : <>
        <div className="challenge-head">
          <button className="back-link" onClick={() => setShowExitConfirm(true)}><ArrowLeft size={15} /> {text.backToChallenges}</button>
          <p>{matchView.isOnline ? (matchView.mode === '1v1' ? '1vs1 · ONLINE' : '1vsAI · ONLINE') : matchView.mode === '1v1' ? '1vs1 · LOCAL PREVIEW' : '1vsAI · LOCAL PREVIEW'} <span>·</span> {matchView.isOnline ? (language === 'fa' ? 'مسابقه سروری' : 'SERVER MATCH') : text.localOnly}</p>
        </div>
        {matchError && <p className="empty-state" role="alert">{matchError}</p>}
        {['waiting-question', 'waiting-result', 'submitting'].includes(matchView.phase) && <GlassPanel variant="feature" className="question-panel" role="status">
          <span className="eyebrow"><span className="live-dot" /> {matchView.phase === 'submitting'
            ? (language === 'fa' ? 'در حال ارسال پاسخ' : 'SUBMITTING ANSWER')
            : matchView.phase === 'waiting-result'
              ? (language === 'fa' ? 'در انتظار داوری سرور' : 'WAITING FOR SERVER JUDGING')
              : (language === 'fa' ? 'در حال آماده‌سازی سؤال' : 'PREPARING QUESTION')}</span>
          <h2>{matchView.phase === 'waiting-result'
            ? (language === 'fa' ? 'پاسخ‌ها در حال بررسی هستند…' : 'Your answers are being judged…')
            : matchView.phase === 'submitting'
              ? (language === 'fa' ? 'پاسخت با امنیت در حال ارسال است…' : 'Your answer is being sent securely…')
              : (matchView.mode === '1v1'
              ? (language === 'fa' ? 'در حال هماهنگی مسابقه با حریف…' : 'Synchronizing your match with the opponent…')
              : (language === 'fa' ? 'هوش مصنوعی در حال آماده‌سازی مسابقه است…' : 'AI is preparing your match…'))}</h2>
          <p className="panel-note">{language === 'fa'
            ? 'وضعیت مسابقه و زمان‌بندی فقط از سرور دریافت می‌شود.'
            : 'Match state and timing are controlled by the backend.'}</p>
        </GlassPanel>}
        {matchView.phase === 'submission-error' && <GlassPanel variant="feature" className="question-panel" role="alert">
          <h2>{language === 'fa' ? 'ارسال پاسخ تأیید نشد' : 'Answer submission needs a retry'}</h2>
          <p>{matchError || matchView.error}</p>
          <button className="primary-button" disabled={matchBusy} onClick={() => {
            setMatchBusy(true);
            void onlineMatchAdapterRef.current?.retrySubmission()
              .then(setMatchView)
              .catch((error) => setMatchError(error.message))
              .finally(() => setMatchBusy(false));
          }}><span className="primary-label">{language === 'fa' ? 'ارسال دوباره همان پاسخ' : 'Retry the same answer'}</span></button>
          <button className="secondary-action" disabled={matchBusy} onClick={() => { void onlineMatchAdapterRef.current?.refresh().then(setMatchView).catch((error) => setMatchError(error.message)); }}>
            {language === 'fa' ? 'بررسی وضعیت سرور' : 'Check server status'}
          </button>
        </GlassPanel>}
        {matchView.phase === 'error' && <GlassPanel variant="feature" className="question-panel" role="alert">
          <h2>{language === 'fa' ? 'ارتباط مسابقه قطع شد' : 'Match synchronization paused'}</h2>
          <p>{matchError || matchView.error}</p>
          <button className="primary-button" onClick={() => {
            void onlineMatchAdapterRef.current?.refresh()
              .then((next) => { setMatchView(next); if (next?.phase === 'complete') setScreen('match-results'); })
              .catch((error) => setMatchError(error.message));
          }}><span className="primary-label">{language === 'fa' ? 'تلاش دوباره برای همگام‌سازی' : 'Retry synchronization'}</span></button>
        </GlassPanel>}
        {matchView.phase === 'handoff' && <GlassPanel variant="feature" className="question-panel">
          <span className="eyebrow">{language === 'fa' ? 'نوبت بعدی' : 'NEXT TURN'}</span>
          <h2>{language === 'fa' ? 'دستگاه را به بازیکن بعدی بدهید' : 'Pass the device to the next player'}</h2>
          <p>{matchView.participants.find(({ id }) => id === matchView.activeParticipantId)?.displayName}</p>
          <button className="primary-button" onClick={continueMatch}><span className="primary-label">{language === 'fa' ? 'آماده‌ام' : 'Ready'}</span><ArrowRight className="primary-arrow" size={18} /></button>
        </GlassPanel>}
        {matchView.phase === 'round-summary' && <GlassPanel variant="feature" className="question-panel">
          <span className="eyebrow">{text.round} {matchView.roundIndex} / {matchView.totalRounds}</span>
          <h2>{language === 'fa' ? 'نتیجه دور' : 'Round results'}</h2>
          <div className="results-stats">
            {matchView.roundSummary.map((result) => {
              const participant = matchView.participants.find(({ id }) => id === result.participantId);
              return <StatCard key={result.participantId} icon={result.decision === 'correct' ? Check : Activity}
                label={participant?.displayName ?? ''} value={`${result.points > 0 ? '+' : ''}${result.points}`}
                tone={result.decision === 'correct' ? 'green' : 'cyan'} />;
            })}
          </div>
          <p className="panel-note">{matchView.isOnline ? (language === 'fa' ? 'نتیجه این دور پس از داوری سرور نمایش داده می‌شود.' : 'This round is settled by the backend before results are shown.') : (language === 'fa' ? 'حریف این حالت اسکریپت‌شده است؛ داوری و بازی آنلاین در دسترس نیست.' : 'The opponent is scripted; real AI judging and online play are not available.')}</p>
          <button className="primary-button" onClick={continueMatch}><span className="primary-label">{text.continue}</span><ArrowRight className="primary-arrow" size={18} /></button>
        </GlassPanel>}
        {matchView.phase === 'question' && matchView.question && <>
          <div className="gameplay-hud">
            <div className="arena-timer">
              <div className={`arena-timer-ring${matchRemaining <= 5 ? ' arena-timer-ring--urgent' : ''}`} style={{ '--timer-progress': `${Math.max(0, Math.min(100, matchRemaining / matchView.timeLimit * 100))}%` }} role="timer">
                <span><small>{text.timeRemaining}</small><strong>{Math.ceil(matchRemaining)}<i>{text.secondsShort}</i></strong></span>
              </div>
            </div>
            <div className="combatant-pair">
              {matchView.participants.map((participant) => <GlassPanel key={participant.id} variant="feature" className="combatant-card">
                <span className="combatant-avatar">{participant.type === 'ai' ? <Activity size={18} /> : <UserRound size={18} />}</span>
                <span className="combatant-copy"><small>{matchView.isOnline
                  ? (participant.isSelf ? (language === 'fa' ? 'شما' : 'YOU') : (language === 'fa' ? 'حریف' : 'OPPONENT'))
                  : participant.id === matchView.activeParticipantId ? (language === 'fa' ? 'نوبت شما' : 'ACTIVE TURN') : text.localSession}</small><strong>{participant.displayName}</strong></span>
                <span className="combatant-score"><small>{text.score}</small><strong>{participant.score}</strong></span>
              </GlassPanel>)}
            </div>
          </div>
          <GlassPanel variant="feature" className="question-panel">
            <div className="question-panel-top"><span><span className="live-dot" /> {text.round} <i>{String(matchView.roundIndex + 1).padStart(2, '0')} / {String(matchView.totalRounds).padStart(2, '0')}</i></span></div>
            <div className="question-copy"><span className="question-kicker"><Sparkles size={13} /> {text.chooseAnswer}</span><h2>{matchView.question.prompt}</h2></div>
            {matchView.question.answerType === 'FREE_TEXT' ? <div className="answer-list online-answer-form">
              <input
                className="text-input"
                type="text"
                maxLength={2000}
                value={onlineAnswerText}
                disabled={matchBusy || matchRemaining <= 0}
                placeholder={language === 'fa' ? 'پاسخ خود را بنویسید…' : 'Type your answer…'}
                onChange={(event) => setOnlineAnswerText(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && onlineAnswerText.trim()) void handleOnlineAnswer(); }}
              />
              <button className="primary-button" disabled={matchBusy || matchRemaining <= 0 || !onlineAnswerText.trim()} onClick={() => void handleOnlineAnswer()}>
                <span className="primary-label">{language === 'fa' ? 'ثبت پاسخ' : 'Submit answer'}</span>
                <ArrowRight className="primary-arrow" size={18} />
              </button>
            </div> : <div className="answer-list">
              {matchView.question.options.map(({ id, text: optionText }, index) => <button className="answer-button" key={id} disabled={matchBusy || matchRemaining <= 0} onClick={() => void handleMatchOption(id)}>
                <span className="answer-key">{String.fromCharCode(65 + index)}</span><span className="answer-text">{optionText}</span>
              </button>)}
            </div>}
            <p className="panel-note">{matchView.isOnline
              ? (language === 'fa' ? 'پاسخ و امتیاز توسط سرور و داور هوش مصنوعی تعیین می‌شود.' : 'The backend and AI Judge determine accepted answers and scores.')
              : (language === 'fa' ? 'حالت پیش‌نمایش محلی؛ حریف اسکریپت‌شده است و AI واقعی نیست.' : 'Local preview only: the opponent is scripted, not real AI.')}</p>
          </GlassPanel>
        </>}
      </>}
    </ScreenFrame>}

    {screen === 'results' && run && <ScreenFrame className="results-screen">
      <div className="results-heading">
        <span className="results-medal"><Medal size={25} /></span><span className="eyebrow"><span className="live-dot" /> {text.battleReport} · {run.categoryTitle.toUpperCase()} · {activeMode.toUpperCase()}</span>
        <h1>{text.resultsTitle} <span>{text.resultsAccent}</span></h1>
        <p>{run.correct} / {run.total} {text.correctAnswers.toLowerCase()} · {run.answers.filter((answer) => answer.timedOut).length} {text.timedOut.toLowerCase()}</p>
      </div>
      <GlassPanel variant="feature" className="results-panel" data-view={resultsView}>
        <div className="screen-tabs" role="group" aria-label={text.battleReport}>
          <button type="button" className={resultsView === 'summary' ? 'is-selected' : ''} aria-pressed={resultsView === 'summary'} onClick={() => setResultsView('summary')}>{text.finalScore}</button>
          <button type="button" className={resultsView === 'review' ? 'is-selected' : ''} aria-pressed={resultsView === 'review'} onClick={() => setResultsView('review')}>{text.answerReview}</button>
        </div>
        <div className="results-summary" hidden={resultsView !== 'summary'}>
          <div className="panel-top"><span className="eyebrow"><Trophy size={13} /> {text.finalScore}</span><strong className="final-score">{run.score}</strong></div>
          <div className="results-stats">
            <StatCard icon={Check} label={text.correctAnswers} value={`${run.correct}/${run.total}`} tone="green" />
            <StatCard icon={Target} label={text.accuracy} value={`${run.total ? Math.round(run.correct / run.total * 100) : 0}%`} tone="cyan" />
            <StatCard icon={Zap} label={text.speedBonus} value={`+${run.answers.reduce((sum, answer) => sum + answer.speedBonus, 0)}`} tone="pink" />
            <StatCard icon={Sparkles} label={text.xpEarned} value={`+${Math.max(0, Math.floor(run.score / 5))}`} tone="gold" />
          </div>
          <div className="level-update"><span className="level-emblem"><Sparkles size={17} /></span><span className="level-copy"><strong>{text.level} {profile.level}</strong><small>{profile.xp} / {threshold} XP · {text.nextLevel}</small><i className="rank-track"><span style={{ width: `${Math.min(100, profile.xp / threshold * 100)}%` }} /></i></span></div>
        </div>
        <div className="answer-review" hidden={resultsView !== 'review'}>
          {run.questions.map((item, index) => {
            const answer = run.answers[index];
            const localizedItem = getQuestionCopy(language, run.categoryId, index, item);
            return <div className={`review-row${answer?.correct ? ' review-correct' : ' review-wrong'}`} key={index}>
              <span>{String(index + 1).padStart(2, '0')}</span><span>{localizedItem.prompt}<small>{answer?.correct ? localizedItem.options[answer.answerIndex] : `${answer?.timedOut ? text.timedOut : text.incorrect} · ${localizedItem.options[item.answer]}`}</small></span>
              <strong>{answer?.points > 0 ? `+${answer.points}` : answer?.points ?? 0}</strong>
            </div>;
          })}
        </div>
        <p className="saved-note"><Check size={13} /> {storageFailed ? text.saveNotice : text.saved}</p>
      </GlassPanel>
      <div className="results-actions">
        <button className="primary-button" onClick={() => { const again = categoryById(run.categoryId); if (again) beginChallenge(again, run.mode, run.modeIndex); }}>
          <span className="play-mark"><RotateCcw size={16} /></span><span className="primary-label">{text.replay}</span><ArrowRight className="primary-arrow" size={18} />
        </button>
        <button className="secondary-action" onClick={() => navigate('home')}>{text.home}</button>
      </div>
    </ScreenFrame>}

    {screen === 'match-results' && matchView && <ScreenFrame className="results-screen">
      <div className="results-heading">
        <span className="results-medal"><Trophy size={25} /></span>
        <span className="eyebrow">{matchView.mode} · {matchView.isOnline ? (language === 'fa' ? 'نتیجه رسمی سرور' : 'SERVER MATCH RESULT') : (language === 'fa' ? 'نتیجه مسابقه محلی' : 'LOCAL MATCH RESULT')}</span>
        <h1>{matchView.winnerId
          ? (matchView.winnerId === 'human-1'
            ? (language === 'fa' ? 'شما برنده شدید' : 'You win')
            : matchView.mode === '1v1'
              ? (language === 'fa' ? 'حریف برنده شد' : 'Your opponent wins')
              : matchView.isOnline
                ? (language === 'fa' ? 'حریف هوش مصنوعی برنده شد' : 'NEXIRA AI wins')
              : matchView.winnerId === 'human-2'
                ? (language === 'fa' ? 'بازیکن ۲ برنده شد' : 'Player 2 wins')
                : (language === 'fa' ? 'حریف اسکریپت‌شده برنده شد' : 'Scripted opponent wins'))
          : (language === 'fa' ? 'مساوی' : 'It’s a draw')}</h1>
      </div>
      <GlassPanel variant="feature" className="results-panel">
        <div className="results-stats">
          {matchView.participants.map((participant) => <StatCard key={participant.id} icon={participant.type === 'ai' ? Activity : UserRound}
            label={participant.displayName} value={participant.score} tone={participant.id === matchView.winnerId ? 'green' : 'cyan'} />)}
        </div>
        <p className="panel-note">{matchView.isOnline
          ? (language === 'fa' ? 'امتیاز نهایی و برنده از نتیجه ثبت‌شده در Backend دریافت شده است.' : 'Final scores and winner were retrieved from the authoritative backend result.')
          : (language === 'fa'
            ? 'این مسابقه پیش‌نمایش محلی است؛ نتیجه در پروفایل ذخیره نشده و AI یا سرویس آنلاین استفاده نشده است.'
            : 'Local preview only. This result is not saved to your profile; no real AI or online service was used.')}</p>
      </GlassPanel>
      <div className="results-actions">
        <button className="primary-button" onClick={() => {
          const selectedCategory = categoryById(run?.categoryId);
          if (selectedCategory) beginMatch(selectedCategory, matchView.mode);
        }}><span className="play-mark"><RotateCcw size={16} /></span><span className="primary-label">{text.replay}</span><ArrowRight className="primary-arrow" size={18} /></button>
        <button className="secondary-action" onClick={() => leaveMatch('home')}>{text.home}</button>
      </div>
    </ScreenFrame>}

    {screen === 'profile' && <ScreenFrame className="info-screen">
      <div className="profile-screen-actions">
        <button className="back-link" onClick={() => navigate('home')}><ArrowLeft size={15} /> {text.home}</button>
        <button className="profile-settings-link" onClick={() => navigate('settings')}><Settings size={15} /> {text.settings}</button>
      </div>
      <ScreenHeading eyebrow={text.operatorDossierEyebrow} title={text.profileTitle} accent={text.profileAccent} />
      <GlassPanel className="profile-panel" data-view={profileView}>
        <div className="profile-identity"><span className="operator-mark"><UserRound size={25} /></span><span><strong>{playerName}</strong><small>{text.level} {profile.level} · {text.totalXp} {profile.totalXp}</small></span></div>
        <div className="panel-note" role="status" data-session-state={sessionState.status}>
          {language === 'fa'
            ? ({ idle: 'وضعیت حساب: در انتظار اتصال', initializing: 'وضعیت حساب: در حال اتصال امن…', guest: 'حساب مهمان: فعال', authenticated: 'حساب ثبت‌شده: متصل', offline: 'اتصال به سرور برقرار نیست؛ اطلاعات محلی اپ در دسترس است.', error: 'اتصال نشست کامل نشد؛ تنظیمات سرور را بررسی کنید.', unsupported: 'نشست پایدار در این پلتفرم هنوز فعال نیست.', 'signed-out': 'از حساب خارج شده‌اید.' }[sessionState.status] ?? 'وضعیت حساب نامشخص است.')
            : ({ idle: 'Account: waiting for connection', initializing: 'Account: securing session…', guest: 'Guest account: active', authenticated: 'Registered account: connected', offline: 'Server is unreachable; local app content remains available.', error: 'Session could not be initialized; check server configuration.', unsupported: 'Persistent sessions are not enabled on this platform yet.', 'signed-out': 'You are signed out.' }[sessionState.status] ?? 'Account status unavailable.')}
        </div>
        {['offline', 'error'].includes(sessionState.status) && <button type="button" className="secondary-action" onClick={() => { void appSessionLifecycle.retry(); }}>
          {language === 'fa' ? 'تلاش دوباره برای اتصال' : 'Retry secure connection'}
        </button>}
        <AccountSessionPanel lifecycle={appSessionLifecycle} sessionState={sessionState} language={language} />
        <div className="screen-tabs" role="group" aria-label={text.profile}>
          <button type="button" className={profileView === 'progress' ? 'is-selected' : ''} aria-pressed={profileView === 'progress'} onClick={() => setProfileView('progress')}>{text.progress}</button>
          <button type="button" className={profileView === 'honors' ? 'is-selected' : ''} aria-pressed={profileView === 'honors'} onClick={() => setProfileView('honors')}>{text.battleHonors}</button>
          <button type="button" className={profileView === 'stats' ? 'is-selected' : ''} aria-pressed={profileView === 'stats'} onClick={() => setProfileView('stats')}>{text.stats}</button>
        </div>
        <div className="profile-view" hidden={profileView !== 'progress'}>
        <span className="profile-rank-chip"><Medal size={14} /> {text.arenaLevel} {String(profile.level).padStart(2, '0')}</span>
        <label className="field-label" htmlFor="player-name">{text.displayName}</label>
        <input id="player-name" className="text-input" maxLength={20} value={playerName} onChange={(event) => updateProfile((saved) => ({ ...saved, playerName: event.target.value }))} />
        <div className="profile-progress">
          <div><span>{text.progress}</span><strong>{profile.xp}<i> / {threshold} XP</i></strong></div>
          <span className="rank-track"><span style={{ width: `${Math.min(100, profile.xp / threshold * 100)}%` }} /></span>
          <small>{text.level} {profile.level} · {threshold - profile.xp} XP {text.nextLevel.toLowerCase()}</small>
        </div>
        <div className="profile-metrics">
          <div><strong>{profile.battles}</strong><span>{text.battles}</span></div>
          <div><strong>{profile.bestScore}</strong><span>{text.best}</span></div>
          <div><strong>{accuracy}%</strong><span>{text.accuracy}</span></div>
        </div>
        </div>
        <div className="profile-view" hidden={profileView !== 'honors'}>
        <h2 className="subsection-title"><Medal size={15} /> {text.battleHonors}</h2>
        <div className="achievement-grid">
          {[
            { title: text.achievementFirst, detail: text.achievementFirstDetail, earned: profile.battles >= 1, icon: Zap },
            { title: text.achievementVeteran, detail: text.achievementVeteranDetail, earned: profile.battles >= 5, icon: Medal },
            { title: text.achievementSharp, detail: text.achievementSharpDetail, earned: profile.totalAnswers > 0 && accuracy >= 80, icon: Target },
            { title: text.achievementAscendant, detail: text.achievementAscendantDetail, earned: profile.level >= 5, icon: Sparkles },
          ].map(({ title, detail, earned, icon: Icon }) => <div className={`achievement-card${earned ? ' achievement-card--earned' : ''}`} key={title}>
            <span><Icon size={16} /></span><strong>{title}</strong><small>{detail}</small><i>{earned ? text.unlocked : text.locked}</i>
          </div>)}
        </div>
        </div>
        <div className="profile-view" hidden={profileView !== 'stats'}>
        <h2 className="subsection-title"><BarChart3 size={15} /> {text.stats}</h2>
        <div className="category-stat-list">
          {CATEGORIES.filter((item) => profile.categoryStats[item.id]?.battles).map((item) => {
            const stats = profile.categoryStats[item.id];
            return <div className="category-stat-row" key={item.id}><span>{item.title}</span><span>{stats.battles} {text.battles.toLowerCase()}</span><strong>{stats.bestScore}</strong></div>;
          })}
          {!profile.battles && <p className="empty-state">{text.noRuns}</p>}
        </div>
        </div>
        <p className="panel-note"><Activity size={13} /> {text.saved}</p>
      </GlassPanel>
    </ScreenFrame>}

    {screen === 'rankings' && <ScreenFrame className="info-screen">
      <button className="back-link" onClick={() => navigate('home')}><ArrowLeft size={15} /> {text.home}</button>
      <ScreenHeading eyebrow={text.rankingsEyebrow} title={text.rankingsTitle} accent={text.rankingsAccent} description={text.noOnline} />
      <GlassPanel className="ranking-panel">
        <div className="ranking-title"><span><Medal size={18} /> {text.localOnly}</span><small>{text.thisDevice}</small></div>
        <p className="ranking-subtitle">{text.rankingSubtitle}</p>
        {(() => {
          const records = CATEGORIES.filter((item) => profile.categoryStats[item.id]?.battles)
            .sort((a, b) => profile.categoryStats[b.id].bestScore - profile.categoryStats[a.id].bestScore);
          const podium = records.slice(0, 3);
          return <>
            {podium.length > 0 && <div className="podium-grid">
              {podium.map((item, index) => {
                const rank = index + 1;
                const Icon = CATEGORY_ICONS[item.icon] ?? Activity;
                return <div className={`podium-card podium-card--${rank}`} key={item.id}>
                  <span className="podium-rank">{rank === 1 ? <Trophy size={18} /> : `0${rank}`}</span>
                  <span className="podium-avatar"><Icon size={18} /></span>
                  <strong>{playerName}</strong><small>{text.levelAbbr} {profile.level} · {item.title}</small>
                  <b>{profile.categoryStats[item.id].bestScore}<i> {text.pointsAbbr}</i></b>
                </div>;
              })}
            </div>}
            <div className="leader-list">
              {records.slice(3).map((item, index) => {
                const Icon = CATEGORY_ICONS[item.icon] ?? Activity;
                const stats = profile.categoryStats[item.id];
                return <div className="leader-row leader-row--you" key={item.id}>
                  <span className="leader-rank">{String(index + 4).padStart(2, '0')}</span>
                  <span className="leader-avatar"><Icon size={16} /></span>
                  <span className="leader-player"><strong>{playerName}</strong><small>{text.levelAbbr} {profile.level} · {item.title} · {stats.battles} {text.runs.toUpperCase()}</small></span>
                  <strong className="leader-score">{stats.bestScore}</strong>
                </div>;
              })}
              {records.length === 0 && <p className="empty-state">{text.noRuns}</p>}
            </div>
          </>;
        })()}
        <p className="panel-note"><Globe2 size={13} /> {text.noRemoteScores}</p>
      </GlassPanel>
    </ScreenFrame>}

    {screen === 'store' && <ScreenFrame className="info-screen store-screen">
      <button className="back-link" onClick={() => navigate('home')}><ArrowLeft size={15} /> {text.home}</button>
      <ScreenHeading eyebrow={language === 'fa' ? 'شخصی‌سازی' : 'PERSONALIZATION'} title={language === 'fa' ? 'فروشگاه' : 'Store'} accent={language === 'fa' ? 'نکسیرا' : 'NEXIRA'} description={language === 'fa' ? 'آیتم‌های ظاهری اختیاری؛ بدون هیچ مزیت رقابتی.' : 'Optional cosmetic items. Never pay for a competitive advantage.'} />
      <GlassPanel className="store-coming-soon">
        <span className="store-mark"><Sparkles size={25} /></span>
        <h2>{language === 'fa' ? 'فروشگاه در حال آماده‌سازی است' : 'The store is being prepared'}</h2>
        <p>{language === 'fa' ? 'پرداخت و خرید هنوز فعال نیست. هیچ آیتم پولی یا مزیت رقابتی در این نسخه ارائه نمی‌شود.' : 'Purchases are not available yet. No paid items or competitive advantages are offered in this build.'}</p>
      </GlassPanel>
    </ScreenFrame>}

    {screen === 'settings' && <ScreenFrame className="info-screen">
      <button className="back-link" onClick={() => navigate('home')}><ArrowLeft size={15} /> {text.home}</button>
      <ScreenHeading eyebrow={text.settingsEyebrow} title={text.settingsTitle} accent={text.settingsAccent} description={text.settingsDescription} />
      <GlassPanel className="settings-panel">
        <div className="setting-row"><span><Languages size={17} /><span><strong>{text.language}</strong><small>{text.languageOptions}</small></span></span>
          <button className="setting-action" onClick={() => navigate('language')}>{language === 'fa' ? 'فارسی' : 'English'} <ChevronRight size={16} /></button></div>
        <div className="setting-row"><span><Sparkles size={17} /><span><strong>{text.reducedMotion}</strong><small>{text.fewerAnimations}</small></span></span>
          <button className={`toggle-control${profile.settings.reducedMotion ? ' is-on' : ''}`} role="switch" aria-checked={profile.settings.reducedMotion} aria-label={text.reducedMotion} onClick={() => updateProfile((saved) => ({ ...saved, settings: { ...saved.settings, reducedMotion: !saved.settings.reducedMotion } }))}><i /></button>
        </div>
        <p className="panel-note"><Check size={13} /> {storageFailed ? text.saveNotice : text.saved}</p>
        <button className="secondary-action settings-language-link" onClick={() => navigate('language')}>{text.language} · {language === 'fa' ? 'فارسی' : 'English'}</button>
      </GlassPanel>
    </ScreenFrame>}

    {screen === 'language' && <ScreenFrame className="info-screen">
      <button className="back-link" onClick={() => navigate('settings')}><ArrowLeft size={15} /> {text.settings}</button>
      <ScreenHeading eyebrow={text.languageEyebrow} title={text.languageTitle} accent={text.languageAccent} description={text.languageDescription} />
      <GlassPanel className="language-options">
        {[['en', 'English', text.englishInterface], ['fa', 'فارسی', text.persianInterface]].map(([value, name, subtitle]) =>
          <button className={`language-option${language === value ? ' language-option--selected' : ''}`} key={value} onClick={() => { updateProfile((saved) => ({ ...saved, settings: { ...saved.settings, language: value } })); completeLanguageSelection(); const wasInitialSelection = isInitialLanguageSelection; setIsInitialLanguageSelection(false); navigate(wasInitialSelection ? 'home' : 'settings'); }}>
            <span><strong>{name}</strong><small>{subtitle}</small></span>{language === value && <Check size={18} />}
          </button>)}
      </GlassPanel>
    </ScreenFrame>}

    {screen !== 'game' && screen !== 'match-game' && screen !== 'matchmaking' && <nav className="bottom-nav" aria-label={text.mainNavigation}>
      {[
        ['home', text.navHome, Home],
        ['rankings', text.navRanks, Trophy],
        ['store', language === 'fa' ? 'فروشگاه' : 'Store', ShoppingCart],
        ['profile', text.navProfile, UserRound],
      ].map(([destination, label, Icon]) => <button key={destination} className={`nav-item${screen === destination ? ' nav-item--active' : ''}`} onClick={() => navigate(destination)}>
        <Icon className="nav-icon" size={17} /><span>{label}</span>
      </button>)}
    </nav>}
    {(screen === 'game' || screen === 'match-game') && showExitConfirm && <div className="overlay overlay--center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowExitConfirm(false); }}>
      <section className="confirm-panel glass-panel" role="dialog" aria-modal="true" aria-labelledby="exit-game-title">
        <span className="confirm-icon"><Activity size={22} /></span>
        <h2 id="exit-game-title">{language === 'fa' ? 'آیا می‌خواهید از مسابقه خارج شوید؟' : screen === 'match-game' ? 'Leave this match?' : 'Leave this challenge?'}</h2>
        <p>{language === 'fa' ? 'پیشرفت این مسابقه ثبت نخواهد شد.' : 'Your current challenge will not be saved.'}</p>
        <div className="confirm-actions">
          <button className="stay-button" onClick={() => setShowExitConfirm(false)}>{language === 'fa' ? 'خیر، ادامه بازی' : 'No, keep playing'}</button>
          <button className="leave-button" onClick={() => {
            if (screen === 'match-game') {
              leaveMatch();
            } else {
              setShowExitConfirm(false);
              runRef.current = null;
              setRun(null);
              navigate('categories');
            }
          }}>{language === 'fa' ? 'بله، خروج' : 'Yes, leave'}</button>
        </div>
      </section>
    </div>}
    {storageFailed && <div className="storage-warning" role="status">{text.saveNotice}</div>}
  </div>;
}
