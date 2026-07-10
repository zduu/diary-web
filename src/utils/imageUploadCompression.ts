const MAX_COMPRESSED_IMAGE_BYTES = 1.6 * 1024 * 1024;
const MIN_COMPRESSION_SIZE_BYTES = 450 * 1024;
const IMAGE_LOAD_TIMEOUT_MS = 15_000;
const CANVAS_BLOB_TIMEOUT_MS = 15_000;
const COMPRESSION_STEPS = [
  { maxDimension: 1600, quality: 0.82 },
  { maxDimension: 1400, quality: 0.78 },
  { maxDimension: 1280, quality: 0.74 },
  { maxDimension: 1080, quality: 0.68 },
] as const;

function shouldSkipCompression(file: File) {
  const mediaType = file.type.toLowerCase();
  return !mediaType.startsWith('image/')
    || mediaType === 'image/gif'
    || mediaType === 'image/svg+xml'
    || file.size < MIN_COMPRESSION_SIZE_BYTES;
}

function canUseBrowserCompressionApis() {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof Image !== 'undefined'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function'
    && typeof URL.revokeObjectURL === 'function'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.toBlob === 'function';
}

function replaceFileExtension(filename: string, nextExtension: string) {
  const normalizedName = filename.trim() || 'image';
  return normalizedName.replace(/\.[a-z0-9]+$/i, '') + nextExtension;
}

function pickOutputType(file: File) {
  const mediaType = file.type.toLowerCase();
  if (mediaType === 'image/png' || mediaType === 'image/webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function getOutputFilename(file: File, outputType: string) {
  if (outputType === 'image/webp') {
    return replaceFileExtension(file.name, '.webp');
  }

  return replaceFileExtension(file.name, '.jpg');
}

function getScaledDimensions(width: number, height: number, maxDimension: number) {
  const longestSide = Math.max(width, height);
  if (longestSide <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function hasValidImageDimensions(image: HTMLImageElement) {
  return Number.isFinite(image.naturalWidth)
    && Number.isFinite(image.naturalHeight)
    && image.naturalWidth > 0
    && image.naturalHeight > 0;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      image.onload = null;
      image.onerror = null;
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error('图片加载超时，无法压缩')));
    }, IMAGE_LOAD_TIMEOUT_MS);

    image.onload = () => {
      settle(() => resolve(image));
    };
    image.onerror = () => {
      settle(() => reject(new Error('图片加载失败，无法压缩')));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, outputType: string, quality?: number) {
  return new Promise<Blob | null>((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      settle(() => reject(new Error('图片压缩超时')));
    }, CANVAS_BLOB_TIMEOUT_MS);

    try {
      canvas.toBlob((blob) => {
        settle(() => resolve(blob));
      }, outputType, quality);
    } catch {
      settle(() => resolve(null));
    }
  });
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (shouldSkipCompression(file) || !canUseBrowserCompressionApis()) {
    return file;
  }

  try {
    const image = await loadImageFromFile(file);
    if (!hasValidImageDimensions(image)) {
      return file;
    }

    const outputType = pickOutputType(file);
    let bestBlob: Blob | null = null;

    for (const step of COMPRESSION_STEPS) {
      const { width, height } = getScaledDimensions(image.naturalWidth, image.naturalHeight, step.maxDimension);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        return file;
      }

      context.drawImage(image, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, outputType, step.quality);
      if (!blob) {
        continue;
      }

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
        bestBlob = blob;
        break;
      }
    }

    if (!bestBlob) {
      return file;
    }

    const shouldKeepOriginal = bestBlob.size >= file.size * 0.92;
    if (shouldKeepOriginal) {
      return file;
    }

    return new File(
      [bestBlob],
      getOutputFilename(file, bestBlob.type || outputType),
      {
        type: bestBlob.type || outputType,
        lastModified: file.lastModified,
      },
    );
  } catch {
    return file;
  }
}
