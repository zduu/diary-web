const MAX_COMPRESSED_IMAGE_BYTES = 1.6 * 1024 * 1024;
const MIN_COMPRESSION_SIZE_BYTES = 450 * 1024;
const COMPRESSION_STEPS = [
  { maxDimension: 1600, quality: 0.82 },
  { maxDimension: 1400, quality: 0.78 },
  { maxDimension: 1280, quality: 0.74 },
  { maxDimension: 1080, quality: 0.68 },
] as const;

function shouldSkipCompression(file: File) {
  return !file.type.startsWith('image/')
    || file.type === 'image/gif'
    || file.type === 'image/svg+xml'
    || file.size < MIN_COMPRESSION_SIZE_BYTES;
}

function canUseBrowserCompressionApis() {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function';
}

function replaceFileExtension(filename: string, nextExtension: string) {
  const normalizedName = filename.trim() || 'image';
  return normalizedName.replace(/\.[a-z0-9]+$/i, '') + nextExtension;
}

function pickOutputType(file: File) {
  if (file.type === 'image/png' || file.type === 'image/webp') {
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

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      image.onload = null;
      image.onerror = null;
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('图片加载失败，无法压缩'));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, outputType: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), outputType, quality);
  });
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (shouldSkipCompression(file) || !canUseBrowserCompressionApis()) {
    return file;
  }

  try {
    const image = await loadImageFromFile(file);
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
