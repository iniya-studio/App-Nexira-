import { ConfigService } from '@nestjs/config';
import { JudgeDecision } from '@prisma/client';
import { FreeTextJudgeError } from './answer-judge.port';
import { OpenAiResponsesAnswerJudgeAdapter } from './openai-responses-answer-judge.adapter';

describe('OpenAiResponsesAnswerJudgeAdapter', () => {
  const input = {
    canonicalQuestion: 'Which planet is known as the Red Planet?',
    language: 'en',
    expectedAnswer: 'Mars',
    gradingRubric: { requiredConcepts: ['Mars'] },
    participantResponse: 'The fourth planet, Mars.',
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let config: ConfigService;
  let adapter: OpenAiResponsesAnswerJudgeAdapter;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          OPENAI_API_KEY: 'test-secret',
          OPENAI_MODEL: 'test-model',
          OPENAI_BASE_URL: 'https://api.openai.com/v1',
          AI_JUDGE_TIMEOUT_MS: '8000',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    adapter = new OpenAiResponsesAnswerJudgeAdapter(config);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uses the Responses API with strict structured output and returns a normalized decision', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  decision: 'CORRECT',
                  confidence: 0.98,
                  reason_code: 'MEANING_MATCH',
                  rationale: 'The response identifies Mars correctly.',
                }),
              },
            ],
          },
        ],
      }),
    });

    await expect(adapter.judge(input)).resolves.toEqual({
      decision: JudgeDecision.CORRECT,
      confidence: 0.98,
      reasonCode: 'MEANING_MATCH',
      rationale: 'The response identifies Mars correctly.',
      provider: 'openai',
      model: 'test-model',
      policyVersion: 'free-text-semantic-v1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((request.headers as Record<string, string>).Authorization).toBe('Bearer test-secret');
    const body = JSON.parse(request.body as string);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.strict).toBe(true);
    expect(body.tools).toBeUndefined();
    expect(body.input[1].content[0].text).toContain('The fourth planet, Mars.');
    expect(body.input[0].content[0].text).toContain('untrusted data');
  });

  it('returns UNCERTAIN without converting it to INCORRECT', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              decision: 'UNCERTAIN',
              confidence: 0.42,
              reason_code: 'AMBIGUOUS',
              rationale: 'The answer lacks enough context.',
            }),
          }],
        }],
      }),
    });

    await expect(adapter.judge(input)).resolves.toMatchObject({
      decision: JudgeDecision.UNCERTAIN,
      confidence: 0.42,
    });
  });

  it('rejects a malformed provider response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: '{"decision":"CORRECT"}' }],
        }],
      }),
    });

    await expect(adapter.judge(input)).rejects.toBeInstanceOf(FreeTextJudgeError);
  });

  it('does not send a request when provider credentials are missing', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'OPENAI_MODEL' ? 'test-model' : undefined,
    );

    await expect(adapter.judge(input)).rejects.toMatchObject({
      code: 'JUDGE_PROVIDER_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects HTTP errors without exposing provider response bodies', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    await expect(adapter.judge(input)).rejects.toMatchObject({
      code: 'JUDGE_PROVIDER_HTTP_429',
    });
  });
});
