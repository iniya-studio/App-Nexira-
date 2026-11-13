export const AI_OPPONENT_ANSWER = Symbol('AI_OPPONENT_ANSWER');

export type AiOpponentOption = { id: string; text: string };

export type AiOpponentAnswerInput = {
  answerType: 'MULTIPLE_CHOICE' | 'FREE_TEXT';
  question: string;
  options: AiOpponentOption[];
};

export interface AiOpponentAnswer {
  generateAnswer(input: AiOpponentAnswerInput): Promise<string>;
}
