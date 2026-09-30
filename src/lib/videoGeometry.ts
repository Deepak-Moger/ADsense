export interface VideoPoint { x: number; y: number; visible: boolean }

/** Map an already-mirrored landmark onto a centered, object-fit: cover video.
 * Using normalized viewport coordinates directly would put ink away from the
 * visible fingertip whenever the camera and screen have different aspect ratios.
 */
export function videoPointToScreen(
  x: number, y: number,
  videoWidth: number, videoHeight: number,
  screenWidth: number, screenHeight: number,
): VideoPoint {
  if (![x, y, videoWidth, videoHeight, screenWidth, screenHeight].every(Number.isFinite) ||
    videoWidth <= 0 || videoHeight <= 0 || screenWidth <= 0 || screenHeight <= 0) {
    return { x: 0, y: 0, visible: false };
  }
  const scale = Math.max(screenWidth / videoWidth, screenHeight / videoHeight);
  const screenX = (screenWidth - videoWidth * scale) / 2 + x * videoWidth * scale;
  const screenY = (screenHeight - videoHeight * scale) / 2 + y * videoHeight * scale;
  return {
    x: screenX, y: screenY,
    visible: screenX >= 0 && screenX < screenWidth && screenY >= 0 && screenY < screenHeight,
  };
}
