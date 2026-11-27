import { AnswerStatus, JudgeDecision, JudgeStatus } from '@prisma/client';

export const QUICK_BATTLE_SCORING_POLICY_VERSION = 'quick-battle-score-v1';
export const QUICK_BATTLE_BASE_POINTS = 100;
export const QUICK_BATTLE_MAX_SPEED_BONUS = 50;
export const QUICK_BATTLE_MAX_ROUND_POINTS = 150;
export const QUICK_BATTLE_MAX_MATCH_POINTS = 1500;

export type QuickBattleRoundScoreInput = {
  status: AnswerStatus;
  judgeStatus: JudgeStatus;
  decision: JudgeDecision | null;
  elapsedMs: number;
  timeLimitSeconds: number;
};

export type QuickBattleRoundScore = {
  points: number;
  outcome: 'CORRECT' | 'INCORRECT' | 'NO_RESPONSE';
};

export class QuickBattleScoringIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuickBattleScoringIntegrityError';
  }
}

export function calculateQuickBattleRoundScore(
  input: QuickBattleRoundScoreInput,
): QuickBattleRoundScore {
  if (input.status === AnswerStatus.NO_RESPONSE) {
    if (input.judgeStatus !== JudgeStatus.NOT_REQUIRED || input.decision !== null ||
        !Number.isSafeInteger(input.timeLimitSeconds) || input.timeLimitSeconds <= 0 ||
        input.elapsedMs !== input.timeLimitSeconds * 1000) {
      throw new QuickBattleScoringIntegrityError('NO_RESPONSE answer has an inconsistent state or timing');
    }
    return { points: 0, outcome: 'NO_RESPONSE' };
  }

  if (input.status !== AnswerStatus.ANSWERED || input.judgeStatus !== JudgeStatus.COMPLETED ||
      (input.decision !== JudgeDecision.CORRECT && input.decision !== JudgeDecision.INCORRECT)) {
    throw new QuickBattleScoringIntegrityError('Quick Battle answer is not in a terminal scoreable state');
  }

  if (!Number.isSafeInteger(input.timeLimitSeconds) || input.timeLimitSeconds <= 0 ||
      !Number.isSafeInteger(input.elapsedMs) || input.elapsedMs < 0 ||
      input.elapsedMs >= input.timeLimitSeconds * 1000) {
    throw new QuickBattleScoringIntegrityError('Quick Battle answer timing is invalid');
  }

  if (input.decision === JudgeDecision.INCORRECT) {
    return { points: 0, outcome: 'INCORRECT' };
  }

  const totalMs = input.timeLimitSeconds * 1000;
  const remainingMs = totalMs - input.elapsedMs;
  const speedBonus = Number((BigInt(QUICK_BATTLE_MAX_SPEED_BONUS) * BigInt(remainingMs)) / BigInt(totalMs));
  return { points: QUICK_BATTLE_BASE_POINTS + speedBonus, outcome: 'CORRECT' };
}
