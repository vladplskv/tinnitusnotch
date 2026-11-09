import type {
  TherapyFilterId,
  WorkspaceIntent,
  WorkspacePresetEntry,
} from '../../index';
import { isTherapyPresetNameTaken } from '../../model/preset';
import { FILTER_COPY, formatHzShort } from '../format';

type AvailablePreset = Extract<
  WorkspacePresetEntry,
  { kind: 'available' }
>['preset'];

const availablePresets = (entries: readonly WorkspacePresetEntry[]) =>
  entries.flatMap(entry => (entry.kind === 'available' ? [entry.preset] : []));

const NAME_TAKEN_TEXT = 'Пресет с таким названием уже есть.';
import { Button } from '@/components/ui/button';
import { For, Show, createSignal } from 'solid-js';

interface PresetCreateFormProps {
  readonly id: string;
  readonly presets: readonly WorkspacePresetEntry[];
  readonly canSave: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function PresetCreateForm(props: PresetCreateFormProps) {
  const [name, setName] = createSignal('');
  const taken = () =>
    isTherapyPresetNameTaken(name(), availablePresets(props.presets));

  const save = () => {
    const presetName = name().trim();
    if (!presetName || !props.canSave || taken()) return;
    props.dispatch({ type: 'create-preset', name: presetName });
    setName('');
  };

  return (
    <form
      class="fw-preset-create"
      onSubmit={event => {
        event.preventDefault();
        save();
      }}
    >
      <label class="fw-label" for={props.id}>
        Название пресета
      </label>
      <div class="fw-preset-create__row">
        <input
          id={props.id}
          class="fw-input"
          type="text"
          maxlength="60"
          placeholder="Например, «Вечер, правое ухо»"
          value={name()}
          onInput={event => setName(event.currentTarget.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!props.canSave || !name().trim() || taken()}
        >
          Сохранить пресет
        </Button>
      </div>
      <Show when={taken()}>
        <p class="fw-help" role="status">
          {NAME_TAKEN_TEXT}
        </p>
      </Show>
      <Show when={!props.canSave}>
        <p class="fw-help">
          Сохранить можно, когда выбранный звук готов к запуску и локальное
          хранилище доступно.
        </p>
      </Show>
    </form>
  );
}

interface PresetListProps {
  readonly presets: readonly WorkspacePresetEntry[];
  readonly dirtyPresetId: string | null;
  readonly loadedPresetId: string | null;
  /** Save Changes keeps a preset's Therapy Filter; another one needs a new preset. */
  readonly selectedFilterId: TherapyFilterId;
  readonly canSave: boolean;
  readonly canLoad: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function PresetList(props: PresetListProps) {
  return (
    <Show
      when={props.presets.length > 0}
      fallback={
        <p class="fw-empty">
          Пресетов пока нет. Настройте звук и сохраните его здесь, чтобы в
          следующий раз начать в одно нажатие.
        </p>
      }
    >
      <ul class="fw-preset-list">
        <For each={props.presets}>
          {entry => (
            <li>
              <Show
                when={entry.kind === 'available' ? entry.preset : null}
                fallback={
                  <UnavailablePresetCard
                    entry={entry}
                    dispatch={props.dispatch}
                  />
                }
              >
                {preset => (
                  <PresetCard
                    preset={preset()}
                    presets={availablePresets(props.presets)}
                    dirty={props.dirtyPresetId === preset().id}
                    loaded={props.loadedPresetId === preset().id}
                    canSave={
                      props.canSave &&
                      preset().filterId === props.selectedFilterId
                    }
                    otherFilter={preset().filterId !== props.selectedFilterId}
                    canLoad={props.canLoad}
                    dispatch={props.dispatch}
                  />
                )}
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

interface PresetCardProps {
  readonly preset: AvailablePreset;
  /** Every available preset, to keep a rename off a taken name. */
  readonly presets: readonly AvailablePreset[];
  readonly dirty: boolean;
  readonly loaded: boolean;
  readonly canSave: boolean;
  /** The current sound differs from the preset's. */
  readonly otherFilter: boolean;
  readonly canLoad: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

function PresetCard(props: PresetCardProps) {
  const [name, setName] = createSignal(props.preset.name);
  const taken = () =>
    isTherapyPresetNameTaken(name(), props.presets, props.preset.id);
  const renamed = () =>
    name().trim() !== '' && name().trim() !== props.preset.name && !taken();

  return (
    <article class="fw-preset" data-loaded={props.loaded ? 'true' : undefined}>
      <div class="fw-preset__heading">
        <label class="sr-only" for={`preset-${props.preset.id}-name`}>
          Название пресета
        </label>
        <input
          id={`preset-${props.preset.id}-name`}
          class="fw-preset__name"
          value={name()}
          maxlength="60"
          onInput={event => setName(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && renamed()) {
              props.dispatch({
                type: 'rename-preset',
                id: props.preset.id,
                name: name().trim(),
              });
            }
          }}
        />
        <Show when={props.dirty}>
          <span class="fw-badge fw-badge--todo">изменён</span>
        </Show>
        <Show when={props.loaded && !props.dirty}>
          <span class="fw-badge fw-badge--done">открыт</span>
        </Show>
      </div>
      <Show when={taken()}>
        <p class="fw-preset__note" role="status">
          {NAME_TAKEN_TEXT}
        </p>
      </Show>
      <p class="fw-preset__meta">
        <span>{FILTER_COPY[props.preset.filterId].name}</span>
        <span>{formatHzShort(props.preset.tinnitusMatch.frequencyHz)}</span>
        <span>громкость {Math.round(props.preset.masterGain * 100)}%</span>
      </p>
      <div class="fw-button-row">
        <Show
          when={!props.loaded}
          fallback={
            <Show when={props.dirty}>
              <Button
                type="button"
                size="sm"
                disabled={!props.canSave}
                onClick={() =>
                  props.dispatch({ type: 'update-preset', id: props.preset.id })
                }
              >
                Сохранить изменения
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  props.dispatch({ type: 'revert-preset', id: props.preset.id })
                }
              >
                Вернуть как было
              </Button>
              <Show when={props.otherFilter}>
                <p class="fw-preset__note">
                  Звук терапии сменился: сохраните настройку как новый пресет.
                </p>
              </Show>
            </Show>
          }
        >
          <Button
            type="button"
            size="sm"
            disabled={!props.canLoad}
            onClick={() =>
              props.dispatch({ type: 'load-preset', id: props.preset.id })
            }
          >
            Открыть
          </Button>
        </Show>
        <Show when={renamed()}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              props.dispatch({
                type: 'rename-preset',
                id: props.preset.id,
                name: name().trim(),
              })
            }
          >
            Переименовать
          </Button>
        </Show>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="fw-danger-text"
          onClick={() =>
            props.dispatch({ type: 'delete-preset', id: props.preset.id })
          }
        >
          Удалить
        </Button>
      </div>
    </article>
  );
}

function UnavailablePresetCard(props: {
  readonly entry: WorkspacePresetEntry;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}) {
  if (props.entry.kind === 'available') return null;

  const reason = {
    'unknown-filter': 'Этот звук не поддерживается текущей версией',
    'newer-version': 'Создан более новой версией приложения',
    'invalid-data': 'Данные пресета повреждены',
  }[props.entry.reason];

  return (
    <article class="fw-preset fw-preset--unavailable" aria-disabled="true">
      <div class="fw-preset__heading">
        <strong class="fw-preset__title">{props.entry.name}</strong>
        <span class="fw-badge fw-badge--todo">недоступен</span>
      </div>
      <p class="fw-preset__meta">
        <span>{reason}. Исходные данные сохранены.</span>
      </p>
      <div class="fw-button-row">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="fw-danger-text"
          onClick={() => {
            if (props.entry.kind === 'available') return;
            props.dispatch({ type: 'delete-preset', id: props.entry.id });
          }}
        >
          Удалить
        </Button>
      </div>
    </article>
  );
}
