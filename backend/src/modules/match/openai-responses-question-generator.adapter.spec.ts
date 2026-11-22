import { ConfigService } from '@nestjs/config';
import {
  QuestionGenerationError,
  QuestionGenerationInput,
} from './question-generator.port';
import { OpenAiResponsesQuestionGeneratorAdapter } from './openai-responses-question-generator.adapter';
import { TARGET_LOCALES } from '../../common/localization/locale-registry';

describe('OpenAiResponsesQuestionGeneratorAdapter', () => {
  const excludedId = 'c0f6df1e-2cdd-4946-99d7-d46485c1b86d';
  const excludedFingerprint = 'a'.repeat(64);
  const input: QuestionGenerationInput = {
    category: 'science',
    difficulty: 'medium',
    language: 'en',
    requiredLocales: ['en'],
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
    localized: [{
      language: 'en',
      prompt: 'Which planet has the shortest year?',
      expectedAnswer: 'Mercury',
      options: [
        { id: 'A', text: 'Mercury' },
        { id: 'B', text: 'Neptune' },
        { id: 'C', text: 'Mars' },
      ],
      gradingRubric: {
        requiredConcepts: [],
        acceptEquivalentWording: false,
        notes: 'Choose the planet with the shortest orbital period.',
      },
    }],
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
      contentVersion: 'question-content-v2',
      generatorVersion: 'question-generator-v2',
      modelVersion: 'test-generator-model',
      generationPolicyVersion: 'shared-semantic-multilocale-v1',
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
    expect(body.input[0].content[0].text).toContain('required_locales');
    expect(body.input[0].content[0].text).toContain('never translate through English');
    expect(body.input[1].content[0].text).toContain('"language":"en"');
    const providerInput = JSON.stringify(body.input);
    expect(providerInput).toContain(excludedFingerprint);
    expect(providerInput).not.toContain(excludedId);
    expect(providerInput).not.toContain('participantId');
  });



  it('identifies pt as Brazilian Portuguese in the live generation request', async () => {
    const brazilianQuestion = {
      ...structuredQuestion,
      canonicalLanguage: 'pt',
      canonicalPrompt: 'Qual planeta tem o ano mais curto?',
      canonicalOptions: [
        { id: 'A', text: 'Mercúrio' },
        { id: 'B', text: 'Netuno' },
        { id: 'C', text: 'Marte' },
      ],
      gradingRubric: {
        requiredConcepts: [],
        acceptEquivalentWording: false,
        notes: 'Escolha o planeta com o menor período orbital.',
      },
      localized: [{
        language: 'pt',
        prompt: 'Qual planeta tem o ano mais curto?',
        expectedAnswer: 'Mercúrio',
        options: [
          { id: 'A', text: 'Mercúrio' },
          { id: 'B', text: 'Netuno' },
          { id: 'C', text: 'Marte' },
        ],
        gradingRubric: {
          requiredConcepts: [],
          acceptEquivalentWording: false,
          notes: 'Escolha o planeta com o menor período orbital.',
        },
      }],
    };
    respond(brazilianQuestion);

    await adapter.generate({ ...input, language: 'pt', requiredLocales: ['pt'] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.input[0].content[0].text).toContain('Brazilian Portuguese (pt-BR)');
    expect(body.input[1].content[0].text).toContain('"language":"pt"');
    expect(body.input[1].content[0].text).toContain('"language_name":"Brazilian Portuguese"');
  });

  it('passes the selected subcategory as a strict generation constraint', async () => {
    respond(structuredQuestion);
    await adapter.generate({ ...input, subcategoryId: 'physics' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.input[0].content[0].text).toContain('selected subcategory');
    expect(body.input[1].content[0].text).toContain('"subcategory":"physics"');
  });

  it('generates and validates one shared question for the complete 20-locale target set', async () => {
    const locales = Object.keys(TARGET_LOCALES);
    const localized = locales.map((language) => ({
      language,
      prompt: `Localized prompt for ${language}`,
      expectedAnswer: `Localized answer for ${language}`,
      options: [
        { id: 'A', text: `Option A (${language})` },
        { id: 'B', text: `Option B (${language})` },
        { id: 'C', text: `Option C (${language})` },
      ],
      gradingRubric: {
        requiredConcepts: [`Concept (${language})`],
        acceptEquivalentWording: true,
        notes: `Localized grading guidance (${language})`,
      },
    }));
    respond({ ...structuredQuestion, localized });

    const result = await adapter.generate({
      ...input,
      requiredLocales: locales,
    });

    expect(Object.keys(result.localized as Record<string, unknown>).sort())
      .toEqual([...locales].sort());
    const localizedResult = result.localized as Record<string, unknown>;
    for (const locale of locales) {
      expect(localizedResult[locale]).toMatchObject({
        prompt: expect.any(String),
        expectedAnswer: expect.any(String),
        options: { A: expect.any(String), B: expect.any(String), C: expect.any(String) },
        gradingRubric: {
          requiredConcepts: [expect.any(String)],
          acceptEquivalentWording: true,
          notes: expect.any(String),
        },
      });
    }

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(JSON.parse(body.input[1].content[0].text).required_locales.sort())
      .toEqual([...locales].sort());
  });

  it('requests Persian directly for every generated question field when Persian is selected', async () => {
    const persianQuestion = {
      ...structuredQuestion,
      canonicalLanguage: 'fa',
      canonicalPrompt: 'کدام سیاره کوتاه‌ترین سال را دارد؟',
      canonicalOptions: [
        { id: 'A', text: 'عطارد' },
        { id: 'B', text: 'نپتون' },
        { id: 'C', text: 'مریخ' },
      ],
      answerKey: 'A',
      gradingRubric: {
        requiredConcepts: [],
        acceptEquivalentWording: false,
        notes: 'سیاره‌ای را انتخاب کن که دورهٔ گردش مداری کوتاه‌تری دارد.',
      },
      localized: [{
        language: 'fa',
        prompt: 'کدام سیاره کوتاه‌ترین سال را دارد؟',
        expectedAnswer: 'عطارد',
        options: [
          { id: 'A', text: 'عطارد' },
          { id: 'B', text: 'نپتون' },
          { id: 'C', text: 'مریخ' },
        ],
        gradingRubric: {
          requiredConcepts: [],
          acceptEquivalentWording: false,
          notes: 'سیاره‌ای را انتخاب کن که دورهٔ گردش مداری کوتاه‌تری دارد.',
        },
      }],
    };
    respond(persianQuestion);

    const result = await adapter.generate({ ...input, language: 'fa', requiredLocales: ['fa'] });

    expect(result.canonicalLanguage).toBe('fa');
    expect(result.canonicalPrompt).toBe('کدام سیاره کوتاه‌ترین سال را دارد؟');
    expect(result.gradingRubric).toMatchObject({
      notes: 'سیاره‌ای را انتخاب کن که دورهٔ گردش مداری کوتاه‌تری دارد.',
    });
    expect(result.localized).toMatchObject({
      fa: {
        prompt: 'کدام سیاره کوتاه‌ترین سال را دارد؟',
        options: { A: 'عطارد', B: 'نپتون', C: 'مریخ' },
      },
    });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.input[1].content[0].text).toContain('"language":"fa"');
  });

  it('generates one semantic question with exact English and Persian renderings', async () => {
    respond({
      ...structuredQuestion,
      localized: [
        structuredQuestion.localized[0],
        {
          language: 'fa',
          prompt: 'کدام سیاره کوتاه‌ترین سال را دارد؟',
          expectedAnswer: 'عطارد',
          options: [
            { id: 'A', text: 'عطارد' },
            { id: 'B', text: 'نپتون' },
            { id: 'C', text: 'مریخ' },
          ],
          gradingRubric: {
            requiredConcepts: [],
            acceptEquivalentWording: false,
            notes: 'سیاره‌ای با کوتاه‌ترین دورهٔ مداری.',
          },
        },
      ],
    });

    const result = await adapter.generate({
      ...input,
      requiredLocales: ['en', 'fa'],
    });
    expect(Object.keys(result.localized as Record<string, unknown>).sort()).toEqual(['en', 'fa']);
    expect(result.localized).toMatchObject({
      en: { prompt: 'Which planet has the shortest year?', expectedAnswer: 'Mercury' },
      fa: { prompt: 'کدام سیاره کوتاه‌ترین سال را دارد؟', expectedAnswer: 'عطارد' },
    });
    const request = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(request.input[1].content[0].text).toContain('"required_locales":["en","fa"]');
  });

  it('rejects a missing requested locale instead of silently falling back', async () => {
    respond(structuredQuestion);
    await expect(adapter.generate({
      ...input,
      requiredLocales: ['en', 'fa'],
    })).rejects.toMatchObject({ code: 'GENERATOR_LOCALE_COVERAGE_INVALID' });
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

  it('generates a valid free-text question with no options and a grading rubric', async () => {
    respond({
      ...structuredQuestion,
      answerType: 'FREE_TEXT',
      canonicalPrompt: 'What is the largest planet in our solar system?',
      canonicalOptions: null,
      answerKey: 'Jupiter',
      gradingRubric: {
        requiredConcepts: ['Jupiter'],
        acceptEquivalentWording: true,
        notes: 'Accept the planet name only.',
      },
      localized: [{
        language: 'en',
        prompt: 'What is the largest planet in our solar system?',
        expectedAnswer: 'Jupiter',
        options: [],
        gradingRubric: {
          requiredConcepts: ['Jupiter'],
          acceptEquivalentWording: true,
          notes: 'Accept the planet name only.',
        },
      }],
    });

    const result = await adapter.generate({
      ...input,
      answerType: 'FREE_TEXT',
    });

    expect(result).toMatchObject({
      answerType: 'FREE_TEXT',
      canonicalOptions: null,
      answerKey: 'Jupiter',
      gradingRubric: {
        requiredConcepts: ['Jupiter'],
        acceptEquivalentWording: true,
      },
      localized: {
        en: {
          options: {},
        },
      },
    });
  });

  it('rejects a generated question whose settings differ from the persisted request', async () => {
    respond({ ...structuredQuestion, difficulty: 'hard' });

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_SETTINGS_MISMATCH',
    });
  });

  it('rejects localized options whose IDs do not match canonical options', async () => {
    respond({
      ...structuredQuestion,
      localized: [{
        language: 'en',
        prompt: 'Which planet has the shortest year?',
        expectedAnswer: 'Mercury',
        options: [
          { id: 'A', text: 'Mercury' },
          { id: 'X', text: 'Neptune' },
          { id: 'C', text: 'Mars' },
        ],
        gradingRubric: {
          requiredConcepts: [],
          acceptEquivalentWording: false,
          notes: 'Choose the planet with the shortest orbital period.',
        },
      }],
    });

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_OPTIONS_INVALID',
    });
  });

  it('rejects malformed structured output and an invalid provider response envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{malformed-json' }],
          },
        ],
      }),
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_INVALID_JSON',
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('invalid response JSON');
      },
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_INVALID_RESPONSE',
    });
  });

  it('rejects an empty output and an invalid response envelope shape', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'completed', output: [] }),
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_EMPTY_OUTPUT',
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_INVALID_RESPONSE',
    });
  });

  it('rejects invalid input and timeout configuration before making a provider request', async () => {
    await expect(
      adapter.generate({ ...input, timeLimitSeconds: 0 }),
    ).rejects.toMatchObject({ code: 'GENERATOR_INPUT_INVALID' });
    expect(fetchMock).not.toHaveBeenCalled();

    (config.get as jest.Mock).mockImplementation((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        QUESTION_GENERATOR_OPENAI_API_KEY: 'generator-test-secret',
        QUESTION_GENERATOR_OPENAI_MODEL: 'test-generator-model',
        QUESTION_GENERATOR_TIMEOUT_MS: '45000',
      };
      return values[key] ?? fallback;
    });
    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_CONFIGURATION_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires both a dedicated API key and a model selection', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'QUESTION_GENERATOR_OPENAI_API_KEY'
        ? 'generator-test-secret'
        : undefined,
    );

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes AbortError as a provider timeout', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );

    await expect(adapter.generate(input)).rejects.toMatchObject({
      code: 'GENERATOR_PROVIDER_TIMEOUT',
    });
  });
});
