import { frequencyPosition } from './frequency-scale';
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

const PLOT_TOP = 10;
const PLOT_BOTTOM = 26;

/* Palette shared with the workspace CSS tokens: tone is the person's
   frequency, sound is everything the therapy plays or removes. */
const COLORS = {
  well: '#141413',
  grid: 'rgba(238, 238, 234, 0.16)',
  axis: 'rgba(238, 238, 234, 0.55)',
  tone: '#ff7f11',
  sound: '#eeeeea',
  soundFill: 'rgba(238, 238, 234, 0.06)',
  soundHatch: 'rgba(238, 238, 234, 0.16)',
  spectrum: 'rgba(238, 238, 234, 0.85)',
} as const;
const CANVAS_FONT = 'Onest, system-ui, sans-serif';

function axisLabel(frequencyHz: number): string {
  return frequencyHz < 1_000 ? `${frequencyHz}` : `${frequencyHz / 1_000}к`;
}

export function drawFrequencyVisualization(
  context: CanvasRenderingContext2D,
  frame: FrequencyVisualizationFrame,
): void {
  const { width, height } = frame;
  context.clearRect(0, 0, width, height);
  context.fillStyle = COLORS.well;
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
  context.strokeStyle = COLORS.grid;
  context.fillStyle = COLORS.axis;
  context.font = `11px ${CANVAS_FONT}`;
  context.lineWidth = 1;
  // Dotted rules read as a dot-matrix display grid.
  context.setLineDash([1, 3]);

  for (const decibels of [-75, -50, -25]) {
    const y =
      Math.round(decibelPosition(decibels, height, minDecibels, maxDecibels)) +
      0.5;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const ticks =
    width < 480
      ? [125, 500, 2_000, 8_000]
      : [63, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000];
  context.textAlign = 'center';
  for (const frequencyHz of ticks) {
    const x = Math.round(frequencyPosition(frequencyHz, width)) + 0.5;
    context.beginPath();
    context.moveTo(x, PLOT_TOP);
    context.lineTo(x, height - PLOT_BOTTOM);
    context.stroke();
    context.fillText(axisLabel(frequencyHz), x, height - 9);
  }
  context.textAlign = 'right';
  context.fillText('Гц', width - 6, height - 9);
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
    context.fillStyle = COLORS.soundFill;
    context.fillRect(
      fromX,
      PLOT_TOP,
      Math.max(1, toX - fromX),
      height - PLOT_TOP - PLOT_BOTTOM,
    );
    context.strokeStyle = COLORS.sound;
    context.globalAlpha = alpha * 0.55;
    context.setLineDash(band.line === 'dashed' ? [5, 5] : []);
    for (const x of [fromX, toX]) {
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, PLOT_TOP);
      context.lineTo(Math.round(x) + 0.5, height - PLOT_BOTTOM);
      context.stroke();
    }
    context.globalAlpha = alpha;

    if (band.pattern === 'hatched') {
      context.save();
      context.beginPath();
      context.rect(
        fromX,
        PLOT_TOP,
        Math.max(1, toX - fromX),
        height - PLOT_TOP - PLOT_BOTTOM,
      );
      context.clip();
      context.strokeStyle = COLORS.soundHatch;
      context.setLineDash([]);
      const plotHeight = height - PLOT_TOP - PLOT_BOTTOM;
      for (let x = fromX - plotHeight; x < toX; x += 9) {
        context.beginPath();
        context.moveTo(x, height - PLOT_BOTTOM);
        context.lineTo(x + plotHeight, PLOT_TOP);
        context.stroke();
      }
      context.restore();
    }
  }

  for (const curve of description.responseCurves) {
    context.strokeStyle = COLORS.sound;
    context.lineWidth = 1.5;
    context.setLineDash(curve.line === 'dashed' ? [5, 5] : []);
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
  context.strokeStyle = COLORS.spectrum;
  context.lineWidth = 1.5;
  context.lineJoin = 'round';
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
  context.strokeStyle = COLORS.tone;
  context.fillStyle = COLORS.tone;
  context.lineWidth = 2;
  for (const marker of description.markers) {
    const x = Math.round(frequencyPosition(marker.frequencyHz, width));
    context.beginPath();
    context.moveTo(x, PLOT_TOP);
    context.lineTo(x, height - PLOT_BOTTOM);
    context.stroke();
    context.beginPath();
    context.arc(x, PLOT_TOP, 4, 0, Math.PI * 2);
    context.fill();
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
