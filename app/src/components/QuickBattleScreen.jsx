import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock3, LoaderCircle, Send, Trophy, Zap } from 'lucide-react';
import { createQuickBattleApi } from '../api/quickBattleApi.js';
import { createQuickBattleAdapter } from '../game/quickBattleAdapter.js';
import './QuickBattleScreen.css';

export function QuickBattleScreen({ language, text, sessionReady, sessionStatus, sessionErrorCode, http, onExit, onRetrySession }) {
  const [view, setView] = useState(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [error, setError] = useState(null);
  const adapterRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (!sessionReady || !http || startRef.current) return undefined;
    const adapter = createQuickBattleAdapter(createQuickBattleApi(http));
    adapterRef.current = adapter;
    startRef.current = adapter.start(language).then((next) => {
      setView(next);
      return next;
    }).catch((failure) => {
      setError(failure);
      return null;
    });
  }, [http, language, sessionReady]);

  useEffect(() => {
    if (!view?.matchId || !adapterRef.current) return undefined;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (!active || inFlight || ['complete', 'voided'].includes(adapterRef.current?.getView()?.phase)) return;
      inFlight = true;
      try {
        const next = await adapterRef.current.refresh();
        if (active && next) {
          setView(next);
          if (next.phase !== 'submission-error') setError(null);
        }
      } catch (failure) {
        if (active) setError(failure);
      } finally {
        inFlight = false;
      }
    };
    const interval = window.setInterval(poll, 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [view?.matchId]);

  useEffect(() => {
    if (view?.phase !== 'question' || !adapterRef.current) return undefined;
    const tick = () => setRemainingMs(adapterRef.current?.getRemainingMs() ?? 0);
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [view?.phase, view?.deadlineAt, view?.roundNumber]);

  const submit = async () => {
    if (!adapterRef.current || busy || !answer.trim() || remainingMs <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = await adapterRef.current.submitAnswer(answer);
      setView(next);
      setAnswer('');
    } catch (failure) {
      setView(adapterRef.current.getView());
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!adapterRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = view?.phase === 'submission-error'
        ? await adapterRef.current.retrySubmission()
        : view?.matchId
          ? await adapterRef.current.refresh()
          : await adapterRef.current.start(language);
      setView(next);
    } catch (failure) {
      setView(adapterRef.current.getView());
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const title = text.home.quickBattle;
  const statusText = view?.phase === 'waiting-result' ? text.match.waitingForJudge
    : view?.phase === 'submitting' ? text.match.answerSendingSecurely
      : view?.phase === 'waiting-next' || view?.phase === 'preparing' ? text.match.preparingQuestion
        : text.match.aiPreparingMatch;
  const timeLabel = Math.ceil(remainingMs / 1000);

  return <main className="screen screen-frame quick-battle-screen">
    <button className="back-link" type="button" onClick={onExit}><ArrowLeft size={15} /> {text.homeLabel}</button>
    <header className="quick-battle-heading">
      <span className="eyebrow"><span className="live-dot" /> {text.match.serverMatch}</span>
      <h1>{title}</h1>
      <p>{text.match.matchStateBackend}</p>
    </header>

    {!sessionReady && ['offline', 'error', 'signed-out', 'unsupported'].includes(sessionStatus) && <section className="quick-battle-panel" role="alert">
      <h2>{text.match.unavailable}</h2>
      <p>{sessionErrorCode || 'SESSION_NOT_READY'}</p>
      <button type="button" className="quick-battle-primary" onClick={() => void onRetrySession?.()}>{text.match.retrySynchronization}</button>
    </section>}

    {!sessionReady && !['offline', 'error', 'signed-out', 'unsupported'].includes(sessionStatus) && <section className="quick-battle-panel" role="status">
      <LoaderCircle className="quick-battle-spinner" size={28} />
      <h2>{text.match.aiPreparingMatch}</h2>
    </section>}

    {sessionReady && !view && !error && <section className="quick-battle-panel" role="status">
      <LoaderCircle className="quick-battle-spinner" size={28} />
      <h2>{text.match.aiPreparingMatch}</h2>
    </section>}

    {view?.phase === 'question' && <section className="quick-battle-panel">
      <div className="quick-battle-panel-top">
        <span><Zap size={16} /> {text.round} {view.roundNumber} / {view.totalRounds}</span>
        <span className={remainingMs <= 5000 ? 'quick-battle-time is-urgent' : 'quick-battle-time'}>
          <Clock3 size={17} /> {timeLabel}s
        </span>
      </div>
      <div className="quick-battle-progress"><span style={{ width: ((view.roundNumber - 1) / view.totalRounds * 100) + '%' }} /></div>
      <h2 className="quick-battle-question">{view.question.prompt}</h2>
      <form className="quick-battle-answer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <input
          type="text"
          autoComplete="off"
          maxLength={2000}
          value={answer}
          disabled={busy || remainingMs <= 0}
          placeholder={text.match.typeAnswer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <button type="submit" disabled={busy || remainingMs <= 0 || !answer.trim()}>
          <Send size={17} /> {text.match.submitAnswer}
        </button>
      </form>
      {remainingMs <= 0 && <p className="quick-battle-note" role="status">{text.match.waitingForJudge}</p>}
    </section>}

    {view && ['preparing', 'submitting', 'waiting-result', 'waiting-next'].includes(view.phase) && <section className="quick-battle-panel" role="status">
      <LoaderCircle className="quick-battle-spinner" size={28} />
      <h2>{statusText}</h2>
      <p>{text.round} {Math.min(view.currentRound || view.roundNumber || 1, view.totalRounds)} / {view.totalRounds}</p>
    </section>}

    {view?.phase === 'submission-error' && <section className="quick-battle-panel" role="alert">
      <h2>{text.match.submissionNeedsRetry}</h2>
      <p>{view.errorCode}</p>
      <button type="button" className="quick-battle-primary" disabled={busy} onClick={() => void retry()}>{text.match.retrySameAnswer}</button>
    </section>}

    {error && !['submission-error'].includes(view?.phase) && <section className="quick-battle-panel" role="alert">
      <h2>{text.match.unavailable}</h2>
      <p>{typeof error?.code === 'string' ? error.code : 'QUICK_BATTLE_SYNC_FAILED'}</p>
      <button type="button" className="quick-battle-primary" disabled={busy} onClick={() => void retry()}>{text.match.retrySynchronization}</button>
    </section>}

    {view?.phase === 'complete' && <section className="quick-battle-panel quick-battle-result">
      <span className="quick-battle-result-icon"><Trophy size={28} /></span>
      <span className="eyebrow">{text.match.serverResult}</span>
      <h2>{text.finalScore}</h2>
      <strong className="quick-battle-total">{view.result.totalPoints.toLocaleString()}</strong>
      <div className="quick-battle-result-stats">
        <div><strong>{view.result.correctAnswers}</strong><span>{text.correctAnswers}</span></div>
        <div><strong>{view.result.incorrectAnswers}</strong><span>{text.incorrect}</span></div>
        <div><strong>{view.result.noResponseCount}</strong><span>{text.timedOut}</span></div>
      </div>
      <p>{text.match.authoritativeResult}</p>
      <button type="button" className="quick-battle-primary" onClick={onExit}>{text.homeLabel}</button>
    </section>}

    {view?.phase === 'voided' && <section className="quick-battle-panel" role="alert">
      <h2>{text.match.unavailable}</h2>
      <p>{text.match.matchStateBackend}</p>
      <button type="button" className="quick-battle-primary" onClick={onExit}>{text.homeLabel}</button>
    </section>}
  </main>;
}
