import { EmailSummaryUtil } from '@mail-otter/backend-services/email';
import { AiSummaryRetryableError } from '@mail-otter/backend-errors';

describe('EmailSummaryUtil', () => {
  it('renders a consistent summary format from structured AI output', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({
          gist: 'The sender wants approval for the May campaign budget.',
          keyDetails: ['Budget requested is $12,000.', 'Launch is planned for May 20.'],
          actionItems: ['Approve or reject the budget by Friday.'],
        }),
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmail(ai, '@cf/meta/llama-3.1-8b-instruct', 'Campaign budget', 'sam@example.com', 'body'))
      .resolves.toBe(`<p><strong>Gist:</strong> The sender wants approval for the May campaign budget.</p>

<p><strong>Details:</strong></p>
<ul>
<li>Budget requested is $12,000.</li>
<li>Launch is planned for May 20.</li>
</ul>

<p><strong>Actions:</strong></p>
<ul>
<li>Approve or reject the budget by Friday.</li>
</ul>`);
    expect(ai.run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.1-8b-instruct',
      expect.objectContaining({
        response_format: expect.objectContaining({
          type: 'json_schema',
        }),
      }),
    );
  });

  it('fills empty sections with stable fallback text', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({
          gist: 'The email shares a status update with no requests.',
          keyDetails: [],
          actionItems: [],
        }),
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmail(ai, 'model', 'Status', 'sam@example.com', 'body')).resolves
      .toBe(`<p><strong>Gist:</strong> The email shares a status update with no requests.</p>

<p><strong>Details:</strong></p>
<ul>
<li>No key details noted.</li>
</ul>

<p><strong>Actions:</strong></p>
<ul>
<li>None.</li>
</ul>`);
  });

  it('throws with usage details when the AI response cannot be parsed into the summary schema', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: '{"wrong":true}',
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 12,
          total_tokens: 1012,
        },
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmail(ai, 'model', 'Status', 'sam@example.com', 'body')).rejects.toMatchObject({
      message: 'Workers AI did not return a valid summary.',
      aiOutputText: '{"wrong":true}',
      aiUsage: {
        promptTokens: 1000,
        completionTokens: 12,
        totalTokens: 1012,
      },
    } satisfies Partial<AiSummaryRetryableError>);
  });

  it('requests JSON mode and low reasoning from gpt-oss-120b', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: `Here is the summary:

\`\`\`json
{
  "gist": "The sender needs approval for the budget.",
  "keyDetails": ["Budget is $12,000."],
  "actionItems": ["Approve the budget by Friday."]
}
\`\`\``,
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmail(ai, '@cf/openai/gpt-oss-120b', 'Campaign budget', 'sam@example.com', 'body')).resolves
      .toBe(`<p><strong>Gist:</strong> The sender needs approval for the budget.</p>

<p><strong>Details:</strong></p>
<ul>
<li>Budget is $12,000.</li>
</ul>

<p><strong>Actions:</strong></p>
<ul>
<li>Approve the budget by Friday.</li>
</ul>`);
    expect(ai.run).toHaveBeenCalledWith(
      '@cf/openai/gpt-oss-120b',
      expect.objectContaining({
        response_format: {
          type: 'json_schema',
          json_schema: expect.objectContaining({
            name: 'email_summary',
            strict: true,
          }),
        },
        reasoning_effort: 'low',
        chat_template_kwargs: { enable_thinking: false },
      }),
    );
  });

  it('extracts summary text from Responses API output', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  gist: 'The email shares a launch update.',
                  keyDetails: ['Launch starts Monday.'],
                  actionItems: [],
                }),
              },
            ],
          },
        ],
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmail(ai, '@cf/openai/gpt-oss-120b', 'Launch', 'sam@example.com', 'body')).resolves
      .toBe(`<p><strong>Gist:</strong> The email shares a launch update.</p>

<p><strong>Details:</strong></p>
<ul>
<li>Launch starts Monday.</li>
</ul>

<p><strong>Actions:</strong></p>
<ul>
<li>None.</li>
</ul>`);
  });

  it('returns token usage with summarized email output when available', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: JSON.stringify({
          gist: 'The email asks for feedback.',
          keyDetails: ['Review is due Tuesday.'],
          actionItems: ['Send feedback by Tuesday.'],
        }),
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 100,
          total_tokens: 1100,
        },
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmailWithUsage(ai, '@cf/openai/gpt-oss-120b', 'Review', 'sam@example.com', 'body')).resolves
      .toMatchObject({
        summary: expect.stringContaining('<strong>Gist:</strong> The email asks for feedback.'),
        usage: {
          promptTokens: 1000,
          completionTokens: 100,
          totalTokens: 1100,
        },
      });
  });

  it('uses Responses API totals as billed output tokens when they exceed visible output tokens', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        output_text: JSON.stringify({
          gist: 'The email asks for feedback.',
          keyDetails: ['Review is due Tuesday.'],
          actionItems: ['Send feedback by Tuesday.'],
        }),
        usage: {
          input_tokens: 1000,
          output_tokens: 100,
          total_tokens: 1800,
          output_tokens_details: {
            reasoning_tokens: 700,
          },
        },
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmailWithUsage(ai, '@cf/openai/gpt-oss-120b', 'Review', 'sam@example.com', 'body')).resolves
      .toMatchObject({
        summary: expect.stringContaining('<strong>Gist:</strong> The email asks for feedback.'),
        usage: {
          promptTokens: 1000,
          completionTokens: 800,
          totalTokens: 1800,
          reasoningTokens: 700,
        },
      });
  });

  it('uses Chat Completions totals as billed output tokens when reasoning details are present', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                gist: 'The email asks for feedback.',
                keyDetails: ['Review is due Tuesday.'],
                actionItems: ['Send feedback by Tuesday.'],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 100,
          total_tokens: 1800,
          completion_tokens_details: {
            reasoning_tokens: 700,
          },
        },
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmailWithUsage(ai, '@cf/openai/gpt-oss-120b', 'Review', 'sam@example.com', 'body')).resolves
      .toMatchObject({
        summary: expect.stringContaining('<strong>Gist:</strong> The email asks for feedback.'),
        usage: {
          promptTokens: 1000,
          completionTokens: 800,
          totalTokens: 1800,
          reasoningTokens: 700,
        },
      });
  });
});
