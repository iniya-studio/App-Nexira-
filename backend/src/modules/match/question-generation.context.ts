import { Prisma } from '@prisma/client';
import { isTargetLocale, normalizeLocaleCode } from '../../common/localization/locale-registry';
import { QuestionGenerationInput } from './question-generator.port';
import { normalizedQuestionFingerprint } from './question-validation';

export async function questionGenerationInputForMatch(
  tx: Prisma.TransactionClient,
  matchId: string,
  settings: Pick<
    QuestionGenerationInput,
    'category' | 'difficulty' | 'language' | 'answerType' | 'timeLimitSeconds'
  >,
): Promise<QuestionGenerationInput> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: { participants: { select: { participantKey: true, participantType: true, language: true } } },
  });
  if (!match || match.participants.length === 0) {
    throw new Error('Question generation match participants are unavailable');
  }

  const participantKeys = match.participants.map(
    (participant) => participant.participantKey,
  );
  const humanParticipants = match.participants.filter((participant) => participant.participantType === 'HUMAN');
  const participantLocales = humanParticipants.map((participant) => participant.language);
  const validParticipantLocales = participantLocales.map((locale) =>
    typeof locale === 'string' && locale.trim().length > 0
      ? normalizeLocaleCode(locale)
      : null,
  );
  if (
    participantLocales.length === 0 ||
    validParticipantLocales.some((locale) => locale === null || !isTargetLocale(locale))
  ) {
    throw new Error('Human participant locale snapshots are invalid');
  }
  const requiredLocales = [...new Set(validParticipantLocales as string[])].sort();
  const language = normalizeLocaleCode(settings.language);
  if (!isTargetLocale(language) || !requiredLocales.includes(language)) {
    throw new Error('Question generation language is not a participant target locale');
  }
  const possibleRematches = await tx.match.findMany({
    where: {
      id: { not: matchId },
      participants: { some: { participantKey: { in: participantKeys } } },
    },
    select: {
      id: true,
      participants: { select: { participantKey: true } },
    },
  });
  const expectedKeys = new Set(participantKeys);
  const rematchIds = possibleRematches
    .filter(
      (candidate) =>
        candidate.participants.length === expectedKeys.size &&
        candidate.participants.every((participant) =>
          expectedKeys.has(participant.participantKey),
        ),
    )
    .map((candidate) => candidate.id);

  const rounds = await tx.round.findMany({
    where: { matchId: { in: [matchId, ...rematchIds] } },
    select: {
      question: {
        select: {
          id: true,
          canonicalLanguage: true,
          answerType: true,
          canonicalPrompt: true,
          canonicalOptions: true,
          contentFingerprint: true,
        },
      },
    },
  });

  const excludedQuestionIds = new Set<string>();
  const excludedQuestionFingerprints = new Set<string>();
  for (const { question } of rounds) {
    if (!question) continue;
    excludedQuestionIds.add(question.id);
    excludedQuestionFingerprints.add(
      question.contentFingerprint ?? normalizedQuestionFingerprint(question),
    );
  }

  return {
    ...settings,
    language,
    requiredLocales,
    excludedQuestionIds: [...excludedQuestionIds],
    excludedQuestionFingerprints: [...excludedQuestionFingerprints],
  };
}

export function parseQuestionGenerationInput(
  value: Prisma.JsonValue,
): QuestionGenerationInput {
  const context = asRecord(value);
  if (
    !context ||
    typeof context.category !== 'string' ||
    typeof context.difficulty !== 'string' ||
    typeof context.language !== 'string' ||
    !Array.isArray(context.requiredLocales) ||
    context.requiredLocales.length === 0 ||
    !context.requiredLocales.every((locale) => typeof locale === 'string' && locale.trim().length > 0) ||
    new Set(context.requiredLocales).size !== context.requiredLocales.length ||
    !context.requiredLocales.includes(context.language) ||
    (context.answerType !== 'MULTIPLE_CHOICE' &&
      context.answerType !== 'FREE_TEXT') ||
    typeof context.timeLimitSeconds !== 'number' ||
    !Array.isArray(context.excludedQuestionIds) ||
    !context.excludedQuestionIds.every((id) => typeof id === 'string') ||
    !Array.isArray(context.excludedQuestionFingerprints) ||
    !context.excludedQuestionFingerprints.every(
      (fingerprint) => typeof fingerprint === 'string',
    )
  ) {
    throw new Error('Persisted question generation context is invalid');
  }

  return {
    category: context.category,
    difficulty: context.difficulty,
    language: context.language,
    requiredLocales: [...new Set(context.requiredLocales as string[])].sort(),
    answerType: context.answerType,
    timeLimitSeconds: context.timeLimitSeconds,
    excludedQuestionIds: context.excludedQuestionIds,
    excludedQuestionFingerprints: context.excludedQuestionFingerprints,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
