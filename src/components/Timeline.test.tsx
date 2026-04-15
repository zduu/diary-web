import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
