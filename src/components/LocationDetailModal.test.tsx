import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../test/renderWithTheme';
import { LocationDetailModal } from './LocationDetailModal';

describe('LocationDetailModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders valid zero-valued coordinates', () => {
    renderWithTheme(
      <LocationDetailModal
        isOpen
        location={{
          name: '赤道本初子午线',
          latitude: 0,
          longitude: 0,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('纬度: 0.000000')).toBeInTheDocument();
    expect(screen.getByText('经度: 0.000000')).toBeInTheDocument();
  });

  it('uses a placeholder for the missing coordinate when one side is valid', () => {
    renderWithTheme(
      <LocationDetailModal
        isOpen
        location={{
          name: '只有纬度',
          latitude: 31.2,
          longitude: Number.NaN,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('纬度: 31.200000')).toBeInTheDocument();
    expect(screen.getByText('经度: -')).toBeInTheDocument();
  });

  it('does not render broken coordinates', () => {
    renderWithTheme(
      <LocationDetailModal
        isOpen
        location={{
          name: '损坏坐标',
          latitude: Number.NaN,
          longitude: Number.POSITIVE_INFINITY,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText(/纬度:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/经度:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });

  it('does not render out-of-range coordinates', () => {
    renderWithTheme(
      <LocationDetailModal
        isOpen
        location={{
          name: '越界坐标',
          latitude: 91,
          longitude: 181,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText(/纬度:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/经度:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/91\.000000|181\.000000/)).not.toBeInTheDocument();
  });

  it('closes from the close button', () => {
    const onClose = vi.fn();

    renderWithTheme(
      <LocationDetailModal
        isOpen
        location={{ name: '静安寺' }}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
