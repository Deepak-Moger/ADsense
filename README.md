# AirWrite Ultra — live webcam writing

AirWrite now uses **only your full-screen live webcam**. Handwriting is overlaid directly on the video in real time. There is no blank board, background selector, mouse-drawing workspace, or canvas pan/zoom.

## Run

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

1. Open the localhost URL printed by Vite.
2. Click **Start webcam** and allow camera permission.
3. Your live video appears full-screen, mirrored like a selfie camera.
4. When tracking is ready, raise your index finger and fold the other fingers to write. Open your palm to lift the pen.

The camera starts only after you click Start. The first run downloads the MediaPipe runtime and hand model. While the model loads, your webcam feed remains visible. Camera denial, disconnection, and initialization failures have retry states; no blank drawing-board fallback is used.

## Features

- Full-screen webcam at normal opacity, without blur or synthetic backgrounds.
- High-DPI transparent ink and cursor layers over the video. Internal HTML canvas elements are rendering primitives, not a separate canvas mode.
- Fingertip coordinates match the mirrored `object-fit: cover` video crop on wide and portrait screens.
- Six writing tools: precision pen, fountain pen, neon, rainbow, highlighter, and eraser.
- Color, thickness, opacity, smart-shape, and auto-hiding control settings.
- Gesture-operated quick palette, undo/redo, clear confirmation, and laser trails.
- Local persistence of writing and tool settings; camera frames are never stored by autosave.
- Snapshot and clipboard export always include the live webcam frame and handwriting. PNG and WebP output are available at 2K or 4K longest-edge sizes; camera detail is limited by the source resolution. These are still images, not video recordings.

## Gestures

| Gesture | Action |
| --- | --- |
| Index up, middle/ring/pinky folded | Write over the live webcam |
| Open palm | Lift the pen |
| Fist or wide V sign | Erase writing |
| Two fingers raised closely together | Laser trail that fades over 2 seconds |
| Thumb/index pinch | Click a tool or open the quick palette |
| Open palm held near the top of the visible video | Quick palette |
| Open-palm swipe left | Undo |
| Two quick pinches in the same spot | Clear-writing confirmation |

Mouse and touch operate the UI controls; handwriting itself comes from your tracked hand. Use bright, even lighting and keep your hand in the visible camera area. Ambiguous poses fall back to hover. Hands outside the cropped video area lift the pen rather than drawing at a mismatched position.

## Shortcuts

- `P / F / N / R / H / E`: precision / fountain / neon / rainbow / highlighter / eraser
- `Ctrl/Cmd Z`: undo
- `Ctrl/Cmd Shift Z` or `Ctrl/Cmd Y`: redo
- `Ctrl/Cmd S`: save a webcam snapshot
- `C`: quick palette
- `Delete / Backspace`: clear-writing confirmation
- `?`: gesture guide
- `Escape`: close a dialog or palette

## Checks

```sh
npm run build
npm test
```

Unit tests cover brush rendering, shape recognition, export utilities, and webcam-coordinate mapping. Build and test execution were attempted after the webcam-only update but remain blocked: the supplied command runner fails before executing commands because WSL cannot find `/bin/bash`. These tests have not been run. Real-camera behavior and visual rendering also require browser verification.

## Privacy and performance

Built with React, TypeScript, Vite, Zustand, Framer Motion, Lucide, and `@mediapipe/tasks-vision`. Camera frames are processed locally; there is no server, streaming upload, telemetry, or account.

Initial network access is required for MediaPipe WASM (jsDelivr), Google's hand-landmark model, and Google Fonts. MediaPipe JavaScript is dynamically imported after camera startup. The package and WASM are pinned to `0.10.22-rc.20250304`. For fully offline deployment, self-host these assets and update `src/hooks/useHandTracking.ts` and `index.html`.

Deploy the built `dist/` directory to an HTTPS static host. Camera access requires HTTPS or localhost. Embedded apps also need camera permission in their iframe and Permissions-Policy. Clipboard images and native fullscreen depend on browser support.

FPS and latency depend on the device, browser, camera, and scene complexity; universal zero latency or 60 FPS cannot be guaranteed. The status badge shows measured inference FPS. Camera capture requests up to 60 FPS at 1280×720, with actual settings negotiated by the browser. Tracking uses adaptive EMA smoothing, GPU initialization with CPU fallback, and video-frame callbacks. MediaPipe VIDEO inference currently runs synchronously on the main thread.

## Key files

- `src/App.tsx`: webcam-only flow, live gestures, and controls.
- `src/hooks/useHandTracking.ts`: camera lifecycle and MediaPipe tracking.
- `src/lib/videoGeometry.ts`: crop-correct fingertip positioning.
- `src/components/DrawingSurface.tsx`: transparent ink and cursor overlays.
- `src/components/StudioUI.tsx`: compact tools, webcam permission state, palette.
- `src/components/Dialogs.tsx`: gesture guide, webcam snapshots, confirmation.
- `src/webcam.css`: webcam-only presentation.
- `src/lib/drawing.ts`: rendering and export primitives. Legacy standalone background/SVG helpers remain available to the unit tests but are not exposed in the webcam-only interface.
