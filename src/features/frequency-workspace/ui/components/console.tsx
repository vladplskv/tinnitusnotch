/*
 * The console modules under the graph: frequency, therapy sound and, for
 * De-correlating AM, the three preparation steps. While an AM hearing check
 * runs it takes the place of the modules until it is closed.
 */
import type { HearingCorrectionId } from '../../index';
import { getActiveBandStatus } from '../../playback/dsp/active-band';
import {
  CR_MAX_TINNITUS_FREQUENCY_HZ,
  CR_MIN_TINNITUS_FREQUENCY_HZ,
  MIN_CR_NOISE_LEVEL,
  clampCRTinnitusFrequency,
  getCRToneFrequenciesHz,
  isCRTinnitusFrequency,
} from '../../model/cr-neuromodulation';
import {
  FILTER_COPY,
  HEARING_CORRECTION_COPY,
  formatHz,
  formatHzList,
  formatHzShort,
} from '../format';
import { For, Match, Show, Switch } from 'solid-js';
import { AmBand, HearingCheckPanel, type HearingCheck } from './hearing-check';
import {
  FREQUENCY_TICKS,
  Fader,
  FrequencyNudges,
  HEARING_CORRECTIONS,
  haptic,
  ListenKey,
  Rocker,
  createFrequencyControl,
  displayedFrequency,
  faderFromHz,
  hzFromFader,
  octaveText,
  qFromWidth,
  widthFromQ,
  type WorkspaceProps,
} from './controls';
import { SpectrumStage } from './spectrum-stage';

/**
 * The working modules. While a hearing check runs it takes their place
 * (frequency, sound and transport step aside); "Закончить" brings them back.
 */
export function ConsoleModules(
  props: WorkspaceProps & {
    readonly check: HearingCheck;
  },
) {
  return (
    <Show
      when={props.check.index() === null}
      fallback={
        <section
          class="fw-module fw-hearing-run"
          aria-labelledby="fw-hear-title"
        >
          <h2 id="fw-hear-title" class="fw-module__title">
            Проверка слуха
          </h2>
          <HearingCheckPanel
            check={props.check}
            masterGain={props.session.masterGain}
            disabled={!props.snapshot.capabilities.canEdit}
            layout="strip"
          />
        </section>
      }
    >
      <div class="fw-grid">
        <FrequencyModule {...props} />
        <SoundModule {...props} />
        <Show when={props.session.selectedFilterId === 'decorrelating-am'}>
          <AmModule {...props} />
        </Show>
      </div>
    </Show>
  );
}

export function ScreenModule(
  props: WorkspaceProps & {
    readonly check: HearingCheck;
  },
) {
  return (
    <section class="fw-module fw-screen" aria-label="Спектр">
      <div class="fw-stage-row">
        <SpectrumStage {...props} check={props.check} />
      </div>
    </section>
  );
}

export function FrequencyModule(props: WorkspaceProps) {
  const limiter = createFrequencyControl(props.dispatch);
  const caps = () => props.snapshot.capabilities;
  return (
    <section
      class="fw-module fw-freq"
      data-module="freq"
      aria-labelledby="fw-freq-title"
    >
      <h2 id="fw-freq-title" class="fw-module__title">
        Частота
      </h2>
      <FrequencyNudges
        frequencyHz={props.session.tinnitusMatch.frequencyHz}
        disabled={!caps().canEdit}
        onCommit={limiter.commit}
      />
      <Fader
        label="Частота шума в ушах"
        value={faderFromHz(displayedFrequency(props))}
        valueText={formatHzShort(displayedFrequency(props))}
        resolution={1_000}
        detents={10}
        ticks={FREQUENCY_TICKS}
        disabled={!caps().canEdit}
        onInput={value => limiter.preview(hzFromFader(value))}
        onCommit={value => limiter.commit(hzFromFader(value))}
      />
      <div class="fw-freq__keys">
        <ListenKey
          class="fw-console-listen"
          snapshot={props.snapshot}
          session={props.session}
          dispatch={props.dispatch}
        />
        <Rocker
          label="Характер шума"
          value={props.session.tinnitusMatch.type}
          disabled={!caps().canEdit}
          options={[
            { value: 'tone', label: 'Тон', hint: 'писк, звон' },
            { value: 'noise', label: 'Шум', hint: 'шипение, гул' },
          ]}
          onChange={value =>
            props.dispatch({ type: 'set-tinnitus-type', value })
          }
        />
      </div>
    </section>
  );
}

export function SoundModule(props: WorkspaceProps) {
  const caps = () => props.snapshot.capabilities;
  const filterId = () => props.session.selectedFilterId;
  const q = () => props.session.filterSettings['white-noise'].q;
  return (
    <section
      class="fw-module fw-sound"
      data-module="sound"
      aria-labelledby="fw-sound-title"
    >
      <h2 id="fw-sound-title" class="fw-module__title">
        Звук терапии
      </h2>
      <div class="fw-sound-choice">
        <Rocker
          label="Звук терапии"
          value={props.session.selectedFilterId}
          disabled={!caps().canEdit}
          options={props.snapshot.filters.map(filter => ({
            value: filter.id,
            label: FILTER_COPY[filter.id].name,
            hint: FILTER_COPY[filter.id].hint,
          }))}
          onChange={filterId =>
            props.dispatch({ type: 'select-filter', filterId })
          }
        />
      </div>
      <Switch>
        <Match when={filterId() === 'white-noise'}>
          <NotchWidthField
            q={q()}
            disabled={!caps().canEdit}
            onChange={value =>
              props.dispatch({ type: 'set-white-noise-q', value })
            }
          />
        </Match>
        <Match when={filterId() === 'decorrelating-am'}>
          <p class="fw-module-hint">
            АМ работает после подготовки: полоса, проверка слуха и коррекция в
            модуле ниже.
          </p>
          <p class="fw-module-hint">
            В исследовании АМ слушали около часа в день 6 недель, не больше 60
            минут подряд и не громче 60 % от максимума устройства.
          </p>
        </Match>
        <Match when={filterId() === 'cr-neuromodulation'}>
          <CRDetails {...props} />
        </Match>
      </Switch>
    </section>
  );
}

/** Notch width as a fader; the notch edges on the graph do the same. */
function NotchWidthField(props: {
  readonly q: number;
  readonly disabled: boolean;
  readonly onChange: (q: number) => void;
}) {
  return (
    <div class="fw-module-field">
      <p class="fw-module-field__row">
        <span class="fw-module-field__label">Ширина выреза</span>
        <span class="fw-module-field__value">{octaveText(props.q)}</span>
      </p>
      <Fader
        label="Ширина выреза"
        value={widthFromQ(props.q)}
        valueText={octaveText(props.q)}
        detents={8}
        ticks={[
          { at: 0, label: 'узкий' },
          { at: 0.25 },
          { at: 0.5 },
          { at: 0.75 },
          { at: 1, label: 'широкий' },
        ]}
        disabled={props.disabled}
        onInput={value => props.onChange(qFromWidth(value))}
        onCommit={value => props.onChange(qFromWidth(value))}
      />
      <p class="fw-module-hint">
        Ширину можно тянуть и прямо на графике, за белые края выреза.
      </p>
    </div>
  );
}

/* The noise level fader runs linearly in decibels against the tones. */
const CR_NOISE_FLOOR_DB = 20 * Math.log10(MIN_CR_NOISE_LEVEL);
const noiseDb = (level: number) => 20 * Math.log10(level);
const faderFromNoiseLevel = (level: number) =>
  1 - noiseDb(level) / CR_NOISE_FLOOR_DB;
const noiseLevelFromFader = (value: number) =>
  Math.round(10 ** (((1 - value) * CR_NOISE_FLOOR_DB) / 20) * 1_000) / 1_000;
const noiseText = (level: number) =>
  `${Math.round(noiseDb(level)).toString().replace('-', '−')} дБ`;

/**
 * The four CR tones for the current frequency, or why there are none, and
 * the optional notched white noise under them.
 */
function CRDetails(props: WorkspaceProps) {
  const caps = () => props.snapshot.capabilities;
  /* While the fader is dragged the preview frequency is what sounds. */
  const frequencyHz = () => displayedFrequency(props);
  const inRange = () => isCRTinnitusFrequency(frequencyHz());
  /* Outside the range running tones hold at the nearest edge. */
  const soundingHz = () => clampCRTinnitusFrequency(frequencyHz());
  const sounding = () =>
    props.snapshot.playback.status === 'playing' ||
    props.snapshot.playback.status === 'paused';
  const cr = () => props.session.filterSettings['cr-neuromodulation'];
  const setLevel = (value: number) =>
    props.dispatch({
      type: 'set-cr-noise-level',
      value: Math.max(MIN_CR_NOISE_LEVEL, noiseLevelFromFader(value)),
    });
  return (
    <>
      <Show when={!inRange()}>
        <p class="fw-module-hint" role="status">
          CR-тоны работают с частотой от{' '}
          {formatHz(CR_MIN_TINNITUS_FREQUENCY_HZ)} до{' '}
          {formatHz(CR_MAX_TINNITUS_FREQUENCY_HZ)}, сейчас{' '}
          {formatHz(frequencyHz())}. Запуск недоступен
          <Show when={sounding()} fallback=".">
            ; уже идущие тоны звучат как для {formatHz(soundingHz())}.
          </Show>{' '}
          Подберите частоту в модуле «Частота» или выберите другой звук.
        </p>
      </Show>
      <Show when={inRange() || sounding()}>
        <div class="fw-module-field">
          <p class="fw-module-field__row">
            <span class="fw-module-field__label">Тоны</span>
            <span class="fw-module-field__value">
              {formatHzList(getCRToneFrequenciesHz(soundingHz()))}
            </span>
          </p>
        </div>
      </Show>
      <p class="fw-module-hint">
        Тоны звучат в случайном порядке: три такта по четыре тона, затем два
        такта без тонов. Их громкость должна быть равна громкости шума в ушах:
        она задаётся регулятором плеера, как при подборе частоты.
      </p>
      <Rocker
        label="Белый шум под тонами"
        value={cr().notchedNoise ? 'mix' : 'tones'}
        disabled={!caps().canEdit}
        options={[
          { value: 'tones', label: 'Только тоны' },
          { value: 'mix', label: 'Тоны + шум', hint: 'шум с вырезом' },
        ]}
        onChange={value =>
          props.dispatch({
            type: 'set-cr-notched-noise',
            value: value === 'mix',
          })
        }
      />
      <Show when={cr().notchedNoise}>
        <div class="fw-module-field">
          <p class="fw-module-field__row">
            <span class="fw-module-field__label">Громкость шума</span>
            <span class="fw-module-field__value">
              {noiseText(cr().noiseLevel)}
            </span>
          </p>
          <Fader
            label="Громкость шума относительно тонов"
            value={faderFromNoiseLevel(cr().noiseLevel)}
            valueText={`${noiseText(cr().noiseLevel)} относительно тонов`}
            detents={6}
            ticks={[
              { at: 0, label: 'тише' },
              { at: 0.5 },
              { at: 1, label: 'как тоны' },
            ]}
            fill
            disabled={!caps().canEdit}
            onInput={setLevel}
            onCommit={setLevel}
          />
        </div>
        <NotchWidthField
          q={cr().notchQ}
          disabled={!caps().canEdit}
          onChange={value => props.dispatch({ type: 'set-cr-notch-q', value })}
        />
      </Show>
      <p class="fw-module-hint">
        В исследованиях ACRN тоны слушали по 4–6 часов в день несколько месяцев.
        Это экспериментальный метод: в контролируемом испытании он не превзошёл
        плацебо.
      </p>
    </>
  );
}

/**
 * AM preparation as three numbered steps, each with an LED that lights when
 * the step is done: the band, the hearing check, the correction.
 */
export function AmModule(
  props: WorkspaceProps & {
    readonly check: HearingCheck;
  },
) {
  const caps = () => props.snapshot.capabilities;
  const am = () => props.session.filterSettings['decorrelating-am'];
  /* The 17-tone sequence of this profile is playing right now. */
  const sounding = (id: HearingCorrectionId) => {
    const playback = props.snapshot.playback;
    return (
      (playback.status === 'previewing' || playback.status === 'starting') &&
      playback.source.kind === 'hearing-correction-preview' &&
      playback.source.hearingCorrection === id
    );
  };
  const bandDone = () => {
    const band = getActiveBandStatus(props.session);
    return band.confirmed && !band.blocked;
  };
  const hearingDone = () => props.check.marked() === props.check.total();
  return (
    <section class="fw-module fw-am" aria-labelledby="fw-am-title">
      <h2 id="fw-am-title" class="fw-module__title">
        Подготовка АМ
      </h2>
      <div class="fw-am__steps">
        <div class="fw-am__step">
          <p class="fw-am-step-title">
            <span class="fw-led" data-on={bandDone() ? 'true' : undefined} />
            1. Рабочая полоса
          </p>
          <AmBand
            bare
            session={props.session}
            dispatch={props.dispatch}
            disabled={!caps().canEdit}
          />
        </div>
        <div class="fw-am__step fw-hear-entry">
          <p class="fw-am-step-title">
            <span class="fw-led" data-on={hearingDone() ? 'true' : undefined} />
            2. Проверка слуха
          </p>
          <HearingCheckPanel
            check={props.check}
            masterGain={props.session.masterGain}
            disabled={!caps().canEdit}
          />
        </div>
        <div class="fw-am__step">
          <p class="fw-am-step-title">
            <span
              class="fw-led"
              data-on={am().hearingCorrection !== null ? 'true' : undefined}
            />
            3. Коррекция
          </p>
          <p class="fw-module-hint">
            Коррекция делает высокие частоты громче, если вы слышите их хуже.
            Нажмите вариант, чтобы услышать 17 тонов, и выберите тот, где они
            звучат одинаково громко. Повторное нажатие останавливает звук.
          </p>
          <div class="fw-corrections">
            <For each={HEARING_CORRECTIONS}>
              {id => (
                <button
                  type="button"
                  class="fw-hold fw-correction"
                  data-active={
                    am().hearingCorrection === id ? 'true' : undefined
                  }
                  data-playing={sounding(id) ? 'true' : undefined}
                  aria-pressed={
                    am().hearingCorrection === id ? 'true' : 'false'
                  }
                  disabled={!caps().canEdit}
                  onClick={() => {
                    haptic(12);
                    if (sounding(id)) {
                      props.dispatch({ type: 'stop-playback' });
                      return;
                    }
                    props.dispatch({
                      type: 'set-hearing-correction',
                      value: id,
                    });
                    props.dispatch({
                      type: 'preview-hearing-correction',
                      value: id,
                    });
                  }}
                >
                  <span
                    class="fw-led"
                    data-on={
                      sounding(id)
                        ? 'breathe'
                        : am().hearingCorrection === id
                          ? 'true'
                          : undefined
                    }
                  />
                  <span class="fw-correction__text">
                    <span>{HEARING_CORRECTION_COPY[id].name}</span>
                    <small>
                      {sounding(id)
                        ? 'звучит'
                        : HEARING_CORRECTION_COPY[id].gain}
                    </small>
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
}
