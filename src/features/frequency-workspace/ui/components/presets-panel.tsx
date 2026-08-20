import type { WorkspaceIntent, WorkspacePresetEntry } from '../../index';
import { Button } from '@/components/ui/button';
import { For, Show, createSignal } from 'solid-js';

interface PresetsPanelProps {
  readonly presets: readonly WorkspacePresetEntry[];
  readonly dirtyPresetId: string | null;
  readonly loadedPresetId: string | null;
  readonly canSave: boolean;
  readonly canLoad: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function PresetsPanel(props: PresetsPanelProps) {
  const [name, setName] = createSignal('');

  const save = () => {
    const presetName = name().trim();
    if (!presetName) return;
    props.dispatch({ type: 'create-preset', name: presetName });
    setName('');
  };

  return (
    <section class="presets-panel" aria-labelledby="presets-heading">
      <div>
        <p class="eyebrow">Therapy Presets</p>
        <h3 id="presets-heading">Сохраните готовую конфигурацию</h3>
        <p class="section-copy">
          Пресет хранит общую настройку и только выбранный Therapy Filter.
          Воспроизведение в него не входит.
        </p>
      </div>

      <div class="preset-create">
        <label class="field-label" for="preset-name">
          Название пресета
          <input
            id="preset-name"
            class="text-input"
            type="text"
            maxlength="80"
            value={name()}
            onInput={event => setName(event.currentTarget.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') save();
            }}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!props.canSave || !name().trim()}
          onClick={save}
        >
          Сохранить Therapy Preset
        </Button>
      </div>

      <Show
        when={props.presets.length > 0}
        fallback={
          <p class="empty-state">Сохранённых Therapy Presets пока нет.</p>
        }
      >
        <div class="preset-list">
          <For each={props.presets}>
            {entry => (
              <Show
                when={entry.kind === 'available' ? entry.preset : null}
                fallback={<UnavailablePresetCard entry={entry} />}
              >
                {preset => (
                  <PresetCard
                    preset={preset()}
                    dirty={props.dirtyPresetId === preset().id}
                    loaded={props.loadedPresetId === preset().id}
                    canSave={props.canSave}
                    canLoad={props.canLoad}
                    dispatch={props.dispatch}
                  />
                )}
              </Show>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

interface PresetCardProps {
  readonly preset: Extract<
    WorkspacePresetEntry,
    { kind: 'available' }
  >['preset'];
  readonly dirty: boolean;
  readonly loaded: boolean;
  readonly canSave: boolean;
  readonly canLoad: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

function PresetCard(props: PresetCardProps) {
  const [name, setName] = createSignal(props.preset.name);

  return (
    <article class="preset-card">
      <div class="preset-card__heading">
        <label class="sr-only" for={`preset-${props.preset.id}-name`}>
          Название пресета
        </label>
        <input
          id={`preset-${props.preset.id}-name`}
          class="preset-card__name"
          value={name()}
          maxlength="80"
          onInput={event => setName(event.currentTarget.value)}
        />
        <Show when={props.dirty}>
          <span class="status-pill status-pill--warning">Есть изменения</span>
        </Show>
        <Show when={props.loaded && !props.dirty}>
          <span class="status-pill">Загружен</span>
        </Show>
      </div>
      <p class="preset-card__meta">
        {props.preset.filterId === 'white-noise'
          ? 'White Noise'
          : 'De-correlating AM'}{' '}
        · {props.preset.tinnitusMatch.frequencyHz} Hz ·{' '}
        {Math.round(props.preset.masterGain * 100)}%
      </p>
      <div class="button-row">
        <Button
          type="button"
          size="sm"
          disabled={!props.canLoad}
          onClick={() =>
            props.dispatch({ type: 'load-preset', id: props.preset.id })
          }
        >
          Загрузить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!props.canSave}
          onClick={() =>
            props.dispatch({ type: 'update-preset', id: props.preset.id })
          }
        >
          Обновить
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!name().trim() || name().trim() === props.preset.name}
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
        <Show when={props.dirty}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              props.dispatch({ type: 'revert-preset', id: props.preset.id })
            }
          >
            Отменить изменения
          </Button>
        </Show>
        <Button
          type="button"
          size="sm"
          variant="destructive"
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
}) {
  if (props.entry.kind === 'available') return null;

  const reason = {
    'unknown-filter': 'Неизвестный Therapy Filter',
    'newer-version': 'Создан более новой версией приложения',
    'invalid-data': 'Повреждённые данные',
  }[props.entry.reason];

  return (
    <article class="preset-card preset-card--unavailable" aria-disabled="true">
      <div class="preset-card__heading">
        <strong>{props.entry.name}</strong>
        <span class="status-pill status-pill--warning">Недоступен</span>
      </div>
      <p class="preset-card__meta">
        {reason}. Исходные данные сохранены без изменений.
      </p>
    </article>
  );
}
