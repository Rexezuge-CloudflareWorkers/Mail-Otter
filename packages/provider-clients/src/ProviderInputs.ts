import { SUPPORTED_IMAGE_MIME_TYPES, type ProviderImageAttachment } from './AttachmentTypes';

/**
Shared calendar-event shape; each provider maps it to its wire format.
*/
interface CalendarEventInput {
  readonly title: string;
  readonly startDateTime: string;
  readonly endDateTime: string;
  readonly timeZone?: string;
  readonly description?: string;
  readonly location?: string;
  readonly attendees?: readonly string[];
}

/**
Shared reply-draft shape; threading headers stay provider-agnostic.
*/
interface DraftReplyInput {
  readonly inReplyToMessageId?: string;
  readonly threadId?: string | null;
  readonly htmlBody: string;
}

/**
Shared summary/digest send shape (`X-Mail-Otter-Summary` intent).
*/
interface SummarySendInput {
  readonly subject: string;
  readonly htmlBody: string;
  readonly markAsSummary: boolean;
}

interface ImageAttachmentFilter {
  readonly maxSizeBytes: number;
  readonly maxCount: number;
}

function normalizeImageAttachmentFilter(input: Partial<ImageAttachmentFilter> & { maxSizeBytes: number }): ImageAttachmentFilter {
  return { maxCount: input.maxCount ?? 5, maxSizeBytes: input.maxSizeBytes };
}

function isSupportedImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
Keep the N-filter loop identical across Gmail/Outlook/JMAP fetchers.
*/
function filterImageAttachments(candidates: readonly ProviderImageAttachment[], filter: ImageAttachmentFilter): ProviderImageAttachment[] {
  const selected: ProviderImageAttachment[] = [];
  for (const candidate of candidates) {
    if (selected.length >= filter.maxCount) break;
    if (!isSupportedImageMimeType(candidate.mimeType)) continue;
    if (candidate.sizeBytes > filter.maxSizeBytes) continue;
    selected.push(candidate);
  }
  return selected;
}

/**
 * Single `isMessageNotFoundError` helper. Gmail matches one 404 pattern,
 * Outlook matches three — call sites previously duplicated both.
 */
function isProviderNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /request failed \(404\)/i.test(error.message) ||
    /ErrorItemNotFound/i.test(error.message) ||
    /ResourceNotFound/i.test(error.message) ||
    /could not find/i.test(error.message)
  );
}

export { filterImageAttachments, isProviderNotFoundError, isSupportedImageMimeType, normalizeImageAttachmentFilter };
export type { CalendarEventInput, DraftReplyInput, ImageAttachmentFilter, SummarySendInput };
