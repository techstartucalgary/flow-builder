'use client';

const INLINE_IMAGE_THRESHOLD = 250_000;

export async function normalizeBaseImageUrl(src: string): Promise<string> {
  if (!src.startsWith('data:image/') || src.length <= INLINE_IMAGE_THRESHOLD) {
    return src;
  }

  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return src;
  }
}

export function isObjectUrl(src: string): boolean {
  return src.startsWith('blob:');
}
