import { frequencyPosition, formatFrequency } from './frequency-scale';
import type { VisualizationDescription } from './overlays';

export interface FrequencyVisualizationFrame {
  readonly width: number;
  readonly height: number;
  readonly minDecibels: number;
  readonly maxDecibels: number;
  readonly spectrum: Float32Array | null;
  readonly description: VisualizationDescription;
  readonly previousDescription?: VisualizationDescription | null;
  readonly transitionProgress?: number;
}

const PLOT_TOP = 24;
const PLOT_BOTTOM = 34;

export function drawFrequencyVisualization(
  context: CanvasRenderingContext2D,
  frame: FrequencyVisualizationFrame,
): void {
  const { width, height } = frame;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#111827';
  context.fillRect(0, 0, width, height);

  drawGrid(context, width, height, frame.minDecibels, frame.maxDecibels);

  if (frame.previousDescription) {
    const progress = Math.min(1, Math.max(0, frame.transitionProgress ?? 1));
    drawDescription(
      context,
      frame.previousDescription,
      width,
      height,
      1 - progress,
    );
    drawDescription(context, frame.description, width, height, progress);
  } else {
    drawDescription(context, frame.description, width, height, 1);
  }

  if (frame.spectrum !== null) {
    drawSpectrum(
      context,
      frame.spectrum,
      width,
      height,
      frame.minDecibels,
      frame.maxDecibels,
    );
  }

  drawMarkers(context, frame.description, width, height);
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  minDecibels: number,
  maxDecibels: number,
) {
  context.save();
  context.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  context.fillStyle = '#94a3b8';
  context.font = '11px system-ui, sans-serif';
  context.lineWidth = 1;

  for (const decibels of [-100, -75, -50, -25, 0]) {
    const y = decibelPosition(decibels, height, minDecibels, maxDecibels);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    if (decibels === -100 || decibels === -50 || decibels === 0) {
      context.textAlign = 'right';
      context.fillText(`${decibels} dB`, width - 5, Math.max(11, y - 4));
    }
  }

  const ticks =
    width < 480
      ? [20, 200, 2_000, 22_000]
      : [20, 100, 500, 2_000, 8_000, 22_000];
  for (const frequencyHz of ticks) {
    const x = frequencyPosition(frequencyHz, width);
    context.beginPath();
    context.moveTo(x, PLOT_TOP);
    context.lineTo(x, height - PLOT_BOTTOM);
    context.stroke();
    context.textAlign = x === 0 ? 'left' : x >= width ? 'right' : 'center';
    context.fillText(formatFrequency(frequencyHz), x, height - 10);
  }
  context.restore();
}

function drawDescription(
  context: CanvasRenderingContext2D,
  description: VisualizationDescription,
  width: number,
  height: number,
  alpha: number,
) {
  context.save();
  context.globalAlpha = alpha;

  for (const band of description.bands) {
    const fromX = frequencyPosition(band.fromHz, width);
    const toX = frequencyPosition(band.toHz, width);
    context.fillStyle =
      band.pattern === 'hatched'
        ? 'rgba(251, 191, 36, 0.12)'
        : 'rgba(129, 140, 248, 0.18)';
    context.fillRect(
      fromX,
      PLOT_TOP,
      Math.max(1, toX - fromX),
      height - PLOT_TOP - PLOT_BOTTOM,
    );
    context.strokeStyle = band.pattern === 'hatched' ? '#fbbf24' : '#818cf8';
    context.setLineDash(band.line === 'dashed' ? [7, 6] : []);
    context.strokeRect(
      fromX,
      PLOT_TOP,
      Math.max(1, toX - fromX),
      height - PLOT_TOP - PLOT_BOTTOM,
    );
    context.fillStyle = band.pattern === 'hatched' ? '#fcd34d' : '#a5b4fc';
    context.font = '600 11px system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText(
      band.label,
      Math.max(6, Math.min(width - 6, fromX + 6)),
      PLOT_TOP + 15,
    );

    if (band.pattern === 'hatched') {
      context.strokeStyle = 'rgba(251, 191, 36, 0.32)';
      context.setLineDash([]);
      for (let x = fromX - height; x < toX; x += 12) {
        context.beginPath();
        context.moveTo(
          Math.max(fromX, x),
          Math.min(height - PLOT_BOTTOM, PLOT_TOP + fromX - x),
        );
        context.lineTo(
          Math.min(toX, x + height),
          Math.max(PLOT_TOP, height - PLOT_BOTTOM - (x + height - toX)),
        );
        context.stroke();
      }
    }
  }

  for (const curve of description.responseCurves) {
    context.strokeStyle = '#fbbf24';
    context.lineWidth = 2;
    context.setLineDash(curve.line === 'dashed' ? [7, 6] : []);
    context.beginPath();
    curve.points.forEach((point, index) => {
      const x = frequencyPosition(point.frequencyHz, width);
      const y = decibelPosition(point.decibels, height, -100, 0);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }
  context.restore();
}

function drawSpectrum(
  context: CanvasRenderingContext2D,
  spectrum: Float32Array,
  width: number,
  height: number,
  minDecibels: number,
  maxDecibels: number,
) {
  context.save();
  const gradient = context.createLinearGradient(0, PLOT_TOP, 0, height);
  gradient.addColorStop(0, 'rgba(165, 180, 252, 0.8)');
  gradient.addColorStop(1, 'rgba(49, 46, 129, 0.04)');
  context.fillStyle = gradient;
  context.strokeStyle = '#c7d2fe';
  context.lineWidth = 2;
  context.beginPath();
  let started = false;
  for (let x = 0; x < spectrum.length; x += 1) {
    if (spectrum[x] <= minDecibels) continue;
    const y = decibelPosition(spectrum[x], height, minDecibels, maxDecibels);
    if (!started) {
      context.moveTo(x, y);
      started = true;
    } else {
      context.lineTo(x, y);
    }
  }
  if (started) {
    context.stroke();
  }
  context.restore();
}

function drawMarkers(
  context: CanvasRenderingContext2D,
  description: VisualizationDescription,
  width: number,
  height: number,
) {
  context.save();
  context.strokeStyle = '#f8fafc';
  context.fillStyle = '#f8fafc';
  context.lineWidth = 2;
  context.font = '600 12px system-ui, sans-serif';
  for (const marker of description.markers) {
    const x = frequencyPosition(marker.frequencyHz, width);
    context.beginPath();
    context.moveTo(x, PLOT_TOP);
    context.lineTo(x, height - PLOT_BOTTOM);
    context.stroke();
    context.textAlign = x < 70 ? 'left' : x > width - 70 ? 'right' : 'center';
    context.fillText(formatFrequency(marker.frequencyHz), x, 16);
  }
  context.restore();
}

function decibelPosition(
  decibels: number,
  height: number,
  minDecibels: number,
  maxDecibels: number,
): number {
  const plotHeight = Math.max(1, height - PLOT_TOP - PLOT_BOTTOM);
  const ratio =
    (Math.min(maxDecibels, Math.max(minDecibels, decibels)) - minDecibels) /
    Math.max(1, maxDecibels - minDecibels);
  return PLOT_TOP + (1 - ratio) * plotHeight;
}
