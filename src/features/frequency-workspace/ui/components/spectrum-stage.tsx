/*
 * The spectrum as an instrument: the Frequency Visualization with live
 * handles on top. Drag the orange line to set the frequency, drag the white
 * notch edges to set the width, and during an AM hearing check the 17
 * control frequencies sit on the graph as dots.
 */
import { FrequencyVisualization } from './frequency-visualization';
import {
  frequencyAtPosition,
  frequencyPosition,
} from '../../visualization/frequency-scale';
import { formatHzShort } from '../format';
import { For, Show, createSignal, onSettled } from 'solid-js';
import type { HearingCheck } from './hearing-check';
import {
  haptic,
  octaveText,
  qFromOctaves,
  type WorkspaceProps,
} from './controls';

/* Matches the canvas renderer's plot insets. */
const PLOT_TOP = 10;
const PLOT_BOTTOM = 26;

type StageProps = WorkspaceProps & {
  /** Hearing check whose frequencies show as dots while it runs (AM). */
  readonly check?: HearingCheck;
};

/**
 * The frequency graph with direct handles: drag the orange line to set the
 * frequency, drag the white notch edges to set the width, tap a dot to
 * check how well you hear that frequency.
 */
export function SpectrumStage(props: StageProps) {
  let wrapper: HTMLDivElement | undefined;
  const [plot, setPlot] = createSignal({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const caps = () => props.snapshot.capabilities;
  const isAM = () => props.session.selectedFilterId === 'decorrelating-am';
  const q = () => props.session.filterSettings['white-noise'].q;
  const frequency = () =>
    props.snapshot.previewFrequencyHz ??
    props.session.tinnitusMatch.frequencyHz;
  /* The control frequencies appear only while a hearing check runs. */
  const showDots = () =>
    props.check !== undefined && isAM() && props.check.index() !== null;

  onSettled(() => {
    const element = wrapper?.querySelector<HTMLElement>('.fw-viz__plot');
    if (!element || !wrapper) return;
    const measure = () => {
      const outer = wrapper!.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      setPlot({
        left: inner.left - outer.left,
        top: inner.top - outer.top,
        width: inner.width,
        height: inner.height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(wrapper);
    return () => observer.disconnect();
  });

  const x = (hz: number) => frequencyPosition(hz, plot().width);
  const notchEdges = () => {
    const term = Math.sqrt(1 / (q() * q()) + 4);
    return {
      low: frequency() * ((term - 1 / q()) / 2),
      high: frequency() * ((term + 1 / q()) / 2),
    };
  };

  let edgeDrag: { pointerId: number } | null = null;
  const dragEdge = (event: PointerEvent) => {
    if (!edgeDrag) return;
    const rect = (
      event.currentTarget as HTMLElement
    ).parentElement!.getBoundingClientRect();
    const hz = frequencyAtPosition(event.clientX - rect.left, rect.width);
    const octaves = Math.max(0.05, 2 * Math.abs(Math.log2(hz / frequency())));
    props.dispatch({ type: 'set-white-noise-q', value: qFromOctaves(octaves) });
  };

  return (
    <div
      class="fw-stage"
      ref={element => {
        wrapper = element;
      }}
    >
      <FrequencyVisualization
        session={props.session}
        previewFrequencyHz={props.snapshot.previewFrequencyHz}
        selectedFilter={props.selectedFilter}
        playback={props.snapshot.playback}
        readSpectrum={props.readSpectrum}
        onPreviewFrequency={frequencyHz =>
          props.dispatch({ type: 'preview-frequency', frequencyHz })
        }
        onCommitFrequency={frequencyHz =>
          props.dispatch({ type: 'commit-frequency', frequencyHz })
        }
      />
      <div
        class="fw-overlay"
        style={{
          left: `${plot().left}px`,
          top: `${plot().top}px`,
          width: `${plot().width}px`,
          height: `${plot().height}px`,
        }}
      >
        <Show when={!isAM()}>
          <For each={['low', 'high'] as const}>
            {side => (
              <button
                type="button"
                class="fw-edge"
                aria-label={`Край выреза, ширина ${octaveText(q())}`}
                style={{
                  left: `${x(notchEdges()[side])}px`,
                  top: `${PLOT_TOP}px`,
                  height: `${plot().height - PLOT_TOP - PLOT_BOTTOM}px`,
                }}
                onPointerDown={event => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  edgeDrag = { pointerId: event.pointerId };
                  haptic(8);
                }}
                onPointerMove={dragEdge}
                onPointerUp={() => {
                  edgeDrag = null;
                  haptic(5);
                }}
                onPointerCancel={() => (edgeDrag = null)}
                onLostPointerCapture={() => (edgeDrag = null)}
                onKeyDown={event => {
                  const factor =
                    event.key === 'ArrowRight' || event.key === 'ArrowUp'
                      ? 1.1
                      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                        ? 1 / 1.1
                        : null;
                  if (factor === null) return;
                  event.preventDefault();
                  const wider = side === 'high' ? factor : 1 / factor;
                  props.dispatch({
                    type: 'set-white-noise-q',
                    value: Math.min(
                      5,
                      Math.max(0.1, Math.round((q() / wider) * 100) / 100),
                    ),
                  });
                }}
              >
                <span class="fw-edge__grip" />
              </button>
            )}
          </For>
          <Show when={!showDots()}>
            <span
              class="fw-notch-label"
              style={{ left: `${x(frequency())}px` }}
            >
              вырез {octaveText(q())}
            </span>
          </Show>
        </Show>
        <Show when={showDots() && props.check}>
          {check => (
            <div
              class="fw-dots"
              role="group"
              aria-label="Слышимость частот: нажмите точку, чтобы проверить"
            >
              <For each={check().entries()}>
                {(entry, at) => (
                  <button
                    type="button"
                    class="fw-dot"
                    data-value={entry.value}
                    data-current={check().index() === at() ? 'true' : undefined}
                    style={{ left: `${x(entry.hz)}px` }}
                    disabled={!caps().canEdit}
                    title={formatHzShort(entry.hz)}
                    aria-label={`${formatHzShort(entry.hz)}: ${entry.value === 'audible' ? 'слышу' : entry.value === 'inaudible' ? 'не слышу' : 'не проверено'}. Проверить`}
                    onClick={() => check().start(at())}
                  />
                )}
              </For>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
