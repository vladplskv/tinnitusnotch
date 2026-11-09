/*
 * The player bar pinned to the bottom of the console: what is playing on
 * the left, stop and play/pause in the middle with a session timer, mute
 * and the app volume on the right.
 */
import { FILTER_COPY, formatHz } from '../format';
import { createSignal, onCleanup } from 'solid-js';
import { getActiveBandStatus } from '../../playback/dsp/active-band';
import { isCRTinnitusFrequency } from '../../model/cr-neuromodulation';
import {
  Glyph,
  haptic,
  playbackText,
  transportAction,
  type WorkspaceProps,
} from './controls';

const DEFAULT_UNMUTED_GAIN = 0.3;

const clock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};

export function PlayerBar(
  props: Omit<WorkspaceProps, 'readSpectrum' | 'selectedFilter'>,
) {
  const caps = () => props.snapshot.capabilities;
  const status = () => props.snapshot.playback.status;
  /* AM with no hearable band would only fail on start: say why instead. */
  const amBlocked = () =>
    props.session.selectedFilterId === 'decorrelating-am' &&
    getActiveBandStatus(props.session).blocked;
  const crBlocked = () =>
    props.session.selectedFilterId === 'cr-neuromodulation' &&
    !isCRTinnitusFrequency(props.session.tinnitusMatch.frequencyHz);
  const action = () => {
    const next = transportAction(props.snapshot);
    return next.state === 'start' && amBlocked()
      ? { ...next, intent: null }
      : next;
  };
  const percent = () => Math.round(props.session.masterGain * 100);
  const frequency = () =>
    props.snapshot.previewFrequencyHz ??
    props.session.tinnitusMatch.frequencyHz;

  /* Therapy time: counts while playing, holds on pause, clears on stop. */
  const [elapsed, setElapsed] = createSignal(0);
  const timer = window.setInterval(() => {
    if (status() === 'playing') setElapsed(value => value + 1);
    else if (status() === 'stopped' || status() === 'error') setElapsed(0);
  }, 1_000);
  onCleanup(() => window.clearInterval(timer));

  let unmutedGain = DEFAULT_UNMUTED_GAIN;
  const setGain = (value: number) =>
    props.dispatch({ type: 'set-master-gain', value });
  const toggleMute = () => {
    haptic(8);
    if (props.session.masterGain > 0) {
      unmutedGain = props.session.masterGain;
      setGain(0);
    } else {
      setGain(unmutedGain || DEFAULT_UNMUTED_GAIN);
    }
  };

  return (
    <section class="fw-player" data-status={status()} aria-label="Плеер">
      <div class="fw-player__now">
        <span class="fw-player__art" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <div class="fw-player__meta" role="status">
          <strong>{FILTER_COPY[props.session.selectedFilterId].name}</strong>
          <small>
            {formatHz(frequency())} ·{' '}
            {amBlocked() && status() === 'stopped'
              ? 'АМ: нет подходящей полосы'
              : crBlocked() && status() === 'stopped'
                ? 'CR: частота вне 500–10 000 Гц'
                : action().intent === null && status() === 'stopped'
                  ? 'запуск после настройки'
                  : status() === 'playing'
                    ? 'идёт терапия'
                    : playbackText(props.session, props.snapshot.playback)}
          </small>
        </div>
      </div>

      <div class="fw-player__transport">
        <button
          type="button"
          class="fw-player__key"
          aria-label="Стоп"
          title="Стоп"
          disabled={!caps().canStop}
          onClick={() => {
            haptic(10);
            props.dispatch({ type: 'stop-playback' });
          }}
        >
          <Glyph name="stop" />
        </button>
        <button
          type="button"
          class="fw-player__play"
          data-state={action().state}
          aria-label={action().label}
          title={
            action().intent === null
              ? 'Сначала закончите настройку'
              : action().label
          }
          disabled={action().intent === null}
          onClick={() => {
            const intent = action().intent;
            if (!intent) return;
            haptic(18);
            props.dispatch(intent);
          }}
        >
          <Glyph
            name={
              action().state === 'pause'
                ? 'pause'
                : action().state === 'retry'
                  ? 'retry'
                  : 'play'
            }
          />
        </button>
        <span class="fw-player__time" aria-label="Время терапии">
          {clock(elapsed())}
        </span>
      </div>

      <div class="fw-player__volume">
        <button
          type="button"
          class="fw-player__key"
          aria-label={
            props.session.masterGain > 0 ? 'Выключить звук' : 'Включить звук'
          }
          aria-pressed={props.session.masterGain === 0 ? 'true' : 'false'}
          disabled={!caps().canEdit}
          onClick={toggleMute}
        >
          <Glyph name={props.session.masterGain > 0 ? 'volume' : 'mute'} />
        </button>
        <input
          class="fw-player__gain"
          type="range"
          min="0"
          max="100"
          value={percent()}
          style={{ '--value': String(props.session.masterGain) }}
          disabled={!caps().canEdit}
          aria-label="Громкость приложения"
          aria-valuetext={`${percent()}%`}
          onInput={event => {
            const value = Number(event.currentTarget.value);
            if (value % 10 === 0) haptic(4);
            setGain(value / 100);
          }}
        />
        <output class="fw-player__percent">{percent()}</output>
      </div>
    </section>
  );
}
