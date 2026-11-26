import { Prisma } from '@prisma/client';
import { parseQuestionGenerationInput } from '../match/question-generation.context';
import { mergeQuickBattleQuestionExclusions } from './quick-battle-question-generation.worker';

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
