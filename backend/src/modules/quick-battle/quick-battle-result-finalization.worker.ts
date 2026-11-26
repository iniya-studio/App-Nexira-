import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { QuickBattleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculateQuickBattleRoundScore,
  QUICK_BATTLE_SCORING_POLICY_VERSION,
} from './quick-battle-scoring.policy';

const POLL_INTERVAL_MS = 1000;
type Candidate = { id: string };

@Injectable()
export class QuickBattleResultFinalizationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuickBattleResultFinalizationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(matchId?: string): Promise<boolean> {
    const candidate = await this.prisma.quickBattleMatch.findFirst({
      where: {
        ...(matchId ? { id: matchId } : {}),
        status: QuickBattleStatus.COMPLETED,
        scoringPolicyVersion: QUICK_BATTLE_SCORING_POLICY_VERSION,
        result: null,
      },
      orderBy: { completedAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) return false;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "QuickBattleMatch" WHERE "id" = ${candidate.id}::uuid FOR UPDATE`;
      const match = await tx.quickBattleMatch.findUnique({
        where: { id: candidate.id },
        include: {
          result: true,
          rounds: {
            orderBy: { roundNumber: 'asc' },
            include: {
              question: { select: { timeLimitSeconds: true } },
              answer: true,
            },
          },
        },
      });
      if (!match || match.status !== QuickBattleStatus.COMPLETED ||
          match.scoringPolicyVersion !== QUICK_BATTLE_SCORING_POLICY_VERSION) return false;
      if (match.roundsTarget !== 10 || match.rounds.length !== 10) {
        throw new Error('Quick Battle result requires exactly ten rounds');
      }
      if (match.roundsTarget !== 10 || match.rounds.length !== 10) {
        throw new Error('Quick Battle result requires exactly ten rounds');
      }

      let totalPoints = 0;
      let correctAnswers = 0;
      let incorrectAnswers = 0;
      let noResponseCount = 0;
      const roundScores: Array<{ answerId: string; points: number }> = [];

      for (const round of match.rounds) {
        if (!round.completedAt || round.voidedAt || !round.question || !round.answer) {
          throw new Error('Quick Battle completed match contains an incomplete round outcome');
        }
        const score = calculateQuickBattleRoundScore({
          status: round.answer.status,
          judgeStatus: round.answer.judgeStatus,
          decision: round.answer.decision,
          elapsedMs: round.answer.elapsedMs,
          timeLimitSeconds: round.question.timeLimitSeconds,
        });
        totalPoints += score.points;
        if (score.outcome === 'CORRECT') correctAnswers += 1;
        if (score.outcome === 'INCORRECT') incorrectAnswers += 1;
        if (score.outcome === 'NO_RESPONSE') noResponseCount += 1;
        roundScores.push({ answerId: round.answer.id, points: score.points });
      }

      if (roundScores.length !== 10 || totalPoints < 0 || totalPoints > 1500 ||
          correctAnswers + incorrectAnswers + noResponseCount !== 10) {
        throw new Error('Quick Battle result summary failed integrity validation');
      }

      if (match.result) {
        const resultMatches = match.result.scoringPolicyVersion === QUICK_BATTLE_SCORING_POLICY_VERSION &&
          match.result.totalPoints === totalPoints &&
          match.result.correctAnswers === correctAnswers &&
          match.result.incorrectAnswers === incorrectAnswers &&
          match.result.noResponseCount === noResponseCount;
        const persistedPointsMatch = match.rounds.every((round) => {
          const score = roundScores.find((item) => item.answerId === round.answer?.id);
          return score !== undefined && round.answer?.points === score.points;
        });
        if (!resultMatches || !persistedPointsMatch) {
          throw new Error('Existing Quick Battle result failed immutable reconciliation');
        }
        return true;
      }

      for (const score of roundScores) {
        const updated = await tx.quickBattleAnswer.updateMany({
          where: { id: score.answerId, points: null },
          data: { points: score.points },
        });
        if (updated.count !== 1) {
          const existing = await tx.quickBattleAnswer.findUnique({
            where: { id: score.answerId },
            select: { points: true },
          });
          if (existing?.points !== score.points) {
            throw new Error('Quick Battle answer score conflicts with the deterministic policy');
          }
        }
      }

      await tx.quickBattleResult.create({
        data: {
          matchId: match.id,
          scoringPolicyVersion: QUICK_BATTLE_SCORING_POLICY_VERSION,
          totalPoints,
          correctAnswers,
          incorrectAnswers,
          noResponseCount,
          finalizedAt: match.completedAt ?? new Date(),
        },
      });
      return true;
    });
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (let index = 0; index < 20; index += 1) {
        if (!(await this.runOnce())) break;
      }
    } catch (error) {
      this.logger.error('Quick Battle result finalization failed',
        error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.polling = false;
    }
  }
}
