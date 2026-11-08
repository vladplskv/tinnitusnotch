/*
 * The console modules under the graph: frequency, therapy sound and, for
 * De-correlating AM, the three preparation steps. While an AM hearing check
 * runs it takes the place of the modules until it is closed.
 */
import { getActiveBandStatus } from '../../playback/dsp/active-band';
import { FILTER_COPY, formatHzShort } from '../format';
import { For, Show } from 'solid-js';
import { AmBand, HearingCheckPanel, type HearingCheck } from './hearing-check';
import {
  FREQUENCY_TICKS,
  Fader,
  FrequencyNudges,
  HEARING_CORRECTIONS,
  HoldKey,
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
  const isAM = () => props.session.selectedFilterId === 'decorrelating-am';
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
            hint: filter.experimental
              ? 'эксперимент, нужна подготовка'
              : 'работает сразу',
          }))}
          onChange={filterId =>
            props.dispatch({ type: 'select-filter', filterId })
          }
        />
      </div>
      <Show
        when={isAM()}
        fallback={
          <div class="fw-module-field">
            <p class="fw-module-field__row">
              <span class="fw-module-field__label">Ширина выреза</span>
              <span class="fw-module-field__value">{octaveText(q())}</span>
            </p>
            <Fader
              label="Ширина выреза"
              value={widthFromQ(q())}
              valueText={octaveText(q())}
              detents={8}
              ticks={[
                { at: 0, label: 'узкий' },
                { at: 0.25 },
                { at: 0.5 },
                { at: 0.75 },
                { at: 1, label: 'широкий' },
              ]}
              disabled={!caps().canEdit}
              onInput={value =>
                props.dispatch({
                  type: 'set-white-noise-q',
                  value: qFromWidth(value),
                })
              }
              onCommit={value =>
                props.dispatch({
                  type: 'set-white-noise-q',
                  value: qFromWidth(value),
                })
              }
            />
            <p class="fw-module-hint">
              Ширину можно тянуть и прямо на графике, за белые края выреза.
            </p>
          </div>
        }
      >
        <p class="fw-module-hint">
          АМ работает после подготовки: полоса, проверка слуха и коррекция в
          модуле ниже.
        </p>
      </Show>
    </section>
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
            Удерживайте вариант, чтобы услышать. Выберите тот, где тоны звучат
            ровнее.
          </p>
          <div class="fw-corrections">
            <For each={HEARING_CORRECTIONS}>
              {id => (
                <HoldKey
                  class="fw-correction"
                  active={am().hearingCorrection === id}
                  disabled={!caps().canEdit}
                  onPress={() => {
                    props.dispatch({
                      type: 'set-hearing-correction',
                      value: id,
                    });
                    props.dispatch({
                      type: 'preview-hearing-correction',
                      value: id,
                    });
                  }}
                  onRelease={() => props.dispatch({ type: 'stop-playback' })}
                >
                  <span
                    class="fw-led"
                    data-on={am().hearingCorrection === id ? 'true' : undefined}
                  />
                  {id.toUpperCase()}
                </HoldKey>
              )}
            </For>
          </div>
        </div>
      </div>
    </section>
  );
}
