import { scoreAnswer } from './scoring.js';

const NO_RESPONSE_PENALTIES = [-5, -5, -10];
const FORFEIT_TRANSFER_POINTS = 20;
const DECISIONS = ['correct', 'incorrect', 'uncertain'];
const ANSWER_TYPES = ['multiple_choice', 'free_text'];

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validConfidence(value) {
  return value === null
    || (Number.isFinite(value) && value >= 0 && value <= 1);
}

function validOptions(options, allowEmpty = false) {
  if (!Array.isArray(options) || (!allowEmpty && options.length < 2)) return false;
  if (allowEmpty && options.length === 0) return true;
  return options.every((option) =>
    nonEmptyString(option?.id) && nonEmptyString(option?.text))
    && new Set(options.map(({ id }) => id)).size === options.length;
}

/**
 * A private server-side package. Never send this object to a player.
 * Localized options must preserve the canonical option IDs and order.
 */
function isQuestionPackage(question, expectedMatchId, expectedRoundIndex) {
  if (!question || typeof question !== 'object'
      || !nonEmptyString(question.questionId)
      || question.matchId !== expectedMatchId
      || question.roundIndex !== expectedRoundIndex
      || !nonEmptyString(question.canonicalLanguage)
      || !nonEmptyString(question.canonicalPrompt)
      || !ANSWER_TYPES.includes(question.answerType)
      || !Number.isFinite(question.timeLimit)
      || question.timeLimit <= 0
      || !nonEmptyString(question.contentVersion)
      || !question.gradingRubric
      || typeof question.gradingRubric !== 'object'
      || !question.localized
      || typeof question.localized !== 'object'
      || Array.isArray(question.localized)
      || !Object.hasOwn(question.localized, question.canonicalLanguage)) return false;

  if (question.answerType === 'multiple_choice') {
    if (!validOptions(question.canonicalOptions)
        || !nonEmptyString(question.answerKey)
        || !question.canonicalOptions.some(({ id }) => id === question.answerKey)) return false;
  } else if (!validOptions(question.canonicalOptions, true)
      || !nonEmptyString(question.answerKey)) {
    return false;
  }

  const canonicalIds = question.canonicalOptions.map(({ id }) => id);
  for (const localized of Object.values(question.localized)) {
    if (!nonEmptyString(localized?.prompt) || !Array.isArray(localized.options)) return false;
    if (question.answerType === 'multiple_choice') {
      if (!validOptions(localized.options)
          || localized.options.length !== canonicalIds.length
          || localized.options.some((option, index) => option.id !== canonicalIds[index])) return false;
    } else if (localized.options.length !== 0) {
      return false;
    }
  }

  return true;
}

function validSetup({ matchId, mode, participants, questionPackages, timeLimit } = {}) {
  if (!nonEmptyString(matchId)
      || !['1v1', '1vAI'].includes(mode)
      || !Array.isArray(participants)
      || participants.length !== 2
      || !Array.isArray(questionPackages)
      || questionPackages.length === 0
      || !Number.isFinite(timeLimit)
      || timeLimit <= 0) return false;

  if (!participants.every((participant) =>
    nonEmptyString(participant?.id)
      && ['human', 'ai'].includes(participant.type)
      && nonEmptyString(participant.language || 'en'))) return false;

  if (new Set(participants.map(({ id }) => id)).size !== 2) return false;
  if (new Set(questionPackages.map(({ questionId }) => questionId)).size
      !== questionPackages.length) return false;

  const humanCount = participants.filter(({ type }) => type === 'human').length;
  const aiCount = participants.filter(({ type }) => type === 'ai').length;
  if (mode === '1v1' ? humanCount !== 2 : humanCount !== 1 || aiCount !== 1) return false;

  return questionPackages.every((question, index) =>
    isQuestionPackage(question, matchId, index)
      && question.timeLimit === timeLimit);
}

function clonePackage(question) {
  return {
    ...question,
    canonicalOptions: question.canonicalOptions.map((option) => ({ ...option })),
    gradingRubric: structuredClone(question.gradingRubric),
    localized: Object.fromEntries(Object.entries(question.localized).map(([language, value]) => [
      language,
      {
        prompt: value.prompt,
        options: value.options.map((option) => ({ ...option })),
      },
    ])),
  };
}

export function createMatch(setup) {
  if (!validSetup(setup)) {
    throw new TypeError('A match requires valid participants and private question packages.');
  }

  return {
    matchId: setup.matchId,
    mode: setup.mode,
    participants: setup.participants.map(({ id, type, language = 'en' }) => ({
      id,
      type,
      language,
      score: 0,
      consecutiveNoResponses: 0,
      answers: [],
    })),
    // Private server state. Do not serialize this whole match to player clients.
    questionPackages: setup.questionPackages.map(clonePackage),
    timeLimit: setup.timeLimit,
    status: 'ready',
    roundIndex: 0,
    winnerId: null,
    endReason: null,
    forfeitTransfer: null,
  };
}

/**
 * Build the safe, player-specific view. answerKey and gradingRubric are
 * deliberately excluded. A real backend must enforce this boundary.
 */
export function getPublicQuestion(match, participantId, language) {
  if (!isValidMatch(match)) throw new TypeError('Invalid match state.');
  if (!['ready', 'active'].includes(match.status)) {
    throw new RangeError('There is no active question to display.');
  }

  const participant = match.participants.find(({ id }) => id === participantId);
  if (!participant) throw new RangeError('Unknown match participant.');

  const question = match.questionPackages[match.roundIndex];
  const requestedLanguage = language || participant.language;
  const localized = question.localized[requestedLanguage]
    || question.localized[question.canonicalLanguage];

  return {
    questionId: question.questionId,
    roundIndex: question.roundIndex,
    answerType: question.answerType,
    prompt: localized.prompt,
    options: localized.options.map(({ id, text }) => ({ id, text })),
    timeLimit: question.timeLimit,
    language: question.localized[requestedLanguage]
      ? requestedLanguage
      : question.canonicalLanguage,
  };
}

function expectedAnswer(answer, previousStreak, timeLimit) {
  if (answer.status === 'no-response') {
    const streak = previousStreak + 1;
    if (streak > NO_RESPONSE_PENALTIES.length
        || answer.decision !== null
        || answer.confidence !== null
        || !Number.isFinite(answer.elapsedMs)
        || answer.elapsedMs < timeLimit * 1000
        || answer.speedBonus !== 0
        || answer.points !== NO_RESPONSE_PENALTIES[streak - 1]
        || answer.consecutiveNoResponses !== streak) return null;
    return { streak, points: answer.points };
  }

  if (answer.status !== 'answered'
      || !DECISIONS.includes(answer.decision)
      || !validConfidence(answer.confidence)
      || !Number.isFinite(answer.elapsedMs)
      || answer.elapsedMs < 0
      || answer.elapsedMs > timeLimit * 1000
      || answer.consecutiveNoResponses !== 0) return null;

  const scoring = scoreAnswer(answer.decision === 'correct', answer.elapsedMs / 1000);
  if (answer.speedBonus !== scoring.speedBonus || answer.points !== scoring.total) return null;
  return { streak: 0, points: answer.points };
}

export function isValidMatch(match) {
  if (!match || typeof match !== 'object'
      || !nonEmptyString(match.matchId)
      || !['1v1', '1vAI'].includes(match.mode)
      || !Array.isArray(match.participants)
      || !Array.isArray(match.questionPackages)
      || match.questionPackages.length === 0
      || !Number.isFinite(match.timeLimit)
      || match.timeLimit <= 0
      || !Number.isInteger(match.roundIndex)
      || !['ready', 'active', 'complete'].includes(match.status)
      || !Object.hasOwn(match, 'winnerId')
      || !Object.hasOwn(match, 'endReason')
      || !Object.hasOwn(match, 'forfeitTransfer')) return false;

  const setup = {
    matchId: match.matchId,
    mode: match.mode,
    participants: match.participants,
    questionPackages: match.questionPackages,
    timeLimit: match.timeLimit,
  };
  if (!validSetup(setup)) return false;

  const answerLengths = [];
  for (const participant of match.participants) {
    if (!Number.isSafeInteger(participant.score)
        || !Array.isArray(participant.answers)
        || !Number.isInteger(participant.consecutiveNoResponses)
        || participant.consecutiveNoResponses < 0) return false;

    let calculatedScore = 0;
    let streak = 0;
    for (let index = 0; index < participant.answers.length; index += 1) {
      const answer = participant.answers[index];
      if (!answer || answer.roundIndex !== index || index >= match.questionPackages.length) return false;
      const expected = expectedAnswer(answer, streak, match.timeLimit);
      if (!expected) return false;
      if (expected.streak === NO_RESPONSE_PENALTIES.length
          && !(match.status === 'complete'
            && match.endReason === 'three-consecutive-no-responses'
            && match.forfeitTransfer?.fromParticipantId === participant.id
            && index === participant.answers.length - 1
            && index === match.roundIndex)) return false;
      calculatedScore += expected.points;
      streak = expected.streak;
    }

    if (match.forfeitTransfer?.toParticipantId === participant.id) {
      calculatedScore += FORFEIT_TRANSFER_POINTS;
    }
    if (!Number.isSafeInteger(calculatedScore)
        || participant.score !== calculatedScore
        || participant.consecutiveNoResponses !== streak) return false;

    answerLengths.push(participant.answers.length);
  }

  if (match.status === 'ready') {
    return match.roundIndex === 0
      && answerLengths.every((length) => length === 0)
      && match.participants.every(({ score, consecutiveNoResponses }) =>
        score === 0 && consecutiveNoResponses === 0)
      && match.winnerId === null
      && match.endReason === null
      && match.forfeitTransfer === null;
  }

  if (match.status === 'active') {
    return match.roundIndex >= 0
      && match.roundIndex < match.questionPackages.length
      && answerLengths.every((length) =>
        length === match.roundIndex || length === match.roundIndex + 1)
      && answerLengths.some((length) => length === match.roundIndex)
      && match.participants.every(({ consecutiveNoResponses }) =>
        consecutiveNoResponses < NO_RESPONSE_PENALTIES.length)
      && match.winnerId === null
      && match.endReason === null
      && match.forfeitTransfer === null;
  }

  if (match.roundIndex < 0 || match.roundIndex >= match.questionPackages.length) return false;

  if (match.endReason === 'questions-complete') {
    const [first, second] = match.participants;
    const expectedWinner = first.score === second.score
      ? null
      : first.score > second.score ? first.id : second.id;
    return match.roundIndex === match.questionPackages.length - 1
      && answerLengths.every((length) => length === match.questionPackages.length)
      && match.participants.every(({ consecutiveNoResponses }) =>
        consecutiveNoResponses < NO_RESPONSE_PENALTIES.length)
      && match.forfeitTransfer === null
      && match.winnerId === expectedWinner;
  }

  if (match.endReason !== 'three-consecutive-no-responses'
      || !match.forfeitTransfer
      || match.forfeitTransfer.points !== FORFEIT_TRANSFER_POINTS
      || match.forfeitTransfer.fromParticipantId === match.forfeitTransfer.toParticipantId
      || match.winnerId !== match.forfeitTransfer.toParticipantId
      || !match.participants.some(({ id }) => id === match.forfeitTransfer.fromParticipantId)
      || !match.participants.some(({ id }) => id === match.forfeitTransfer.toParticipantId)
      || !answerLengths.every((length) =>
        length === match.roundIndex || length === match.roundIndex + 1)) return false;

  const forfeiter = match.participants.find(({ id }) =>
    id === match.forfeitTransfer.fromParticipantId);
  const recipient = match.participants.find(({ id }) =>
    id === match.forfeitTransfer.toParticipantId);
  const finalAnswer = forfeiter.answers.at(-1);

  return forfeiter.answers.length === match.roundIndex + 1
    && finalAnswer?.roundIndex === match.roundIndex
    && finalAnswer.status === 'no-response'
    && finalAnswer.consecutiveNoResponses === NO_RESPONSE_PENALTIES.length
    && recipient.score === recipient.answers.reduce((total, answer) => total + answer.points, 0)
      + FORFEIT_TRANSFER_POINTS;
}

function requireValidMatch(match) {
  if (!isValidMatch(match)) throw new TypeError('Invalid match state.');
}

export function startMatch(match) {
  requireValidMatch(match);
  if (match.status !== 'ready') throw new RangeError('Only a ready match can be started.');
  return { ...match, status: 'active' };
}

/**
 * result:
 *   { status: 'answered', adjudication: { decision, confidence? }, elapsedMs }
 *   { status: 'no-response', elapsedMs } // trusted clock elapsed time >= timeLimit
 *
 * adjudication and timeout timing must come from trusted server-side services,
 * not directly from an untrusted player client.
 */
export function recordMatchResult(match, participantId, result) {
  requireValidMatch(match);
  if (match.status !== 'active') {
    throw new RangeError('Results can only be recorded during an active match.');
  }

  const participantIndex = match.participants.findIndex(({ id }) => id === participantId);
  if (participantIndex < 0) throw new RangeError('Unknown match participant.');

  const participant = match.participants[participantIndex];
  if (participant.answers.length !== match.roundIndex) {
    throw new RangeError('This participant has already submitted a result for the current round.');
  }

  const noResponse = result?.status === 'no-response';
  const decision = result?.adjudication?.decision;
  const elapsedValid = Number.isFinite(result?.elapsedMs)
    && result.elapsedMs >= 0
    && result.elapsedMs <= match.timeLimit * 1000;
  const timeoutElapsedValid = Number.isFinite(result?.elapsedMs)
    && result.elapsedMs >= match.timeLimit * 1000;
  const answered = result?.status === 'answered'
    && DECISIONS.includes(decision)
    && elapsedValid;

  if ((!noResponse && !answered) || (noResponse && !timeoutElapsedValid)) {
    throw new TypeError('A result must contain a trusted Judge decision within the time limit, or a trusted timeout recorded after the time limit.');
  }

  if (answered && result.adjudication.confidence !== undefined
      && !validConfidence(result.adjudication.confidence)) {
    throw new TypeError('Judge confidence must be between 0 and 1.');
  }

  const streak = noResponse ? participant.consecutiveNoResponses + 1 : 0;
  const scoring = noResponse
    ? { points: NO_RESPONSE_PENALTIES[streak - 1], speedBonus: 0 }
    : scoreAnswer(decision === 'correct', result.elapsedMs / 1000);

  const answer = {
    roundIndex: match.roundIndex,
    status: noResponse ? 'no-response' : 'answered',
    decision: noResponse ? null : decision,
    confidence: noResponse ? null : (result.adjudication.confidence ?? null),
    elapsedMs: result.elapsedMs,
    points: noResponse ? scoring.points : scoring.total,
    speedBonus: scoring.speedBonus,
    consecutiveNoResponses: streak,
  };

  const updatedParticipant = {
    ...participant,
    score: participant.score + answer.points,
    consecutiveNoResponses: streak,
    answers: [...participant.answers, answer],
  };
  const participants = [...match.participants];
  participants[participantIndex] = updatedParticipant;

  if (noResponse && streak === NO_RESPONSE_PENALTIES.length) {
    const opponent = participants.find(({ id }) => id !== participantId);
    const opponentIndex = participants.findIndex(({ id }) => id === opponent.id);
    participants[opponentIndex] = {
      ...opponent,
      score: opponent.score + FORFEIT_TRANSFER_POINTS,
    };
    return {
      ...match,
      participants,
      status: 'complete',
      winnerId: opponent.id,
      endReason: 'three-consecutive-no-responses',
      forfeitTransfer: {
        fromParticipantId: participantId,
        toParticipantId: opponent.id,
        points: FORFEIT_TRANSFER_POINTS,
      },
    };
  }

  const allSubmitted = participants.every(({ answers }) =>
    answers.length === match.roundIndex + 1);
  if (!allSubmitted) return { ...match, participants };

  if (match.roundIndex === match.questionPackages.length - 1) {
    const [first, second] = participants;
    return {
      ...match,
      participants,
      status: 'complete',
      winnerId: first.score === second.score
        ? null
        : first.score > second.score ? first.id : second.id,
      endReason: 'questions-complete',
    };
  }

  return { ...match, participants, roundIndex: match.roundIndex + 1 };
}
