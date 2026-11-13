import { createHash } from 'node:crypto';
import { GeneratedQuestion, QuestionAnswerType } from './question.types';

const MAX_PROMPT_LENGTH = 2_000;
const MAX_OPTION_COUNT = 8;

export class GeneratedQuestionValidationError extends Error {
  constructor(readonly code: string) {
    super('Generated question package is invalid');
    this.name = 'GeneratedQuestionValidationError';
  }
}

export function validateGeneratedQuestion(value: unknown): GeneratedQuestion {
  const question = asRecord(value);
  if (
    !question ||
    !isNonEmptyString(question.category, 64) ||
    !isNonEmptyString(question.difficulty, 32) ||
    !isNonEmptyString(question.canonicalLanguage, 35) ||
    !isNonEmptyString(question.canonicalPrompt, MAX_PROMPT_LENGTH) ||
    !isNonEmptyString(question.answerKey, 200) ||
    !isNonEmptyString(question.contentVersion, 64) ||
    !isRecord(question.gradingRubric) ||
    !isRecord(question.localized) ||
    !Number.isSafeInteger(question.timeLimitSeconds) ||
    (question.timeLimitSeconds as number) < 1 ||
    (question.timeLimitSeconds as number) > 300 ||
    (question.answerType !== 'MULTIPLE_CHOICE' &&
      question.answerType !== 'FREE_TEXT')
  ) {
    throw new GeneratedQuestionValidationError('QUESTION_OUTPUT_INVALID');
  }

  const answerType = question.answerType as QuestionAnswerType;
  const rubric = asRecord(question.gradingRubric);
  if (
    answerType === 'FREE_TEXT' &&
    (!Array.isArray(rubric?.requiredConcepts) ||
      rubric.requiredConcepts.length === 0 ||
      !rubric.requiredConcepts.every((concept) =>
        isNonEmptyString(concept, 200),
      ))
  ) {
    throw new GeneratedQuestionValidationError('QUESTION_RUBRIC_INVALID');
  }

  let canonicalOptions: GeneratedQuestion['canonicalOptions'];
  if (answerType === 'MULTIPLE_CHOICE') {
    if (
      !Array.isArray(question.canonicalOptions) ||
      question.canonicalOptions.length < 2 ||
      question.canonicalOptions.length > MAX_OPTION_COUNT
    ) {
      throw new GeneratedQuestionValidationError('QUESTION_OPTIONS_INVALID');
    }

    canonicalOptions = question.canonicalOptions.map((value) => {
      const option = asRecord(value);
      if (
        !option ||
        !isNonEmptyString(option.id, 64) ||
        !isNonEmptyString(option.text, MAX_PROMPT_LENGTH)
      ) {
        throw new GeneratedQuestionValidationError('QUESTION_OPTIONS_INVALID');
      }
      return { id: option.id, text: option.text };
    });

    const optionIds = canonicalOptions.map((option) => option.id);
    if (
      new Set(optionIds).size !== optionIds.length ||
      !optionIds.includes(question.answerKey as string)
    ) {
      throw new GeneratedQuestionValidationError('QUESTION_ANSWER_KEY_INVALID');
    }
  } else {
    if (question.canonicalOptions !== null) {
      throw new GeneratedQuestionValidationError('QUESTION_OPTIONS_INVALID');
    }
    canonicalOptions = null;
  }

  const localized = question.localized as Record<string, unknown>;
  const canonicalLocalized = asRecord(
    localized[question.canonicalLanguage as string],
  );
  if (
    !canonicalLocalized ||
    !isNonEmptyString(canonicalLocalized.prompt, MAX_PROMPT_LENGTH)
  ) {
    throw new GeneratedQuestionValidationError('QUESTION_LOCALIZATION_INVALID');
  }
  if (answerType === 'MULTIPLE_CHOICE') {
    const localizedOptions = asRecord(canonicalLocalized.options);
    if (
      !localizedOptions ||
      !canonicalOptions?.every((option) =>
        isNonEmptyString(localizedOptions[option.id], MAX_PROMPT_LENGTH),
      )
    ) {
      throw new GeneratedQuestionValidationError(
        'QUESTION_LOCALIZATION_INVALID',
      );
    }
  }

  const validated: GeneratedQuestion = {
    category: question.category as string,
    difficulty: question.difficulty as string,
    canonicalLanguage: question.canonicalLanguage as string,
    answerType,
    canonicalPrompt: question.canonicalPrompt as string,
    canonicalOptions,
    answerKey: question.answerKey as string,
    gradingRubric: question.gradingRubric as GeneratedQuestion['gradingRubric'],
    localized: question.localized as GeneratedQuestion['localized'],
    timeLimitSeconds: question.timeLimitSeconds as number,
    contentVersion: question.contentVersion as string,
    contentFingerprint:
      typeof question.contentFingerprint === 'string'
        ? question.contentFingerprint
        : undefined,
    generatorVersion:
      typeof question.generatorVersion === 'string'
        ? question.generatorVersion
        : undefined,
    modelVersion:
      typeof question.modelVersion === 'string'
        ? question.modelVersion
        : undefined,
    generationPolicyVersion:
      typeof question.generationPolicyVersion === 'string'
        ? question.generationPolicyVersion
        : undefined,
    judgeVersion:
      typeof question.judgeVersion === 'string'
        ? question.judgeVersion
        : undefined,
  };
  if (
    (validated.generatorVersion !== undefined &&
      !validated.generatorVersion.trim()) ||
    (validated.modelVersion !== undefined && !validated.modelVersion.trim()) ||
    (validated.generationPolicyVersion !== undefined &&
      !validated.generationPolicyVersion.trim())
  ) {
    throw new GeneratedQuestionValidationError('QUESTION_VERSION_INVALID');
  }
  if (
    validated.contentFingerprint !== undefined &&
    (!/^[a-f0-9]{64}$/i.test(validated.contentFingerprint) ||
      validated.contentFingerprint !== normalizedQuestionFingerprint(validated))
  ) {
    throw new GeneratedQuestionValidationError('QUESTION_FINGERPRINT_INVALID');
  }
  return validated;
}

export function normalizedQuestionFingerprint(question: {
  canonicalLanguage: string;
  answerType: QuestionAnswerType | string;
  canonicalPrompt: string;
  canonicalOptions: unknown;
}): string {
  const options = Array.isArray(question.canonicalOptions)
    ? question.canonicalOptions
        .map((value) => {
          const option = asRecord(value);
          return typeof option?.text === 'string'
            ? normalizeContent(option.text)
            : '';
        })
        .sort()
    : [];
  const canonicalContent = JSON.stringify([
    question.canonicalLanguage.trim().toLowerCase(),
    question.answerType,
    normalizeContent(question.canonicalPrompt),
    options,
  ]);
  return createHash('sha256').update(canonicalContent).digest('hex');
}

function normalizeContent(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim();
}

function isNonEmptyString(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}
