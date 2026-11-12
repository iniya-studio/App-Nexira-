import { JudgeDecision, Prisma } from '@prisma/client';

export const FREE_TEXT_ANSWER_JUDGE = Symbol('FREE_TEXT_ANSWER_JUDGE');

export class FreeTextJudgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FreeTextJudgeError';
  }
}

export type FreeTextJudgeInput = {
  canonicalQuestion: string;
  language: string;
  expectedAnswer: string;
  gradingRubric: Prisma.JsonValue;
  participantResponse: string;
};

export type FreeTextJudgeResult = {
  decision: JudgeDecision;
  confidence: number;
  reasonCode: string;
  rationale: string;
  provider: string;
  model: string;
  policyVersion: string;
};

export interface FreeTextAnswerJudge {
  judge(input: FreeTextJudgeInput): Promise<FreeTextJudgeResult>;
}
