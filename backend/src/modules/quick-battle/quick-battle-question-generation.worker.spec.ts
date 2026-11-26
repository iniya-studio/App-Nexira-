import { Prisma } from '@prisma/client';
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
    jest.spyOn(worker as any, 'claimNextJob').mockResolvedValue({
      id: 'job-1',
      matchId: 'current-match',
      roundId: 'current-round',
      attempts: 1,
      maxAttempts: 3,
      leaseId: 'lease-1',
      requestContext,
    });
    jest.spyOn(worker as any, 'releaseClaim').mockResolvedValue(undefined);

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
