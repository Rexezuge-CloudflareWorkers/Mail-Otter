import type { ProviderImageAttachment } from '@mail-otter/provider-clients';
import type { EmailActionProposal } from '@mail-otter/shared/model';
import { WorkersAiResponseUtil } from './WorkersAiResponseUtil';
import type { AiTextGenerationUsage } from './WorkersAiResponseUtil';

const VISION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'actions'],
  properties: {
    summary: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'title', 'description', 'parameters'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'delivery.track_package',
              'travel.track_flight',
              'finance.pay_bill',
              'appointment.confirm',
              'manual.todo',
            ],
          },
          title: { type: 'string' },
          description: { type: 'string' },
          confidence: { type: 'number' },
          parameters: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
} as const;

const VISION_SYSTEM_PROMPT =
  'You are an assistant that extracts structured data from email attachment images. ' +
  'Return only JSON: {"summary":"one sentence describing the attachment","actions":[...]}. ' +
  'If the image is a receipt or invoice use finance.pay_bill with parameters payee, amount, currency, dueDate, invoiceNumber as available. ' +
  'If the image is a boarding pass or flight ticket use travel.track_flight with parameters flightNumber, airline, departureAirport, arrivalAirport, departureTime as available. ' +
  'If the image is a package or shipping label use delivery.track_package with parameters trackingNumber and carrier as available. ' +
  'If the image is an appointment or booking confirmation use appointment.confirm with parameters serviceType, providerName, appointmentTime, confirmationNumber as available. ' +
  'Use manual.todo only for other useful actionable content; parameters must include instructions. ' +
  'Return an empty actions array if the image contains no actionable content. ' +
  'Do not invent facts. Do not create URLs.';

interface AttachmentAnalysisResult {
  attachmentSummaries: string[];
  actionProposals: EmailActionProposal[];
  totalUsage?: AiTextGenerationUsage;
}

interface VisionJsonOutput {
  summary?: string;
  actions?: Array<{
    type?: string;
    title?: string;
    description?: string;
    confidence?: number;
    parameters?: Record<string, unknown>;
  }>;
}

class AttachmentAnalysisUtil {
  public static async analyzeAttachments(
    ai: Ai,
    visionModel: string,
    subject: string,
    from: string,
    attachments: ProviderImageAttachment[],
  ): Promise<AttachmentAnalysisResult> {
    const attachmentSummaries: string[] = [];
    const actionProposals: EmailActionProposal[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let hasUsage = false;

    for (const attachment of attachments) {
      try {
        const result = await this.analyzeOne(ai, visionModel, subject, from, attachment);
        if (result.summary) {
          attachmentSummaries.push(`${attachment.filename}: ${result.summary}`);
        }
        actionProposals.push(...result.proposals);
        if (result.usage) {
          hasUsage = true;
          totalPromptTokens += result.usage.promptTokens ?? 0;
          totalCompletionTokens += result.usage.completionTokens ?? 0;
          totalTokens += result.usage.totalTokens ?? 0;
        }
      } catch (error) {
        console.warn(`[AttachmentAnalysisUtil] Vision analysis failed for ${attachment.filename}:`, error);
      }
    }

    return {
      attachmentSummaries,
      actionProposals,
      totalUsage: hasUsage ? { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens, totalTokens } : undefined,
    };
  }

  private static async analyzeOne(
    ai: Ai,
    visionModel: string,
    subject: string,
    from: string,
    attachment: ProviderImageAttachment,
  ): Promise<{ summary?: string; proposals: EmailActionProposal[]; usage?: AiTextGenerationUsage }> {
    const request = {
      messages: [
        { role: 'system', content: VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Email subject: ${subject}\nFrom: ${from}\nAttachment: ${attachment.filename}` },
            { type: 'image_url', image_url: { url: `data:${attachment.mimeType};base64,${attachment.base64Data}` } },
          ],
        },
      ],
      max_tokens: 600,
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'attachment_analysis', schema: VISION_JSON_SCHEMA, strict: true },
      },
    };

    const result = await (ai as unknown as { run: (...args: unknown[]) => Promise<unknown> }).run(visionModel, request);
    const usage = WorkersAiResponseUtil.extractUsage(result);
    const text = WorkersAiResponseUtil.extractResponseText(result);
    if (!text) return { proposals: [], usage };

    const jsonText = WorkersAiResponseUtil.extractJsonObjectText(text) ?? text;
    let parsed: VisionJsonOutput;
    try {
      parsed = JSON.parse(jsonText) as VisionJsonOutput;
    } catch {
      return { proposals: [], usage };
    }

    const proposals: EmailActionProposal[] = (parsed.actions ?? [])
      .filter((a) => typeof a.type === 'string' && typeof a.title === 'string' && typeof a.description === 'string')
      .map((a) => ({
        type: a.type as EmailActionProposal['type'],
        title: a.title!,
        description: a.description!,
        confidence: typeof a.confidence === 'number' ? a.confidence : undefined,
        parameters: a.parameters,
      }));

    return { summary: typeof parsed.summary === 'string' ? parsed.summary : undefined, proposals, usage };
  }
}

export { AttachmentAnalysisUtil };
export type { AttachmentAnalysisResult };
