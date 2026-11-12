import { ConfigService } from '@nestjs/config';
import {
  QuestionGenerationError,
  QuestionGenerationInput,
} from './question-generator.port';
import { OpenAiResponsesQuestionGeneratorAdapter } from './openai-responses-question-generator.adapter';

describe('OpenAiResponsesQuestionGeneratorAdapter', () => {
  const excludedId = 'c0f6df1e-2cdd-4946-99d7-d46485c1b86d';
  const excludedFingerprint = 'a'.repeat(64);
  const input: QuestionGenerationInput = {
    category: 'science',
    difficulty: 'medium',
    language: 'en',
    answerType: 'MULTIPLE_CHOICE',
    timeLimitSeconds: 30,
    excludedQuestionIds: [excludedId],
    excludedQuestionFingerprints: [excludedFingerprint],
  };
  const structuredQuestion = {
    category: 'science',
    difficulty: 'medium',
    canonicalLanguage: 'en',
    answerType: 'MULTIPLE_CHOICE',
    canonicalPrompt: 'Which planet has the shortest year?',
    canonicalOptions: [
      { id: 'A', text: 'Mercury' },
      { id: 'B', text: 'Neptune' },
      { id: 'C', text: 'Mars' },
    ],
    answerKey: 'A',
    gradingRubric: {
      requiredConcepts: [],
      acceptEquivalentWording: false,
      notes: 'Choose the planet with the shortest orbital period.',
    },
    localizedPrompt: 'Which planet has the shortest year?',
    localizedOptions: [
      { id: 'A', text: 'Mercury' },
      { id: 'B', text: 'Neptune' },
      { id: 'C', text: 'Mars' },
    ],
    timeLimitSeconds: 30,
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let config: ConfigService;
  let adapter: OpenAiResponsesQuestionGeneratorAdapter;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          QUESTION_GENERATOR_OPENAI_API_KEY: 'generator-test-secret',
          QUESTION_GENERATOR_OPENAI_MODEL: 'test-generator-model',
          QUESTION_GENERATOR_OPENAI_BASE_URL: 'https://api.openai.com/v1',
          QUESTION_GENERATOR_TIMEOUT_MS: '12000',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    adapter = new OpenAiResponsesQuestionGeneratorAdapter(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function respond(output: unknown) {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify(output) }],
          },
        ],
      }),
    });
  }

  it('uses strict Responses API output and returns a versioned validated question', async () => {
    respond(structuredQuestion);

    const result = await adapter.generate(input);

    expect(result).toMatchObject({
      category: 'science',
      difficulty: 'medium',
      canonicalLanguage: 'en',
      answerType: 'MULTIPLE_CHOICE',
      answerKey: 'A',
      timeLimitSeconds: 30,
      contentVersion: 'question-content-v1',
      generatorVersion: 'question-generator-v1',
      modelVersion: 'test-generator-model',
      generationPolicyVersion: 'replacement-question-v1',
    });
    expect(result.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((request.headers as Record<string, string>).Authorization).toMatch(
      /^Bearer .+/,
    );
    const body = JSON.parse(request.body as string);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.tools).toBeUndefined();
    const providerInput = JSON.stringify(body.input);
    expect(providerInput).toContain(excludedFingerprint);
    expect(providerInput).not.toContain(excludedId);
    expect(providerInput).not.toContain('participantId');
  });

  it('rejects incomplete provider output', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'incomplete', output: [] }),
    });

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_INCOMPLETE',
    });
  });

  it('rejects provider refusal', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'No' }] },
        ],
      }),
    });

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_REFUSAL',
    });
  });

  it('rejects invalid structured question content', async () => {
    respond({ ...structuredQuestion, answerKey: 'Z' });

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'QUESTION_ANSWER_KEY_INVALID',
    });
  });

  it('rejects HTTP errors without exposing provider response bodies', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'sensitive provider response',
    });

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_HTTP_429',
    });
  });

  it('normalizes timeout and network failures', async () => {
    const timeout = Object.assign(new Error('timeout'), {
      name: 'TimeoutError',
    });
    fetchMock.mockRejectedValueOnce(timeout);
    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_TIMEOUT',
    });

    fetchMock.mockRejectedValueOnce(new Error('socket failure'));
    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_NETWORK_ERROR',
    });
  });

  it('rejects repeated normalized question fingerprints', async () => {
    respond({
      ...structuredQuestion,
      canonicalPrompt: '  WHICH PLANET HAS THE SHORTEST YEAR?! ',
    });

    const duplicateInput = {
      ...input,
      excludedQuestionFingerprints: ['b'.repeat(64)],
    };
    const candidate = await adapter.generate(duplicateInput);
    const repeated = {
      ...input,
      excludedQuestionFingerprints: [candidate.contentFingerprint!],
    };

    await expect(adapter.generate(repeated)).rejects.toBeInstanceOf(
      QuestionGenerationError,
    );
    await expect(adapter.generate(repeated)).rejects.toMatchObject({
      code: 'GENERATOR_DUPLICATE_QUESTION',
    });
  });

  it('does not make requests without a separate generator key', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'QUESTION_GENERATOR_OPENAI_MODEL'
        ? 'test-generator-model'
        : undefined,
    );

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
