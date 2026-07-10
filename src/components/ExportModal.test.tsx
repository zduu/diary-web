import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry } from '../types';
import { renderWithTheme } from '../test/renderWithTheme';
import * as exportUtils from '../utils/exportUtils';
import { ExportModal } from './ExportModal';

const sampleEntry: DiaryEntry = {
  id: 1,
  title: '导出测试',
  content: '导出内容',
  content_type: 'markdown',
  images: ['/api/images/sample.png'],
  hidden: false,
  created_at: '2026-04-12T10:00:00.000Z',
  updated_at: '2026-04-12T10:00:00.000Z',
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe('ExportModal', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the modal open and prevents duplicate exports while exporting', async () => {
    const packageImages = createDeferred<Awaited<ReturnType<typeof exportUtils.packageDiaryEntryImagesForExport>>>();
    const packageImagesSpy = vi
      .spyOn(exportUtils, 'packageDiaryEntryImagesForExport')
      .mockReturnValue(packageImages.promise);
    vi.spyOn(exportUtils, 'downloadBlobFile').mockImplementation(() => {});
    const onClose = vi.fn();

    renderWithTheme(
      <ExportModal
        isOpen={true}
        onClose={onClose}
        entries={[sampleEntry]}
        exportType="全部日记"
      />
    );

    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    fireEvent.click(screen.getByRole('button', { name: '导出' }));
    expect(await screen.findByRole('button', { name: '导出中...' })).toBeDisabled();

    const headerCloseButton = screen.getAllByRole('button')[0];
    fireEvent.click(headerCloseButton);
    fireEvent.click(screen.getByRole('button', { name: '导出中...' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(packageImagesSpy).toHaveBeenCalledTimes(1);

    packageImages.resolve({
      entries: [sampleEntry],
      packagedImageCount: 0,
      failedImageCount: 0,
    });
  });
});
