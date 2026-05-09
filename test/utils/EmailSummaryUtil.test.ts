import { EmailSummaryUtil } from '@/utils';
import { InternalServerError } from '@/error';

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
      .resolves.toBe(`Gist: The sender wants approval for the May campaign budget.

Key details:
- Budget requested is $12,000.
- Launch is planned for May 20.

Action items:
- Approve or reject the budget by Friday.

<Mail-Otter Summary>`);
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
      .toBe(`Gist: The email shares a status update with no requests.

Key details:
- No key details noted.

Action items:
- None.

<Mail-Otter Summary>`);
  });

  it('throws when the AI response cannot be parsed into the summary schema', async () => {
    const ai = {
      run: vi.fn().mockResolvedValue({
        response: '{"wrong":true}',
      }),
    } as unknown as Ai;

    await expect(EmailSummaryUtil.summarizeEmail(ai, 'model', 'Status', 'sam@example.com', 'body')).rejects.toThrow(
      new InternalServerError('Workers AI did not return a valid summary.'),
    );
  });
});
