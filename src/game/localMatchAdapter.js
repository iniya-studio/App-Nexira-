import {
  createMatch,
  getPublicQuestion,
  recordMatchResult,
  startMatch,
} from './match.js';
import { getQuestionCopy } from '../i18n.js';

function createQuestionPackages(category, matchId) {
  if (!category || !Array.isArray(category.questions) || category.questions.length === 0) {
    throw new TypeError('A competitive match requires a category with questions.');
  }

  return category.questions.map((question, roundIndex) => {
    const persian = getQuestionCopy('fa', category.id, roundIndex, question);
    return {
      questionId: `${matchId}-question-${roundIndex + 1}`,
      matchId,
      roundIndex,
      canonicalLanguage: 'en',
      canonicalPrompt: question.prompt,
      canonicalOptions: question.options.map((option, index) => ({
        id: `option-${index}`,
        text: option,
      })),
      answerType: 'multiple_choice',
      answerKey: `option-${question.answer}`,
      gradingRubric: { type: 'exact-option-id' },
      localized: {
        en: {
          prompt: question.prompt,
          options: question.options.map((text, index) => ({ id: `option-${index}`, text })),
        },
        fa: {
          prompt: persian.prompt,
          options: persian.options.map((text, index) => ({ id: `option-${index}`, text })),
        },
      },
      timeLimit: 10,
      contentVersion: 'local-category-v1',
    };
  });
}

function answerSummary(participant, roundIndex) {
  const answer = participant.answers.find((item) => item.roundIndex === roundIndex);
  return answer ? {
    participantId: participant.id,
    decision: answer.decision,
    points: answer.points,
  } : null;
}

function scriptedOpponentOption(question, roundIndex) {
  const options = question.canonicalOptions;
  if (options.length === 0) throw new TypeError('The scripted opponent requires multiple-choice options.');
  // Deliberately deterministic preview behavior; this is not an AI service.
  return options[(roundIndex + 1) % options.length].id;
}

function createView(match, phase, roundSummary, activeParticipantId) {
  const participants = match.participants.map(({ id, type, score, consecutiveNoResponses }) => ({
    id,
    type,
    score,
    consecutiveNoResponses,
    displayName: type === 'ai'
      ? 'Scripted opponent · preview'
      : id === 'human-1' ? 'Player 1' : 'Player 2',
  }));
  const question = phase === 'question' && activeParticipantId
    ? getPublicQuestion(match, activeParticipantId)
    : null;

  return {
    matchId: match.matchId,
    mode: match.mode,
    status: match.status,
    phase,
    roundIndex: match.roundIndex,
    totalRounds: match.questionPackages.length,
    participants,
    activeParticipantId,
    question,
    roundSummary,
    winnerId: match.winnerId,
    endReason: match.endReason,
    forfeitTransfer: match.forfeitTransfer
      ? { points: match.forfeitTransfer.points }
      : null,
    timeLimit: match.timeLimit,
  };
}

export function createLocalMatchAdapter() {
  let match = null;
  let phase = 'idle';
  let roundSummary = null;

  function getCurrentParticipantId() {
    if (!match) return null;
    return match.participants.find(({ answers }) => answers.length === match.roundIndex)?.id ?? null;
  }

  function getView() {
    if (!match) return null;
    return createView(match, phase, roundSummary, getCurrentParticipantId());
  }

  function adjudicateOption(optionId) {
    const question = match.questionPackages[match.roundIndex];
    if (!question.canonicalOptions.some(({ id }) => id === optionId)) {
      throw new RangeError('The selected option does not belong to the current question.');
    }
    return {
      decision: question.answerKey === optionId ? 'correct' : 'incorrect',
      confidence: 1,
    };
  }

  function collectRoundSummary(roundIndex) {
    roundSummary = match.participants
      .map((participant) => answerSummary(participant, roundIndex))
      .filter(Boolean);
  }

  function finishSubmission(previousRoundIndex, participantId, result) {
    match = recordMatchResult(match, participantId, result);
    if (match.status === 'complete') {
      phase = 'complete';
      collectRoundSummary(previousRoundIndex);
      return;
    }

    const roundComplete = match.roundIndex !== previousRoundIndex;
    if (roundComplete) {
      collectRoundSummary(previousRoundIndex);
      phase = 'round-summary';
    } else if (match.mode === '1v1') {
      phase = 'handoff';
    }
  }

  return {
    start({ category, mode, matchId, language = 'en' }) {
      if (!['1v1', '1vAI'].includes(mode)) throw new TypeError('Unsupported competitive match mode.');
      if (typeof matchId !== 'string' || !matchId.trim()) throw new TypeError('A match ID is required.');

      const participants = mode === '1v1'
        ? [
          { id: 'human-1', type: 'human', language },
          { id: 'human-2', type: 'human', language },
        ]
        : [
          { id: 'human-1', type: 'human', language },
          { id: 'scripted-opponent', type: 'ai', language },
        ];
      match = startMatch(createMatch({
        matchId,
        mode,
        participants,
        questionPackages: createQuestionPackages(category, matchId),
        timeLimit: 10,
      }));
      phase = 'question';
      roundSummary = null;
      return getView();
    },

    getView,

    continue() {
      if (!match || !['handoff', 'round-summary'].includes(phase)) {
        throw new RangeError('There is no match transition to continue.');
      }
      phase = 'question';
      return getView();
    },

    submitOption(optionId, elapsedMs) {
      if (!match || match.status !== 'active' || phase !== 'question') {
        throw new RangeError('There is no active question accepting an answer.');
      }
      const participantId = getCurrentParticipantId();
      if (!participantId || match.participants.find(({ id }) => id === participantId).type !== 'human') {
        throw new RangeError('It is not a human participant’s turn.');
      }

      const previousRoundIndex = match.roundIndex;
      const result = {
        status: 'answered',
        adjudication: adjudicateOption(optionId),
        elapsedMs,
      };
      finishSubmission(previousRoundIndex, participantId, result);

      if (match.status === 'active' && match.mode === '1vAI') {
        const opponent = match.participants.find(({ type }) => type === 'ai');
        const question = match.questionPackages[match.roundIndex];
        const opponentOption = scriptedOpponentOption(question, match.roundIndex);
        finishSubmission(previousRoundIndex, opponent.id, {
          status: 'answered',
          adjudication: adjudicateOption(opponentOption),
          elapsedMs: Math.min(2000, match.timeLimit * 1000),
        });
      }

      return getView();
    },

    submitNoResponse() {
      if (!match || match.status !== 'active' || phase !== 'question') {
        throw new RangeError('There is no active question accepting a timeout.');
      }
      const participantId = getCurrentParticipantId();
      if (!participantId || match.participants.find(({ id }) => id === participantId).type !== 'human') {
        throw new RangeError('It is not a human participant’s turn.');
      }

      const previousRoundIndex = match.roundIndex;
      finishSubmission(previousRoundIndex, participantId, { status: 'no-response' });
      if (match.status === 'active' && match.mode === '1vAI') {
        const opponent = match.participants.find(({ type }) => type === 'ai');
        const question = match.questionPackages[match.roundIndex];
        finishSubmission(previousRoundIndex, opponent.id, {
          status: 'answered',
          adjudication: adjudicateOption(scriptedOpponentOption(question, match.roundIndex)),
          elapsedMs: Math.min(2000, match.timeLimit * 1000),
        });
      }
      return getView();
    },

    reset() {
      match = null;
      phase = 'idle';
      roundSummary = null;
    },
  };
}
