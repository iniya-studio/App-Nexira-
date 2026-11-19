import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QuestionGenerationError,
  QuestionGenerationInput,
  QuestionGenerator,
} from './question-generator.port';
import { GeneratedQuestion } from './question.types';
import { isTargetLocale } from '../../common/localization/locale-registry';
import {
  normalizedQuestionFingerprint,
  validateGeneratedQuestion,
} from './question-validation';

const GENERATOR_VERSION = 'question-generator-v2';
const GENERATION_POLICY_VERSION = 'shared-semantic-multilocale-v1';

type ResponsesApiPayload = {
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
};

type StructuredQuestion = {
  category: string;
  difficulty: string;
  canonicalLanguage: string;
  answerType: string;
  canonicalPrompt: string;
  canonicalOptions: Array<{ id: string; text: string }> | null;
  answerKey: string;
  gradingRubric: {
    requiredConcepts: string[];
    acceptEquivalentWording: boolean;
    notes: string;
  };
  localized: Array<{
    language: string;
    prompt: string;
    expectedAnswer: string;
    options: Array<{ id: string; text: string }>;
    gradingRubric: {
      requiredConcepts: string[];
      acceptEquivalentWording: boolean;
      notes: string;
    };
  }>;
  timeLimitSeconds: number;
};

@Injectable()
export class OpenAiResponsesQuestionGeneratorAdapter implements QuestionGenerator {
  constructor(private readonly config: ConfigService) {}

  async generate(input: QuestionGenerationInput): Promise<GeneratedQuestion> {
    this.validateInput(input);

    const apiKey = this.config
      .get<string>('QUESTION_GENERATOR_OPENAI_API_KEY')
      ?.trim();
    const model = this.config
      .get<string>('QUESTION_GENERATOR_OPENAI_MODEL')
      ?.trim();
    const baseUrl = (
      this.config.get<string>(
        'QUESTION_GENERATOR_OPENAI_BASE_URL',
        'https://api.openai.com/v1',
      ) ?? 'https://api.openai.com/v1'
    ).replace(/\/+$/, '');
    const timeoutMs = Number(
      this.config.get<string>('QUESTION_GENERATOR_TIMEOUT_MS', '12000'),
    );

    if (!apiKey || !model) {
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_NOT_CONFIGURED',
        'The configured question generator is not available',
      );
    }
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1000 ||
      timeoutMs > 30000
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_CONFIGURATION_INVALID',
        'Question generator timeout configuration is invalid',
      );
    }

    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        max_output_tokens: 1600,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  'Generate exactly one original quiz question using only the supplied settings. ' +
                  'The language field is the canonical locale for shared semantic content. required_locales lists every human participant locale. Generate exactly one semantic question and a localized rendering for every required locale, directly authored in that locale; never translate through English and never omit a requested locale. canonicalPrompt, canonicalOptions, answerKey and gradingRubric must be authored in the canonical language. Each localized entry must contain its own prompt, expected answer, option text keyed by stable option IDs, and localized grading rubric. Preserve identical meaning, answer identity, difficulty, option IDs and option order across all locales. ' +
                  'Use the requested category, difficulty, answer type, and time limit. For multiple choice, provide 2 to 8 distinct options and an answerKey equal to exactly one option ID; option IDs are language-neutral and must remain stable between canonical and localized options. For free text, use null options and a concise expected answer with a grading rubric containing required concepts, all in the requested language. Do not include player data or mention internal identifiers. The excluded fingerprints represent prior question content; avoid repeating or paraphrasing any of those questions.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  category: input.category,
                  difficulty: input.difficulty,
                  language: input.language,
                  required_locales: input.requiredLocales,
                  answer_type: input.answerType,
                  time_limit_seconds: input.timeLimitSeconds,
                  excluded_content_fingerprints:
                    input.excludedQuestionFingerprints,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'nexira_generated_question',
            strict: true,
            schema: this.responseSchema(),
          },
        },
      }),
    }).catch((error: unknown) => {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new QuestionGenerationError(
          'GENERATOR_PROVIDER_TIMEOUT',
          'Question generation request timed out',
        );
      }
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_NETWORK_ERROR',
        'Question generation provider request failed',
      );
    });

    if (!response.ok) {
      throw new QuestionGenerationError(
        `GENERATOR_PROVIDER_HTTP_${response.status}`,
        'Question generation provider returned an unsuccessful response',
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_INVALID_RESPONSE',
        'Question generation provider returned invalid JSON',
      );
    }
    const body = asRecord(responseBody);
    if (!body) {
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_INVALID_RESPONSE',
        'Question generation provider returned an invalid response shape',
      );
    }
    const payload = body as ResponsesApiPayload;

    if (payload.status !== 'completed') {
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_INCOMPLETE',
        'Question generation provider did not complete the response',
      );
    }

    const outputItems = Array.isArray(payload.output) ? payload.output : [];
    const content = outputItems.flatMap((item) => {
      const parts = asRecord(item)?.content;
      return Array.isArray(parts)
        ? parts
            .map(asRecord)
            .filter((part): part is Record<string, unknown> => part !== null)
        : [];
    });
    if (content.some((item) => item.type === 'refusal' || item.refusal)) {
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_REFUSAL',
        'Question generation provider refused the request',
      );
    }

    const outputTextCandidate = content.find(
      (item) => item.type === 'output_text',
    )?.text;
    const outputText =
      typeof outputTextCandidate === 'string' ? outputTextCandidate : undefined;
    if (!outputText) {
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_EMPTY_OUTPUT',
        'Question generation provider returned no structured question',
      );
    }

    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(outputText);
    } catch {
      throw new QuestionGenerationError(
        'GENERATOR_PROVIDER_INVALID_JSON',
        'Question generation provider returned malformed structured output',
      );
    }

    const structured = this.validateStructuredQuestion(parsedOutput);
    if (
      structured.category !== input.category ||
      structured.difficulty !== input.difficulty ||
      structured.canonicalLanguage !== input.language ||
      structured.answerType !== input.answerType ||
      structured.timeLimitSeconds !== input.timeLimitSeconds
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_SETTINGS_MISMATCH',
        'Generated question does not match the requested settings',
      );
    }

    if (new Set(structured.localized.map((rendering) => rendering.language)).size !== structured.localized.length) {
      throw new QuestionGenerationError('GENERATOR_LOCALE_COVERAGE_INVALID', 'Generated question contains duplicate locale renderings');
    }
    const localized = Object.fromEntries(
      structured.localized.map((rendering) => [rendering.language, {
        prompt: rendering.prompt,
        expectedAnswer: rendering.expectedAnswer,
        options: Object.fromEntries(rendering.options.map((option) => [option.id, option.text])),
        gradingRubric: rendering.gradingRubric,
      }]),
    );
    const expectedLocales = [...new Set(input.requiredLocales)].sort();
    const actualLocales = Object.keys(localized).sort();
    if (
      expectedLocales.length !== actualLocales.length ||
      expectedLocales.some((locale, index) => locale !== actualLocales[index]) ||
      !expectedLocales.includes(input.language)
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_LOCALE_COVERAGE_INVALID',
        'Generated question does not contain exactly the required participant locales',
      );
    }
    const candidate = validateGeneratedQuestion({
      category: structured.category,
      difficulty: structured.difficulty,
      canonicalLanguage: structured.canonicalLanguage,
      answerType: structured.answerType,
      canonicalPrompt: structured.canonicalPrompt,
      canonicalOptions: structured.canonicalOptions,
      answerKey: structured.answerKey,
      gradingRubric: structured.gradingRubric,
      localized,
      timeLimitSeconds: structured.timeLimitSeconds,
      contentVersion: 'question-content-v2',
      generatorVersion: GENERATOR_VERSION,
      modelVersion: model,
      generationPolicyVersion: GENERATION_POLICY_VERSION,
    });

    const fingerprint = normalizedQuestionFingerprint(candidate);
    if (
      input.excludedQuestionFingerprints.some(
        (excluded) => excluded.toLowerCase() === fingerprint,
      )
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_DUPLICATE_QUESTION',
        'Generated question repeats previously used content',
      );
    }

    return { ...candidate, contentFingerprint: fingerprint };
  }

  private validateInput(input: QuestionGenerationInput): void {
    if (
      typeof input.category !== 'string' ||
      !input.category.trim() ||
      input.category.length > 64 ||
      typeof input.difficulty !== 'string' ||
      !input.difficulty.trim() ||
      input.difficulty.length > 32 ||
      typeof input.language !== 'string' ||
      !input.language.trim() ||
      input.language.length > 35 ||
      !Array.isArray(input.requiredLocales) ||
      input.requiredLocales.length === 0 ||
      input.requiredLocales.length > 20 ||
      !input.requiredLocales.every((locale) => typeof locale === 'string' && locale.trim().length > 0 && locale.length <= 35 && isTargetLocale(locale)) ||
      new Set(input.requiredLocales).size !== input.requiredLocales.length ||
      !input.requiredLocales.includes(input.language) ||
      !isTargetLocale(input.language) ||
      !Number.isSafeInteger(input.timeLimitSeconds) ||
      input.timeLimitSeconds < 1 ||
      input.timeLimitSeconds > 300 ||
      !Array.isArray(input.excludedQuestionIds) ||
      !input.excludedQuestionIds.every((id) => typeof id === 'string') ||
      !Array.isArray(input.excludedQuestionFingerprints) ||
      input.excludedQuestionFingerprints.some(
        (fingerprint) => !/^[a-f0-9]{64}$/i.test(fingerprint),
      )
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_INPUT_INVALID',
        'Question generation input is invalid',
      );
    }
  }

  private validateStructuredQuestion(value: unknown): StructuredQuestion {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new QuestionGenerationError(
        'GENERATOR_OUTPUT_INVALID',
        'Generated question has an invalid shape',
      );
    }

    const output = value as Record<string, unknown>;
    const expectedKeys = [
      'category',
      'difficulty',
      'canonicalLanguage',
      'answerType',
      'canonicalPrompt',
      'canonicalOptions',
      'answerKey',
      'gradingRubric',
      'localized',
      'timeLimitSeconds',
    ];
    if (
      Object.keys(output).length !== expectedKeys.length ||
      expectedKeys.some((key) => !(key in output)) ||
      typeof output.category !== 'string' ||
      typeof output.difficulty !== 'string' ||
      typeof output.canonicalLanguage !== 'string' ||
      typeof output.answerType !== 'string' ||
      typeof output.canonicalPrompt !== 'string' ||
      typeof output.answerKey !== 'string' ||
      !Number.isSafeInteger(output.timeLimitSeconds) ||
      !Array.isArray(output.localized) ||
      typeof output.gradingRubric !== 'object' ||
      output.gradingRubric === null ||
      Array.isArray(output.gradingRubric)
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_OUTPUT_INVALID',
        'Generated question is incomplete',
      );
    }

    const rubric = output.gradingRubric as Record<string, unknown>;
    const rubricKeys = ['requiredConcepts', 'acceptEquivalentWording', 'notes'];
    if (
      Object.keys(rubric).length !== rubricKeys.length ||
      rubricKeys.some((key) => !(key in rubric)) ||
      !Array.isArray(rubric.requiredConcepts) ||
      rubric.requiredConcepts.some((concept) => typeof concept !== 'string') ||
      typeof rubric.acceptEquivalentWording !== 'boolean' ||
      typeof rubric.notes !== 'string'
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_RUBRIC_INVALID',
        'Generated grading rubric is invalid',
      );
    }

    if (
      output.canonicalOptions !== null &&
      !Array.isArray(output.canonicalOptions)
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_OPTIONS_INVALID',
        'Generated options are invalid',
      );
    }

    const canonicalOptions = this.readOptions(output.canonicalOptions);
    const localized = (output.localized as unknown[]).map((value) => {
      const item = asRecord(value);
      if (!item || typeof item.language !== 'string' || typeof item.prompt !== 'string' ||
          typeof item.expectedAnswer !== 'string' || !item.expectedAnswer.trim() ||
          !Array.isArray(item.options) || typeof item.gradingRubric !== 'object' ||
          item.gradingRubric === null || Array.isArray(item.gradingRubric)) {
        throw new QuestionGenerationError('GENERATOR_LOCALIZATION_INVALID', 'A localized question rendering is invalid');
      }
      const rubric = item.gradingRubric as Record<string, unknown>;
      if (!Array.isArray(rubric.requiredConcepts) ||
          !rubric.requiredConcepts.every((concept) => typeof concept === 'string') ||
          typeof rubric.acceptEquivalentWording !== 'boolean' || typeof rubric.notes !== 'string') {
        throw new QuestionGenerationError('GENERATOR_LOCALIZATION_INVALID', 'A localized grading rubric is invalid');
      }
      const options = this.readOptions(item.options);
      if (canonicalOptions.length !== options.length ||
          canonicalOptions.some((option, index) => option.id !== options[index]?.id)) {
        throw new QuestionGenerationError('GENERATOR_OPTIONS_INVALID', 'Localized option IDs/order do not match canonical options');
      }
      return {
        language: item.language,
        prompt: item.prompt,
        expectedAnswer: item.expectedAnswer,
        options,
        gradingRubric: {
          requiredConcepts: rubric.requiredConcepts as string[],
          acceptEquivalentWording: rubric.acceptEquivalentWording,
          notes: rubric.notes,
        },
      };
    });
    return {
      category: output.category,
      difficulty: output.difficulty,
      canonicalLanguage: output.canonicalLanguage,
      answerType: output.answerType,
      canonicalPrompt: output.canonicalPrompt,
      canonicalOptions: output.canonicalOptions === null ? null : canonicalOptions,
      answerKey: output.answerKey,
      gradingRubric: {
        requiredConcepts: rubric.requiredConcepts as string[],
        acceptEquivalentWording: rubric.acceptEquivalentWording,
        notes: rubric.notes,
      },
      localized,
      timeLimitSeconds: output.timeLimitSeconds as number,
    };
  }

  private readOptions(value: unknown): Array<{ id: string; text: string }> {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new QuestionGenerationError(
          'GENERATOR_OPTIONS_INVALID',
          'Generated option is invalid',
        );
      }
      const option = item as Record<string, unknown>;
      if (
        Object.keys(option).length !== 2 ||
        typeof option.id !== 'string' ||
        typeof option.text !== 'string'
      ) {
        throw new QuestionGenerationError(
          'GENERATOR_OPTIONS_INVALID',
          'Generated option is incomplete',
        );
      }
      return { id: option.id, text: option.text };
    });
  }

  private responseSchema(): Record<string, unknown> {
    const option = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['id', 'text'],
      additionalProperties: false,
    };
    return {
      type: 'object',
      properties: {
        category: { type: 'string' },
        difficulty: { type: 'string' },
        canonicalLanguage: { type: 'string' },
        answerType: { type: 'string', enum: ['MULTIPLE_CHOICE', 'FREE_TEXT'] },
        canonicalPrompt: { type: 'string' },
        canonicalOptions: {
          anyOf: [
            { type: 'array', items: option, minItems: 2, maxItems: 8 },
            { type: 'null' },
          ],
        },
        answerKey: { type: 'string' },
        gradingRubric: {
          type: 'object',
          properties: {
            requiredConcepts: { type: 'array', items: { type: 'string' } },
            acceptEquivalentWording: { type: 'boolean' },
            notes: { type: 'string' },
          },
          required: ['requiredConcepts', 'acceptEquivalentWording', 'notes'],
          additionalProperties: false,
        },
        localized: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              language: { type: 'string' },
              prompt: { type: 'string' },
              expectedAnswer: { type: 'string' },
              options: { type: 'array', items: option, maxItems: 8 },
              gradingRubric: {
                type: 'object',
                properties: {
                  requiredConcepts: { type: 'array', items: { type: 'string' } },
                  acceptEquivalentWording: { type: 'boolean' },
                  notes: { type: 'string' },
                },
                required: ['requiredConcepts', 'acceptEquivalentWording', 'notes'],
                additionalProperties: false,
              },
            },
            required: ['language', 'prompt', 'expectedAnswer', 'options', 'gradingRubric'],
            additionalProperties: false,
          },
        },
        timeLimitSeconds: { type: 'integer' },
      },
      required: [
        'category',
        'difficulty',
        'canonicalLanguage',
        'answerType',
        'canonicalPrompt',
        'canonicalOptions',
        'answerKey',
        'gradingRubric',
        'localized',
        'timeLimitSeconds',
      ],
      additionalProperties: false,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
