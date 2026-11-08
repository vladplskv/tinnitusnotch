/*
 * Tactile controls of the workspace console: faders, step keys, rocker
 * selectors, momentary keys and the listen key, plus the small helpers they
 * share. Every control works with a mouse, a finger and a keyboard.
 */
import type {
  FrequencyWorkspace,
  TherapyFilterDescription,
  TherapyPlaybackSnapshot,
  TherapySession,
  WorkspaceIntent,
  WorkspaceSnapshot,
} from '../../index';
import { createFrequencyInputRateLimiter } from '../../visualization/frequency-input-rate-limiter';
import {
  FILTER_COPY,
  clampHz,
  formatHzShort,
  hzFromSliderPosition,
  sliderPositionFromHz,
} from '../format';
import { For, Show, createSignal, onCleanup } from 'solid-js';

/** What every console module reads from a ready workspace. */
export interface WorkspaceProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly session: TherapySession;
  readonly selectedFilter: TherapyFilterDescription;
  readonly dispatch: FrequencyWorkspace['dispatch'];
  readonly readSpectrum: FrequencyWorkspace['readSpectrum'];
}

/* ---------- Haptics ---------- */

/** A short buzz on phones that support it; silently nothing elsewhere. */
export function haptic(durationMs = 6) {
  try {
    navigator.vibrate?.(durationMs);
  } catch {
    /* unsupported */
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/* ---------- Frequency helpers ---------- */

export function createFrequencyControl(
  dispatch: (intent: WorkspaceIntent) => void,
) {
  const limiter = createFrequencyInputRateLimiter({
    now: () => performance.now(),
    schedule: (callback, delayMs) => {
      const timeout = window.setTimeout(callback, delayMs);
      return () => window.clearTimeout(timeout);
    },
    onPreview: frequencyHz =>
      dispatch({ type: 'preview-frequency', frequencyHz }),
    onCommit: frequencyHz =>
      dispatch({ type: 'commit-frequency', frequencyHz }),
  });
  onCleanup(limiter.dispose);
  return limiter;
}

export const displayedFrequency = (props: WorkspaceProps) =>
  props.snapshot.previewFrequencyHz ?? props.session.tinnitusMatch.frequencyHz;

/** Doto digits read best with a narrow group gap. */
export const groupedDigits = (frequencyHz: number) =>
  new Intl.NumberFormat('ru-RU').format(Math.round(frequencyHz));

/* White-noise notch: Q <-> width in octaves. */
const MIN_Q = 0.1;
const MAX_Q = 5;

function notchOctaves(q: number): number {
  const term = Math.sqrt(1 / (q * q) + 4);
  return Math.log2((term + 1 / q) / (term - 1 / q));
}

export function qFromOctaves(octaves: number): number {
  const ratio = 2 ** octaves;
  const q = Math.sqrt(ratio) / (ratio - 1);
  return Math.round(Math.min(MAX_Q, Math.max(MIN_Q, q)) * 100) / 100;
}

/** 0 = narrowest notch, 1 = widest, on a log scale. */
export const widthFromQ = (q: number) =>
  Math.log(q / MAX_Q) / Math.log(MIN_Q / MAX_Q);
export const qFromWidth = (width: number) =>
  Math.round(MAX_Q * (MIN_Q / MAX_Q) ** clamp01(width) * 100) / 100;

export const octaveText = (q: number) =>
  `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(notchOctaves(q))} окт.`;

/* ---------- Playback helpers ---------- */

export function transportAction(snapshot: WorkspaceSnapshot): {
  readonly label: string;
  readonly intent: WorkspaceIntent | null;
  readonly state: 'start' | 'pause' | 'continue' | 'retry';
} {
  const caps = snapshot.capabilities;
  if (caps.canPause)
    return {
      label: 'Пауза',
      intent: { type: 'pause-therapy' },
      state: 'pause',
    };
  if (caps.canContinue)
    return {
      label: 'Продолжить',
      intent: { type: 'continue-therapy' },
      state: 'continue',
    };
  if (snapshot.playback.status === 'error')
    return {
      label: 'Повторить',
      intent: { type: 'retry-playback' },
      state: 'retry',
    };
  return {
    label: 'Начать терапию',
    intent: caps.canStart ? { type: 'start-therapy' } : null,
    state: 'start',
  };
}

export function playbackText(
  session: TherapySession,
  playback: TherapyPlaybackSnapshot,
): string {
  switch (playback.status) {
    case 'starting':
      return 'Запускаем звук…';
    case 'stopping':
      return 'Останавливаем…';
    case 'previewing':
      if (playback.source.kind === 'hearing-correction-preview')
        return `Звучит вариант ${playback.source.hearingCorrection.toUpperCase()}`;
      return `Звучит ${session.tinnitusMatch.type === 'tone' ? 'тон' : 'шум'} ${formatHzShort(session.tinnitusMatch.frequencyHz)}`;
    case 'playing':
      return `Терапия: ${FILTER_COPY[session.selectedFilterId].name}`;
    case 'paused':
      return 'Пауза';
    case 'error':
      return 'Звук не запустился';
    default:
      return 'Тишина';
  }
}

const stimulusPlaying = (playback: TherapyPlaybackSnapshot) =>
  playback.source.kind === 'matching-stimulus' &&
  (playback.status === 'previewing' || playback.status === 'starting');

export const audibilityEntries = (session: TherapySession) =>
  Object.entries(session.tinnitusMatch.audibilityByFrequencyHz)
    .map(([hz, value]) => ({ hz: Number(hz), value }))
    .filter(entry => Number.isFinite(entry.hz))
    .sort((left, right) => left.hz - right.hz);

export const HEARING_CORRECTIONS = ['a1', 'a2', 'c1', 'c2'] as const;

/* ---------- Fader: a linear slide with a printed scale ---------- */

interface FaderProps {
  readonly label: string;
  /** 0..1 along the travel. */
  readonly value: number;
  readonly valueText: string;
  /** Resolution of the travel; arrow keys move one unit. */
  readonly resolution?: number;
  /** Haptic detents across the full travel, for example 10 octaves. */
  readonly detents?: number;
  readonly ticks?: readonly { readonly at: number; readonly label?: string }[];
  /** Light the groove up to the cap, for amounts such as volume. */
  readonly fill?: boolean;
  readonly disabled?: boolean;
  readonly onInput: (value: number) => void;
  readonly onCommit: (value: number) => void;
}

/**
 * A native range input dressed as a mixing-desk fader: grab the cap or tap
 * the groove, arrow keys step one unit. Works the same with a mouse, a
 * finger and a keyboard, and the browser keeps page scrolling on phones.
 */
export function Fader(props: FaderProps) {
  const resolution = () => props.resolution ?? 100;
  let lastDetent = -1;
  const read = (input: HTMLInputElement) => Number(input.value) / resolution();

  return (
    <div
      class="fw-fader"
      data-fill={props.fill ? 'true' : undefined}
      data-disabled={props.disabled ? 'true' : undefined}
      style={{ '--value': String(clamp01(props.value)) }}
    >
      <div class="fw-fader__scale" aria-hidden="true">
        <For each={props.ticks ?? []}>
          {tick => (
            <>
              <span
                class="fw-fader__tick"
                data-major={tick.label ? 'true' : undefined}
                style={{ '--at': String(tick.at) }}
              />
              <Show when={tick.label}>
                <span
                  class="fw-fader__label"
                  style={{ '--at': String(tick.at) }}
                >
                  {tick.label}
                </span>
              </Show>
            </>
          )}
        </For>
      </div>
      <input
        class="fw-fader__input"
        type="range"
        min="0"
        max={resolution()}
        step="1"
        value={Math.round(clamp01(props.value) * resolution())}
        disabled={props.disabled}
        aria-label={props.label}
        aria-valuetext={props.valueText}
        onInput={event => {
          const value = read(event.currentTarget);
          if (props.detents) {
            const detent = Math.floor(value * props.detents);
            if (detent !== lastDetent) {
              haptic(detent === 0 || detent === props.detents ? 14 : 5);
              lastDetent = detent;
            }
          }
          props.onInput(value);
        }}
        onChange={event => props.onCommit(read(event.currentTarget))}
      />
    </div>
  );
}

/* ---------- Frequency step keys ---------- */

const NUDGES = [
  { label: '«', title: 'Октавой ниже', ratio: 0.5 },
  { label: '‹', title: 'Полутоном ниже', ratio: 2 ** (-1 / 12) },
  { label: '›', title: 'Полутоном выше', ratio: 2 ** (1 / 12) },
  { label: '»', title: 'Октавой выше', ratio: 2 },
];

/** Precise steps for fingers: semitone and octave keys. */
export function FrequencyNudges(props: {
  readonly frequencyHz: number;
  readonly disabled?: boolean;
  readonly onCommit: (frequencyHz: number) => void;
}) {
  return (
    <div class="fw-nudges" role="group" aria-label="Шаг частоты">
      <For each={NUDGES}>
        {nudge => (
          <button
            type="button"
            class="fw-key fw-key--square"
            title={nudge.title}
            aria-label={nudge.title}
            disabled={props.disabled}
            onClick={() => {
              haptic(8);
              props.onCommit(clampHz(props.frequencyHz * nudge.ratio));
            }}
          >
            {nudge.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Frequency fader position <-> Hz, on the app's log slider scale. */
export const faderFromHz = (frequencyHz: number) =>
  sliderPositionFromHz(frequencyHz) / 1_000;
export const hzFromFader = (value: number) =>
  hzFromSliderPosition(value * 1_000);

/* ---------- Rocker: a two- or more-way physical selector ---------- */

interface RockerProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    readonly hint?: string;
  }[];
  readonly disabled?: boolean;
  readonly onChange: (value: T) => void;
}

export function Rocker<T extends string>(props: RockerProps<T>) {
  return (
    <div
      class="fw-rocker"
      role="radiogroup"
      aria-label={props.label}
      onKeyDown={event => {
        /* Radio keys: arrows move the choice and the focus. */
        const step =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? -1
              : 0;
        if (step === 0 || props.disabled) return;
        event.preventDefault();
        const count = props.options.length;
        const at = props.options.findIndex(o => o.value === props.value);
        const next = props.options[(at + step + count) % count]!;
        haptic(10);
        props.onChange(next.value);
        const sides =
          event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
        sides[(at + step + count) % count]?.focus();
      }}
    >
      <For each={props.options}>
        {option => (
          <button
            type="button"
            role="radio"
            class="fw-rocker__side"
            aria-checked={props.value === option.value ? 'true' : 'false'}
            tabindex={props.value === option.value ? 0 : -1}
            disabled={props.disabled}
            onClick={() => {
              if (props.value === option.value) return;
              haptic(10);
              props.onChange(option.value);
            }}
          >
            <span class="fw-rocker__label">{option.label}</span>
            <Show when={option.hint}>
              <span class="fw-rocker__hint">{option.hint}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}

/* ---------- Momentary key: sounds only while held ---------- */

interface HoldKeyProps {
  readonly class?: string;
  readonly disabled?: boolean;
  readonly active: boolean;
  readonly onPress: () => void;
  readonly onRelease: () => void;
  readonly children: unknown;
}

export function HoldKey(props: HoldKeyProps) {
  let held = false;
  const press = () => {
    if (held || props.disabled) return;
    held = true;
    haptic(12);
    props.onPress();
  };
  const release = () => {
    if (!held) return;
    held = false;
    props.onRelease();
  };
  onCleanup(release);
  return (
    <button
      type="button"
      class={`fw-hold ${props.class ?? ''}`}
      data-active={props.active ? 'true' : undefined}
      disabled={props.disabled}
      aria-pressed={props.active ? 'true' : 'false'}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onBlur={release}
      onKeyDown={event => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          press();
        }
      }}
      onKeyUp={event => {
        if (event.key === ' ' || event.key === 'Enter') release();
      }}
      onContextMenu={event => event.preventDefault()}
    >
      {props.children as never}
    </button>
  );
}

/* ---------- Listen key: hold to hear, slide to retune ---------- */

/** Sideways travel for one octave while the listen key is held. */
const SCRUB_PX_PER_OCTAVE = 140;
/** Movement below this is a wobbly finger, not a retune. */
const SCRUB_DEAD_ZONE_PX = 6;

interface ListenKeyProps {
  readonly class?: string;
  readonly snapshot: WorkspaceSnapshot;
  readonly session: TherapySession;
  readonly dispatch: FrequencyWorkspace['dispatch'];
  readonly label?: string;
}

/**
 * Momentary key for the matching tone. While it is held, sliding the
 * finger or the cursor left or right retunes the tone live (one octave per
 * 140 px, a light tick on every semitone); releasing stops the sound and
 * keeps the new frequency. With the keyboard: hold Space, step with arrows.
 */
export function ListenKey(props: ListenKeyProps) {
  const limiter = createFrequencyControl(props.dispatch);
  const [held, setHeld] = createSignal(false);
  const [direction, setDirection] = createSignal<-1 | 0 | 1>(0);
  let drag: {
    readonly x: number;
    readonly hz: number;
    moved: boolean;
    semitone: number;
  } | null = null;
  let tunedHz: number | null = null;

  const canEdit = () => props.snapshot.capabilities.canEdit;
  const semitoneOf = (hz: number) => Math.round(12 * Math.log2(hz));

  const press = () => {
    if (held() || !props.snapshot.capabilities.canPreviewMatchingStimulus)
      return false;
    setHeld(true);
    tunedHz = null;
    haptic(12);
    props.dispatch({ type: 'preview-matching-stimulus' });
    return true;
  };
  const tune = (hz: number) => {
    const next = clampHz(hz);
    if (drag && semitoneOf(next) !== drag.semitone) {
      drag.semitone = semitoneOf(next);
      haptic(drag.semitone % 12 === 0 ? 12 : 4);
    }
    tunedHz = next;
    limiter.preview(next);
  };
  const release = () => {
    if (!held()) return;
    setHeld(false);
    setDirection(0);
    drag = null;
    props.dispatch({ type: 'stop-playback' });
    if (tunedHz !== null) limiter.commit(tunedHz);
    tunedHz = null;
  };

  return (
    <button
      type="button"
      class={`fw-hold fw-listen ${props.class ?? ''}`}
      data-active={
        held() || stimulusPlaying(props.snapshot.playback) ? 'true' : undefined
      }
      data-direction={held() ? String(direction()) : undefined}
      disabled={
        !held() && !props.snapshot.capabilities.canPreviewMatchingStimulus
      }
      aria-pressed={held() ? 'true' : 'false'}
      aria-keyshortcuts="Space ArrowLeft ArrowRight"
      aria-description="Держите, чтобы слушать. Не отпуская, ведите влево или вправо, чтобы менять частоту."
      onPointerDown={event => {
        if (event.button !== 0 || !press()) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const hz = props.session.tinnitusMatch.frequencyHz;
        drag = { x: event.clientX, hz, moved: false, semitone: semitoneOf(hz) };
      }}
      onPointerMove={event => {
        if (!drag || !canEdit()) return;
        const dx = event.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) < SCRUB_DEAD_ZONE_PX) return;
        drag.moved = true;
        setDirection(dx < 0 ? -1 : dx > 0 ? 1 : 0);
        tune(drag.hz * 2 ** (dx / SCRUB_PX_PER_OCTAVE));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={event => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          if (!event.repeat) press();
          return;
        }
        if (!held() || !canEdit()) return;
        const step =
          event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
              ? -1
              : 0;
        if (step === 0) return;
        event.preventDefault();
        setDirection(step);
        haptic(4);
        tune(
          (tunedHz ?? props.session.tinnitusMatch.frequencyHz) *
            2 ** (step / 12),
        );
      }}
      onKeyUp={event => {
        if (event.key === ' ' || event.key === 'Enter') release();
      }}
      onBlur={release}
      onContextMenu={event => event.preventDefault()}
    >
      <span class="fw-listen__arrow" data-side="low" aria-hidden="true">
        ‹
      </span>
      <span class="fw-led" />
      <span class="fw-listen__text">
        <span>{props.label ?? 'Слушать'}</span>
        <small>
          {held()
            ? formatHzShort(
                props.snapshot.previewFrequencyHz ??
                  props.session.tinnitusMatch.frequencyHz,
              )
            : 'держите и ведите в сторону'}
        </small>
      </span>
      <span class="fw-listen__arrow" data-side="high" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/* ---------- Glyphs ---------- */

export function Glyph(props: {
  readonly name:
    | 'play'
    | 'pause'
    | 'stop'
    | 'ear'
    | 'book'
    | 'retry'
    | 'volume'
    | 'mute';
}) {
  return (
    <svg class="fw-glyph" viewBox="0 0 16 16" aria-hidden="true">
      {props.name === 'play' && (
        <path d="M4.5 2.75v10.5L13 8z" fill="currentColor" />
      )}
      {props.name === 'pause' && (
        <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
      )}
      {props.name === 'stop' && (
        <rect
          x="3.5"
          y="3.5"
          width="9"
          height="9"
          rx="1.5"
          fill="currentColor"
        />
      )}
      {props.name === 'retry' && (
        <path
          d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      )}
      {props.name === 'ear' && (
        <path
          d="M5 6a3.5 3.5 0 1 1 6 2.4c-.9.9-1.5 1.4-1.5 2.6A2 2 0 0 1 6 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      )}
      {(props.name === 'volume' || props.name === 'mute') && (
        <path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z" fill="currentColor" />
      )}
      {props.name === 'volume' && (
        <path
          d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.25 3.5a6.25 6.25 0 0 1 0 9"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      )}
      {props.name === 'mute' && (
        <path
          d="M10.75 6l3.5 4M14.25 6l-3.5 4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      )}
      {props.name === 'book' && (
        <path
          d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4zM13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      )}
    </svg>
  );
}

/** Octave ticks on the 20 Hz to 22 kHz log fader. */
export const FREQUENCY_TICKS = [
  { at: 0, label: '20' },
  ...[125, 500, 2_000, 8_000].map(hz => ({
    at: Math.log(hz / 20) / Math.log(22_000 / 20),
    label: hz < 1_000 ? String(hz) : `${hz / 1_000}к`,
  })),
  { at: 1, label: '22к' },
  ...[40, 80, 250, 1_000, 4_000, 16_000].map(hz => ({
    at: Math.log(hz / 20) / Math.log(22_000 / 20),
  })),
];
