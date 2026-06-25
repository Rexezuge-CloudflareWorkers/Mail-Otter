import { AttachmentAnalysisUtil } from '@mail-otter/backend-services/email';
import type { ProviderImageAttachment } from '@mail-otter/provider-clients';

const makeAttachment = (overrides: Partial<ProviderImageAttachment> = {}): ProviderImageAttachment => ({
  filename: 'receipt.jpg',
  mimeType: 'image/jpeg',
  base64Data: 'abc123',
  sizeBytes: 1024,
  ...overrides,
});

const makeAi = (response: unknown) =>
  ({
    run: vi.fn().mockResolvedValue({ response: typeof response === 'string' ? response : JSON.stringify(response) }),
  }) as unknown as Ai;

describe('AttachmentAnalysisUtil', () => {
  describe('analyzeAttachments', () => {
    it('returns extracted summary and action proposals from a single image', async () => {
      const ai = makeAi({
        summary: 'Receipt from Acme for $42.00.',
        actions: [
          { type: 'finance.pay_bill', title: 'Pay Acme Invoice', description: 'Invoice #123', parameters: { payee: 'Acme', amount: '42.00', currency: 'USD' } },
        ],
      });

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        '@cf/meta/llama-3.2-11b-vision-instruct',
        'Your receipt',
        'noreply@acme.com',
        [makeAttachment()],
      );

      expect(result.attachmentSummaries).toEqual(['receipt.jpg: Receipt from Acme for $42.00.']);
      expect(result.actionProposals).toHaveLength(1);
      expect(result.actionProposals[0]).toMatchObject({
        type: 'finance.pay_bill',
        title: 'Pay Acme Invoice',
        description: 'Invoice #123',
      });
    });

    it('accumulates summaries and proposals across multiple attachments', async () => {
      const ai = {
        run: vi.fn()
          .mockResolvedValueOnce({
            response: JSON.stringify({ summary: 'Boarding pass summary.', actions: [{ type: 'travel.track_flight', title: 'Track Flight', description: 'AA100', parameters: { flightNumber: 'AA100' } }] }),
          })
          .mockResolvedValueOnce({
            response: JSON.stringify({ summary: 'Package label.', actions: [{ type: 'delivery.track_package', title: 'Track Package', description: 'UPS', parameters: { trackingNumber: '1Z999' } }] }),
          }),
      } as unknown as Ai;

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        'vision-model',
        'Your shipment',
        'shipping@carrier.com',
        [makeAttachment({ filename: 'boarding.jpg' }), makeAttachment({ filename: 'label.jpg' })],
      );

      expect(result.attachmentSummaries).toHaveLength(2);
      expect(result.attachmentSummaries[0]).toContain('boarding.jpg');
      expect(result.attachmentSummaries[1]).toContain('label.jpg');
      expect(result.actionProposals).toHaveLength(2);
    });

    it('returns empty results for empty attachments array', async () => {
      const ai = makeAi({});

      const result = await AttachmentAnalysisUtil.analyzeAttachments(ai, 'model', 'subject', 'from@example.com', []);

      expect(result.attachmentSummaries).toEqual([]);
      expect(result.actionProposals).toEqual([]);
      expect(result.totalUsage).toBeUndefined();
      expect((ai as unknown as { run: ReturnType<typeof vi.fn> }).run).not.toHaveBeenCalled();
    });

    it('skips an attachment and continues when AI call throws', async () => {
      const ai = {
        run: vi.fn()
          .mockRejectedValueOnce(new Error('Vision model unavailable'))
          .mockResolvedValueOnce({
            response: JSON.stringify({ summary: 'Package label.', actions: [] }),
          }),
      } as unknown as Ai;

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        'model',
        'subject',
        'from@example.com',
        [makeAttachment({ filename: 'bad.jpg' }), makeAttachment({ filename: 'good.jpg' })],
      );

      expect(result.attachmentSummaries).toEqual(['good.jpg: Package label.']);
      expect(result.actionProposals).toEqual([]);
    });

    it('omits summary when AI returns no summary field', async () => {
      const ai = makeAi({ actions: [] });

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        'model',
        'subject',
        'from@example.com',
        [makeAttachment()],
      );

      expect(result.attachmentSummaries).toEqual([]);
    });

    it('filters out action items missing required fields', async () => {
      const ai = makeAi({
        summary: 'Image summary.',
        actions: [
          { type: 'finance.pay_bill', title: 'Pay Bill', description: 'Due', parameters: {} },
          { type: 'manual.todo', description: 'Missing title', parameters: {} },
          { title: 'Missing type', description: 'test', parameters: {} },
        ],
      });

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        'model',
        'subject',
        'from@example.com',
        [makeAttachment()],
      );

      expect(result.actionProposals).toHaveLength(1);
      expect(result.actionProposals[0].type).toBe('finance.pay_bill');
    });

    it('returns empty proposals when AI response text is empty', async () => {
      const ai = { run: vi.fn().mockResolvedValue({ response: '' }) } as unknown as Ai;

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        'model',
        'subject',
        'from@example.com',
        [makeAttachment()],
      );

      expect(result.actionProposals).toEqual([]);
      expect(result.attachmentSummaries).toEqual([]);
    });

    it('returns empty proposals when AI response is invalid JSON', async () => {
      const ai = { run: vi.fn().mockResolvedValue({ response: 'not json at all' }) } as unknown as Ai;

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        'model',
        'subject',
        'from@example.com',
        [makeAttachment()],
      );

      expect(result.actionProposals).toEqual([]);
    });

    it('accumulates token usage across multiple attachments', async () => {
      const ai = {
        run: vi.fn()
          .mockResolvedValueOnce({
            response: JSON.stringify({ summary: 'First.', actions: [] }),
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          })
          .mockResolvedValueOnce({
            response: JSON.stringify({ summary: 'Second.', actions: [] }),
            usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
          }),
      } as unknown as Ai;

      const result = await AttachmentAnalysisUtil.analyzeAttachments(
        ai,
        'model',
        'subject',
        'from@example.com',
        [makeAttachment({ filename: 'a.jpg' }), makeAttachment({ filename: 'b.jpg' })],
      );

      expect(result.totalUsage).toBeDefined();
      expect(result.totalUsage?.promptTokens).toBe(300);
      expect(result.totalUsage?.completionTokens).toBe(130);
      expect(result.totalUsage?.totalTokens).toBe(430);
    });

    it('passes the vision model and data URI to the AI run call', async () => {
      const ai = makeAi({ summary: 'Test.', actions: [] });
      const attachment = makeAttachment({ mimeType: 'image/png', base64Data: 'ZGF0YQ==', filename: 'img.png' });

      await AttachmentAnalysisUtil.analyzeAttachments(ai, '@cf/meta/llama-3.2-11b-vision-instruct', 'Subject', 'a@b.com', [attachment]);

      const runMock = (ai as unknown as { run: ReturnType<typeof vi.fn> }).run;
      expect(runMock).toHaveBeenCalledWith(
        '@cf/meta/llama-3.2-11b-vision-instruct',
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({ type: 'image_url', image_url: { url: 'data:image/png;base64,ZGF0YQ==' } }),
              ]),
            }),
          ]),
        }),
      );
    });
  });
});
