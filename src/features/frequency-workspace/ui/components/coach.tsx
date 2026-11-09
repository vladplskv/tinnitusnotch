/*
 * The coach ("Тренер"): one question at a time, from the kind of tinnitus
 * to the therapy sound and, for AM, the hearing check. It writes to the
 * same session as the console.
 */
import { isCRTinnitusFrequency } from '../../model/cr-neuromodulation';
import { FILTER_COPY, clampHz, formatHz, formatHzShort } from '../format';
import { For, Show, createSignal } from 'solid-js';
import { FrequencyVisualization } from './frequency-visualization';
import { HearingCheckPanel, type HearingCheck } from './hearing-check';
import {
  FREQUENCY_TICKS,
  Fader,
  FrequencyNudges,
  ListenKey,
  createFrequencyControl,
  displayedFrequency,
  faderFromHz,
  haptic,
  hzFromFader,
  type WorkspaceProps,
} from './controls';

export function Coach(
  props: WorkspaceProps & {
    readonly onDone: () => void;
    /** The console's hearing check, so answers show up there too. */
    readonly check: HearingCheck;
  },
) {
  const [step, setStep] = createSignal(0);
  const limiter = createFrequencyControl(props.dispatch);
  const check = () => props.check;
  /* Questions in order; the hearing check (4) is asked only for AM. */
  const order = () =>
    props.session.selectedFilterId === 'decorrelating-am'
      ? [0, 1, 2, 3, 4, 5]
      : [0, 1, 2, 3, 5];
  const position = () => Math.max(0, order().indexOf(step()));
  const total = () => order().length;
  const next = () =>
    setStep(order()[Math.min(total() - 1, position() + 1)] ?? 5);
  const hz = () => props.session.tinnitusMatch.frequencyHz;

  return (
    <main class="fw-coach">
      <div
        class="fw-coach__progress"
        aria-label={`Вопрос ${position() + 1} из ${total()}`}
      >
        <For each={Array.from({ length: total() }, (_, index) => index)}>
          {index => (
            <span
              data-state={
                index < position()
                  ? 'done'
                  : index === position()
                    ? 'current'
                    : undefined
              }
            />
          )}
        </For>
      </div>

      <Show when={step() === 0}>
        <h2 class="fw-coach-question">На что похож ваш шум в ушах?</h2>
        <p class="fw-coach__lede">
          От ответа зависит пробный звук, с которым вы будете сравнивать.
        </p>
        <div class="fw-coach-answers">
          <button
            type="button"
            class="fw-coach-answer"
            onClick={() => {
              haptic(12);
              props.dispatch({ type: 'set-tinnitus-type', value: 'tone' });
              next();
            }}
          >
            <strong>Писк или звон</strong>
            <small>чистая высокая нота</small>
          </button>
          <button
            type="button"
            class="fw-coach-answer"
            onClick={() => {
              haptic(12);
              props.dispatch({ type: 'set-tinnitus-type', value: 'noise' });
              next();
            }}
          >
            <strong>Шипение или гул</strong>
            <small>как помехи в радио</small>
          </button>
        </div>
      </Show>

      <Show when={step() === 1}>
        <h2 class="fw-coach-question">Найдите высоту</h2>
        <p class="fw-coach__lede">
          Убавьте системную громкость. Зажмите «Слушать» и, не отпуская, ведите
          палец в сторону, пока звук не станет похож на ваш. Кнопки ‹ и ›
          сдвигают на полутон.
        </p>
        <div class="fw-coach-screen">
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
        </div>
        <Tuner {...props} />
        <Listen {...props} />
        <button
          type="button"
          class="fw-key fw-key--ink fw-coach-next"
          onClick={next}
        >
          Похоже, дальше
        </button>
      </Show>

      <Show when={step() === 2}>
        <h2 class="fw-coach-question">Проверьте октаву</h2>
        <p class="fw-coach__lede">
          Тон легко спутать с тем же тоном вдвое выше или ниже. Сравните и
          оставьте самый похожий.
        </p>
        <div class="fw-coach-answers fw-coach-answers--row">
          <button
            type="button"
            class="fw-coach-answer"
            onClick={() => {
              haptic(10);
              limiter.commit(clampHz(hz() / 2));
            }}
          >
            <strong>Октавой ниже</strong>
            <small>{formatHzShort(hz() / 2)}</small>
          </button>
          <button
            type="button"
            class="fw-coach-answer"
            onClick={() => {
              haptic(10);
              limiter.commit(clampHz(hz() * 2));
            }}
          >
            <strong>Октавой выше</strong>
            <small>{formatHzShort(hz() * 2)}</small>
          </button>
        </div>
        <Listen {...props} />
        <button
          type="button"
          class="fw-key fw-key--ink fw-coach-next"
          onClick={next}
        >
          Оставить {formatHzShort(hz())}
        </button>
      </Show>

      <Show when={step() === 4}>
        <h2 class="fw-coach-question">Какие частоты вы слышите?</h2>
        <p class="fw-coach__lede">
          АМ-терапии нужно знать, какие из 17 контрольных частот вы слышите.
          Прозвучат короткие тоны от 1 до 16 кГц, про каждый ответьте «Слышу»
          или «Не слышу».
        </p>
        <HearingCheckPanel
          check={check()}
          masterGain={props.session.masterGain}
          disabled={!props.snapshot.capabilities.canEdit}
        />
        <button
          type="button"
          class="fw-key fw-key--ink fw-coach-next"
          onClick={() => {
            check().finish();
            next();
          }}
        >
          {check().marked() === check().total() ? 'Дальше' : 'Позже'}
        </button>
      </Show>

      <Show when={step() === 3}>
        <h2 class="fw-coach-question">Чем заглушать шум?</h2>
        <div class="fw-coach-answers">
          <For each={props.snapshot.filters}>
            {filter => (
              <button
                type="button"
                class="fw-coach-answer"
                aria-pressed={
                  props.session.selectedFilterId === filter.id
                    ? 'true'
                    : 'false'
                }
                onClick={() => {
                  haptic(12);
                  props.dispatch({
                    type: 'select-filter',
                    filterId: filter.id,
                  });
                  setStep(filter.id === 'decorrelating-am' ? 4 : 5);
                }}
              >
                <strong>{FILTER_COPY[filter.id].name}</strong>
                <small>{FILTER_COPY[filter.id].description}</small>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={step() === 5}>
        <h2 class="fw-coach-question">Готово</h2>
        <p class="fw-coach__lede">
          Ваша частота {formatHzShort(hz())}, звук «
          {FILTER_COPY[props.session.selectedFilterId].name}».
          <Show
            when={
              props.session.selectedFilterId === 'cr-neuromodulation' &&
              !isCRTinnitusFrequency(hz())
            }
          >
            {' '}
            CR-тоны работают с частотой от 500 до 10 000 Гц, а ваша{' '}
            {formatHz(hz())}: запуск недоступен. Вернитесь к частоте или
            выберите другой звук.
          </Show>
          <Show when={props.session.selectedFilterId === 'decorrelating-am'}>
            {' '}
            <Show
              when={check().marked() === check().total()}
              fallback="На пульте осталось проверить слух на всех частотах и выбрать коррекцию."
            >
              На пульте осталось выбрать коррекцию.
            </Show>
          </Show>{' '}
          Всё остальное настраивается на пульте, тренер можно пройти заново в
          любой момент.
        </p>
        <button
          type="button"
          class="fw-key fw-key--ink fw-coach-next"
          onClick={() => props.onDone()}
        >
          Открыть пульт
        </button>
      </Show>

      <Show when={step() > 0}>
        <button
          type="button"
          class="fw-coach__back"
          onClick={() => {
            check().finish();
            setStep(order()[Math.max(0, position() - 1)] ?? 0);
          }}
        >
          Назад
        </button>
      </Show>
    </main>
  );
}

function Listen(props: WorkspaceProps) {
  return (
    <ListenKey
      class="fw-coach-listen"
      snapshot={props.snapshot}
      session={props.session}
      dispatch={props.dispatch}
    />
  );
}

/* ---------- Tuner: frequency fader plus step keys ---------- */

function Tuner(props: WorkspaceProps) {
  const limiter = createFrequencyControl(props.dispatch);
  return (
    <div class="fw-coach-tuner">
      <Fader
        label="Частота шума в ушах"
        value={faderFromHz(displayedFrequency(props))}
        valueText={formatHzShort(displayedFrequency(props))}
        resolution={1_000}
        detents={10}
        ticks={FREQUENCY_TICKS}
        disabled={!props.snapshot.capabilities.canEdit}
        onInput={value => limiter.preview(hzFromFader(value))}
        onCommit={value => limiter.commit(hzFromFader(value))}
      />
      <FrequencyNudges
        frequencyHz={props.session.tinnitusMatch.frequencyHz}
        disabled={!props.snapshot.capabilities.canEdit}
        onCommit={limiter.commit}
      />
    </div>
  );
}
