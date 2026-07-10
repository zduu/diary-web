import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../test/renderWithTheme';
import { MarkdownRenderer } from './MarkdownRenderer';

function setClipboard(value: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  });
}

function setExecCommand(result: boolean) {
  const execCommand = vi.fn().mockReturnValue(result);
  Object.defineProperty(document, 'execCommand', {
    value: execCommand,
    configurable: true,
  });
  return execCommand;
}

describe('MarkdownRenderer', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setClipboard(undefined);
  });

  it('copies code blocks with the async clipboard api', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const execCommand = setExecCommand(true);

    renderWithTheme(<MarkdownRenderer content={'```ts\nconst value = 1;\n```'} />);

    fireEvent.click(screen.getByRole('button', { name: '复制代码' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('const value = 1;');
    });
    expect(execCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '复制代码' })).toHaveTextContent('已复制');
  });

  it('falls back to textarea copy when async clipboard is blocked', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
    setClipboard({ writeText });
    const execCommand = setExecCommand(true);

    renderWithTheme(<MarkdownRenderer content={'```js\nconsole.log("ok");\n```'} />);

    fireEvent.click(screen.getByRole('button', { name: '复制代码' }));

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
    });
    expect(writeText).toHaveBeenCalledWith('console.log("ok");');
    expect(document.querySelector('textarea')).toBeNull();
    expect(screen.getByRole('button', { name: '复制代码' })).toHaveTextContent('已复制');
  });

  it('shows a copy failure state and removes the temporary textarea when fallback copy fails', async () => {
    setClipboard(undefined);
    setExecCommand(false);

    renderWithTheme(<MarkdownRenderer content={'```\ncopy me\n```'} />);

    fireEvent.click(screen.getByRole('button', { name: '复制代码' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '复制代码' })).toHaveTextContent('复制失败');
    });
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('sanitizes markdown links and preserves safe link attributes', () => {
    renderWithTheme(
      <MarkdownRenderer
        content={'[安全](https://example.com/path?q=1) [邮箱](mailto:test@example.com) [危险](javascript:alert(1))'}
      />
    );

    const safeLink = screen.getByRole('link', { name: '安全' });
    expect(safeLink).toHaveAttribute('href', 'https://example.com/path?q=1');
    expect(safeLink).toHaveAttribute('target', '_blank');
    expect(safeLink).toHaveAttribute('rel', 'noreferrer noopener');
    expect(screen.getByRole('link', { name: '邮箱' })).toHaveAttribute('href', 'mailto:test@example.com');
    expect(screen.queryByRole('link', { name: '危险' })).not.toBeInTheDocument();
    expect(screen.getByText('危险')).toBeInTheDocument();
  });

  it('does not render markdown images with unsafe src values', () => {
    renderWithTheme(
      <MarkdownRenderer
        content={'![安全](https://example.com/safe.png)\n\n![危险](javascript:alert(1))'}
      />
    );

    expect(screen.getByAltText('安全')).toHaveAttribute('src', 'https://example.com/safe.png');
    expect(screen.queryByAltText('危险')).not.toBeInTheDocument();
  });

  it('renders embedded markdown images with case-insensitive data image media types', () => {
    renderWithTheme(
      <MarkdownRenderer
        content={'![内嵌](<data:IMAGE/PNG;base64,aGVsbG8=>)'}
      />
    );

    expect(screen.getByAltText('内嵌')).toHaveAttribute('src', 'data:IMAGE/PNG;base64,aGVsbG8=');
  });

  it('does not render markdown data images without base64 payloads', () => {
    renderWithTheme(
      <MarkdownRenderer
        content={'![伪图片](<data:image/svg+xml,<svg onload=alert(1)>>)'}
      />
    );

    expect(screen.queryByAltText('伪图片')).not.toBeInTheDocument();
  });

  it('evicts old markdown image dimension cache entries', async () => {
    let createdImages = 0;
    class MockImage {
      naturalWidth = 640;
      naturalHeight = 320;
      complete = true;
      onload: (() => void) | null = null;
      src = '';

      constructor() {
        createdImages += 1;
      }
    }
    vi.stubGlobal('Image', MockImage);
    const imageUrls = Array.from(
      { length: 65 },
      (_, index) => `https://example.com/cache-test-${index}.png`
    );

    renderWithTheme(
      <MarkdownRenderer
        content={imageUrls.map((url, index) => `![图片 ${index}](${url})`).join('\n\n')}
      />
    );

    await waitFor(() => {
      expect(createdImages).toBe(65);
    });

    cleanup();
    renderWithTheme(<MarkdownRenderer content={`![第一张](${imageUrls[0]})`} />);

    await waitFor(() => {
      expect(createdImages).toBe(66);
    });
  });
});
