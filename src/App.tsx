import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Camera, CameraOff, CircleHelp, Hand, Maximize, Minimize, ShieldCheck, Trash2 } from 'lucide-react';
import { DrawingSurface } from './components/DrawingSurface';
import type { SurfaceApi } from './components/DrawingSurface';
import { BottomDock, QuickPalette, SettingsPanel, ToolRail, WebcamStart, WebcamStatus } from './components/StudioUI';
import { ClearDialog, ExportDialog, HelpDialog, Toast } from './components/Dialogs';
import { useHandTracking } from './hooks/useHandTracking';
import type { HandFrame } from './hooks/useHandTracking';
import { BRUSH_NAMES, useStudio } from './store';
import { videoPointToScreen } from './lib/videoGeometry';
import type { Brush } from './lib/drawing';

type Dialog = 'help' | 'export' | 'clear' | null;

export default function App() {
  const state = useStudio();
  const surface = useRef<SurfaceApi>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [gesture, setGesture] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [palette, setPalette] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handState = useRef({ pinched: false, lastPinch: 0, pinchX: 0, pinchY: 0, lastMode: '', palmStart: 0, paletteCooldown: 0, swipeX: 0, swipeY: 0, swipeTime: 0, undoCooldown: 0 });
  const notify = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 4800);
  }, []);

  const onHandFrame = useCallback((frame: HandFrame) => {
    const engine = surface.current;
    const video = videoRef.current;
    if (!engine || !video) return;
    const h = handState.current;
    const first = frame.hands[0];
    if (!first) {
      engine.end(); engine.hideCursor(); setGesture(null);
      h.pinched = false; h.lastMode = ''; h.palmStart = 0; h.swipeTime = 0;
      return;
    }
    // Match the exact crop of the full-screen, mirrored webcam, not the raw
    // image aspect ratio. Ink therefore stays at the visible fingertip.
    const point = videoPointToScreen(first.x, first.y, video.videoWidth, video.videoHeight, window.innerWidth, window.innerHeight);
    if (!point.visible) {
      engine.end(); engine.hideCursor(); setGesture(null);
      h.pinched = first.pinched; h.lastMode = ''; h.palmStart = 0; h.swipeTime = 0;
      return;
    }
    const { x, y } = point;
    const now = frame.timestamp;
    setGesture((old) => old === first.gesture ? old : first.gesture);
    engine.cursor(x, y, first.gesture);
    const underHand = document.elementFromPoint(x, y);
    const button = underHand?.closest<HTMLButtonElement | HTMLInputElement>('button, input[type="checkbox"]');
    const overVideo = underHand?.classList.contains('interactive-canvas');
    if (first.pinched && !h.pinched) {
      engine.end();
      const doublePinch = h.lastPinch > 0 && now - h.lastPinch < 450 && now - h.lastPinch > 100 && Math.hypot(x - h.pinchX, y - h.pinchY) < 40;
      if (!dialog && doublePinch) {
        setPalette(null); setDialog('clear'); h.lastPinch = 0;
      } else if (button && !button.disabled) {
        button.click(); h.lastPinch = 0;
      } else if (!dialog && overVideo) {
        setPalette({ x, y }); h.lastPinch = now; h.pinchX = x; h.pinchY = y;
      }
    }
    h.pinched = first.pinched;
    if (dialog || palette || !overVideo || first.pinched) { engine.end(); h.lastMode = ''; return; }
    if (first.gesture === 'hover') {
      engine.end();
      if (first.openness < 0.8) { h.palmStart = 0; h.swipeTime = 0; h.lastMode = 'hover'; return; }
      if (y < window.innerHeight * 0.22 && now > h.paletteCooldown) {
        if (!h.palmStart) h.palmStart = now;
        if (now - h.palmStart > 550) { setPalette({ x, y }); h.paletteCooldown = now + 2500; h.palmStart = 0; }
      } else h.palmStart = 0;
      if (!h.swipeTime || now - h.swipeTime > 600) { h.swipeTime = now; h.swipeX = first.x; h.swipeY = first.y; }
      if (h.swipeX - first.x > 0.28 && Math.abs(h.swipeY - first.y) < 0.16 && now > h.undoCooldown) {
        useStudio.getState().undo(); h.undoCooldown = now + 1300; h.swipeTime = 0; notify('Last stroke undone.');
      }
    } else {
      h.palmStart = 0; h.swipeTime = 0;
      if (first.gesture === 'laser') { engine.end(); engine.laser(x, y); }
      else if (first.gesture === 'write' || first.gesture === 'erase') {
        if (h.lastMode !== first.gesture) engine.end();
        engine.begin(x, y, first.gesture === 'erase' ? 'eraser' : undefined);
        engine.move(x, y);
      } else engine.end();
    }
    h.lastMode = first.gesture;
  }, [dialog, palette, notify]);

  const tracking = useHandTracking(videoRef, cameraEnabled, onHandFrame, cameraAttempt);
  const live = cameraEnabled && tracking.status === 'tracking';
  useEffect(() => {
    if (tracking.status === 'idle' || tracking.status === 'error') {
      setCameraReady(false); setGesture(null); setWriting(false);
      setPalette(null); setSettingsOpen(false);
    }
  }, [tracking.status]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    const storageError = () => notify('Device storage is unavailable. Save a snapshot to keep your writing.');
    window.addEventListener('airwrite-storage-error', storageError);
    return () => window.removeEventListener('airwrite-storage-error', storageError);
  }, [notify]);
  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || (e.target as HTMLElement)?.isContentEditable || dialog) return;
      const modifier = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') { setPalette(null); setSettingsOpen(false); }
      if (!modifier && (k === '?' || k === '/')) { e.preventDefault(); setDialog('help'); }
      if (!live) return;
      if (modifier && k === 'z') { e.preventDefault(); surface.current?.end(); e.shiftKey ? useStudio.getState().redo() : useStudio.getState().undo(); }
      else if (modifier && k === 'y') { e.preventDefault(); surface.current?.end(); useStudio.getState().redo(); }
      else if (modifier && k === 's') { e.preventDefault(); surface.current?.end(); setDialog('export'); }
      else if (!modifier) {
        const tools: Record<string, Brush> = { p: 'pen', f: 'fountain', n: 'neon', r: 'rainbow', h: 'marker', e: 'eraser' };
        if (tools[k]) { surface.current?.end(); useStudio.getState().set({ brush: tools[k] }); }
        if (k === 'c') { surface.current?.end(); setPalette((previous) => previous ? null : { x: window.innerWidth / 2, y: window.innerHeight / 2 }); }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); surface.current?.end(); setDialog('clear'); }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dialog, live]);

  const startCamera = () => { setCameraReady(false); setCameraAttempt((attempt) => attempt + 1); setCameraEnabled(true); };
  const stopCamera = () => {
    surface.current?.end(); surface.current?.hideCursor();
    setCameraEnabled(false); setCameraReady(false); setWriting(false);
    setGesture(null); setPalette(null); setSettingsOpen(false);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else notify('Fullscreen is unavailable in this browser. Your webcam already fills the window.');
    } catch { notify('Your browser could not enter fullscreen.'); }
  };

  return <main className={`app webcam-app ${writing && state.autoHide ? 'is-writing' : ''}`}>
    <video ref={videoRef} autoPlay muted playsInline className={`webcam-live-feed ${cameraReady ? 'ready' : ''}`} aria-label="Full-screen mirrored live webcam" onPlaying={() => setCameraReady(true)} onEmptied={() => setCameraReady(false)} />
    {live && <DrawingSurface ref={surface} onActivity={setWriting} />}
    <div className="webcam-edge-shade" aria-hidden="true" />

    <header className="app-header">
      <div className="brand"><span className="brand-icon"><img src="/favicon.svg" alt="" /></span><span className="brand-name">airwrite<span className="ultra-badge">ULTRA</span><small>Write directly on your live webcam.</small></span></div>
      <WebcamStatus status={tracking.status} cameraReady={cameraReady} gesture={gesture} fps={tracking.fps} />
      <div className="header-actions"><button className="icon-button help-button" aria-label="Gesture guide" onClick={() => setDialog('help')}><CircleHelp size={19} /></button><button className="icon-button fullscreen-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
        {live && <button className="export-button" onClick={() => { surface.current?.end(); setDialog('export'); }}><Camera size={16} /><span>Save snapshot</span></button>}
        {cameraEnabled && tracking.status !== 'error' && <button className="webcam-stop-button" onClick={stopCamera} aria-label="Stop webcam"><CameraOff size={17} /><span>Stop</span></button>}
      </div>
    </header>

    {(!cameraEnabled || !cameraReady || tracking.status === 'error') && <WebcamStart status={cameraEnabled ? tracking.status : 'idle'} error={tracking.error} onStart={startCamera} onCancel={stopCamera} />}
    {cameraReady && tracking.status === 'loading' && <div className="webcam-loading-note" role="status">Your camera is live. Preparing hand tracking…<small>The model downloads on first use.</small></div>}

    {live && <>
      <ToolRail />
      <BottomDock settingsOpen={settingsOpen} toggleSettings={() => setSettingsOpen((open) => !open)} />
      <AnimatePresence>{settingsOpen && <SettingsPanel close={() => setSettingsOpen(false)} />}</AnimatePresence>
      <footer className="status-bar"><div className="local-status"><ShieldCheck size={13} /><span>Live & on-device</span><span className="footer-dot">·</span><span className="footer-brush">{BRUSH_NAMES[state.brush]}</span></div><div className="webcam-gesture-hint"><Hand size={15} /><span>Index up to write · Open palm to pause</span></div><button className="webcam-clear-button" onClick={() => { surface.current?.end(); setDialog('clear'); }}><Trash2 size={15} /><span>Clear writing</span></button></footer>
    </>}

    <AnimatePresence>{palette && live && <><div className="palette-dismiss" onPointerDown={() => setPalette(null)} /><QuickPalette x={palette.x} y={palette.y} close={() => setPalette(null)} /></>}</AnimatePresence>
    <AnimatePresence>{dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}{dialog === 'export' && <ExportDialog videoRef={videoRef} notify={notify} onClose={() => setDialog(null)} />}{dialog === 'clear' && <ClearDialog onClose={() => setDialog(null)} onClear={() => { surface.current?.end(); state.clear(); notify('Writing cleared. Your webcam stays live.'); }} />}</AnimatePresence>
    <Toast message={toast} />
    <div className="sr-only" role="status" aria-live="polite">{live ? 'Live webcam writing ready. Raise your index finger to write over the video.' : cameraReady ? 'Webcam live. Loading hand tracking.' : 'Start your webcam to write in real time.'}</div>
  </main>;
}
