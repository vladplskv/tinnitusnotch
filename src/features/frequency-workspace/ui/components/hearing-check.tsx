/*
 * AM preparation. Hearing check: the 17 control frequencies are played one
 * by one and the user answers "слышу" or "не слышу" (set-audibility). Band
 * status: which band AM will modulate and whether it is confirmed. Both
 * matter only for De-correlating AM.
 *
 * The probe tone is a local Web Audio oscillator, not Therapy Playback:
 * the workspace has no intent for a short control-frequency probe. Starting
 * a probe stops any playback first, so the two never sound together.
 */
import type {
  FrequencyWorkspace,
  TherapySession,
  WorkspaceSnapshot,
} from '../../index';
import { getActiveBandStatus } from '../../playback/dsp/active-band';
import { formatBandHz, formatHz, formatHzShort } from '../format';
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { audibilityEntries, groupedDigits, haptic } from './controls';

/* ---------- Probe tone ---------- */

const BEEP_SECONDS = 0.38;
const GAP_SECONDS = 0.27;
const BEEPS = 3;
const RAMP_SECONDS = 0.02;
/** Same level as the hearing-correction preview, before the master gain. */
const PROBE_GAIN = 0.05;

function createProbeTone() {
  let context: AudioContext | null = null;
  let stopCurrent: (() => void) | null = null;
  let doneTimer = 0;
  const [playing, setPlaying] = createSignal(false);

  const stop = () => {
    window.clearTimeout(doneTimer);
    stopCurrent?.();
    stopCurrent = null;
    setPlaying(false);
  };

  /** Three short beeps at the frequency; call from a user gesture. */
  const play = (frequencyHz: number, masterGain: number) => {
    stop();
    context ??= new AudioContext();
    void context.resume();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.frequency.value = frequencyHz;
    envelope.gain.value = 0;
    const level = PROBE_GAIN * Math.max(0, Math.min(1, masterGain));
    for (let beep = 0; beep < BEEPS; beep += 1) {
      const start = now + 0.03 + beep * (BEEP_SECONDS + GAP_SECONDS);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(level, start + RAMP_SECONDS);
      envelope.gain.setValueAtTime(level, start + BEEP_SECONDS - RAMP_SECONDS);
      envelope.gain.linearRampToValueAtTime(0, start + BEEP_SECONDS);
    }
    const total = 0.03 + BEEPS * (BEEP_SECONDS + GAP_SECONDS);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + total);
    setPlaying(true);
    doneTimer = window.setTimeout(() => setPlaying(false), total * 1_000);
    const audio = context;
    stopCurrent = () => {
      const at = audio.currentTime;
      envelope.gain.cancelScheduledValues(at);
      envelope.gain.setTargetAtTime(0, at, 0.008);
      try {
        oscillator.stop(at + 0.05);
      } catch {
        /* already stopped */
      }
    };
  };

  onCleanup(() => {
    stop();
    void context?.close();
  });
  return { play, stop, playing };
}

/* ---------- Check controller ---------- */

interface CheckSource {
  readonly snapshot: WorkspaceSnapshot;
  readonly session: TherapySession;
  readonly dispatch: FrequencyWorkspace['dispatch'];
}

export type HearingCheck = ReturnType<typeof createHearingCheck>;

/**
 * State of one hearing check run. Several views (a panel, dots on the
 * graph, a coach step) can share one controller.
 */
export function createHearingCheck(source: CheckSource) {
  const probe = createProbeTone();
  const [index, setIndex] = createSignal<number | null>(null);
  const entries = () => audibilityEntries(source.session);
  const marked = () =>
    entries().filter(entry => entry.value !== 'unknown').length;
  const currentHz = () => {
    const at = index();
    return at === null ? null : (entries()[at]?.hz ?? null);
  };

  const sound = (at: number) => {
    const entry = entries()[at];
    if (!entry) return;
    if (source.snapshot.playback.status !== 'stopped')
      source.dispatch({ type: 'stop-playback' });
    probe.play(entry.hz, source.session.masterGain);
  };
  const go = (at: number | null) => {
    setIndex(at);
    if (at === null) probe.stop();
    else sound(at);
  };
  /* The check belongs to AM: leaving AM closes it. */
  createEffect(
    () => source.session.selectedFilterId,
    filterId => {
      if (filterId !== 'decorrelating-am') go(null);
    },
  );

  return {
    entries,
    marked,
    index,
    currentHz,
    playing: probe.playing,
    total: () => entries().length,
    /** Start at a given frequency, or at the first unanswered one. */
    start(at?: number) {
      haptic(10);
      const first = entries().findIndex(entry => entry.value === 'unknown');
      go(at ?? (first === -1 ? 0 : first));
    },
    replay() {
      const at = index();
      if (at !== null) sound(at);
    },
    back() {
      const at = index();
      if (at !== null && at > 0) go(at - 1);
    },
    answer(value: 'audible' | 'inaudible') {
      const at = index();
      const entry = at === null ? undefined : entries()[at];
      if (at === null || !entry) return;
      haptic(value === 'audible' ? 14 : 8);
      source.dispatch({
        type: 'set-audibility',
        frequencyHz: entry.hz,
        value,
      });
      go(at + 1 < entries().length ? at + 1 : null);
    },
    finish() {
      go(null);
    },
  };
}

/* ---------- Panel ---------- */

const shortHz = (hz: number) =>
  hz < 1_000 ? String(hz) : `${(hz / 1_000).toLocaleString('ru-RU')}к`;

const valueText = (value: string) =>
  value === 'audible'
    ? 'слышу'
    : value === 'inaudible'
      ? 'не слышу'
      : 'не проверено';

export function HearingCheckPanel(props: {
  readonly check: HearingCheck;
  readonly masterGain: number;
  readonly disabled?: boolean;
  /** Narrow strip under a graph instead of a full panel. */
  readonly layout?: 'panel' | 'strip';
  /** Hide the 17 cells, for example when the graph already shows dots. */
  readonly hideCells?: boolean;
}) {
  const check = props.check;
  const running = () => check.index() !== null;

  return (
    <div
      class="fw-hear"
      data-layout={props.layout ?? 'panel'}
      data-running={running() ? 'true' : undefined}
    >
      <div class="fw-hear__body">
        <Show
          when={running()}
          fallback={
            <div class="fw-hear__intro">
              <p class="fw-hear__lede">
                <Show
                  when={check.marked() > 0}
                  fallback="Прозвучат 17 коротких тонов от 1 до 16 кГц. Про каждый ответьте, слышите ли вы его."
                >
                  Проверено {check.marked()} из {check.total()}.
                  <Show when={check.marked() < check.total()}>
                    {' '}
                    Можно продолжить с первой непроверенной частоты.
                  </Show>
                </Show>{' '}
                Терапия остановится на время проверки.
              </p>
              <button
                type="button"
                class="fw-key fw-key--ink fw-hear__start"
                disabled={props.disabled}
                onClick={() =>
                  check.start(check.marked() === check.total() ? 0 : undefined)
                }
              >
                {check.marked() === 0
                  ? 'Начать проверку'
                  : check.marked() < check.total()
                    ? 'Продолжить проверку'
                    : 'Пройти заново'}
              </button>
            </div>
          }
        >
          <div
            class="fw-hear__run"
            aria-live="polite"
            tabindex="-1"
            ref={element => queueMicrotask(() => element.focus())}
          >
            <p class="fw-hear__count">
              Тон {check.index()! + 1} из {check.total()}
            </p>
            <p class="fw-hear__hz">
              <span
                class="fw-led"
                data-on={check.playing() ? 'true' : undefined}
              />
              <span>{groupedDigits(check.currentHz() ?? 0)}</span>
              <small>Гц</small>
            </p>
            <div class="fw-hear__answers">
              <button
                type="button"
                class="fw-key fw-hear__answer"
                data-answer="audible"
                onClick={() => check.answer('audible')}
              >
                Слышу
              </button>
              <button
                type="button"
                class="fw-key fw-hear__answer"
                data-answer="inaudible"
                onClick={() => check.answer('inaudible')}
              >
                Не слышу
              </button>
            </div>
            <div class="fw-hear__tools">
              <button
                type="button"
                class="fw-key fw-key--sm"
                onClick={() => check.replay()}
              >
                Ещё раз
              </button>
              <button
                type="button"
                class="fw-key fw-key--sm"
                disabled={check.index() === 0}
                onClick={() => check.back()}
              >
                Назад
              </button>
              <button
                type="button"
                class="fw-hear__stop"
                onClick={() => check.finish()}
              >
                Закончить
              </button>
            </div>
          </div>
        </Show>
        <Show when={props.masterGain < 0.05}>
          <p class="fw-hear__warn">
            Громкость приложения почти на нуле, тоны будет не слышно.
            <Show when={!running()}> Прибавьте её в плеере внизу.</Show>
          </p>
        </Show>

        <Show when={!props.hideCells}>
          <div
            class="fw-hear__cells"
            role="group"
            aria-label="Слышимость частот"
          >
            <For each={check.entries()}>
              {(entry, at) => (
                <button
                  type="button"
                  class="fw-hear__cell"
                  data-value={entry.value}
                  data-current={check.index() === at() ? 'true' : undefined}
                  disabled={props.disabled}
                  aria-label={`${formatHzShort(entry.hz)}: ${valueText(entry.value)}. Проверить`}
                  onClick={() => check.start(at())}
                >
                  <span class="fw-hear__mark" />
                  <span class="fw-hear__label">{shortHz(entry.hz)}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

/* ---------- AM band status ---------- */

/**
 * AM modulates a fixed band chosen by the control frequency nearest to the
 * user's exact frequency. The band needs an explicit confirmation because
 * it is not exactly the user's frequency. The workspace asks for it in a
 * dialog when AM is selected or the frequency changes; this status shows
 * the result and offers the dialog again if it was dismissed.
 */
export function AmBand(props: {
  /** Drop the LED and label when a surrounding step header shows them. */
  readonly bare?: boolean;
  readonly session: TherapySession;
  readonly dispatch: FrequencyWorkspace['dispatch'];
  readonly disabled?: boolean;
}) {
  const state = () => getActiveBandStatus(props.session);
  const ready = () => state().confirmed && !state().blocked;

  return (
    <div
      class="fw-band"
      data-confirmed={ready() ? 'true' : undefined}
      data-blocked={state().blocked ? 'true' : undefined}
    >
      <Show when={!props.bare}>
        <span class="fw-led" data-on={ready() ? 'true' : undefined} />
      </Show>
      <div class="fw-band__text">
        <Show when={!props.bare}>
          <span class="fw-band__label">Рабочая полоса АМ</span>
        </Show>
        <strong>
          {!state().confirmed
            ? 'не подтверждена'
            : state().blocked
              ? 'нет подходящей полосы'
              : formatBandHz(state().bandHz!)}
        </strong>
        <small>
          <Show when={state().confirmed && state().blocked}>
            В полосе {formatBandHz(state().primaryBandHz!)} есть частоты,
            которые вы не слышите, а запасной полосы для них нет. Перепроверьте
            эти частоты, выберите другую частоту или белый шум.
          </Show>
          <Show when={state().confirmed && state().fallback}>
            Основная полоса {formatBandHz(state().primaryBandHz!)} задевает
            частоты, которые вы не слышите, поэтому АМ возьмёт соседнюю.
          </Show>
          <Show
            when={state().confirmed && !state().blocked && !state().fallback}
          >
            Готовая полоса для контрольной частоты{' '}
            {formatHzShort(state().projectionHz)}, ближайшей к вашим{' '}
            {formatHz(props.session.tinnitusMatch.frequencyHz)}.
          </Show>
          <Show when={!state().confirmed}>
            АМ работает только с готовыми полосами шириной в октаву. Для ваших{' '}
            {formatHz(props.session.tinnitusMatch.frequencyHz)} ближайшая
            контрольная частота {formatHzShort(state().projectionHz)}, ей
            соответствует полоса {formatBandHz(state().primaryBandHz!)}
            <Show when={state().confirmedProjectionHz !== null}>
              {' '}
              (раньше была подтверждена{' '}
              {formatHzShort(state().confirmedProjectionHz!)})
            </Show>
            . Подтвердите её, иначе АМ не запустится. Ваша частота не изменится.
          </Show>
        </small>
      </div>
      <Show when={!state().confirmed}>
        <button
          type="button"
          class="fw-key fw-key--sm"
          disabled={props.disabled}
          onClick={() =>
            props.dispatch({
              type: 'commit-frequency',
              frequencyHz: props.session.tinnitusMatch.frequencyHz,
            })
          }
        >
          Подтвердить полосу
        </button>
      </Show>
    </div>
  );
}
