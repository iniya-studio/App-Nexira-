function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random number generation is unavailable.');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function errorCode(error, fallback = 'QUICK_BATTLE_SYNC_FAILED') {
  return typeof error?.code === 'string' && error.code.trim() ? error.code : fallback;
}

export function createQuickBattleAdapter(api, { createKey = createIdempotencyKey } = {}) {
  if (!api || typeof api.createOrRecover !== 'function' || typeof api.getMatch !== 'function'
      || typeof api.getCurrentRound !== 'function' || typeof api.submitAnswer !== 'function'
      || typeof api.getResult !== 'function') {
    throw new TypeError('A complete Quick Battle API is required.');
  }

  let view = null;
  let pendingSubmission = null;
  let serverClockOffsetMs = 0;
  let syncInFlight = null;

  function update(patch) {
    view = { ...view, ...patch };
    return view;
  }

  function getRemainingMs() {
    if (!view?.deadlineAt) return 0;
    const deadline = Date.parse(view.deadlineAt);
    if (!Number.isFinite(deadline)) return 0;
    return Math.max(0, deadline - (Date.now() + serverClockOffsetMs));
  }

  async function start(language = 'en') {
    const match = await api.createOrRecover(language);
    if (!match?.id || !Number.isInteger(match.roundsTarget) || match.roundsTarget !== 10) {
      throw new Error('Backend returned an invalid Quick Battle match.');
    }
    view = {
      matchId: match.id,
      status: match.status,
      language: match.language ?? language,
      currentRound: match.currentRound ?? 0,
      totalRounds: match.roundsTarget,
      phase: 'preparing',
      question: null,
      deadlineAt: null,
      errorCode: null,
      result: null,
    };
    return refresh();
  }

  async function refresh() {
    if (!view?.matchId) return null;
    if (syncInFlight) return syncInFlight;
    syncInFlight = (async () => {
      const match = await api.getMatch(view.matchId);
      update({
        status: match.status,
        currentRound: match.currentRound,
        totalRounds: match.roundsTarget,
      });

      if (match.status === 'VOIDED' || match.status === 'CANCELLED') {
        pendingSubmission = null;
        return update({ phase: 'voided', question: null, errorCode: null });
      }

      if (match.status === 'COMPLETED') {
        try {
          const result = await api.getResult(view.matchId);
          if (result?.matchId !== view.matchId || !Number.isSafeInteger(result.totalPoints)) {
            throw new Error('Backend returned an invalid Quick Battle result.');
          }
          pendingSubmission = null;
          return update({ phase: 'complete', result, question: null, errorCode: null });
        } catch (error) {
          if (error?.status === 409 || error?.code === 'HTTP_ERROR') {
            return update({ phase: 'waiting-result', question: null, errorCode: null });
          }
          throw error;
        }
      }

      const snapshot = await api.getCurrentRound(view.matchId);
      const serverNow = Date.parse(snapshot.serverNow);
      if (Number.isFinite(serverNow)) serverClockOffsetMs = serverNow - Date.now();
      update({
        currentRound: snapshot.currentRound,
        totalRounds: snapshot.roundsTarget,
        serverNow: snapshot.serverNow,
        status: snapshot.matchStatus,
      });

      if (snapshot.state === 'VOIDED' || snapshot.state === 'CANCELLED') {
        pendingSubmission = null;
        return update({ phase: 'voided', question: null, errorCode: null });
      }
      if (snapshot.state === 'WAITING_FOR_PUBLICATION' || !snapshot.round) {
        return update({ phase: 'preparing', question: null, deadlineAt: null, errorCode: null });
      }

      const round = snapshot.round;
      const roundNumber = round.roundNumber;
      if (round.state === 'VOIDED') {
        return update({ phase: 'voided', question: null, errorCode: null });
      }
      if (round.completedAt || snapshot.state === 'COMPLETED') {
        pendingSubmission = null;
        return update({
          phase: 'waiting-next',
          roundNumber,
          question: null,
          deadlineAt: null,
          answer: round.answer ?? null,
          errorCode: null,
        });
      }
      if (round.answer) {
        pendingSubmission = null;
        return update({
          phase: 'waiting-result',
          roundNumber,
          question: null,
          deadlineAt: round.deadlineAt,
          answer: round.answer,
          errorCode: null,
        });
      }
      if (!round.question || typeof round.question.prompt !== 'string'
          || !round.question.prompt.trim() || !round.deadlineAt) {
        return update({ phase: 'preparing', question: null, deadlineAt: null, errorCode: null });
      }
      if (pendingSubmission) {
        return update({ phase: 'submission-error', question: null, deadlineAt: round.deadlineAt,
          errorCode: 'QUICK_BATTLE_SUBMISSION_RETRY_REQUIRED' });
      }
      return update({
        phase: 'question',
        roundNumber,
        question: round.question,
        deadlineAt: round.deadlineAt,
        answer: null,
        errorCode: null,
      });
    })().finally(() => { syncInFlight = null; });
    return syncInFlight;
  }

  async function submitAnswer(responseText) {
    const response = typeof responseText === 'string' ? responseText.trim() : '';
    if (!view || !['question', 'submission-error'].includes(view.phase) || !response || response.length > 2000) {
      throw new Error('A valid active Quick Battle answer is required.');
    }
    if (!pendingSubmission) {
      pendingSubmission = {
        responseText: response,
        idempotencyKey: createKey(),
        roundNumber: view.roundNumber,
      };
    } else if (pendingSubmission.responseText !== response
        || pendingSubmission.roundNumber !== view.roundNumber) {
      throw new Error('The pending Quick Battle answer must be retried unchanged.');
    }
    update({ phase: 'submitting', errorCode: null });
    try {
      await api.submitAnswer(
        view.matchId,
        pendingSubmission.roundNumber,
        pendingSubmission.responseText,
        pendingSubmission.idempotencyKey,
      );
      pendingSubmission = null;
      return update({ phase: 'waiting-result', question: null, errorCode: null });
    } catch (error) {
      update({ phase: 'submission-error', errorCode: errorCode(error, 'QUICK_BATTLE_SUBMISSION_FAILED') });
      throw error;
    }
  }

  async function retrySubmission() {
    if (!pendingSubmission) return refresh();
    return submitAnswer(pendingSubmission.responseText);
  }

  return Object.freeze({
    start,
    refresh,
    submitAnswer,
    retrySubmission,
    getRemainingMs,
    getView: () => view,
    reset() {
      view = null;
      pendingSubmission = null;
      serverClockOffsetMs = 0;
      syncInFlight = null;
    },
  });
}
