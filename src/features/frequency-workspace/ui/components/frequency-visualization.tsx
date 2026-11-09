import type {
  FrequencyWorkspace,
  TherapyFilterDescription,
  TherapyPlaybackSnapshot,
  TherapySession,
} from '../../index';
import { aggregateSpectrumByPixel } from '../../visualization/spectrum';
import { calculateCanvasSize } from '../../visualization/canvas-size';
import { frequencyAtPosition } from '../../visualization/frequency-scale';
import { getActiveBandStatus } from '../../playback/dsp/active-band';
import {
  getCRToneFrequenciesHz,
  isCRTinnitusFrequency,
} from '../../model/cr-neuromodulation';
import { FILTER_COPY, formatBandHz, formatHz, formatHzShort } from '../format';
import { createFrequencyInputRateLimiter } from '../../visualization/frequency-input-rate-limiter';
import { buildVisualizationDescription } from '../../visualization/overlays';
import { drawFrequencyVisualization } from '../../visualization/renderer';
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
} from 'solid-js';

interface FrequencyVisualizationProps {
  readonly session: TherapySession;
  readonly previewFrequencyHz: number | null;
  readonly selectedFilter: TherapyFilterDescription;
  readonly playback: TherapyPlaybackSnapshot;
  readonly readSpectrum: FrequencyWorkspace['readSpectrum'];
  readonly onPreviewFrequency: (frequencyHz: number) => void;
  readonly onCommitFrequency: (frequencyHz: number) => void;
}

export function FrequencyVisualization(props: FrequencyVisualizationProps) {
  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const [failed, setFailed] = createSignal(false);
  const [reducedMotion, setReducedMotion] = createSignal(false);
  const displayedFrequency = createMemo(
    () => props.previewFrequencyHz ?? props.session.tinnitusMatch.frequencyHz,
  );
  const effectSummary = createMemo(() => {
    if (props.session.selectedFilterId === 'white-noise') {
      return `вырез Q ${props.session.filterSettings['white-noise'].q.toFixed(1)}`;
    }
    if (props.session.selectedFilterId === 'cr-neuromodulation') {
      if (!isCRTinnitusFrequency(displayedFrequency())) {
        return 'частота вне диапазона CR';
      }
      const cr = props.session.filterSettings['cr-neuromodulation'];
      const tones = `тоны ${getCRToneFrequenciesHz(displayedFrequency()).map(formatHzShort).join(', ')}`;
      return cr.notchedNoise
        ? `${tones} + шум, вырез Q ${cr.notchQ.toFixed(1)}`
        : tones;
    }
    const activeBand = getActiveBandStatus(props.session);
    if (!activeBand.confirmed) return 'рабочая полоса не подтверждена';
    return activeBand.bandHz === null
      ? 'нет подходящей полосы'
      : `полоса ${formatBandHz(activeBand.bandHz)}`;
  });
  let refreshVisualization: (() => void) | null = null;
  let cleanupVisualization = () => {};

  createEffect(
    () => [
      props.session,
      props.previewFrequencyHz,
      props.playback.status,
      props.playback.source,
      reducedMotion(),
    ],
    () => refreshVisualization?.(),
  );

  onSettled(() => {
    const containerElement = container!;
    const canvasElement = canvas!;
    if (!containerElement || !canvasElement) return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const limiter = createFrequencyInputRateLimiter({
      now: () => performance.now(),
      schedule: (callback, delayMs) => {
        const timeout = window.setTimeout(callback, delayMs);
        return () => window.clearTimeout(timeout);
      },
      onPreview: props.onPreviewFrequency,
      onCommit: props.onCommitFrequency,
    });
    let animationFrame: number | null = null;
    let pointer: {
      readonly id: number;
      readonly startX: number;
      readonly startY: number;
      horizontal: boolean;
    } | null = null;
    let previousDescription = buildVisualizationDescription(
      props.session,
      props.playback,
      displayedFrequency(),
    );
    let transitionStartedAt = 0;

    const setMotionPreference = () => setReducedMotion(media.matches);

    const render = (includeSpectrum: boolean) => {
      try {
        const context = canvasElement.getContext('2d');
        if (!context) {
          throw new Error('Canvas 2D context unavailable');
        }

        const rect = containerElement.getBoundingClientRect();
        const size = calculateCanvasSize(
          rect.width,
          rect.height,
          window.devicePixelRatio,
        );
        if (
          canvasElement.width !== size.backingWidth ||
          canvasElement.height !== size.backingHeight
        ) {
          canvasElement.width = size.backingWidth;
          canvasElement.height = size.backingHeight;
        }
        context.setTransform(size.pixelRatio, 0, 0, size.pixelRatio, 0, 0);

        const metadata = props.playback.spectrum;
        let spectrum: Float32Array | null = null;
        if (includeSpectrum && isAudiblePlayback(props.playback)) {
          const bins = new Float32Array(metadata.fftSize / 2);
          const actualMetadata = props.readSpectrum(bins);
          spectrum = aggregateSpectrumByPixel(bins, {
            sampleRate: actualMetadata.sampleRate,
            fftSize: actualMetadata.fftSize,
            width: Math.max(1, Math.round(size.cssWidth)),
            minDecibels: actualMetadata.minDecibels,
          });
        }

        const description = buildVisualizationDescription(
          props.session,
          props.playback,
          displayedFrequency(),
        );
        const oldBand = previousDescription.bands[0];
        const newBand = description.bands[0];
        if (
          transitionStartedAt === 0 &&
          isAudiblePlayback(props.playback) &&
          !reducedMotion() &&
          oldBand &&
          newBand &&
          (oldBand.fromHz !== newBand.fromHz || oldBand.toHz !== newBand.toHz)
        ) {
          transitionStartedAt = performance.now();
        }
        const transitionProgress = transitionStartedAt
          ? Math.min(1, (performance.now() - transitionStartedAt) / 300)
          : 1;

        drawFrequencyVisualization(context, {
          width: size.cssWidth,
          height: size.cssHeight,
          minDecibels: metadata.minDecibels,
          maxDecibels: metadata.maxDecibels,
          spectrum,
          description,
          previousDescription:
            transitionProgress < 1 ? previousDescription : null,
          transitionProgress,
        });
        if (transitionProgress >= 1) {
          previousDescription = description;
          transitionStartedAt = 0;
        }
        setFailed(false);
      } catch {
        stopAnimation();
        setFailed(true);
      }
    };

    const animate = () => {
      animationFrame = null;
      if (
        document.hidden ||
        reducedMotion() ||
        !isAudiblePlayback(props.playback)
      ) {
        return;
      }
      render(true);
      animationFrame = requestAnimationFrame(animate);
    };

    function stopAnimation() {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    const restartAnimation = () => {
      stopAnimation();
      if (
        !document.hidden &&
        !reducedMotion() &&
        isAudiblePlayback(props.playback) &&
        !failed()
      ) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (!document.hidden) render(!reducedMotion());
    });
    resizeObserver.observe(containerElement);

    const handleVisibility = () => {
      if (document.hidden) {
        stopAnimation();
      } else {
        render(true);
        restartAnimation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    media.addEventListener('change', setMotionPreference);
    setMotionPreference();

    refreshVisualization = () => {
      if (document.hidden) {
        stopAnimation();
        return;
      }
      render(true);
      restartAnimation();
    };
    refreshVisualization();

    const selectFrequency = (clientX: number) => {
      const rect = containerElement.getBoundingClientRect();
      return Math.round(frequencyAtPosition(clientX - rect.left, rect.width));
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!props.session || event.button !== 0) return;
      pointer = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        horizontal: false,
      };
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const deltaX = Math.abs(event.clientX - pointer.startX);
      const deltaY = Math.abs(event.clientY - pointer.startY);
      if (!pointer.horizontal && deltaX > 8 && deltaX > deltaY) {
        pointer.horizontal = true;
        canvasElement.setPointerCapture(event.pointerId);
      }
      if (!pointer.horizontal) return;
      event.preventDefault();
      limiter.preview(selectFrequency(event.clientX));
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      limiter.commit(selectFrequency(event.clientX));
      if (canvasElement.hasPointerCapture(event.pointerId)) {
        canvasElement.releasePointerCapture(event.pointerId);
      }
      pointer = null;
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.horizontal) {
        limiter.commit(selectFrequency(event.clientX));
      }
      pointer = null;
    };

    canvasElement.addEventListener('pointerdown', handlePointerDown);
    canvasElement.addEventListener('pointermove', handlePointerMove);
    canvasElement.addEventListener('pointerup', handlePointerUp);
    canvasElement.addEventListener('pointercancel', handlePointerCancel);

    cleanupVisualization = () => {
      refreshVisualization = null;
      limiter.dispose();
      stopAnimation();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      media.removeEventListener('change', setMotionPreference);
      canvasElement.removeEventListener('pointerdown', handlePointerDown);
      canvasElement.removeEventListener('pointermove', handlePointerMove);
      canvasElement.removeEventListener('pointerup', handlePointerUp);
      canvasElement.removeEventListener('pointercancel', handlePointerCancel);
    };
  });

  onCleanup(() => cleanupVisualization());

  return (
    <section
      class="fw-viz"
      aria-labelledby="frequency-visualization-heading"
      data-playback={props.playback.status}
    >
      <div class="fw-viz__readout">
        <div>
          <h2 id="frequency-visualization-heading" class="fw-viz__label">
            Ваша частота
          </h2>
          <p class="fw-viz__number">
            <span class="fw-viz__digits">
              {groupDigits(displayedFrequency())}
            </span>
            <span class="fw-viz__unit">Гц</span>
          </p>
        </div>
        <div class="fw-viz__meta">
          <span class="fw-viz__filter">
            {FILTER_COPY[props.selectedFilter.id].name}
          </span>
          <span class="fw-viz__effect">{effectSummary()}</span>
        </div>
      </div>

      <div
        class="fw-viz__plot"
        ref={element => {
          container = element;
        }}
      >
        <Show when={!failed()}>
          <canvas
            ref={element => {
              canvas = element;
            }}
            aria-hidden="true"
            class="fw-viz__canvas"
          />
        </Show>
        <Show when={failed()}>
          <div class="fw-viz__fallback" role="status">
            График недоступен в этом браузере. Подбор частоты и звук работают
            как обычно.
          </div>
        </Show>
      </div>

      <div class="fw-viz__legend">
        <span class="fw-legend fw-legend--tone">ваша частота</span>
        <span class="fw-legend fw-legend--sound">звук терапии</span>
        <span class="fw-viz__drag-hint">
          Проведите по графику, чтобы выбрать частоту
        </span>
        <Show when={reducedMotion()}>
          <span>
            Анимация спектра выключена: в системе включено уменьшение движения.
          </span>
        </Show>
      </div>
      <p class="sr-only" aria-live="polite">
        Частота {formatHz(props.session.tinnitusMatch.frequencyHz)}.{' '}
        {FILTER_COPY[props.selectedFilter.id].name}. {effectSummary()}.{' '}
        {playbackLabel(props.playback)}.
      </p>
    </section>
  );
}

const digitFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

function groupDigits(frequencyHz: number): string {
  return digitFormatter.format(Math.round(frequencyHz));
}

function isAudiblePlayback(playback: TherapyPlaybackSnapshot): boolean {
  return playback.status === 'playing' || playback.status === 'previewing';
}

function playbackLabel(playback: TherapyPlaybackSnapshot): string {
  switch (playback.status) {
    case 'previewing':
      return 'Звучит пробный звук';
    case 'playing':
      return 'Идёт терапия';
    case 'paused':
      return 'Пауза';
    case 'starting':
      return 'Запуск';
    case 'stopping':
      return 'Остановка';
    case 'error':
      return 'Ошибка воспроизведения';
    default:
      return 'Тишина';
  }
}
