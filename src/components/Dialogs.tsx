import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, Check, Copy, FileImage, Keyboard, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useStudio } from '../store';
import { downloadBlob, makeExportCanvas } from '../lib/drawing';

export function Modal({ children, title, onClose, className = '' }: { children: ReactNode; title: string; onClose: () => void; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeCallback.current(); }
      if (e.key === 'Tab') {
        const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]');
        if (!nodes?.length) { e.preventDefault(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <motion.div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${className}`} initial={{ y: 18, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, scale: 0.98 }}>
      <div className="modal-header"><div><span className="eyebrow">AIRWRITE ULTRA</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
      {children}
    </motion.div>
  </motion.div>;
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return <Modal title="A little movement. A little magic." onClose={onClose} className="help-modal">
    <p className="modal-description">Start your webcam, then write directly over your live video. Your index fingertip is the pen — there is no separate drawing board.</p>
    <div className="guide-grid">
      {[
        ['☝', 'Write your heart out', 'Raise your index finger. Fold your other fingers to draw.'],
        ['✋', 'Take a little pause', 'Open your palm to hover. Hold it near the top for the quick palette.'],
        ['✌', 'Make room for more', 'Spread two fingers into a V, or make a fist, to erase.'],
        ['🤏', 'Pick, pinch, click', 'Pinch your thumb and index to click. Pinch empty space for the palette.'],
        ['Ⅱ', 'Point it out', 'Keep two raised fingers together for a laser trail that fades in 2 seconds.'],
        ['↶', 'Undo a little', 'Swipe an open palm left to undo the most recent stroke.'],
      ].map(([symbol, title, description]) => <div className="guide-item" key={title}><span className="gesture-symbol">{symbol}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}
    </div>
    <p className="export-note">Two quick pinches in the same spot open the clear confirmation. For smart shapes, enable the option in Settings, then hold still briefly at the end of a stroke.</p>
    <div className="shortcut-section"><h3><Keyboard size={16} /> More of a keyboard person?</h3><div className="shortcut-grid">
      {[['Undo', '⌘ / Ctrl Z'], ['Redo', '⌘ / Ctrl ⇧ Z'], ['Clear writing', 'Delete'], ['Gesture guide', '?'], ['Precision pen', 'P'], ['Eraser', 'E'], ['Quick palette', 'C'], ['Save snapshot', '⌘ / Ctrl S']].map(([name, key]) => <div key={name}><span>{name}</span><kbd>{key}</kbd></div>)}
    </div></div>
    <div className="info-note"><ShieldCheck size={18} /><span>Your camera stays yours. Tracking runs on your device. The hand-tracking model downloads once on first use. Bright, even lighting works best.</span></div>
    <button className="primary-button full-width" onClick={onClose}>Got it. Let's create <Sparkles size={16} /></button>
  </Modal>;
}

export function ExportDialog({ onClose, videoRef, notify }: { onClose: () => void; videoRef: RefObject<HTMLVideoElement | null>; notify: (message: string) => void }) {
  const [format, setFormat] = useState<'png' | 'webp'>('png');
  const [resolution, setResolution] = useState(2048);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const state = useStudio();
  const exportImage = async (clipboard = false) => {
    setBusy(true);
    try {
      const width = window.innerWidth, height = window.innerHeight;
      const filename = (state.title.trim() || 'airwrite-creation').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 64);
      const video = videoRef.current;
      if (!video?.srcObject || video.readyState < 2 || video.paused || !video.videoWidth) {
        throw new Error('Reconnect your webcam before saving a snapshot.');
      }
      const canvas = makeExportCanvas(state.strokes, width, height, 'camera', resolution / Math.max(width, height), false, video);
      const mime = clipboard ? 'image/png' : `image/${format}`;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not create image. Try a lower resolution.')), mime, 0.96));
      if (clipboard) {
        if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('Image clipboard is unavailable in this browser. Download a PNG instead.');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        notify('Webcam snapshot and writing copied to clipboard.');
      } else downloadBlob(blob, `${filename}.${format}`);
      setDone(true);
    } catch (error) { notify(error instanceof Error ? error.message : 'Export failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return <Modal title="Save this moment." onClose={onClose}>
    <p className="modal-description">Your live webcam frame and handwriting, together in one image.</p>
    <div className="export-preview"><FileImage size={32} strokeWidth={1.4} /><div><strong>Webcam + your writing</strong><span>{state.strokes.filter((stroke) => stroke.brush !== 'eraser').length} strokes · {resolution}px longest edge</span></div><span className="small-badge">LOCAL</span></div>
    <label className="field-label">FILE FORMAT</label>
    <div className="segmented">{(['png', 'webp'] as const).map((item) => <button key={item} className={format === item ? 'selected' : ''} onClick={() => { setFormat(item); setDone(false); }}>{item.toUpperCase()}<small>{item === 'png' ? 'Lossless' : 'Lightweight'}</small></button>)}</div>
    <label className="field-label" htmlFor="resolution">OUTPUT SIZE</label><select id="resolution" value={resolution} onChange={(e) => setResolution(Number(e.target.value))}><option value={2048}>2K · 2048px longest edge</option><option value={3840}>4K · 3840px longest edge</option></select>
    <p className="export-note">Captures the live frame when you click Save. Camera image detail depends on your webcam's resolution. Controls and cursor indicators are not included.</p>
    <div className="export-actions"><button className="secondary-button" disabled={busy} onClick={() => void exportImage(true)}><Copy size={16} /> Copy image</button><button className="primary-button" disabled={busy} onClick={() => void exportImage()}>{busy ? <LoaderCircle className="spin" size={17} /> : done ? <Check size={17} /> : <ArrowDownToLine size={17} />}{busy ? 'Creating…' : done ? 'Save another' : 'Save snapshot'}</button></div>
  </Modal>;
}

export function ClearDialog({ onClose, onClear }: { onClose: () => void; onClear: () => void }) {
  return <Modal title="A fresh start?" onClose={onClose}><p className="modal-description">Clear the handwriting from your webcam view. Your camera stays live, and you can undo this.</p><div className="export-actions"><button className="secondary-button" onClick={onClose}>Keep creating</button><button className="primary-button" onClick={() => { onClear(); onClose(); }}>Clear writing <Sparkles size={16} /></button></div></Modal>;
}

export function Toast({ message }: { message: string | null }) {
  return <AnimatePresence>{message && <motion.div role="status" className="toast" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}><Check size={17} /><span>{message}</span></motion.div>}</AnimatePresence>;
}
