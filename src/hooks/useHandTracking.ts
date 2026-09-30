import { useEffect, useRef, useState, type RefObject } from 'react'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

export interface TrackedHand {
  /** Normalized, mirrored coordinates of the index fingertip. */
  x: number
  y: number
  gesture: 'write' | 'laser' | 'hover' | 'erase' | 'pinch'
  pinched: boolean
  /** Fraction of extended fingers, from zero to one. */
  openness: number
}

export interface HandFrame {
  hands: TrackedHand[]
  /** Monotonic timestamp in milliseconds, from performance.now(). */
  timestamp: number
}

type TrackingStatus = 'idle' | 'loading' | 'tracking' | 'error'
type Point = { x: number; y: number }
type SmoothedPoint = Point & { timestamp: number }

// Match the installed 0.10.22 release candidate; the unsuffixed release is not published.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// Distances and joint angles work for rotated hands, unlike comparing y alone.
function fingerExtended(points: Point[], base: number, joint: number, tip: number) {
  const a = points[base]
  const b = points[joint]
  const c = points[tip]
  const ux = a.x - b.x
  const uy = a.y - b.y
  const vx = c.x - b.x
  const vy = c.y - b.y
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  const cosine = length > 0 ? (ux * vx + uy * vy) / length : 1

  return (
    cosine < -0.55 &&
    distance(c, a) > distance(b, a) * 1.45 &&
    distance(c, points[0]) > distance(b, points[0]) * 1.05
  )
}

function classifyHand(points: Point[]): Pick<TrackedHand, 'gesture' | 'pinched' | 'openness'> {
  const index = fingerExtended(points, 5, 6, 8)
  const middle = fingerExtended(points, 9, 10, 12)
  const ring = fingerExtended(points, 13, 14, 16)
  const pinky = fingerExtended(points, 17, 18, 20)
  const thumb =
    distance(points[4], points[17]) > distance(points[3], points[17]) * 1.1 &&
    distance(points[4], points[5]) > distance(points[3], points[5]) * 1.1
  const openness = [thumb, index, middle, ring, pinky].filter(Boolean).length / 5
  // Curled fingertips inside a fist can also be close together; require the
  // index tip to be outside the palm so a fist does not become a false click.
  const tipOutsidePalm = distance(points[8], points[0]) > distance(points[6], points[0]) * 0.85
  const pinched = distance(points[4], points[8]) < 0.05 && tipOutsidePalm
  let gesture: TrackedHand['gesture'] = 'hover'

  if (pinched) {
    // Pinching always wins, even when the other fingers are extended or curled.
    gesture = 'pinch'
  } else if (!index && !middle && !ring && !pinky) {
    gesture = 'erase'
  } else if (index && !middle && !ring && !pinky) {
    gesture = 'write'
  } else if (index && middle && !ring && !pinky) {
    const palmWidth = Math.max(distance(points[5], points[17]), 0.001)
    gesture = distance(points[8], points[12]) / palmWidth < 0.45 ? 'laser' : 'erase'
  }

  // An open palm, and ambiguous poses, intentionally remain hover.
  return { gesture, pinched, openness }
}

function trackingError(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera access was denied. Allow camera access in your browser and try again.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera was found. Connect a camera and try again.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera could not be opened. Close other apps using it and try again.'
  }
  if (name === 'SecurityError') {
    return 'Camera access requires a secure page (HTTPS or localhost) and browser permission.'
  }
  const detail = error instanceof Error ? error.message : String(error)
  return `Unable to start hand tracking: ${detail}`
}

/**
 * Uses the real camera and MediaPipe model. The first enable downloads MediaPipe
 * WASM and the hand-landmark model; subsequent loads may use the browser cache.
 * FPS measures completed inferences, not the display refresh rate.
 */
export function useHandTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onFrame: (frame: HandFrame) => void,
  restartKey = 0,
): { status: TrackingStatus; error: string | null; fps: number } {
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const onFrameRef = useRef(onFrame)

  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  useEffect(() => {
    let disposed = false
    let stream: MediaStream | null = null
    let landmarker: HandLandmarker | null = null
    let animationFrameId: number | null = null
    let videoFrameId: number | null = null
    let removeTrackListeners: (() => void) | null = null
    const video = videoRef.current
    const smoothed = new Map<string, SmoothedPoint>()
    let lastVideoTime = -1
    let fpsWindowStart = 0
    let inferenceCount = 0

    const emitEmptyFrame = () => {
      onFrameRef.current({ hands: [], timestamp: performance.now() })
    }

    const releaseResources = () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
      if (videoFrameId !== null) video?.cancelVideoFrameCallback(videoFrameId)
      animationFrameId = null
      videoFrameId = null
      removeTrackListeners?.()
      removeTrackListeners = null

      // Do not detach a stream belonging to a newer enable/StrictMode effect.
      if (stream) {
        if (video?.srcObject === stream) {
          video.pause()
          video.srcObject = null
        }
        stream.getTracks().forEach((track) => track.stop())
        stream = null
      }
      const instance = landmarker
      landmarker = null
      smoothed.clear()
      // A failed WebGL context must not prevent camera cleanup.
      try {
        instance?.close()
      } catch {
        // The camera and animation callbacks have already been released.
      }
    }

    const fail = (cause: unknown) => {
      if (disposed) return
      disposed = true
      releaseResources()
      setStatus('error')
      setError(trackingError(cause))
      setFps(0)
      emitEmptyFrame()
    }

    setError(null)
    setFps(0)
    setStatus(enabled ? 'loading' : 'idle')
    emitEmptyFrame()

    if (!enabled) {
      return () => {
        disposed = true
        releaseResources()
      }
    }

    function scheduleFrame() {
      if (disposed || !video || !landmarker) return
      if (
        typeof video.requestVideoFrameCallback === 'function' &&
        typeof video.cancelVideoFrameCallback === 'function'
      ) {
        videoFrameId = video.requestVideoFrameCallback(processFrame)
      } else {
        animationFrameId = requestAnimationFrame(processFrame)
      }
    }

    function processFrame() {
      animationFrameId = null
      videoFrameId = null
      if (disposed || !video || !landmarker) return

      try {
        if (
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          !video.paused &&
          !video.ended &&
          video.currentTime !== lastVideoTime
        ) {
          lastVideoTime = video.currentTime
          const timestamp = performance.now()
          const result = landmarker.detectForVideo(video, timestamp)
          const seenKeys = new Set<string>()
          const hands: TrackedHand[] = []

          result.landmarks.forEach((points, index) => {
            if (points.length < 21) return
            const handedness = result.handedness[index]?.[0]?.categoryName ?? `hand-${index}`
            // Normally Left/Right are unique. Do not blend two hands if the
            // detector happens to assign them the same handedness this frame.
            const key = seenKeys.has(handedness) ? `${handedness}-${index}` : handedness
            seenKeys.add(key)
            let x = clamp(1 - points[8].x, 0, 1)
            let y = clamp(points[8].y, 0, 1)
            const previous = smoothed.get(key)

            if (previous && timestamp - previous.timestamp < 150) {
              const dt = clamp((timestamp - previous.timestamp) / 1000, 0.001, 0.1)
              const speed = Math.hypot(x - previous.x, y - previous.y) / dt
              // Stable at rest, responsive in motion, independent of frame rate.
              const alpha = 1 - Math.exp(-(12 + Math.min(speed * 65, 80)) * dt)
              x = previous.x + alpha * (x - previous.x)
              y = previous.y + alpha * (y - previous.y)
            }

            smoothed.set(key, { x, y, timestamp })
            hands.push({ x, y, ...classifyHand(points) })
          })

          for (const key of smoothed.keys()) {
            if (!seenKeys.has(key)) smoothed.delete(key)
          }
          onFrameRef.current({ hands, timestamp })

          inferenceCount += 1
          const completedAt = performance.now()
          if (completedAt - fpsWindowStart >= 750) {
            setFps(Math.round((inferenceCount * 1000) / (completedAt - fpsWindowStart)))
            inferenceCount = 0
            fpsWindowStart = completedAt
          }
        }
      } catch (cause) {
        fail(cause)
        return
      }
      scheduleFrame()
    }

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is unavailable. Use a supported browser on HTTPS or localhost.')
        }
        if (!video) throw new Error('The camera preview is not ready. Please try again.')

        const acquiredStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, max: 60 },
          },
        })
        if (disposed) {
          acquiredStream.getTracks().forEach((track) => track.stop())
          return
        }
        stream = acquiredStream
        const tracks = acquiredStream.getVideoTracks()
        const onEnded = () => fail(new Error('The camera disconnected or camera access was revoked.'))
        tracks.forEach((track) => track.addEventListener('ended', onEnded))
        removeTrackListeners = () => {
          tracks.forEach((track) => track.removeEventListener('ended', onEnded))
        }
        video.muted = true
        video.playsInline = true
        video.srcObject = acquiredStream
        await video.play()
        if (disposed) return

        const { FilesetResolver, HandLandmarker: VisionHandLandmarker } = await import('@mediapipe/tasks-vision')
        if (disposed) return
        const fileset = await FilesetResolver.forVisionTasks(WASM_URL)
        if (disposed) return
        const createLandmarker = (delegate: 'GPU' | 'CPU') =>
          VisionHandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          })

        let instance: HandLandmarker
        try {
          instance = await createLandmarker('GPU')
        } catch (gpuError) {
          if (disposed) return
          try {
            instance = await createLandmarker('CPU')
          } catch (cpuError) {
            const detail = cpuError instanceof Error ? cpuError.message : String(cpuError)
            throw new Error(
              `The hand model could not load (GPU and CPU). Check your network connection and allow model downloads. ${detail}`,
              { cause: gpuError },
            )
          }
        }
        // Model initialization cannot be cancelled, so close late arrivals.
        if (disposed) {
          instance.close()
          return
        }
        landmarker = instance
        fpsWindowStart = performance.now()
        setStatus('tracking')
        scheduleFrame()
      } catch (cause) {
        fail(cause)
      }
    }

    void start()
    return () => {
      disposed = true
      releaseResources()
    }
  }, [enabled, videoRef, restartKey])

  return { status, error, fps }
}
