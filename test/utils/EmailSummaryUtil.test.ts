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

<p><strong>Key details:</strong></p>
<ul>
<li>Budget requested is $12,000.</li>
<li>Launch is planned for May 20.</li>
</ul>

<p><strong>Action items:</strong></p>
<ul>
<li>Approve or reject the budget by Friday.</li>
</ul>

<p><em>Powered by Mail-Otter</em></p>`);
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

<p><strong>Key details:</strong></p>
<ul>
<li>No key details noted.</li>
</ul>

<p><strong>Action items:</strong></p>
<ul>
<li>None.</li>
</ul>

<p><em>Powered by Mail-Otter</em></p>`);
  });

  it('throws when the AI response cannot be parsed into the summary schema', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: '{"wrong":true}',
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmail(ai, 'model', 'Status', 'sam@example.com', 'body')).rejects.toThrow(
      new AiSummaryRetryableError('Workers AI did not return a valid summary.'),
    );
  });

  it('does not request JSON mode from gpt-oss-120b and parses fenced JSON output', async () => {
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

<p><strong>Key details:</strong></p>
<ul>
<li>Budget is $12,000.</li>
</ul>

<p><strong>Action items:</strong></p>
<ul>
<li>Approve the budget by Friday.</li>
</ul>

<p><em>Powered by Mail-Otter</em></p>`);
    expect(ai.run).toHaveBeenCalledWith(
      '@cf/openai/gpt-oss-120b',
      expect.not.objectContaining({
        response_format: expect.anything(),
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

<p><strong>Key details:</strong></p>
<ul>
<li>Launch starts Monday.</li>
</ul>

<p><strong>Action items:</strong></p>
<ul>
<li>None.</li>
</ul>

<p><em>Powered by Mail-Otter</em></p>`);
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
});
