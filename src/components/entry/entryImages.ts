import { isValidImageSource } from '../../utils/imageSourceValidation.ts';

export function getRenderableEntryImages(images: string[] | null | undefined): string[] {
  if (!Array.isArray(images)) {
    return [];
  }

  return images.filter(isValidImageSource);
}

export function clampImageIndex(index: number, imageCount: number): number {
  if (imageCount <= 0) {
    return 0;
  }

  if (!Number.isInteger(index) || index < 0) {
    return 0;
  }

  return Math.min(index, imageCount - 1);
}
