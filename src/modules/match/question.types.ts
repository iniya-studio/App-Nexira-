import { Prisma } from '@prisma/client';

export type CanonicalOption = {
  id: string;
  text: string;
};

export type QuestionAnswerType = 'MULTIPLE_CHOICE' | 'FREE_TEXT';

export type GeneratedQuestion = {
  category: string;
  difficulty: string;
  canonicalLanguage: string;
  answerType: QuestionAnswerType;
  canonicalPrompt: string;
  canonicalOptions: CanonicalOption[] | null;
  answerKey: string;
  gradingRubric: Prisma.InputJsonValue;
  localized: Prisma.InputJsonValue;
  timeLimitSeconds: number;
  contentVersion: string;
  contentFingerprint?: string;
  generatorVersion?: string;
  modelVersion?: string;
  generationPolicyVersion?: string;
  judgeVersion?: string;
};

export type PublicQuestionOption = {
  id: string;
  text: string;
};

export type PublicRoundQuestion = {
  matchId: string;
  roundId: string;
  roundNumber: number;
  questionId: string;
  answerType: string;
  prompt: string;
  options: PublicQuestionOption[];
  timeLimitSeconds: number;
  startedAt: Date;
  deadlineAt: Date;
};
