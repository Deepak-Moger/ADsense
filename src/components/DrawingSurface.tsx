import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { drawScene, drawStroke, recognizeShape } from '../lib/drawing';
import type { Brush, Point, Stroke } from '../lib/drawing';
import { useStudio } from '../store';

export interface SurfaceApi {
  begin: (x: number, y: number, brush?: Brush) => void;
  move: (x: number, y: number) => void;
  end: () => void;
  cursor: (x: number, y: number, mode: string) => void;
  hideCursor: () => void;
  laser: (x: number, y: number) => void;
}
interface Props { onActivity: (active: boolean) => void }
type Cursor = { x: number; y: number; mode: string };

/** Transparent ink and feedback over the live webcam; never a separate board. */
export const DrawingSurface = forwardRef<SurfaceApi, Props>(function DrawingSurface({ onActivity }, ref) {
  const inkRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLCanvasElement>(null);
  const active = useRef<Stroke | null>(null);
  const cursor = useRef<Cursor | null>(null);
  const laser = useRef<Point[]>([]);
  const requestRender = useRef<() => void>(() => {});
  const dirtyInk = useRef(true);
  const size = useRef({ width: window.innerWidth, height: window.innerHeight, dpr: 1 });
  const activityCallback = useRef(onActivity);
  activityCallback.current = onActivity;
  const lastMove = useRef(0);
  const stillAnchor = useRef({ x: 0, y: 0 });

  const end = useCallback(() => {
    if (!active.current) return;
    const stroke = active.current;
    active.current = null;
    const state = useStudio.getState();
    const held = performance.now() - lastMove.current > 380;
    state.commit(state.smartShapes && held && stroke.brush !== 'eraser' ? recognizeShape(stroke) : stroke);
    dirtyInk.current = true;
    activityCallback.current(false);
    requestRender.current();
  }, []);
  const begin = useCallback((x: number, y: number, brush?: Brush) => {
    if (active.current) return;
    const state = useStudio.getState();
    const selected = brush || state.brush;
    active.current = {
      id: crypto.randomUUID(), points: [{ x, y, t: performance.now() }], brush: selected,
      color: state.color, size: selected === 'eraser' ? Math.max(20, state.size * 5) : state.size,
      opacity: selected === 'eraser' ? 1 : state.opacity,
    };
    if (selected === 'eraser') dirtyInk.current = true;
    lastMove.current = performance.now();
    stillAnchor.current = { x, y };
    activityCallback.current(true);
    requestRender.current();
  }, []);
  const move = useCallback((x: number, y: number) => {
    const stroke = active.current;
    if (!stroke) return;
    const point = { x, y, t: performance.now() };
    const prev = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point.x - prev.x, point.y - prev.y) < 0.65) return;
    stroke.points.push(point);
    if (Math.hypot(x - stillAnchor.current.x, y - stillAnchor.current.y) > 3) {
      lastMove.current = performance.now();
      stillAnchor.current = { x, y };
    }
    if (stroke.brush === 'eraser') dirtyInk.current = true;
    requestRender.current();
  }, []);
  useImperativeHandle(ref, () => ({
    begin, move, end,
    cursor: (x, y, mode) => { cursor.current = { x, y, mode }; requestRender.current(); },
    hideCursor: () => { cursor.current = null; requestRender.current(); },
    laser: (x, y) => { laser.current.push({ x, y, t: performance.now() }); requestRender.current(); },
  }), [begin, move, end]);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const paint = () => {
      raf = 0;
      if (!alive) return;
      const ink = inkRef.current?.getContext('2d');
      const hud = hudRef.current?.getContext('2d');
      if (!ink || !hud) return;
      const { width, height, dpr } = size.current;
      const state = useStudio.getState();
      if (dirtyInk.current) {
        ink.setTransform(dpr, 0, 0, dpr, 0, 0);
        ink.clearRect(0, 0, width, height);
        drawScene(ink, state.strokes);
        if (active.current?.brush === 'eraser') drawStroke(ink, active.current);
        dirtyInk.current = false;
      }
      hud.setTransform(dpr, 0, 0, dpr, 0, 0);
      hud.clearRect(0, 0, width, height);
      if (active.current && active.current.brush !== 'eraser') drawStroke(hud, active.current);
      const now = performance.now();
      laser.current = laser.current.filter((p) => now - p.t < 2000);
      for (let i = 1; i < laser.current.length; i++) {
        const a = laser.current[i - 1], b = laser.current[i];
        if (b.t - a.t > 140) continue;
        hud.save();
        hud.globalAlpha = Math.max(0, 1 - (now - b.t) / 2000);
        hud.strokeStyle = state.color; hud.shadowColor = state.color; hud.shadowBlur = 18;
        hud.lineWidth = 3; hud.lineCap = 'round';
        hud.beginPath(); hud.moveTo(a.x, a.y); hud.lineTo(b.x, b.y); hud.stroke(); hud.restore();
      }
      const c = cursor.current;
      if (c) {
        hud.save();
        const isWrite = c.mode === 'write' || c.mode === 'laser';
        const radius = c.mode === 'erase' ? Math.max(10, state.size * 2.5) : isWrite ? 7 : 12;
        hud.strokeStyle = isWrite ? state.color : '#e8fff4'; hud.lineWidth = 1.5;
        hud.shadowBlur = isWrite ? 16 : 4; hud.shadowColor = isWrite ? state.color : '#000000';
        hud.beginPath(); hud.arc(c.x, c.y, radius, 0, Math.PI * 2); hud.stroke();
        hud.fillStyle = state.color; hud.globalAlpha = isWrite ? 0.3 : 0.08; hud.fill();
        hud.restore();
      }
      if (laser.current.length) raf = requestAnimationFrame(paint);
    };
    requestRender.current = () => { if (alive && !raf) raf = requestAnimationFrame(paint); };
    const resize = () => {
      // End an in-flight stroke before the video crop changes.
      end();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { width: window.innerWidth, height: window.innerHeight, dpr };
      for (const canvas of [inkRef.current, hudRef.current]) {
        if (canvas) { canvas.width = Math.round(window.innerWidth * dpr); canvas.height = Math.round(window.innerHeight * dpr); }
      }
      dirtyInk.current = true; requestRender.current();
    };
    resize();
    const unsubscribe = useStudio.subscribe((state, prev) => {
      if (state.strokes !== prev.strokes) dirtyInk.current = true;
      requestRender.current();
    });
    const onBlur = () => { end(); cursor.current = null; requestRender.current(); };
    window.addEventListener('resize', resize);
    window.addEventListener('blur', onBlur);
    return () => {
      alive = false; cancelAnimationFrame(raf); unsubscribe();
      requestRender.current = () => {};
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', onBlur);
      end();
    };
  }, [end]);

  return <>
    <canvas ref={inkRef} className="canvas-layer persistent-canvas" aria-hidden="true" />
    <canvas ref={hudRef} className="canvas-layer interactive-canvas" aria-label="Live webcam writing overlay. Raise your index finger to write; open your palm to pause." />
  </>;
});
