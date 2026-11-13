import { ConfigService } from '@nestjs/config';
import { AiOpponentAnswerInput } from './ai-opponent-answer.port';
import { OpenAiResponsesAiOpponentAdapter } from './openai-responses-ai-opponent.adapter';

describe('OpenAiResponsesAiOpponentAdapter', () => {
  const multipleChoiceInput: AiOpponentAnswerInput = {
    answerType: 'MULTIPLE_CHOICE',
    question: 'Which planet is known as the Red Planet?',
    options: [
      { id: 'mars', text: 'Mars' },
      { id: 'venus', text: 'Venus' },
      { id: 'jupiter', text: 'Jupiter' },
      { id: 'mercury', text: 'Mercury' },
    ],
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let config: ConfigService;
  let adapter: OpenAiResponsesAiOpponentAdapter;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    config = {
      get: jest.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          AI_OPPONENT_API_KEY: 'opponent-test-secret',
          AI_OPPONENT_MODEL: 'test-opponent-model',
          AI_OPPONENT_BASE_URL: 'https://api.openai.com/v1/',
          AI_OPPONENT_TIMEOUT_MS: '6000',
        };
        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;
    adapter = new OpenAiResponsesAiOpponentAdapter(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function respond(answer: string) {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify({ answer }) },
            ],
          },
        ],
      }),
    });
  }

  it('sends only visible question data through strict Responses API output', async () => {
    respond('mars');

    await expect(adapter.generateAnswer(multipleChoiceInput)).resolves.toBe('mars');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect((request.headers as Record<string, string>).Authorization).toBe(
      'Bearer opponent-test-secret',
    );
    expect(request.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(request.body as string);
    expect(body.model).toBe('test-opponent-model');
    expect(body.text.format).toMatchObject({
      type: 'json_schema',
      strict: true,
      schema: { additionalProperties: false, required: ['answer'] },
    });
    expect(body.tools).toBeUndefined();
    const providerInput = JSON.stringify(body.input);
    expect(providerInput).toContain(multipleChoiceInput.question);
    expect(providerInput).toContain('mars');
    expect(providerInput).not.toContain('answerKey');
    expect(providerInput).not.toContain('gradingRubric');
    expect(providerInput).not.toContain('participantId');
  });

  it('supports free-text questions without sending options', async () => {
    respond('Mars');
    await expect(
      adapter.generateAnswer({
        answerType: 'FREE_TEXT',
        question: 'Which planet is known as the Red Planet?',
        options: [],
      }),
    ).resolves.toBe('Mars');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.input[1].content[0].text).toContain('"answer_type":"FREE_TEXT"');
    expect(body.input[1].content[0].text).toContain('"options":[]');
  });

  it('rejects provider responses that are not completed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'incomplete', output: [] }),
    });

    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_INCOMPLETE',
    );
  });

  it('rejects provider refusals and empty output', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }],
      }),
    });
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_REFUSAL',
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'completed', output: [] }),
    });
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_EMPTY_OUTPUT',
    );
  });

  it('rejects malformed JSON, invalid result shapes, and empty or oversized answers', async () => {
    const payload = (text: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
      }),
    });

    fetchMock.mockResolvedValueOnce(payload('{'));
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_INVALID_JSON',
    );

    fetchMock.mockResolvedValueOnce(payload(JSON.stringify({ answer: 42 })));
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_INVALID_RESULT',
    );

    fetchMock.mockResolvedValueOnce(payload(JSON.stringify({ answer: '  ' })));
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_INVALID_ANSWER',
    );

    fetchMock.mockResolvedValueOnce(
      payload(JSON.stringify({ answer: 'x'.repeat(2001) })),
    );
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_INVALID_ANSWER',
    );
  });

  it('normalizes HTTP, timeout, and network failures without exposing provider bodies', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'sensitive provider response',
    });
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_HTTP_429',
    );

    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    );
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_TIMEOUT',
    );

    fetchMock.mockRejectedValueOnce(new Error('socket failure'));
    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_NETWORK_ERROR',
    );
  });

  it('does not make requests without dedicated credentials', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) =>
      key === 'AI_OPPONENT_MODEL' ? 'test-opponent-model' : undefined,
    );

    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_PROVIDER_NOT_CONFIGURED',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid timeout configuration and malformed visible question input', async () => {
    (config.get as jest.Mock).mockImplementation((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        AI_OPPONENT_API_KEY: 'opponent-test-secret',
        AI_OPPONENT_MODEL: 'test-opponent-model',
        AI_OPPONENT_TIMEOUT_MS: '25000',
      };
      return values[key] ?? fallback;
    });

    await expect(adapter.generateAnswer(multipleChoiceInput)).rejects.toThrow(
      'AI_OPPONENT_CONFIGURATION_INVALID',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      adapter.generateAnswer({
        answerType: 'MULTIPLE_CHOICE',
        question: '   ',
        options: [{ id: 'A', text: 'Option A' }],
      }),
    ).rejects.toThrow('AI_OPPONENT_INPUT_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
