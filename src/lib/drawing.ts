export type Point = { x: number; y: number; t: number }
export type Brush = 'pen' | 'fountain' | 'neon' | 'rainbow' | 'marker' | 'eraser'
export type Background = 'paper' | 'dark' | 'white' | 'blueprint' | 'camera'
export type CanvasView = { x: number; y: number; zoom: number }

export type Stroke = {
  id: string
  points: Point[]
  color: string
  size: number
  opacity: number
  brush: Brush
}

type Position = Pick<Point, 'x' | 'y'>
type Segment = { from: Position; control: Position; to: Position }
type NibPoint = Position & { radius: number }

const TAU = Math.PI * 2
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const distance = (a: Position, b: Position) => Math.hypot(b.x - a.x, b.y - a.y)
const midpoint = (a: Position, b: Position): Position => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const sizeOf = (stroke: Stroke) => Number.isFinite(stroke.size) ? Math.max(0.1, stroke.size) : 3
const opacityOf = (stroke: Stroke) => Number.isFinite(stroke.opacity) ? clamp(stroke.opacity, 0, 1) : 1
const dimension = (value: number) => Number.isFinite(value) && value > 0 ? value : 1
const number = (value: number) => String(Math.round(value * 1000) / 1000)
const coordinates = (point: Position) => `${number(point.x)} ${number(point.y)}`

function usablePoints(points: Point[]): Point[] {
  const result: Point[] = []
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    if (result.length && distance(result[result.length - 1], point) < 0.001) continue
    result.push({ x: point.x, y: point.y, t: Number.isFinite(point.t) ? point.t : 0 })
  }
  return result
}

/** Midpoint quadratics interpolate the endpoints and keep neighboring tangents continuous. */
function segmentsOf(points: Position[]): Segment[] {
  if (points.length < 2) return []
  const segments: Segment[] = []
  let from = points[0]
  for (let i = 0; i < points.length; i += 1) {
    const to = i === points.length - 1 ? points[i] : midpoint(points[i], points[i + 1])
    segments.push({ from, control: points[i], to })
    from = to
  }
  return segments
}

function tracePath(ctx: CanvasRenderingContext2D, points: Position[]): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const { control, to } of segmentsOf(points)) {
    ctx.quadraticCurveTo(control.x, control.y, to.x, to.y)
  }
}

function svgPath(points: Position[]): string {
  return `M ${coordinates(points[0])} ${segmentsOf(points).map(({ control, to }) =>
    `Q ${coordinates(control)} ${coordinates(to)}`).join(' ')}`
}

/** A filled, round-capped ribbon avoids opacity seams between variable-width segments. */
function fountainOutline(points: Point[], size: number): { left: Position[]; right: Position[]; samples: NibPoint[] } {
  const widths: number[] = []
  let previous = size
  for (let i = 0; i < points.length; i += 1) {
    const a = points[Math.max(0, i - 1)]
    const b = points[i === 0 ? Math.min(1, points.length - 1) : i]
    const elapsed = b.t - a.t
    // Missing or non-monotonic timestamps must not turn the nib into a hairline.
    const velocity = distance(a, b) / (elapsed > 0 ? Math.max(4, elapsed) : 16)
    const target = size * clamp(1.25 / (1 + velocity * 0.65), 0.3, 1.25)
    previous = i === 0 ? target : previous * 0.65 + target * 0.35
    widths.push(previous)
  }
  const samples: NibPoint[] = [{ ...points[0], radius: widths[0] / 2 }]
  segmentsOf(points).forEach(({ from, control, to }, i) => {
    const startWidth = i === 0 ? widths[0] : (widths[i - 1] + widths[i]) / 2
    const endWidth = i === points.length - 1 ? widths[i] : (widths[i] + widths[i + 1]) / 2
    const steps = clamp(Math.ceil((distance(from, control) + distance(control, to)) / 2), 2, 64)
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const inverse = 1 - t
      const sample = {
        x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
        y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
        radius: (startWidth + (endWidth - startWidth) * t) / 2,
      }
      if (distance(samples[samples.length - 1], sample) > 0.001) samples.push(sample)
    }
  })
  const left: Position[] = []
  const right: Position[] = []
  samples.forEach((sample, i) => {
    const before = samples[Math.max(0, i - 1)]
    const after = samples[Math.min(samples.length - 1, i + 1)]
    let dx = after.x - before.x
    let dy = after.y - before.y
    if (Math.hypot(dx, dy) < 0.001) {
      dx = sample.x - before.x || 1
      dy = sample.y - before.y
    }
    const length = Math.hypot(dx, dy)
    const nx = -dy / length * sample.radius
    const ny = dx / length * sample.radius
    left.push({ x: sample.x + nx, y: sample.y + ny })
    right.push({ x: sample.x - nx, y: sample.y - ny })
  })
  return { left, right, samples }
}

function traceFountain(ctx: CanvasRenderingContext2D, points: Point[], size: number): void {
  const { left, right, samples } = fountainOutline(points, size)
  const first = samples[0]
  const last = samples[samples.length - 1]
  const endAngle = Math.atan2(left[left.length - 1].y - last.y, left[left.length - 1].x - last.x)
  const startAngle = Math.atan2(right[0].y - first.y, right[0].x - first.x)
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i += 1) ctx.lineTo(left[i].x, left[i].y)
  ctx.arc(last.x, last.y, last.radius, endAngle, endAngle - Math.PI, true)
  for (let i = right.length - 2; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y)
  ctx.arc(first.x, first.y, first.radius, startAngle, startAngle - Math.PI, true)
  ctx.closePath()
  ctx.fill()
}

function svgFountain(points: Point[], size: number): string {
  const { left, right, samples } = fountainOutline(points, size)
  const first = samples[0]
  const last = samples[samples.length - 1]
  return `M ${coordinates(left[0])} ${left.slice(1).map(point => `L ${coordinates(point)}`).join(' ')} ` +
    `A ${number(last.radius)} ${number(last.radius)} 0 0 0 ${coordinates(right[right.length - 1])} ` +
    `${right.slice(0, -1).reverse().map(point => `L ${coordinates(point)}`).join(' ')} ` +
    `A ${number(first.radius)} ${number(first.radius)} 0 0 0 ${coordinates(left[0])} Z`
}

function paintDot(ctx: CanvasRenderingContext2D, point: Position, size: number, square = false): void {
  if (square) {
    ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size)
    return
  }
  ctx.beginPath()
  ctx.arc(point.x, point.y, size / 2, 0, TAU)
  ctx.fill()
}

/** Draw in logical CSS pixels; caller-owned transforms, clipping, and styles are preserved. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = usablePoints(stroke.points)
  if (!points.length || opacityOf(stroke) === 0) return
  const size = sizeOf(stroke)
  ctx.save()
  try {
    ctx.globalCompositeOperation = stroke.brush === 'eraser' ? 'destination-out' : 'source-over'
    ctx.globalAlpha *= opacityOf(stroke) * (stroke.brush === 'marker' ? 0.4 : 1)
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
    ctx.lineWidth = size
    ctx.lineCap = stroke.brush === 'marker' ? 'square' : 'round'
    ctx.lineJoin = stroke.brush === 'marker' ? 'bevel' : 'round'
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.shadowColor = 'transparent'
    // Erasing is independent of the selected ink color (including its alpha channel).
    if (stroke.brush === 'eraser') ctx.strokeStyle = ctx.fillStyle = '#000000'
    if (stroke.brush === 'neon') {
      const transform = ctx.getTransform()
      const scale = (Math.hypot(transform.a, transform.b) + Math.hypot(transform.c, transform.d)) / 2
      ctx.shadowColor = stroke.color
      ctx.shadowBlur = size * 1.5 * scale
    }
    if (stroke.brush === 'rainbow') {
      let travelled = 0
      if (points.length === 1) {
        ctx.fillStyle = 'hsl(0, 90%, 60%)'
        paintDot(ctx, points[0], size)
      }
      for (const segment of segmentsOf(points)) {
        ctx.strokeStyle = `hsl(${number(travelled * 1.2 % 360)}, 90%, 60%)`
        ctx.beginPath()
        ctx.moveTo(segment.from.x, segment.from.y)
        ctx.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y)
        ctx.stroke()
        travelled += distance(segment.from, segment.to)
      }
      return
    }
    if (points.length === 1) {
      paintDot(ctx, points[0], size, stroke.brush === 'marker')
    } else if (stroke.brush === 'fountain') {
      traceFountain(ctx, points, size)
    } else {
      tracePath(ctx, points)
      ctx.stroke()
    }
    if (stroke.brush === 'neon') {
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'
      ctx.globalAlpha *= 0.7
      ctx.strokeStyle = ctx.fillStyle = '#ffffff'
      ctx.lineWidth = size * 0.32
      if (points.length === 1) paintDot(ctx, points[0], size * 0.32)
      else {
        tracePath(ctx, points)
        ctx.stroke()
      }
    }
  } finally {
    ctx.restore()
  }
}

/** Camera is intentionally transparent so a live video layer can sit behind the ink. */
export function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, background: Background): void {
  if (background === 'camera') return
  ctx.save()
  try {
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.setLineDash([])
    ctx.fillStyle = background === 'dark' ? '#151b2a' : background === 'blueprint' ? '#142d4f' : background === 'white' ? '#ffffff' : '#f8f9fc'
    ctx.fillRect(0, 0, width, height)
    if (background === 'paper') {
      ctx.fillStyle = '#dce1ec'
      ctx.beginPath()
      for (let x = 12; x < width; x += 24) {
        for (let y = 12; y < height; y += 24) {
          ctx.moveTo(x + 0.75, y)
          ctx.arc(x, y, 0.75, 0, TAU)
        }
      }
      ctx.fill()
    } else if (background === 'blueprint') {
      ctx.lineWidth = 1
      for (const [spacing, color] of [[24, 'rgba(139, 183, 224, 0.14)'], [120, 'rgba(139, 183, 224, 0.22)']] as const) {
        ctx.strokeStyle = color
        ctx.beginPath()
        for (let x = 0; x <= width; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, height) }
        for (let y = 0; y <= height; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(width, y) }
        ctx.stroke()
      }
    }
  } finally {
    ctx.restore()
  }
}

/** Draw ink only. Use a separate ink canvas if erasers must not remove a background. */
export function drawScene(ctx: CanvasRenderingContext2D, strokes: Stroke[]): void {
  for (const stroke of strokes) drawStroke(ctx, stroke)
}

function pointSegmentDistance(point: Position, a: Position, b: Position): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return distance(point, a)
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1)
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy })
}

function pathLength(points: Position[]): number {
  let total = 0
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i])
  return total
}

function signedArea(points: Position[]): number {
  let area = 0
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length]
    area += points[i].x * next.y - next.x * points[i].y
  }
  return area / 2
}

/** Iterative Ramer–Douglas–Peucker keeps long input strokes off the call stack. */
function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points
  const keep = new Set([0, points.length - 1])
  const pending: [number, number][] = [[0, points.length - 1]]
  while (pending.length) {
    const [start, end] = pending.pop()!
    let farthest = epsilon
    let index = -1
    for (let i = start + 1; i < end; i += 1) {
      const error = pointSegmentDistance(points[i], points[start], points[end])
      if (error > farthest) { farthest = error; index = i }
    }
    if (index !== -1) {
      keep.add(index)
      pending.push([start, index], [index, end])
    }
  }
  return [...keep].sort((a, b) => a - b).map(index => points[index])
}

function polygonCorners(points: Point[], epsilon: number): Point[] {
  let split = 1
  for (let i = 2; i < points.length; i += 1) {
    if (distance(points[0], points[i]) > distance(points[0], points[split])) split = i
  }
  const first = simplify(points.slice(0, split + 1), epsilon)
  const second = simplify([...points.slice(split), points[0]], epsilon)
  const corners = [...first.slice(0, -1), ...second.slice(0, -1)]
  let changed = true
  while (changed && corners.length > 3) {
    changed = false
    for (let i = 0; i < corners.length; i += 1) {
      if (pointSegmentDistance(corners[i], corners[(i + corners.length - 1) % corners.length], corners[(i + 1) % corners.length]) <= epsilon) {
        corners.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return corners
}

function sampledPolygon(corners: Position[]): Position[] {
  const points: Position[] = []
  for (let i = 0; i < corners.length; i += 1) {
    const from = corners[i]
    const to = corners[(i + 1) % corners.length]
    const steps = clamp(Math.ceil(distance(from, to) / 3), 2, 128)
    for (let j = 0; j < steps; j += 1) points.push({ x: from.x + (to.x - from.x) * j / steps, y: from.y + (to.y - from.y) * j / steps })
  }
  points.push({ ...points[0] })
  return points
}

function withShape(stroke: Stroke, original: Point[], positions: Position[]): Stroke {
  const total = pathLength(positions)
  const start = original[0].t
  const duration = Math.max(16, original[original.length - 1].t - start)
  let travelled = 0
  return {
    ...stroke,
    points: positions.map((point, i) => {
      if (i > 0) travelled += distance(positions[i - 1], point)
      return { ...point, t: start + duration * (total > 0 ? travelled / total : 0) }
    }),
  }
}

/** Conservative recognition: ambiguous handwriting is returned unchanged, never mutated. */
export function recognizeShape(stroke: Stroke): Stroke {
  if (stroke.brush === 'eraser') return stroke
  const points = usablePoints(stroke.points)
  if (points.length < 3) return stroke
  const first = points[0]
  const last = points[points.length - 1]
  const length = pathLength(points)
  const direct = distance(first, last)
  if (direct >= 12 && length / direct <= 1.14 && points.every(point => pointSegmentDistance(point, first, last) <= Math.max(2, direct * 0.035))) {
    return withShape(stroke, points, [first, last])
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
  }
  const width = maxX - minX
  const height = maxY - minY
  const diagonal = Math.hypot(width, height)
  if (points.length < 4 || diagonal < 24 || direct > Math.max(6, diagonal * 0.13)) return stroke
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const radii = points.map(point => distance(point, center))
  const radius = radii.reduce((sum, value) => sum + value, 0) / radii.length
  const radialError = Math.sqrt(radii.reduce((sum, value) => sum + (value - radius) ** 2, 0) / radii.length) / radius
  const buckets = new Set(points.map(point => Math.floor((Math.atan2(point.y - center.y, point.x - center.x) + Math.PI) / TAU * 12) % 12))
  if (width / height >= 0.88 && width / height <= 1.14 && radialError < 0.075 &&
    radii.every(value => Math.abs(value - radius) / radius < 0.18) && buckets.size >= 11 &&
    length / (TAU * radius) > 0.83 && length / (TAU * radius) < 1.2) {
    const startAngle = Math.atan2(first.y - center.y, first.x - center.x)
    const direction = signedArea(points) >= 0 ? 1 : -1
    const steps = clamp(Math.ceil(TAU * radius / 4), 48, 256)
    const circle = Array.from({ length: steps + 1 }, (_, i) => ({
      x: center.x + Math.cos(startAngle + direction * TAU * i / steps) * radius,
      y: center.y + Math.sin(startAngle + direction * TAU * i / steps) * radius,
    }))
    return withShape(stroke, points, circle)
  }
  const corners = polygonCorners(points, diagonal * 0.045)
  if (corners.length !== 3 && corners.length !== 4) return stroke
  const edges = corners.map((point, i) => ({ x: corners[(i + 1) % corners.length].x - point.x, y: corners[(i + 1) % corners.length].y - point.y }))
  const lengths = edges.map(edge => Math.hypot(edge.x, edge.y))
  const perimeter = lengths.reduce((sum, value) => sum + value, 0)
  if (lengths.some(value => value < diagonal * 0.2) || Math.abs(signedArea(corners)) < diagonal * diagonal * 0.08 ||
    length / perimeter < 0.85 || length / perimeter > 1.2) return stroke
  let fitted: Position[] = corners
  if (corners.length === 4) {
    for (let i = 0; i < 4; i += 1) {
      const next = (i + 1) % 4
      if (Math.abs(edges[i].x * edges[next].x + edges[i].y * edges[next].y) / (lengths[i] * lengths[next]) > 0.18) return stroke
    }
    if (Math.abs(lengths[0] - lengths[2]) / Math.max(lengths[0], lengths[2]) > 0.18 ||
      Math.abs(lengths[1] - lengths[3]) / Math.max(lengths[1], lengths[3]) > 0.18) return stroke
    const ux = edges[0].x - edges[2].x
    const uy = edges[0].y - edges[2].y
    const magnitude = Math.hypot(ux, uy)
    if (magnitude < 0.001) return stroke
    const u = { x: ux / magnitude, y: uy / magnitude }
    const direction = u.x * edges[1].y - u.y * edges[1].x >= 0 ? 1 : -1
    const v = { x: -u.y * direction, y: u.x * direction }
    const middle = { x: corners.reduce((sum, point) => sum + point.x, 0) / 4, y: corners.reduce((sum, point) => sum + point.y, 0) / 4 }
    const halfWidth = (lengths[0] + lengths[2]) / 4
    const halfHeight = (lengths[1] + lengths[3]) / 4
    fitted = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
      x: middle.x + x * u.x * halfWidth + y * v.x * halfHeight,
      y: middle.y + x * u.y * halfWidth + y * v.y * halfHeight,
    }))
  }
  if (!points.every(point => fitted.some((corner, i) => pointSegmentDistance(point, corner, fitted[(i + 1) % fitted.length]) <= diagonal * 0.055))) return stroke
  return withShape(stroke, points, sampledPolygon(fitted))
}

function escapeXml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }
  return value.replace(/[&<>"']/g, character => entities[character])
}

function svgMark(points: Point[], color: string, size: number, opacity: number, square = false, extra = ''): string {
  const attributes = `opacity="${number(opacity)}"${extra ? ` ${extra}` : ''}`
  if (points.length === 1) {
    const point = points[0]
    return square
      ? `<rect x="${number(point.x - size / 2)}" y="${number(point.y - size / 2)}" width="${number(size)}" height="${number(size)}" fill="${escapeXml(color)}" ${attributes}/>`
      : `<circle cx="${number(point.x)}" cy="${number(point.y)}" r="${number(size / 2)}" fill="${escapeXml(color)}" ${attributes}/>`
  }
  return `<path d="${svgPath(points)}" fill="none" stroke="${escapeXml(color)}" stroke-width="${number(size)}" stroke-linecap="${square ? 'square' : 'round'}" stroke-linejoin="${square ? 'bevel' : 'round'}" ${attributes}/>`
}

function svgStroke(stroke: Stroke, points: Point[], index: number, definitions: string[]): string {
  const size = sizeOf(stroke)
  const opacity = opacityOf(stroke)
  if (stroke.brush === 'fountain' && points.length > 1) {
    return `<path d="${svgFountain(points, size)}" fill="${escapeXml(stroke.color)}" opacity="${number(opacity)}"/>`
  }
  if (stroke.brush === 'rainbow') {
    if (points.length === 1) return svgMark(points, 'hsl(0, 90%, 60%)', size, opacity)
    let travelled = 0
    return segmentsOf(points).map(({ from, control, to }) => {
      const color = `hsl(${number(travelled * 1.2 % 360)}, 90%, 60%)`
      travelled += distance(from, to)
      return `<path d="M ${coordinates(from)} Q ${coordinates(control)} ${coordinates(to)}" fill="none" stroke="${color}" stroke-width="${number(size)}" stroke-linecap="round" opacity="${number(opacity)}"/>`
    }).join('')
  }
  if (stroke.brush === 'neon') {
    const padding = size * 5
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const point of points) {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
    }
    definitions.push(`<filter id="aw-neon-${index}" filterUnits="userSpaceOnUse" x="${number(minX - padding)}" y="${number(minY - padding)}" width="${number(maxX - minX + padding * 2)}" height="${number(maxY - minY + padding * 2)}" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="${number(size * 0.75)}"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`)
    return svgMark(points, stroke.color, size, opacity, false, `filter="url(#aw-neon-${index})"`) + svgMark(points, '#ffffff', size * 0.32, opacity * 0.7)
  }
  return svgMark(points, stroke.color, size, opacity * (stroke.brush === 'marker' ? 0.4 : 1), stroke.brush === 'marker')
}

function svgBackground(background: Background, definitions: string[]): string {
  const rect = (fill: string) => `<rect width="100%" height="100%" fill="${fill}"/>`
  if (background === 'paper') {
    definitions.push('<pattern id="aw-paper" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="0.75" fill="#dce1ec"/></pattern>')
    return rect('#f8f9fc') + rect('url(#aw-paper)')
  }
  if (background === 'blueprint') {
    definitions.push('<pattern id="aw-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 H 0 V 24" fill="none" stroke="#8bb7e0" stroke-opacity="0.14"/></pattern>')
    definitions.push('<pattern id="aw-grid-major" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M 120 0 H 0 V 120" fill="none" stroke="#8bb7e0" stroke-opacity="0.22"/></pattern>')
    return rect('#142d4f') + rect('url(#aw-grid)') + rect('url(#aw-grid-major)')
  }
  // SVG has no video argument; camera exports use the same fallback as raster exports.
  return rect(background === 'white' ? '#ffffff' : '#151b2a')
}

/** Eraser masks affect only earlier ink, never the background or later strokes. */
export function exportSvg(strokes: Stroke[], width: number, height: number, background: Background, transparent = false, view: CanvasView = { x: 0, y: 0, zoom: 1 }): string {
  width = dimension(width)
  height = dimension(height)
  const zoom = dimension(view.zoom)
  const maskX = -view.x / zoom, maskY = -view.y / zoom
  const maskWidth = width / zoom, maskHeight = height / zoom
  const definitions: string[] = []
  const backdrop = transparent ? '' : svgBackground(background, definitions)
  let artwork = ''
  strokes.forEach((stroke, index) => {
    const points = usablePoints(stroke.points)
    if (!points.length || opacityOf(stroke) === 0) return
    if (stroke.brush !== 'eraser') {
      artwork += svgStroke(stroke, points, index, definitions)
    } else if (artwork) {
      definitions.push(`<mask id="aw-erase-${index}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="${number(maskX)}" y="${number(maskY)}" width="${number(maskWidth)}" height="${number(maskHeight)}" style="mask-type:luminance"><rect x="${number(maskX)}" y="${number(maskY)}" width="${number(maskWidth)}" height="${number(maskHeight)}" fill="#ffffff"/>${svgMark(points, '#000000', sizeOf(stroke), opacityOf(stroke))}</mask>`)
      artwork = `<g mask="url(#aw-erase-${index})">${artwork}</g>`
    }
  })
  if (view.x !== 0 || view.y !== 0 || zoom !== 1) artwork = `<g transform="translate(${number(view.x)} ${number(view.y)}) scale(${number(zoom)})">${artwork}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${number(height)}" viewBox="0 0 ${number(width)} ${number(height)}"><defs>${definitions.join('')}</defs>${backdrop}${artwork}</svg>`
}

/** Scale controls output resolution; the optional view preserves brush behavior under pan/zoom. */
export function makeExportCanvas(
  strokes: Stroke[],
  width: number,
  height: number,
  background: Background,
  scale: number,
  transparent: boolean,
  video?: HTMLVideoElement | null,
  view: CanvasView = { x: 0, y: 0, zoom: 1 },
): HTMLCanvasElement {
  if (typeof document === 'undefined') throw new Error('Canvas export requires a browser document.')
  width = dimension(width)
  height = dimension(height)
  scale = dimension(scale)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('A 2D canvas context is not available.')
  ctx.scale(canvas.width / width, canvas.height / height)
  if (!transparent) {
    drawBackground(ctx, width, height, background === 'camera' ? 'dark' : background)
    if (background === 'camera' && video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      // Match a mirrored object-fit: cover camera preview without stretching the frame.
      const cover = Math.max(width / video.videoWidth, height / video.videoHeight)
      const videoWidth = video.videoWidth * cover
      const videoHeight = video.videoHeight * cover
      ctx.save()
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      try {
        ctx.drawImage(video, (width - videoWidth) / 2, (height - videoHeight) / 2, videoWidth, videoHeight)
      } catch {
        // A stream can lose its decoded frame between readyState and drawImage.
      } finally {
        ctx.restore()
      }
    }
  }
  // Composite the ink only after all erasers have run, keeping paper/video intact.
  const ink = document.createElement('canvas')
  ink.width = canvas.width
  ink.height = canvas.height
  const inkContext = ink.getContext('2d')
  if (!inkContext) throw new Error('A 2D ink canvas context is not available.')
  inkContext.scale(canvas.width / width, canvas.height / height)
  inkContext.translate(view.x, view.y)
  inkContext.scale(dimension(view.zoom), dimension(view.zoom))
  drawScene(inkContext, strokes)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(ink, 0, 0)
  return canvas
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // Delay revocation so browsers have time to begin consuming the download URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
