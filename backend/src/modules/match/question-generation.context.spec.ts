import { Prisma } from '@prisma/client';
import { TARGET_LOCALES } from '../../common/localization/locale-registry';
import { questionGenerationInputForMatch } from './question-generation.context';

describe('question generation locale context', () => {
  it('preserves every ordered pair of target locales as participant renderings', async () => {
    const locales = Object.keys(TARGET_LOCALES);
    for (const first of locales) {
      for (const second of locales) {
        const tx = {
          match: {
            findUnique: jest.fn().mockResolvedValue({
              participants: [
                { participantKey: 'human:first', participantType: 'HUMAN', language: first },
                { participantKey: 'human:second', participantType: 'HUMAN', language: second },
              ],
            }),
            findMany: jest.fn().mockResolvedValue([]),
          },
          round: { findMany: jest.fn().mockResolvedValue([]) },
        } as unknown as Prisma.TransactionClient;

        const context = await questionGenerationInputForMatch(tx, 'match-id', {
          category: 'science',
          difficulty: 'medium',
          language: first,
          answerType: 'FREE_TEXT',
          timeLimitSeconds: 30,
        });

        expect(context.requiredLocales).toEqual([...new Set([first, second])].sort());
        expect(context.language).toBe(first);
      }
    }
  });

  it('deduplicates identical participant locales without changing the match language', async () => {
    const tx = {
      match: {
        findUnique: jest.fn().mockResolvedValue({
          participants: [
            { participantKey: 'human:first', participantType: 'HUMAN', language: 'fa' },
            { participantKey: 'human:second', participantType: 'HUMAN', language: 'fa' },
          ],
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      round: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as Prisma.TransactionClient;

    const context = await questionGenerationInputForMatch(tx, 'match-id', {
      category: 'science',
      difficulty: 'medium',
      language: 'fa',
      answerType: 'FREE_TEXT',
      timeLimitSeconds: 30,
    });

    expect(context.requiredLocales).toEqual(['fa']);
  });
});
