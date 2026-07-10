import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiService } from '../services/api';
import { renderWithTheme } from '../test/renderWithTheme';
import { ImageUpload } from './ImageUpload';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe('ImageUpload', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('ignores new file selections while an upload is already running', async () => {
    const upload = createDeferred<{ url: string; storage: 'r2' }>();
    const uploadImageSpy = vi
      .spyOn(apiService, 'uploadImageWithStatus')
      .mockReturnValue(upload.promise);
    const onImagesChange = vi.fn();

    renderWithTheme(
      <ImageUpload images={[]} onImagesChange={onImagesChange} />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const firstFile = new File(['first'], 'first.png', { type: 'image/png' });
    const secondFile = new File(['second'], 'second.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [firstFile] } });
    expect(await screen.findByText('上传中... 1/1')).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [secondFile] } });
    expect(uploadImageSpy).toHaveBeenCalledTimes(1);

    upload.resolve({
      url: '/api/images/first.png',
      storage: 'r2',
    });

    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith(['/api/images/first.png']);
    });
    expect(uploadImageSpy).toHaveBeenCalledTimes(1);
  });

  it('warns when selected files exceed the remaining image slots', async () => {
    const uploadImageSpy = vi
      .spyOn(apiService, 'uploadImageWithStatus')
      .mockImplementation(async (file) => ({
        url: `/api/images/${file.name}`,
        storage: 'r2',
      }));
    const onImagesChange = vi.fn();

    renderWithTheme(
      <ImageUpload
        images={['/api/images/existing-a.png', '/api/images/existing-b.png']}
        onImagesChange={onImagesChange}
        maxImages={3}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const firstFile = new File(['first'], 'first.png', { type: 'image/png' });
    const secondFile = new File(['second'], 'second.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [firstFile, secondFile] } });

    expect(await screen.findByText('最多还能上传 1 张图片，已只处理前 1 张')).toBeInTheDocument();
    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith([
        '/api/images/existing-a.png',
        '/api/images/existing-b.png',
        '/api/images/first.png',
      ]);
    });
    expect(uploadImageSpy).toHaveBeenCalledTimes(1);
    expect(uploadImageSpy).toHaveBeenCalledWith(firstFile);
  });

  it('filters unsafe existing image sources before counting, previewing and saving updates', async () => {
    const uploadImageSpy = vi
      .spyOn(apiService, 'uploadImageWithStatus')
      .mockImplementation(async (file) => ({
        url: `/api/images/${file.name}`,
        storage: 'r2',
      }));
    const onImagesChange = vi.fn();

    renderWithTheme(
      <ImageUpload
        images={['javascript:alert(1)', '/api/images/existing.png']}
        onImagesChange={onImagesChange}
        maxImages={2}
      />
    );

    expect(screen.getByText('已上传 1/2 张')).toBeInTheDocument();
    expect(screen.getByAltText('上传的图片 1')).toHaveAttribute('src', '/api/images/existing.png');
    expect(screen.queryByAltText('上传的图片 2')).not.toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['next'], 'next.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith([
        '/api/images/existing.png',
        '/api/images/next.png',
      ]);
    });
    expect(uploadImageSpy).toHaveBeenCalledWith(file);
  });

  it('accepts image mime types case-insensitively', async () => {
    const uploadImageSpy = vi
      .spyOn(apiService, 'uploadImageWithStatus')
      .mockImplementation(async (file) => ({
        url: `/api/images/${file.name}`,
        storage: 'r2',
      }));
    const onImagesChange = vi.fn();

    renderWithTheme(
      <ImageUpload images={[]} onImagesChange={onImagesChange} />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'upper.png', { type: 'IMAGE/PNG' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onImagesChange).toHaveBeenCalledWith(['/api/images/upper.png']);
    });
    expect(uploadImageSpy).toHaveBeenCalledWith(file);
    expect(screen.queryByText('upper.png 不是有效的图片文件')).not.toBeInTheDocument();
  });

  it('rejects empty image files before upload', async () => {
    const uploadImageSpy = vi.spyOn(apiService, 'uploadImageWithStatus');
    const onImagesChange = vi.fn();

    renderWithTheme(
      <ImageUpload images={[]} onImagesChange={onImagesChange} />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([], 'empty.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('empty.png 文件为空')).toBeInTheDocument();
    expect(uploadImageSpy).not.toHaveBeenCalled();
    expect(onImagesChange).not.toHaveBeenCalled();
  });
});
