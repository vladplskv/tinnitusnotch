export interface CanvasSize {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelRatio: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
}

export function calculateCanvasSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): CanvasSize {
  const safeWidth = Math.max(0, cssWidth);
  const safeHeight = Math.max(0, cssHeight);
  const pixelRatio =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? Math.min(2, devicePixelRatio)
      : 1;

  return {
    cssWidth: safeWidth,
    cssHeight: safeHeight,
    pixelRatio,
    backingWidth: Math.round(safeWidth * pixelRatio),
    backingHeight: Math.round(safeHeight * pixelRatio),
  };
}
