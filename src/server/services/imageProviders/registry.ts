import { openAiCompatibleImageProvider } from './openAiCompatible.js';
import { zhipuImageProvider } from './zhipu.js';
import { volcengineImageProvider } from './volcengine.js';
import { minimaxImageProvider } from './minimax.js';
import { dashscopeImageProvider } from './dashscope.js';
import { geminiImagenImageProvider } from './geminiImagen.js';
import type { ImageProviderAdapter, ImageProviderId } from './types.js';

export const IMAGE_PROVIDER_IDS = [
  'openai-compatible',
  'zhipu',
  'volcengine',
  'minimax',
  'dashscope',
  'gemini-imagen',
] as const satisfies readonly ImageProviderId[];

const imageProviderIds = new Set<string>(IMAGE_PROVIDER_IDS);
const imageProviderAdapters = new Map<ImageProviderId, ImageProviderAdapter>([
  [openAiCompatibleImageProvider.id, openAiCompatibleImageProvider],
  [zhipuImageProvider.id, zhipuImageProvider],
  [volcengineImageProvider.id, volcengineImageProvider],
  [minimaxImageProvider.id, minimaxImageProvider],
  [dashscopeImageProvider.id, dashscopeImageProvider],
  [geminiImagenImageProvider.id, geminiImagenImageProvider],
]);

export function normalizeImageProviderId(value: unknown): ImageProviderId | null {
  if (value === null || value === undefined) return 'openai-compatible';
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'openai-compatible';
  return imageProviderIds.has(normalized) ? normalized as ImageProviderId : null;
}

export function resolveImageProviderAdapter(value: unknown): ImageProviderAdapter | null {
  const id = normalizeImageProviderId(value);
  return id ? imageProviderAdapters.get(id) ?? null : null;
}
