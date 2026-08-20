import type {
  Audibility,
  HearingCorrectionId,
  TherapyFilterDescription,
  TherapySession,
  WorkspaceIntent,
} from '../../index';
import { formatFrequency } from '../../visualization/frequency-scale';
import { Button } from '@/components/ui/button';
import { For, Show } from 'solid-js';

interface FilterSelectionProps {
  readonly selectedFilter: TherapyFilterDescription;
  readonly filters: readonly TherapyFilterDescription[];
  readonly canEdit: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function FilterSelection(props: FilterSelectionProps) {
  return (
    <fieldset class="choice-fieldset">
      <legend>Therapy Filter</legend>
      <div class="filter-grid">
        <For each={props.filters}>
          {filter => (
            <label
              class={`filter-card ${props.selectedFilter.id === filter.id ? 'filter-card--selected' : ''}`}
            >
              <input
                type="radio"
                name="therapy-filter"
                value={filter.id}
                checked={props.selectedFilter.id === filter.id}
                disabled={!props.canEdit || !filter.ready}
                onChange={() =>
                  props.dispatch({ type: 'select-filter', filterId: filter.id })
                }
              />
              <span class="filter-card__title">
                {filter.label}
                <Show when={filter.experimental}>
                  <small>Experimental</small>
                </Show>
              </span>
              <span class="filter-card__description">
                {filter.id === 'white-noise'
                  ? 'Широкополосный шум с рассчитанным вырезом вокруг Tinnitus Frequency.'
                  : 'Однопроходная амплитудная модуляция подтверждённого Active Band.'}
              </span>
              <Show when={!filter.ready}>
                <span class="field-error">{filter.unavailableReason}</span>
              </Show>
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}

interface FilterSettingsProps {
  readonly session: TherapySession;
  readonly canEdit: boolean;
  readonly canPreviewHearingCorrection: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function FilterSettings(props: FilterSettingsProps) {
  return (
    <Show
      when={props.session.selectedFilterId === 'white-noise'}
      fallback={<DecorrelatingAMFields {...props} />}
    >
      <div class="field-stack">
        <div class="field-heading">
          <label for="white-noise-q">Ширина рассчитанного выреза</label>
          <strong>
            Q {props.session.filterSettings['white-noise'].q.toFixed(1)}
          </strong>
        </div>
        <input
          id="white-noise-q"
          class="frequency-slider"
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          value={props.session.filterSettings['white-noise'].q}
          disabled={!props.canEdit}
          onChange={event =>
            props.dispatch({
              type: 'set-white-noise-q',
              value: Number(event.currentTarget.value),
            })
          }
        />
        <p class="field-help">
          Область с ослаблением не менее 3 dB показана штриховкой. Это расчёт
          фильтра, а не измерение громкости.
        </p>
      </div>
    </Show>
  );
}

function DecorrelatingAMFields(props: FilterSettingsProps) {
  const frequencies = () =>
    Object.keys(props.session.tinnitusMatch.audibilityByFrequencyHz)
      .map(Number)
      .filter(Number.isFinite)
      .sort((left, right) => left - right);

  return (
    <div class="field-stack">
      <div class="am-explainer">
        <p class="eyebrow">Active Band</p>
        <strong>
          {props.session.filterSettings['decorrelating-am']
            .confirmedProjectionHz === null
            ? 'Ещё не подтверждён'
            : formatFrequency(
                props.session.filterSettings['decorrelating-am']
                  .confirmedProjectionHz!,
              )}
        </strong>
        <p>
          De-correlating AM использует ближайшую поддерживаемую частоту только
          после подтверждения. Точная Tinnitus Frequency остаётся общей.
        </p>
      </div>

      <fieldset class="choice-fieldset">
        <legend>Наблюдения слышимости</legend>
        <p class="field-help">
          Отметьте субъективный результат для каждой частоты. Это не диагностика
          слуха.
        </p>
        <div class="audibility-list">
          <For each={frequencies()}>
            {frequencyHz => (
              <div class="audibility-row">
                <span>{formatFrequency(frequencyHz)}</span>
                <select
                  aria-label={`Слышимость ${formatFrequency(frequencyHz)}`}
                  value={
                    props.session.tinnitusMatch.audibilityByFrequencyHz[
                      String(frequencyHz)
                    ]
                  }
                  disabled={!props.canEdit}
                  onChange={event =>
                    props.dispatch({
                      type: 'set-audibility',
                      frequencyHz,
                      value: event.currentTarget.value as Audibility,
                    })
                  }
                >
                  <option value="unknown">Не проверено</option>
                  <option value="audible">Слышу</option>
                  <option value="inaudible">Не слышу</option>
                </select>
              </div>
            )}
          </For>
        </div>
      </fieldset>

      <fieldset class="choice-fieldset">
        <legend>Hearing Correction</legend>
        <p class="field-help">
          Выберите подтверждённую 17-тоновую последовательность с наиболее
          ровной субъективной громкостью.
        </p>
        <div class="segmented-control segmented-control--four">
          <For each={['a1', 'a2', 'c1', 'c2'] as HearingCorrectionId[]}>
            {value => (
              <div class="hearing-correction-choice">
                <label class="segmented-control__item">
                  <input
                    type="radio"
                    name="hearing-correction"
                    value={value}
                    checked={
                      props.session.filterSettings['decorrelating-am']
                        .hearingCorrection === value
                    }
                    disabled={!props.canEdit}
                    onChange={() =>
                      props.dispatch({ type: 'set-hearing-correction', value })
                    }
                  />
                  <span>{value.toUpperCase()}</span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!props.canPreviewHearingCorrection}
                  aria-label={`Прослушать Hearing Correction ${value.toUpperCase()}`}
                  onClick={() =>
                    props.dispatch({
                      type: 'preview-hearing-correction',
                      value,
                    })
                  }
                >
                  Прослушать
                </Button>
              </div>
            )}
          </For>
        </div>
      </fieldset>
    </div>
  );
}

interface MasterGainFieldProps {
  readonly session: TherapySession;
  readonly canEdit: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function MasterGainField(props: MasterGainFieldProps) {
  return (
    <div class="field-stack">
      <div class="field-heading">
        <label for="master-gain">Общая громкость</label>
        <strong>{Math.round(props.session.masterGain * 100)}%</strong>
      </div>
      <input
        id="master-gain"
        class="frequency-slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(props.session.masterGain * 100)}
        disabled={!props.canEdit}
        onInput={event =>
          props.dispatch({
            type: 'set-master-gain',
            value: Number(event.currentTarget.value) / 100,
          })
        }
      />
      <p class="field-help">
        Процент управляет цифровым master gain. Это не SPL и не гарантия
        безопасного уровня.
      </p>
    </div>
  );
}
