import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareImageForUpload } from './imageUploadCompression';

const originalRevokeObjectUrl = URL.revokeObjectURL;

function createImageFile(options: { size: number; type?: string; name?: string }) {
  return new File(
    [new Uint8Array(options.size)],
    options.name ?? 'image.png',
    { type: options.type ?? 'image/png', lastModified: 1_700_000_000_000 },
  );
}

describe('imageUploadCompression', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectUrl,
      configurable: true,
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('skips compression for small images', async () => {
    const file = createImageFile({ size: 120 * 1024 });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

    await expect(prepareImageForUpload(file)).resolves.toBe(file);
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('skips compression for GIF and SVG images', async () => {
    const gif = createImageFile({ size: 900 * 1024, type: 'IMAGE/GIF', name: 'animated.gif' });
    const svg = createImageFile({ size: 900 * 1024, type: 'IMAGE/SVG+XML', name: 'vector.svg' });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

    await expect(prepareImageForUpload(gif)).resolves.toBe(gif);
    await expect(prepareImageForUpload(svg)).resolves.toBe(svg);
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('returns the original file when object URL cleanup APIs are unavailable', async () => {
    const file = createImageFile({ size: 900 * 1024 });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

    Object.defineProperty(URL, 'revokeObjectURL', {
      value: undefined,
      configurable: true,
    });

    await expect(prepareImageForUpload(file)).resolves.toBe(file);
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('returns the original file when canvas blob export is unavailable', async () => {
    const file = createImageFile({ size: 900 * 1024 });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;

    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: undefined,
      configurable: true,
    });

    try {
      await expect(prepareImageForUpload(file)).resolves.toBe(file);
      expect(createObjectUrl).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        value: originalToBlob,
        configurable: true,
      });
    }
  });

  it('returns the original file when decoded image dimensions are invalid', async () => {
    const file = createImageFile({ size: 900 * 1024 });
    const createElementSpy = vi.spyOn(document, 'createElement');

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-image');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    class ZeroWidthImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 400;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', ZeroWidthImage);

    await expect(prepareImageForUpload(file)).resolves.toBe(file);
    expect(createElementSpy).not.toHaveBeenCalledWith('canvas');
  });

  it('returns the original file when image decoding never settles', async () => {
    vi.useFakeTimers();

    const file = createImageFile({ size: 900 * 1024 });
    const createElementSpy = vi.spyOn(document, 'createElement');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hanging-image');

    class HangingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1200;
      naturalHeight = 800;

      set src(_value: string) {
        // Simulate a browser/image decoder that never resolves.
      }
    }

    vi.stubGlobal('Image', HangingImage);

    const preparedFile = prepareImageForUpload(file);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(preparedFile).resolves.toBe(file);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:hanging-image');
    expect(createElementSpy).not.toHaveBeenCalledWith('canvas');
  });

  it('returns the original file when canvas blob export never settles', async () => {
    vi.useFakeTimers();

    const file = createImageFile({ size: 900 * 1024 });
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let toBlobCalls = 0;

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hanging-canvas');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      drawImage: vi.fn(),
    }) as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {
      toBlobCalls += 1;
    });

    class LoadedImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1200;
      naturalHeight = 800;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', LoadedImage);

    const preparedFile = prepareImageForUpload(file);

    for (let index = 0; index < 5 && toBlobCalls === 0; index += 1) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    }

    expect(toBlobCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(preparedFile).resolves.toBe(file);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:hanging-canvas');
  });
});
