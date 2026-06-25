const SUPPORTED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

interface ProviderImageAttachment {
  filename: string;
  mimeType: string;
  base64Data: string;
  sizeBytes: number;
}

export { SUPPORTED_IMAGE_MIME_TYPES };
export type { ProviderImageAttachment };
