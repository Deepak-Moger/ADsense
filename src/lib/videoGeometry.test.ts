import { describe, expect, it } from 'vitest';
import { videoPointToScreen } from './videoGeometry';

describe('live webcam fingertip alignment', () => {
  it('maps a matching aspect ratio without changing the mirrored x coordinate', () => {
    expect(videoPointToScreen(0.25, 0.75, 1280, 720, 1920, 1080)).toEqual({ x: 480, y: 810, visible: true });
  });

  it('keeps the center at the center for any camera aspect ratio', () => {
    expect(videoPointToScreen(0.5, 0.5, 640, 480, 1920, 1080)).toEqual({ x: 960, y: 540, visible: true });
  });

  it('accounts for the vertical crop of a 4:3 camera on a wide screen', () => {
    // Cover scale = 3, height = 1440, centered crop removes 180px on each side.
    expect(videoPointToScreen(0.25, 0.25, 640, 480, 1920, 1080)).toEqual({ x: 480, y: 180, visible: true });
  });

  it('lifts the pen when a fingertip is outside the visible video crop', () => {
    expect(videoPointToScreen(0.5, 0, 640, 480, 1920, 1080).visible).toBe(false);
    expect(videoPointToScreen(0.5, 1, 640, 480, 1920, 1080).visible).toBe(false);
  });

  it('accounts for horizontal cropping on portrait screens', () => {
    const center = videoPointToScreen(0.5, 0.5, 1280, 720, 360, 720);
    expect(center).toEqual({ x: 180, y: 360, visible: true });
    expect(videoPointToScreen(0, 0.5, 1280, 720, 360, 720).visible).toBe(false);
    expect(videoPointToScreen(0.6, 0.5, 1280, 720, 360, 720).x).toBeCloseTo(308);
  });

  it('rejects frames before video dimensions are available', () => {
    expect(videoPointToScreen(0.5, 0.5, 0, 0, 1280, 720).visible).toBe(false);
    expect(videoPointToScreen(NaN, 0.5, 640, 480, 1280, 720).visible).toBe(false);
  });
});
