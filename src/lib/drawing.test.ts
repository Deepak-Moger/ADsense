import { describe, expect, it, vi } from 'vitest';
import { drawScene, drawStroke, exportSvg, makeExportCanvas, recognizeShape } from './drawing';
import type { Brush, Point, Stroke } from './drawing';

const stroke = (overrides: Partial<Stroke> = {}): Stroke => ({
  id: 'test-stroke', brush: 'pen', color: '#24b8a8', size: 5, opacity: 1,
  points: [{ x: 10, y: 10, t: 0 }, { x: 25, y: 20, t: 16 }, { x: 40, y: 30, t: 32 }], ...overrides,
});

function contextMock() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(), arc: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    fillRect: vi.fn(), setLineDash: vi.fn(), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
    globalAlpha: 1, globalCompositeOperation: 'source-over',
  };
}

describe('brush rendering', () => {
  it.each<Brush>(['pen', 'fountain', 'neon', 'rainbow', 'marker', 'eraser'])('balances canvas state for %s', (brush) => {
    const ctx = contextMock();
    drawStroke(ctx as unknown as CanvasRenderingContext2D, stroke({ brush }));
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.beginPath).toHaveBeenCalled();
  });

  it('renders a tap as a visible dot', () => {
    const ctx = contextMock();
    drawStroke(ctx as unknown as CanvasRenderingContext2D, stroke({ points: [{ x: 10, y: 10, t: 0 }] }));
    expect(ctx.arc).toHaveBeenCalledWith(10, 10, 2.5, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalledOnce();
  });

  it('ignores invalid and empty coordinates', () => {
    const ctx = contextMock();
    drawScene(ctx as unknown as CanvasRenderingContext2D, [stroke({ points: [] }), stroke({ points: [{ x: NaN, y: 1, t: 0 }] })]);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('composites the eraser independently of the ink color', () => {
    const ctx = contextMock();
    drawStroke(ctx as unknown as CanvasRenderingContext2D, stroke({ brush: 'eraser', color: 'transparent' }));
    expect(ctx.globalCompositeOperation).toBe('destination-out');
  });
});

describe('smart shapes', () => {
  it('straightens a near-linear path without mutating the original', () => {
    const input = stroke({ points: [0, 15, 30, 45, 60].map((x, i) => ({ x, y: i % 2 ? 0.3 : 0, t: i * 16 })) });
    const result = recognizeShape(input);
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toEqual(input.points[0]);
    expect(result.points[1].x).toBe(60);
    expect(input.points).toHaveLength(5);
    expect(result.id).toBe(input.id);
  });

  it('recognizes a complete circle and preserves its radius', () => {
    const points: Point[] = Array.from({ length: 65 }, (_, i) => ({
      x: 100 + 50 * Math.cos(i / 64 * Math.PI * 2),
      y: 100 + 50 * Math.sin(i / 64 * Math.PI * 2), t: i * 16,
    }));
    const input = stroke({ points });
    const result = recognizeShape(input);
    expect(result).not.toBe(input);
    for (const point of result.points) expect(Math.hypot(point.x - 100, point.y - 100)).toBeCloseTo(50, 3);
  });

  it('does not snap an eraser or an ambiguous scribble', () => {
    const eraser = stroke({ brush: 'eraser' });
    expect(recognizeShape(eraser)).toBe(eraser);
    const scribble = stroke({ points: [
      { x: 0, y: 0, t: 0 }, { x: 90, y: 80, t: 16 }, { x: 5, y: 30, t: 32 },
      { x: 60, y: 5, t: 48 }, { x: 15, y: 90, t: 64 },
    ] });
    expect(recognizeShape(scribble)).toBe(scribble);
  });
});

describe('SVG export', () => {
  it('exports clean vector paths at the requested dimensions', () => {
    const svg = exportSvg([stroke()], 1920, 1080, 'white');
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg).toContain('stroke="#24b8a8"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it('omits the backdrop for transparent exports', () => {
    const svg = exportSvg([stroke()], 800, 600, 'paper', true);
    expect(svg).not.toContain('aw-paper');
    expect(svg).not.toContain('width="100%"');
  });

  it('applies eraser masks only to earlier ink', () => {
    const svg = exportSvg([stroke(), stroke({ id: 'erase', brush: 'eraser' }), stroke({ id: 'later', color: '#22c55e' })], 800, 600, 'paper');
    expect(svg).toContain('<mask id="aw-erase-1"');
    expect(svg).toContain('<g mask="url(#aw-erase-1)">');
    expect(svg.indexOf('stroke="#22c55e"')).toBeGreaterThan(svg.indexOf('</g>'));
    expect(svg.indexOf('fill="url(#aw-paper)"')).toBeLessThan(svg.indexOf('<g mask='));
  });

  it('frames pan and zoom without changing brush coordinates', () => {
    const svg = exportSvg([stroke(), stroke({ brush: 'eraser' })], 800, 600, 'white', false, { x: 100, y: -50, zoom: 2 });
    expect(svg).toContain('transform="translate(100 -50) scale(2)"');
    expect(svg).toContain('x="-50" y="25" width="400" height="300"');
    expect(svg).toContain('stroke-width="5"');
  });

  it('escapes attribute content', () => {
    const svg = exportSvg([stroke({ color: '" onload="unsafe' })], 800, 600, 'white');
    expect(svg).toContain('&quot; onload=&quot;unsafe');
    expect(svg).not.toContain('stroke="" onload=');
  });

  it('does not include invalid coordinates', () => {
    const svg = exportSvg([stroke({ points: [{ x: Infinity, y: NaN, t: 0 }] })], 800, 600, 'dark');
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });

  it('requires a real browser for raster export', () => {
    expect(() => makeExportCanvas([], 800, 600, 'paper', 2, false)).toThrow('browser document');
  });
});
