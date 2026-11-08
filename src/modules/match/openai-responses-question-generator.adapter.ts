import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QuestionGenerationError,
  QuestionGenerationInput,
  QuestionGenerator,
} from './question-generator.port';
import { GeneratedQuestion } from './question.types';
import {
  normalizedQuestionFingerprint,
  validateGeneratedQuestion,
} from './question-validation';

const GENERATOR_VERSION = 'question-generator-v1';
const GENERATION_POLICY_VERSION = 'replacement-question-v1';

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
  localizedPrompt: string;
  localizedOptions: Array<{ id: string; text: string }>;
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
                  'Use the requested language, category, difficulty, answer type, and time limit. ' +
                  'For multiple choice, provide 2 to 8 distinct options and an answerKey equal to ' +
                  'exactly one option ID. For free text, use null options and a concise expected ' +
                  'answer with a grading rubric containing required concepts. Provide localized ' +
                  'wording in the requested language. Do not include player data or mention internal ' +
                  'identifiers. The excluded fingerprints represent prior question content; avoid ' +
                  'repeating or paraphrasing any of those questions.',
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

    const localizedOptions = Object.fromEntries(
      structured.localizedOptions.map((option) => [option.id, option.text]),
    );
    const candidate = validateGeneratedQuestion({
      category: structured.category,
      difficulty: structured.difficulty,
      canonicalLanguage: structured.canonicalLanguage,
      answerType: structured.answerType,
      canonicalPrompt: structured.canonicalPrompt,
      canonicalOptions: structured.canonicalOptions,
      answerKey: structured.answerKey,
      gradingRubric: structured.gradingRubric,
      localized: {
        [structured.canonicalLanguage]: {
          prompt: structured.localizedPrompt,
          options: localizedOptions,
        },
      },
      timeLimitSeconds: structured.timeLimitSeconds,
      contentVersion: 'question-content-v1',
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
      'localizedPrompt',
      'localizedOptions',
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
      typeof output.localizedPrompt !== 'string' ||
      !Number.isSafeInteger(output.timeLimitSeconds) ||
      !Array.isArray(output.localizedOptions) ||
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
    const localizedOptions = this.readOptions(output.localizedOptions);
    if (
      canonicalOptions.length !== localizedOptions.length ||
      canonicalOptions.some(
        (option, index) => option.id !== localizedOptions[index]?.id,
      )
    ) {
      throw new QuestionGenerationError(
        'GENERATOR_OPTIONS_INVALID',
        'Localized options do not match canonical options',
      );
    }

    return {
      category: output.category,
      difficulty: output.difficulty,
      canonicalLanguage: output.canonicalLanguage,
      answerType: output.answerType,
      canonicalPrompt: output.canonicalPrompt,
      canonicalOptions:
        output.canonicalOptions === null ? null : canonicalOptions,
      answerKey: output.answerKey,
      gradingRubric: {
        requiredConcepts: rubric.requiredConcepts as string[],
        acceptEquivalentWording: rubric.acceptEquivalentWording,
        notes: rubric.notes,
      },
      localizedPrompt: output.localizedPrompt,
      localizedOptions,
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
        localizedPrompt: { type: 'string' },
        localizedOptions: { type: 'array', items: option, maxItems: 8 },
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
        'localizedPrompt',
        'localizedOptions',
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
