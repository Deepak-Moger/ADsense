import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';
import { Camera, CameraOff, Check, Eraser, Highlighter, LoaderCircle, PenLine, PenTool, Plus, Rainbow, Redo2, Settings2, ShieldCheck, Undo2, Video, WandSparkles, X, Zap } from 'lucide-react';
import { BRUSH_NAMES, COLORS, useStudio } from '../store';
import type { Brush } from '../lib/drawing';

const TOOLS = [
  { id: 'pen', icon: PenLine, key: 'P' }, { id: 'fountain', icon: PenTool, key: 'F' },
  { id: 'neon', icon: Zap, key: 'N' }, { id: 'rainbow', icon: Rainbow, key: 'R' },
  { id: 'marker', icon: Highlighter, key: 'H' }, { id: 'eraser', icon: Eraser, key: 'E' },
] as const;

export function ToolRail() {
  const state = useStudio();
  return <div className="tool-rail-wrap auto-hide"><nav className="tool-rail glass" aria-label="Air-writing tools">
    {TOOLS.map(({ id, icon: Icon, key }) => <button key={id} className={`tool-button ${state.brush === id ? 'active' : ''}`} aria-label={`${BRUSH_NAMES[id]} (${key})`} aria-pressed={state.brush === id} data-tooltip={`${BRUSH_NAMES[id]} · ${key}`} onClick={() => state.set({ brush: id })}><Icon size={22} strokeWidth={1.65} />{state.brush === id && <span className="active-tool-dot" />}</button>)}
    <div className="rail-divider" /><button className="tool-button" aria-label="Undo (Ctrl Z)" data-tooltip="Undo · Ctrl Z" disabled={!state.past.length} onClick={state.undo}><Undo2 size={20} strokeWidth={1.6} /></button><button className="tool-button" aria-label="Redo (Ctrl Shift Z)" data-tooltip="Redo · Ctrl Shift Z" disabled={!state.future.length} onClick={state.redo}><Redo2 size={20} strokeWidth={1.6} /></button>
  </nav></div>;
}

export function BottomDock({ settingsOpen, toggleSettings }: { settingsOpen: boolean; toggleSettings: () => void }) {
  const state = useStudio();
  return <div className="bottom-dock glass auto-hide">
    <div className="dock-colors"><span className="dock-label">INK COLOR</span><div className="color-list">{COLORS.map((color) => <button key={color} className={`color-swatch ${state.color === color ? 'selected' : ''} ${color === '#ffffff' ? 'white-swatch' : ''}`} style={{ '--swatch': color } as CSSProperties} aria-label={`Use ${color} ink`} aria-pressed={state.color === color} onClick={() => state.set({ color })}>{state.color === color && <Check size={14} strokeWidth={2.5} />}</button>)}<label className="custom-color" title="Choose any color"><Plus size={14} /><input aria-label="Custom ink color" type="color" value={state.color} onChange={(e) => state.set({ color: e.target.value })} /></label></div></div>
    <div className="dock-divider" />
    <div className="dock-size"><div><label className="dock-label" htmlFor="brush-size">BRUSH SIZE</label><span>{state.size}<small> px</small></span></div><div className="size-input"><span className="size-dot small" /><input id="brush-size" aria-label="Brush size" type="range" min="1" max="60" value={state.size} onChange={(e) => state.set({ size: Number(e.target.value) })} /><span className="size-dot" /></div></div>
    <div className="dock-divider" />
    <button className={`icon-button settings-button ${settingsOpen ? 'selected' : ''}`} onClick={toggleSettings} aria-label="Writing settings" aria-expanded={settingsOpen}><Settings2 size={19} strokeWidth={1.5} /></button>
  </div>;
}

export function SettingsPanel({ close }: { close: () => void }) {
  const state = useStudio();
  return <motion.section className="settings-panel glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} aria-label="Writing settings"><div className="popover-heading"><h3>Writing settings</h3><button className="icon-button" aria-label="Close settings" onClick={close}><X size={17} /></button></div>
    <label className="switch-row"><span><WandSparkles size={16} /> Smart shapes<small>Hold still at a stroke's end to snap.</small></span><input type="checkbox" checked={state.smartShapes} onChange={(e) => state.set({ smartShapes: e.target.checked })} /></label>
    <label className="switch-row"><span>Distraction-free mode<small>Fade tools while you're writing.</small></span><input type="checkbox" checked={state.autoHide} onChange={(e) => state.set({ autoHide: e.target.checked })} /></label>
    <label className="slider-setting">Ink opacity <span>{Math.round(state.opacity * 100)}%</span><input type="range" min="0.1" max="1" step="0.05" value={state.opacity} onChange={(e) => state.set({ opacity: Number(e.target.value) })} /></label>
  </motion.section>;
}

export function WebcamStart({ status, error, onStart, onCancel }: { status: string; error: string | null; onStart: () => void; onCancel: () => void }) {
  const loading = status === 'loading';
  return <section className="webcam-start" aria-label="Start live webcam writing">
    <div className="webcam-start-icon">{loading ? <LoaderCircle size={36} className="spin" /> : error ? <CameraOff size={36} /> : <Camera size={36} />}</div>
    <span className="webcam-start-eyebrow">AIRWRITE ULTRA · LIVE WEBCAM</span>
    <h1>{loading ? 'Opening your webcam…' : error ? 'Let’s reconnect your camera.' : 'Your webcam. Your handwriting.'}</h1>
    <p>{loading ? 'Allow camera access in your browser. Your live feed will appear here.' : 'See yourself full-screen and write directly over your live video. Raise your index finger to start; open your palm to pause.'}</p>
    {error && <div className="camera-error" role="alert">{error}</div>}
    <button className="primary-button" onClick={loading ? onCancel : onStart}>{loading ? <X size={17} /> : <Video size={18} />}{loading ? 'Cancel' : error ? 'Retry camera' : 'Start webcam'}</button>
    <div className="webcam-start-privacy"><ShieldCheck size={14} /> Live processing on your device. No video uploads.</div>
  </section>;
}

export function WebcamStatus({ status, cameraReady, gesture, fps }: { status: string; cameraReady: boolean; gesture: string | null; fps: number }) {
  const live = status === 'tracking';
  const labels: Record<string, string> = { write: 'Writing', erase: 'Erasing', hover: 'Pen lifted', laser: 'Laser pointer', pinch: 'Pinch detected' };
  return <div className="webcam-status" role="status"><span className={`status-dot ${cameraReady ? 'live' : ''}`} /><strong>{cameraReady ? 'LIVE' : 'WEBCAM'}</strong><span className="webcam-status-divider" /><span>{live ? gesture ? labels[gesture] : 'Raise your hand' : cameraReady ? 'Loading hand tracking…' : status === 'loading' ? 'Connecting…' : 'Camera off'}</span>{live && <span className="webcam-fps">{fps} fps</span>}</div>;
}

export function QuickPalette({ x, y, close }: { x: number; y: number; close: () => void }) {
  const state = useStudio();
  const left = Math.min(window.innerWidth - 120, Math.max(120, x));
  const top = Math.min(window.innerHeight - 150, Math.max(135, y));
  return <motion.div role="group" aria-label="Quick color palette" className="quick-palette" style={{ left, top }} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}><div className="palette-ring glass">{COLORS.map((color, index) => {
    const angle = (index * 60 - 90) * Math.PI / 180;
    return <button key={color} className={`radial-color ${color === '#ffffff' ? 'white-swatch' : ''}`} style={{ background: color, left: 86 + Math.cos(angle) * 65, top: 86 + Math.sin(angle) * 65 }} aria-label={`Select ${color}`} onClick={() => { state.set({ color }); close(); }}>{state.color === color && <Check size={17} />}</button>;
  })}<button className="palette-center" onClick={close} aria-label="Close quick palette"><X size={19} /></button></div><div className="palette-tools glass">{(['pen', 'neon', 'eraser'] as Brush[]).map((brush) => <button key={brush} aria-label={BRUSH_NAMES[brush]} className={state.brush === brush ? 'selected' : ''} onClick={() => { state.set({ brush }); close(); }}>{brush === 'pen' ? <PenLine size={17} /> : brush === 'neon' ? <Zap size={17} /> : <Eraser size={17} />}</button>)}<label className="custom-color" title="Full spectrum"><Rainbow size={17} /><input aria-label="Full spectrum color" type="color" value={state.color} onChange={(e) => state.set({ color: e.target.value })} /></label></div></motion.div>;
}
