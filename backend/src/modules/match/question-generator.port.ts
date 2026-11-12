import { GeneratedQuestion, QuestionAnswerType } from './question.types';

export const QUESTION_GENERATOR = Symbol('QUESTION_GENERATOR');

export type QuestionGenerationInput = {
  category: string;
  difficulty: string;
  language: string;
  answerType: QuestionAnswerType;
  timeLimitSeconds: number;
  excludedQuestionIds: string[];
  excludedQuestionFingerprints: string[];
};

export class QuestionGenerationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'QuestionGenerationError';
  }
}

export interface QuestionGenerator {
  generate(input: QuestionGenerationInput): Promise<GeneratedQuestion>;
}
