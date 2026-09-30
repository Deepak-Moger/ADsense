import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { Brush, Stroke } from './lib/drawing';

export const COLORS = ['#24b8a8', '#36ba79', '#ed619b', '#efbc45', '#ffffff', '#263544'];
export const BRUSH_NAMES: Record<Brush, string> = {
  pen: 'Precision pen', fountain: 'Fountain pen', neon: 'Neon glow',
  rainbow: 'Rainbow ink', marker: 'Highlighter', eraser: 'Eraser',
};
interface StudioState {
  title: string;
  brush: Brush; color: string; size: number; opacity: number;
  smartShapes: boolean; autoHide: boolean;
  strokes: Stroke[]; past: Stroke[][]; future: Stroke[][];
  savedAt: number | null;
  set: (settings: Partial<Pick<StudioState, 'title' | 'brush' | 'color' | 'size' | 'opacity' | 'smartShapes' | 'autoHide'>>) => void;
  commit: (stroke: Stroke) => void; undo: () => void; redo: () => void; clear: () => void;
}

type SavedStudio = Pick<StudioState, 'title' | 'brush' | 'color' | 'size' | 'opacity' | 'smartShapes' | 'autoHide' | 'strokes' | 'savedAt'>;
let pendingSave: { name: string; value: StorageValue<SavedStudio> } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let previousSaved: SavedStudio | null = null;
const flushSave = () => {
  if (!pendingSave) return;
  const { name, value } = pendingSave;
  pendingSave = null;
  try { localStorage.setItem(name, JSON.stringify(value)); }
  catch { window.dispatchEvent(new Event('airwrite-storage-error')); }
};
// Debounce saving so changing ink settings does not stall live tracking.
const studioStorage: PersistStorage<SavedStudio> = {
  getItem: (name) => {
    try { const raw = localStorage.getItem(name); return raw ? JSON.parse(raw) as StorageValue<SavedStudio> : null; }
    catch { return null; }
  },
  setItem: (name, value) => {
    if (previousSaved && Object.keys(value.state).every((key) => previousSaved![key as keyof SavedStudio] === value.state[key as keyof SavedStudio])) return;
    previousSaved = value.state;
    pendingSave = { name, value };
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  },
  removeItem: (name) => { try { localStorage.removeItem(name); } catch { /* Drawing remains available without storage. */ } },
};
window.addEventListener('pagehide', flushSave);

export const useStudio = create<StudioState>()(persist((set) => ({
  title: 'AirWrite snapshot',
  brush: 'pen', color: COLORS[0], size: 5, opacity: 1,
  smartShapes: false, autoHide: true,
  strokes: [], past: [], future: [], savedAt: null,
  set: (settings) => set(settings),
  commit: (stroke) => set((state) => ({
    strokes: [...state.strokes, stroke], past: [...state.past.slice(-49), state.strokes],
    future: [], savedAt: Date.now(),
  })),
  undo: () => set((state) => state.past.length ? ({
    strokes: state.past[state.past.length - 1], past: state.past.slice(0, -1),
    future: [state.strokes, ...state.future], savedAt: Date.now(),
  }) : {}),
  redo: () => set((state) => state.future.length ? ({
    strokes: state.future[0], past: [...state.past.slice(-49), state.strokes],
    future: state.future.slice(1), savedAt: Date.now(),
  }) : {}),
  clear: () => set((state) => ({
    strokes: [], past: [...state.past.slice(-49), state.strokes], future: [],
    savedAt: Date.now(),
  })),
}), {
  name: 'airwrite-ultra-studio-v1',
  storage: studioStorage,
  // Ignore old board/background preferences while preserving existing writing.
  merge: (persisted, current) => {
    if (!persisted || typeof persisted !== 'object') return current;
    const saved = persisted as Partial<SavedStudio>;
    const keys = ['title', 'brush', 'color', 'size', 'opacity', 'smartShapes', 'autoHide', 'strokes', 'savedAt'] as const;
    return { ...current, ...Object.fromEntries(keys.filter((key) => saved[key] !== undefined).map((key) => [key, saved[key]])) };
  },
  partialize: (state) => ({
    title: state.title,
    brush: state.brush, color: state.color, size: state.size, opacity: state.opacity,
    smartShapes: state.smartShapes, autoHide: state.autoHide,
    strokes: state.strokes, savedAt: state.savedAt,
  }),
}));
