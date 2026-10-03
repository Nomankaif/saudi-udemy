export type EraseRect = { x: number; y: number; width: number; height: number };
export type ImagePoint = { x: number; y: number };

export function imagePoint(client: ImagePoint, bounds: { left: number; top: number; width: number; height: number }, size: { width: number; height: number }): ImagePoint {
  return {
    x: Math.max(0, Math.min(size.width, (client.x - bounds.left) / bounds.width * size.width)),
    y: Math.max(0, Math.min(size.height, (client.y - bounds.top) / bounds.height * size.height)),
  };
}

// Round outwards so no fractional edge pixels retain the printed answer.
export function eraseRect(start: ImagePoint, end: ImagePoint): EraseRect {
  const x = Math.floor(Math.min(start.x, end.x)), y = Math.floor(Math.min(start.y, end.y));
  return { x, y, width: Math.ceil(Math.max(start.x, end.x)) - x, height: Math.ceil(Math.max(start.y, end.y)) - y };
}

export function validEraseRect(rect: EraseRect, size: { width: number; height: number }) {
  return Object.values(rect).every(Number.isFinite) && rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 &&
    rect.x + rect.width <= size.width && rect.y + rect.height <= size.height;
}

export function paintCleanImage(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, rectangles: EraseRect[]) {
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  context.fillStyle = "#ffffff";
  for (const rect of rectangles) {
    if (!validEraseRect(rect, { width, height })) throw new Error("An erase rectangle falls outside the image.");
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}
