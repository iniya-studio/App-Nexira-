import {
  GeneratedQuestionValidationError,
  normalizedQuestionFingerprint,
  validateGeneratedQuestion,
} from './question-validation';

describe('generated question validation', () => {
  const validFreeText = {
    category: 'science',
    difficulty: 'medium',
    canonicalLanguage: 'en',
    answerType: 'FREE_TEXT',
    canonicalPrompt: 'What is the opposite of cold?',
    canonicalOptions: null,
    answerKey: 'Warm',
    gradingRubric: { requiredConcepts: ['warm'] },
    localized: {
      en: { prompt: 'What is the opposite of cold?' },
    },
    timeLimitSeconds: 30,
    contentVersion: 'question-content-v1',
  };

  it('accepts a complete free-text question with a required grading concept', () => {
    expect(validateGeneratedQuestion(validFreeText)).toMatchObject(
      validFreeText,
    );
  });

  it('rejects free-text content without an answer rubric', () => {
    expect(() =>
      validateGeneratedQuestion({
        ...validFreeText,
        gradingRubric: { requiredConcepts: [] },
      }),
    ).toThrow(GeneratedQuestionValidationError);
  });

  it('normalizes punctuation, compatibility characters, whitespace, and option order', () => {
    const first = normalizedQuestionFingerprint({
      canonicalLanguage: 'en',
      answerType: 'MULTIPLE_CHOICE',
      canonicalPrompt: 'Which planet has the shortest year?',
      canonicalOptions: [
        { id: 'A', text: 'Mercury' },
        { id: 'B', text: 'Earth' },
      ],
    });
    const equivalent = normalizedQuestionFingerprint({
      canonicalLanguage: 'EN',
      answerType: 'MULTIPLE_CHOICE',
      canonicalPrompt: ' WHICH PLANET HAS THE SHORTEST YEAR?! ',
      canonicalOptions: [
        { id: 'B', text: 'Earth' },
        { id: 'A', text: 'Mercury' },
      ],
    });

    expect(equivalent).toBe(first);
  });

  it('rejects a supplied fingerprint that does not match normalized content', () => {
    expect(() =>
      validateGeneratedQuestion({
        ...validFreeText,
        contentFingerprint: 'f'.repeat(64),
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'QUESTION_FINGERPRINT_INVALID',
      }),
    );
  });
});
