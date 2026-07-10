import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Timeline } from './Timeline';
import { AdminAuthProvider } from './AdminAuthContext';
import { ThemeProvider } from './ThemeProvider';
import type { DiaryEntry } from '../types/index.ts';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const sampleEntries: DiaryEntry[] = [
  {
    id: 1,
    title: '公开的一篇',
    content: '这是一条所有人都能看到的内容。',
    content_type: 'markdown',
    mood: 'happy',
    weather: 'sunny',
    tags: ['公开'],
    images: [],
    location: null,
    hidden: false,
    created_at: '2026-04-14T09:00:00.000Z',
    updated_at: '2026-04-14T09:00:00.000Z',
  },
  {
    id: 2,
    title: '第二篇公开内容',
    content: '第二条公开内容会让推荐入口变得有意义。',
    content_type: 'markdown',
    mood: 'neutral',
    weather: 'cloudy',
    tags: ['公开', '复盘'],
    images: [],
    location: null,
    hidden: false,
    created_at: '2026-04-13T09:00:00.000Z',
    updated_at: '2026-04-13T09:00:00.000Z',
  },
  {
    id: 3,
    title: '隐藏的一篇',
    content: '访客不应通过推荐区看到这条内容。',
    content_type: 'markdown',
    mood: 'sad',
    weather: 'rainy',
    tags: ['私密'],
    images: [],
    location: null,
    hidden: true,
    created_at: '2026-04-12T09:00:00.000Z',
    updated_at: '2026-04-12T09:00:00.000Z',
  },
];

function renderTimeline(entries: DiaryEntry[]) {
  return render(
    <ThemeProvider>
      <AdminAuthProvider>
        <Timeline entries={entries} viewMode="card" />
      </AdminAuthProvider>
    </ThemeProvider>
  );
}

describe('Timeline recommendations', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the recommendation block hidden when guests only have one readable entry', () => {
    renderTimeline([sampleEntries[0], sampleEntries[2]]);

    expect(screen.queryByText('给你三条更轻的回看入口。')).not.toBeInTheDocument();
    expect(screen.getByText('公开的一篇')).toBeInTheDocument();
    expect(screen.queryByText('隐藏的一篇')).not.toBeInTheDocument();
  });

  it('shows the recommendation block when guests have multiple readable entries', () => {
    renderTimeline([sampleEntries[0], sampleEntries[1], sampleEntries[2]]);

    expect(screen.getByText('给你三条更轻的回看入口。')).toBeInTheDocument();
    expect(screen.queryByText('隐藏的一篇')).not.toBeInTheDocument();
  });

  it('opens the preview modal from recommendations in timeline view', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <AdminAuthProvider>
          <Timeline entries={[sampleEntries[0], sampleEntries[1], sampleEntries[2]]} viewMode="timeline" />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    await user.click(screen.getAllByRole('button', { name: '打开这篇' })[0]);

    expect(await screen.findByText('日记预览')).toBeInTheDocument();
  });

  it('uses the displayed timeline order for preview navigation', async () => {
    const user = userEvent.setup();
    const olderEntry: DiaryEntry = {
      ...sampleEntries[0],
      id: 10,
      title: '较早公开内容',
      created_at: '2025-01-01T09:00:00.000Z',
    };
    const newerEntry: DiaryEntry = {
      ...sampleEntries[1],
      id: 11,
      title: '较新公开内容',
      created_at: '2026-04-14T09:00:00.000Z',
    };

    render(
      <ThemeProvider>
        <AdminAuthProvider>
          <Timeline entries={[olderEntry, newerEntry]} viewMode="card" recommendationsEnabled={false} />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    await user.click(screen.getByText('较新公开内容'));

    expect(await screen.findByText('日记预览')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('keeps previewing the same entry when the list is reordered', async () => {
    const user = userEvent.setup();
    const firstEntry: DiaryEntry = {
      ...sampleEntries[0],
      id: 20,
      title: '重排前第一篇',
      content: '应保持打开的正文',
      created_at: '2026-04-14T09:00:00.000Z',
    };
    const secondEntry: DiaryEntry = {
      ...sampleEntries[1],
      id: 21,
      title: '重排前第二篇',
      content: '不应意外切换到这里',
      created_at: '2026-04-13T09:00:00.000Z',
    };
    const { rerender } = render(
      <ThemeProvider>
        <AdminAuthProvider>
          <Timeline entries={[firstEntry, secondEntry]} viewMode="card" recommendationsEnabled={false} />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    await user.click(screen.getByText('重排前第一篇'));

    rerender(
      <ThemeProvider>
        <AdminAuthProvider>
          <Timeline
            entries={[
              { ...firstEntry, created_at: '2026-04-12T09:00:00.000Z' },
              { ...secondEntry, created_at: '2026-04-15T09:00:00.000Z' },
            ]}
            viewMode="card"
            recommendationsEnabled={false}
          />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('重排前第一篇')).toBeInTheDocument();
    expect(within(dialog).getByText('2 / 2')).toBeInTheDocument();
    expect(within(dialog).queryByText('重排前第二篇')).not.toBeInTheDocument();
  });

  it('filters unsafe entry images before rendering card thumbnails', () => {
    render(
      <ThemeProvider>
        <AdminAuthProvider>
          <Timeline
            entries={[{
              ...sampleEntries[0],
              images: [
                'javascript:alert(1)',
                'https://example.com/safe.jpg',
              ],
            }]}
            viewMode="card"
            recommendationsEnabled={false}
          />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    const image = screen.getByAltText('图片 1');
    expect(image).toHaveAttribute('src', 'https://example.com/safe.jpg');
    expect(screen.queryByAltText('图片 2')).not.toBeInTheDocument();
  });

  it('renders entry DOM anchors only for valid persisted ids', () => {
    render(
      <ThemeProvider>
        <AdminAuthProvider>
          <Timeline
            entries={[
              {
                ...sampleEntries[0],
                id: 12,
                title: '有效锚点内容',
              },
              {
                ...sampleEntries[1],
                id: Number.NaN,
                title: '无效锚点内容',
              },
            ]}
            viewMode="card"
            recommendationsEnabled={false}
          />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    expect(screen.getByText('有效锚点内容')).toBeInTheDocument();
    expect(screen.getByText('无效锚点内容')).toBeInTheDocument();
    expect(document.getElementById('entry-12')).not.toBeNull();
    expect(document.getElementById('entry-NaN')).toBeNull();

    cleanup();

    render(
      <ThemeProvider>
        <AdminAuthProvider>
          <Timeline
            entries={[{
              ...sampleEntries[0],
              id: 0,
              title: '时间轴无效锚点',
            }]}
            viewMode="timeline"
            recommendationsEnabled={false}
          />
        </AdminAuthProvider>
      </ThemeProvider>
    );

    expect(screen.getByText('时间轴无效锚点')).toBeInTheDocument();
    expect(document.getElementById('entry-0')).toBeNull();
  });
});
