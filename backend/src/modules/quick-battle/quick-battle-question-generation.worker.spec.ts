import { Prisma, QuickBattleStatus } from '@prisma/client';
import { QuestionGenerationError } from '../match/question-generator.port';
import { parseQuestionGenerationInput } from '../match/question-generation.context';
import { PrismaService } from '../../prisma/prisma.service';
import {
  mergeQuickBattleQuestionExclusions,
  QuickBattleQuestionGenerationWorker,
} from './quick-battle-question-generation.worker';

describe('mergeQuickBattleQuestionExclusions', () => {
  const input = parseQuestionGenerationInput({
    category: 'science',
    subcategoryId: 'physics',
    difficulty: 'medium',
    language: 'en',
    requiredLocales: ['en'],
    answerType: 'FREE_TEXT',
    timeLimitSeconds: 30,
    excludedQuestionIds: ['persisted-id'],
    excludedQuestionFingerprints: ['persisted-fingerprint'],
    excludedQuestionPrompts: ['Persisted prompt'],
  } as Prisma.JsonValue);

  it('merges same-match and recent served history IDs, fingerprints and prompts', () => {
    const result = mergeQuickBattleQuestionExclusions(input, [
      {
        questionId: 'same-match-id',
        question: {
          contentFingerprint: 'same-match-fingerprint',
          canonicalPrompt: 'Same match prompt',
        },
      },
    ], [
      {
        questionId: 'recent-user-id',
        question: {
          contentFingerprint: 'recent-user-fingerprint',
          canonicalPrompt: 'Recent user prompt',
        },
      },
      {
        questionId: 'recent-guest-id',
        question: {
          contentFingerprint: 'recent-guest-fingerprint',
          canonicalPrompt: 'Recent guest prompt',
        },
      },
    ]);

    expect(result.excludedQuestionIds).toEqual([
      'persisted-id',
      'same-match-id',
      'recent-user-id',
      'recent-guest-id',
    ]);
    expect(result.excludedQuestionFingerprints).toEqual([
      'persisted-fingerprint',
      'same-match-fingerprint',
      'recent-user-fingerprint',
      'recent-guest-fingerprint',
    ]);
    expect(result.excludedQuestionPrompts).toEqual([
      'Persisted prompt',
      'Same match prompt',
      'Recent user prompt',
      'Recent guest prompt',
    ]);
  });

  it('deduplicates repeated IDs, fingerprints and canonical prompts', () => {
    const repeated = {
      questionId: 'repeated-id',
      question: {
        contentFingerprint: 'repeated-fingerprint',
        canonicalPrompt: 'Repeated canonical prompt',
      },
    };
    const result = mergeQuickBattleQuestionExclusions(input, [repeated], [repeated]);

    expect(result.excludedQuestionIds.filter((id) => id === 'repeated-id')).toHaveLength(1);
    expect(result.excludedQuestionFingerprints.filter((value) => value === 'repeated-fingerprint')).toHaveLength(1);
    expect(result.excludedQuestionPrompts.filter((value) => value === 'Repeated canonical prompt')).toHaveLength(1);
  });

  it('keeps question IDs when a historical question relation has been deleted or is unavailable', () => {
    const result = mergeQuickBattleQuestionExclusions(input, [
      { questionId: 'orphaned-question-id', question: null },
      { questionId: null, question: null },
    ], []);

    expect(result.excludedQuestionIds).toContain('orphaned-question-id');
    expect(result.excludedQuestionFingerprints).toEqual(['persisted-fingerprint']);
    expect(result.excludedQuestionPrompts).toEqual(['Persisted prompt']);
  });

  it('does not mutate the persisted generation context', () => {
    const before = structuredClone(input);
    mergeQuickBattleQuestionExclusions(input, [], [
      {
        questionId: 'history-id',
        question: {
          contentFingerprint: 'history-fingerprint',
          canonicalPrompt: 'History prompt',
        },
      },
    ]);

    expect(input).toEqual(before);
  });
});

describe('QuickBattleQuestionGenerationWorker recent history query', () => {
  const requestContext = {
    category: 'science',
    subcategoryId: 'physics',
    difficulty: 'medium',
    language: 'en',
    requiredLocales: ['en'],
    answerType: 'FREE_TEXT',
    timeLimitSeconds: 30,
    excludedQuestionIds: [],
    excludedQuestionFingerprints: [],
  } as Prisma.JsonValue;

  it.each([
    [
      'USER',
      { userId: 'user-1', guestIdentityId: null },
      { userId: 'user-1' },
    ],
    [
      'GUEST',
      { userId: null, guestIdentityId: 'guest-1' },
      { guestIdentityId: 'guest-1' },
    ],
  ])('loads only served Quick Battle history for the %s principal', async (_type, owner, ownerFilter) => {
    const sameMatchQuestions = [{
      questionId: 'same-match-question',
      question: {
        contentFingerprint: 'same-match-fingerprint',
        canonicalPrompt: 'Already generated in this match',
      },
    }];
    const recentHistory = [{
      questionId: 'recently-served-question',
      question: {
        contentFingerprint: 'recent-fingerprint',
        canonicalPrompt: 'A previously served question',
      },
    }];
    const prisma = {
      quickBattleMatch: {
        findUnique: jest.fn().mockResolvedValue(owner),
      },
      quickBattleRound: {
        findMany: jest.fn()
          .mockResolvedValueOnce(sameMatchQuestions)
          .mockResolvedValueOnce(recentHistory),
      },
    } as unknown as PrismaService;
    const generator = {
      generate: jest.fn().mockRejectedValue(new Error('intentional test failure')),
    };
    const worker = new QuickBattleQuestionGenerationWorker(prisma, generator as never);
    const workerInternals = worker as unknown as {
      claimNextJob: () => Promise<unknown>;
      releaseClaim: () => Promise<void>;
    };
    jest.spyOn(workerInternals, 'claimNextJob').mockResolvedValue({
      id: 'job-1',
      matchId: 'current-match',
      roundId: 'current-round',
      attempts: 1,
      maxAttempts: 3,
      leaseId: 'lease-1',
      requestContext,
    });
    jest.spyOn(workerInternals, 'releaseClaim').mockResolvedValue(undefined);

    await worker.runOnce();

    expect(prisma.quickBattleMatch.findUnique).toHaveBeenCalledWith({
      where: { id: 'current-match' },
      select: { userId: true, guestIdentityId: true },
    });
    const historyQuery = (prisma.quickBattleRound.findMany as jest.Mock).mock.calls[1][0];
    expect(historyQuery).toMatchObject({
      where: {
        matchId: { not: 'current-match' },
        startedAt: { not: null },
        questionId: { not: null },
        match: { is: ownerFilter },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    expect(generator.generate).toHaveBeenCalledWith(expect.objectContaining({
      excludedQuestionIds: ['same-match-question', 'recently-served-question'],
      excludedQuestionFingerprints: ['same-match-fingerprint', 'recent-fingerprint'],
      excludedQuestionPrompts: [
        'Already generated in this match',
        'A previously served question',
      ],
    }));
  });
});


describe('QuickBattleQuestionGenerationWorker lifecycle handling', () => {
  const claim = {
    id: 'job-1',
    matchId: 'match-1',
    roundId: 'round-1',
    attempts: 2,
    maxAttempts: 3,
    leaseId: 'lease-1',
    requestContext: {
      category: 'science',
      subcategoryId: 'physics',
      difficulty: 'medium',
      language: 'en',
      requiredLocales: ['en'],
      answerType: 'FREE_TEXT',
      timeLimitSeconds: 30,
      excludedQuestionIds: [],
      excludedQuestionFingerprints: [],
    } as Prisma.JsonValue,
  };

  function workerWithClaim(generatorResult: {
    resolve?: unknown;
    reject?: Error;
  }) {
    const prisma = {
      quickBattleRound: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      quickBattleMatch: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          guestIdentityId: null,
        }),
      },
    } as unknown as PrismaService;
    const generator = {
      generate: generatorResult.reject
        ? jest.fn().mockRejectedValue(generatorResult.reject)
        : jest.fn().mockResolvedValue(generatorResult.resolve),
    };
    const worker = new QuickBattleQuestionGenerationWorker(prisma, generator as never);
    const internals = worker as unknown as {
      claimNextJob: () => Promise<unknown>;
      releaseClaim: (job: typeof claim, errorCode: string) => Promise<void>;
    };
    jest.spyOn(internals, 'claimNextJob').mockResolvedValue(claim);
    const release = jest.spyOn(internals, 'releaseClaim').mockResolvedValue(undefined);
    return { worker, release, generator };
  }

  it('routes invalid provider output into the bounded retry handler', async () => {
    const { worker, release } = workerWithClaim({ resolve: { invalid: true } });

    await worker.runOnce();

    expect(release).toHaveBeenCalledWith(claim, 'QUESTION_OUTPUT_INVALID');
  });

  it('preserves normalized HTTP provider failure codes for retry diagnostics', async () => {
    const { worker, release } = workerWithClaim({
      reject: new QuestionGenerationError('GENERATOR_PROVIDER_HTTP_429', 'Rate limited'),
    });

    await worker.runOnce();

    expect(release).toHaveBeenCalledWith(claim, 'GENERATOR_PROVIDER_HTTP_ERROR');
  });

  it('requeues a failed attempt with bounded exponential delay', async () => {
    const now = new Date('2026-11-27T12:00:00.000Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      quickBattleQuestionJob: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'PROCESSING',
          leaseId: claim.leaseId,
          attempts: 2,
          maxAttempts: 3,
          matchId: claim.matchId,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      quickBattleMatch: {
        findUnique: jest.fn().mockResolvedValue({ status: QuickBattleStatus.PREPARING }),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const worker = new QuickBattleQuestionGenerationWorker(prisma, { generate: jest.fn() } as never);
    const internals = worker as unknown as {
      releaseClaim: (job: typeof claim, errorCode: string) => Promise<void>;
    };

    await internals.releaseClaim(claim, 'GENERATOR_PROVIDER_TIMEOUT');

    expect(tx.quickBattleQuestionJob.update).toHaveBeenCalledWith({
      where: { id: claim.id },
      data: expect.objectContaining({
        status: 'PENDING',
        leaseId: null,
        leaseAt: null,
        availableAt: new Date(now.getTime() + 2_000),
        lastErrorCode: 'GENERATOR_PROVIDER_TIMEOUT',
      }),
    });
    expect(tx.quickBattleMatch.updateMany).not.toHaveBeenCalled();
  });

  it('voids the match when the final generation attempt is exhausted', async () => {
    const now = new Date('2026-11-27T12:00:00.000Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      quickBattleQuestionJob: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'PROCESSING',
          leaseId: claim.leaseId,
          attempts: 3,
          maxAttempts: 3,
          matchId: claim.matchId,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      quickBattleMatch: {
        findUnique: jest.fn().mockResolvedValue({ status: QuickBattleStatus.READY }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const worker = new QuickBattleQuestionGenerationWorker(prisma, { generate: jest.fn() } as never);
    const internals = worker as unknown as {
      releaseClaim: (job: typeof claim, errorCode: string) => Promise<void>;
    };

    await internals.releaseClaim(claim, 'GENERATOR_OUTPUT_INVALID');

    expect(tx.quickBattleQuestionJob.update).toHaveBeenCalledWith({
      where: { id: claim.id },
      data: expect.objectContaining({
        status: 'FAILED',
        completedAt: now,
        lastErrorCode: 'GENERATOR_OUTPUT_INVALID',
        leaseId: null,
        leaseAt: null,
      }),
    });
    expect(tx.quickBattleMatch.updateMany).toHaveBeenCalledWith({
      where: {
        id: claim.matchId,
        status: {
          in: [
            QuickBattleStatus.PREPARING,
            QuickBattleStatus.READY,
            QuickBattleStatus.ACTIVE,
          ],
        },
      },
      data: {
        status: QuickBattleStatus.VOIDED,
        voidedAt: now,
        voidReason: 'QUESTION_GENERATION_EXHAUSTED',
      },
    });
  });

  it('does not retry or void a job after its match has become terminal', async () => {
    const now = new Date('2026-11-27T12:00:00.000Z');
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      quickBattleQuestionJob: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'PROCESSING',
          leaseId: claim.leaseId,
          attempts: 1,
          maxAttempts: 3,
          matchId: claim.matchId,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      quickBattleMatch: {
        findUnique: jest.fn().mockResolvedValue({ status: QuickBattleStatus.COMPLETED }),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const worker = new QuickBattleQuestionGenerationWorker(prisma, { generate: jest.fn() } as never);
    const internals = worker as unknown as {
      releaseClaim: (job: typeof claim, errorCode: string) => Promise<void>;
    };

    await internals.releaseClaim(claim, 'GENERATOR_PROVIDER_TIMEOUT');

    expect(tx.quickBattleQuestionJob.update).toHaveBeenCalledWith({
      where: { id: claim.id },
      data: {
        status: 'CANCELLED',
        leaseId: null,
        leaseAt: null,
        completedAt: now,
        lastErrorCode: 'MATCH_NOT_ACTIVE',
      },
    });
    expect(tx.quickBattleMatch.updateMany).not.toHaveBeenCalled();
  });

  it('claims generation jobs with a database lease and the first-three readiness gate', async () => {
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([claim]),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const worker = new QuickBattleQuestionGenerationWorker(prisma, { generate: jest.fn() } as never);
    const internals = worker as unknown as {
      claimNextJob: () => Promise<unknown>;
    };

    await expect(internals.claimNextJob()).resolves.toEqual(claim);

    const claimSql = tx.$queryRaw.mock.calls[1][0].join('');
    expect(claimSql).toContain('FOR UPDATE OF job SKIP LOCKED');
    expect(claimSql).toContain('round."roundNumber" <= 3');
    expect(claimSql).toContain('match."status" IN');
    expect(claimSql).toContain("'READY', 'ACTIVE'");
    expect(claimSql).toContain('job."attempts" < job."maxAttempts"');
  });
});
