function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random number generation is unavailable.');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function participantView(participant) {
  const isAi = participant.type === 'AI';
  const isSelf = Boolean(participant.isSelf);
  return {
    id: isAi ? 'scripted-opponent' : isSelf ? 'human-1' : 'human-2',
    type: isAi ? 'ai' : 'human',
    displayName: isAi ? 'NEXIRA AI' : isSelf ? 'YOU' : 'OPPONENT',
    score: Number.isSafeInteger(participant.score) ? participant.score : 0,
    isSelf: Boolean(participant.isSelf),
    answer: participant.answer ?? null,
    status: participant.status,
  };
}

export function createOnlineMatchAdapter(api, {
  createKey = createIdempotencyKey,
} = {}) {
  if (!api || typeof api.createAiMatch !== 'function' ||
      typeof api.getMatch !== 'function' ||
      typeof api.getQuestionRecovery !== 'function' ||
      typeof api.getRoundQuestion !== 'function' ||
      typeof api.markRoundReady !== 'function' ||
      typeof api.submitAnswer !== 'function' ||
      typeof api.getRoundResult !== 'function' ||
      typeof api.getMatchResult !== 'function') {
    throw new TypeError('A complete NEXIRA online match API is required.');
  }

  let view = null;
  let roundId = null;
  let lastPresentedRoundId = null;
  let pendingSubmission = null;
  let syncInFlight = null;

  function update(patch) {
    view = { ...view, ...patch };
    return view;
  }

  async function sendPendingSubmission() {
    if (!pendingSubmission || !roundId || !view) {
      throw new Error('There is no pending answer to submit.');
    }
    update({ phase: 'submitting', error: null });
    try {
      await api.submitAnswer(
        view.matchId,
        roundId,
        pendingSubmission.responseText,
        pendingSubmission.idempotencyKey,
      );
    } catch (error) {
      update({
        phase: 'submission-error',
        error: error instanceof Error ? error.message : 'Answer submission failed.',
      });
      throw error;
    }

    // The server accepted the idempotent submission. A later result-read
    // failure is a synchronization problem, not a failed answer submission.
    pendingSubmission = null;
    update({ phase: 'waiting-result', error: null });
    return await refresh();
  }

  async function refresh() {
    if (!view) return null;
    if (syncInFlight) return syncInFlight;

    syncInFlight = (async () => {
      const match = await api.getMatch(view.matchId);
      update({
        status: match.status,
        currentRound: match.currentRound,
        totalRounds: match.roundsTarget,
      });

      if (match.status === 'COMPLETED') {
        const result = await api.getMatchResult(view.matchId);
        if (!result.completed) {
          return update({ phase: 'waiting-result' });
        }
        const participants = result.participants.map(participantView);
        const self = participants.find((participant) => participant.isSelf);
        const winnerId = result.youWon === true
          ? 'human-1'
          : result.winnerType === 'AI'
            ? 'scripted-opponent'
            : result.youWon === false && result.winnerType === 'HUMAN'
              ? 'human-2'
              : null;
        return update({
          phase: 'complete',
          participants,
          winnerId,
          finalResult: result,
          question: null,
          roundSummary: null,
          error: null,
          playerScore: self?.score ?? 0,
        });
      }

      const recovery = await api.getQuestionRecovery(view.matchId);
      if (recovery.status === 'FAILED') {
        return update({
          phase: 'error',
          error: recovery.lastErrorCode || 'Question generation failed.',
        });
      }
      if (match.status === 'CANCELLED') {
        return update({
          phase: 'error',
          error: 'The backend cancelled this match. No competitive result was recorded.',
        });
      }

      if (recovery.status === 'COMPLETED' && recovery.roundId && recovery.roundId !== roundId) {
        let readiness = {
          startedAt: recovery.startedAt,
          deadlineAt: recovery.deadlineAt,
        };
        if (!recovery.ready) {
          readiness = await api.markRoundReady(view.matchId, recovery.roundId);
        }
        if (!readiness.startedAt) {
          return update({ phase: 'waiting-question', error: null });
        }
        const question = await api.getRoundQuestion(
          view.matchId,
          recovery.roundId,
          view.language,
        );
        roundId = recovery.roundId;
        return update({
          phase: 'question',
          roundId,
          roundIndex: question.roundNumber - 1,
          currentRound: question.roundNumber,
          question,
          timeLimit: question.timeLimitSeconds,
          deadlineAt: question.deadlineAt,
          roundSummary: null,
          error: null,
          participants: view.participants.map((participant) => ({
            ...participant,
            answer: null,
          })),
        });
      }

      if (roundId) {
        const settlement = await api.getRoundResult(view.matchId, roundId);
        if (settlement.status === 'COMPLETED') {
          const participants = settlement.participants.map(participantView);
          const selfAnswer = settlement.participants.find((participant) => participant.isSelf)?.answer;
          if (pendingSubmission && selfAnswer) pendingSubmission = null;
          const roundSummary = participants.map((participant) => ({
            participantId: participant.id,
            decision: participant.answer?.decision === 'CORRECT' ? 'correct'
              : participant.answer?.decision === 'INCORRECT' ? 'incorrect' : null,
            points: participant.answer?.points ?? 0,
            status: participant.answer?.status ?? 'NO_RESPONSE',
            displayName: participant.displayName,
          }));
          update({
            participants,
            roundSummary,
            phase: lastPresentedRoundId === roundId
              ? view.phase
              : 'round-summary',
            error: null,
          });
          lastPresentedRoundId = roundId;
          return view;
        }
        if (settlement.status === 'VOIDED') {
          roundId = null;
          return update({ phase: 'waiting-question', question: null, error: null });
        }
        const selfAnswer = settlement.participants?.find((participant) => participant.isSelf)?.answer;
        if (pendingSubmission && selfAnswer) {
          pendingSubmission = null;
          update({ phase: 'waiting-result', error: null });
        }
        if (view.deadlineAt && Date.parse(view.deadlineAt) <= Date.now()) {
          update({ phase: 'waiting-result' });
        }
      }

      if (!recovery.roundId && !['question', 'submission-error', 'waiting-result'].includes(view.phase)) {
        update({ phase: 'waiting-question' });
      }
      return view;
    })().catch((error) => {
      const message = error instanceof Error
        ? error.message
        : 'Unable to synchronize the online match.';
      const recoverablePhases = new Set([
        'waiting-question', 'waiting-result', 'submitting', 'submission-error',
      ]);
      const deadlineExpired = view?.deadlineAt &&
        Date.parse(view.deadlineAt) <= Date.now();
      const phase = recoverablePhases.has(view?.phase)
        ? view.phase
        : view?.phase === 'question' && deadlineExpired
          ? 'waiting-result'
          : 'error';
      update({ phase, error: message });
      throw error;
    }).finally(() => {
      syncInFlight = null;
    });

    return syncInFlight;
  }

  return {
    async start({ category, language = 'en' } = {}) {
      const created = await api.createAiMatch({ category, language });
      if (!created?.id) throw new Error('Backend did not return a valid match ID.');
      view = {
        isOnline: true,
        matchId: created.id,
        mode: '1vAI',
        status: created.status,
        phase: 'waiting-question',
        language,
        currentRound: 0,
        roundIndex: 0,
        totalRounds: created.roundsTarget ?? 10,
        timeLimit: 30,
        deadlineAt: null,
        question: null,
        roundSummary: null,
        participants: [
          { id: 'human-1', type: 'human', displayName: 'YOU', score: 0, isSelf: true },
          { id: 'scripted-opponent', type: 'ai', displayName: 'NEXIRA AI', score: 0, isSelf: false },
        ],
        error: null,
      };
      roundId = null;
      lastPresentedRoundId = null;
      pendingSubmission = null;
      return refresh();
    },

    async resume(matchId, { mode = '1v1', language = 'en' } = {}) {
      if (typeof matchId !== 'string' || !matchId) throw new TypeError('A valid server match ID is required.');
      const match = await api.getMatch(matchId);
      const isOneVsOne = mode === '1v1';
      view = {
        isOnline: true, matchId, mode, status: match.status, phase: 'waiting-question', language,
        currentRound: match.currentRound ?? 0, roundIndex: Math.max(0, (match.currentRound ?? 0) - 1),
        totalRounds: match.roundsTarget ?? 10, timeLimit: 30, deadlineAt: null, question: null, roundSummary: null,
        participants: isOneVsOne
          ? [
              { id: 'human-1', type: 'human', displayName: 'YOU', score: 0, isSelf: true },
              { id: 'human-2', type: 'human', displayName: 'OPPONENT', score: 0, isSelf: false },
            ]
          : [
              { id: 'human-1', type: 'human', displayName: 'YOU', score: 0, isSelf: true },
              { id: 'scripted-opponent', type: 'ai', displayName: 'NEXIRA AI', score: 0, isSelf: false },
            ],
        error: null,
      };
      roundId = null;
      lastPresentedRoundId = null;
      pendingSubmission = null;
      return refresh();
    },

    getView: () => view,

    refresh,
    async submitAnswer(responseText) {
      const normalized = typeof responseText === 'string' ? responseText.trim() : '';
      if (!normalized || normalized.length > 2000) {
        throw new TypeError('Enter an answer between 1 and 2000 characters.');
      }
      if (!view || view.phase !== 'question' || !roundId) {
        throw new Error('There is no active online question accepting an answer.');
      }
      if (pendingSubmission && pendingSubmission.responseText !== normalized) {
        throw new Error('Retry the pending answer before submitting a different response.');
      }
      if (!pendingSubmission) {
        pendingSubmission = {
          responseText: normalized,
          idempotencyKey: createKey(),
        };
      }
      return sendPendingSubmission();
    },

    retrySubmission() {
      return sendPendingSubmission();
    },

    async continue() {
      if (!view || view.phase !== 'round-summary') {
        throw new Error('There is no completed round to continue from.');
      }
      update({
        phase: view.currentRound >= view.totalRounds ? 'waiting-result' : 'waiting-question',
        roundSummary: null,
      });
      return refresh();
    },

    reset() {
      view = null;
      roundId = null;
      lastPresentedRoundId = null;
      pendingSubmission = null;
      syncInFlight = null;
    },
  };
}
