import type {
  FrequencyWorkspace,
  TherapyFilterDescription,
  TherapySession,
  WorkspaceSnapshot,
} from '../index';
import { Button } from '@/components/ui/button';
import { For, Show, createEffect, createSignal } from 'solid-js';
import {
  FilterSelection,
  FilterSettings,
  MasterGainField,
} from './components/filter-fields';
import { FrequencyFields } from './components/frequency-fields';
import { FrequencyVisualization } from './components/frequency-visualization';
import { PlaybackControls } from './components/playback-controls';
import { PresetsPanel } from './components/presets-panel';
import {
  ConfirmationPanel,
  NotificationCenter,
  RecoveryPanel,
} from './components/workspace-feedback';
import './frequency-workspace.css';

export interface FrequencyWorkspaceViewProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly dispatch: FrequencyWorkspace['dispatch'];
  readonly readSpectrum: FrequencyWorkspace['readSpectrum'];
}

const STEPS = [
  'Frequency Matching',
  'Therapy Filter',
  'Настройка фильтра',
  'Все настройки',
] as const;

export function FrequencyWorkspaceView(props: FrequencyWorkspaceViewProps) {
  const [step, setStep] = createSignal(1);
  let observedLoadedPresetId: string | null = null;

  createEffect(
    () => props.snapshot.loadedPresetId,
    loadedPresetId => {
      if (
        loadedPresetId !== null &&
        loadedPresetId !== observedLoadedPresetId
      ) {
        setStep(4);
      }
      observedLoadedPresetId = loadedPresetId;
    },
  );

  return (
    <Show
      when={props.snapshot.phase !== 'booting'}
      fallback={<WorkspaceBooting />}
    >
      <Show
        when={
          props.snapshot.phase === 'ready' &&
          props.snapshot.session &&
          props.snapshot.selectedFilter
            ? {
                session: props.snapshot.session!,
                selectedFilter: props.snapshot.selectedFilter!,
              }
            : null
        }
        fallback={
          <>
            <RecoveryPanel
              persistence={props.snapshot.persistence}
              dispatch={props.dispatch}
            />
            <Show when={props.snapshot.pendingConfirmation}>
              {confirmation => (
                <ConfirmationPanel
                  confirmation={confirmation()}
                  dispatch={props.dispatch}
                />
              )}
            </Show>
          </>
        }
      >
        {ready => (
          <ReadyWorkspace
            snapshot={props.snapshot}
            session={ready().session}
            selectedFilter={ready().selectedFilter}
            step={step()}
            setStep={setStep}
            dispatch={props.dispatch}
            readSpectrum={props.readSpectrum}
          />
        )}
      </Show>
      <NotificationCenter
        notifications={props.snapshot.notifications}
        dispatch={props.dispatch}
      />
    </Show>
  );
}

interface ReadyWorkspaceProps extends FrequencyWorkspaceViewProps {
  readonly session: TherapySession;
  readonly selectedFilter: TherapyFilterDescription;
  readonly step: number;
  readonly setStep: (step: number) => void;
}

function ReadyWorkspace(props: ReadyWorkspaceProps) {
  return (
    <div class="frequency-workspace">
      <header class="workspace-header">
        <div>
          <p class="eyebrow">Tinnitus Notch</p>
          <h1>Настройка Therapy Session</h1>
        </div>
        <div class="workspace-header__status">
          <span class="status-pill">Шаг {props.step} из 4</span>
          <span class="save-status">{persistenceLabel(props.snapshot)}</span>
        </div>
      </header>

      <main class="workspace-shell">
        <div class="frequency-visualization-sticky">
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

        <nav class="guided-navigation" aria-label="Этапы настройки">
          <For each={STEPS}>
            {(label, index) => (
              <button
                type="button"
                class={
                  props.step === index() + 1
                    ? 'guided-navigation__step--active'
                    : undefined
                }
                aria-current={props.step === index() + 1 ? 'step' : undefined}
                onClick={() => props.setStep(index() + 1)}
              >
                <span>{index() + 1}</span>
                {label}
              </button>
            )}
          </For>
        </nav>

        <Show when={props.snapshot.persistence.status === 'unavailable'}>
          <div class="workspace-warning" role="status">
            <span>
              Настройки работают только в этой вкладке, пока локальное
              сохранение недоступно.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => props.dispatch({ type: 'retry-persistence' })}
            >
              Повторить сохранение
            </Button>
          </div>
        </Show>

        <Show when={props.step !== 4}>
          <div class="workspace-presets-start">
            <PresetsPanel
              presets={props.snapshot.presets}
              dirtyPresetId={props.snapshot.dirtyPresetId}
              loadedPresetId={props.snapshot.loadedPresetId}
              canSave={props.snapshot.capabilities.canSavePreset}
              canLoad={props.snapshot.capabilities.canLoadPreset}
              dispatch={props.dispatch}
            />
          </div>
        </Show>

        <section class="guided-card">
          <Show when={props.step === 1}>
            <GuidedHeading
              step="Шаг 1"
              title="Найдите Tinnitus Frequency"
              description="Сравнивайте Matching Stimulus с вашим ощущением. Визуализация сама по себе никогда не запускает звук."
            />
            <FrequencyFields
              session={props.session}
              previewFrequencyHz={props.snapshot.previewFrequencyHz}
              canPreview={
                props.snapshot.capabilities.canPreviewMatchingStimulus
              }
              canEdit={props.snapshot.capabilities.canEdit}
              dispatch={props.dispatch}
            />
          </Show>

          <Show when={props.step === 2}>
            <GuidedHeading
              step="Шаг 2"
              title="Выберите Therapy Filter"
              description="Tinnitus Frequency, тип тиннитуса и master gain останутся общими. Настройки каждого фильтра сохраняются отдельно."
            />
            <FilterSelection
              selectedFilter={props.selectedFilter}
              filters={props.snapshot.filters}
              canEdit={props.snapshot.capabilities.canEdit}
              dispatch={props.dispatch}
            />
          </Show>

          <Show when={props.step === 3}>
            <GuidedHeading
              step="Шаг 3"
              title={`Настройте ${props.selectedFilter.label}`}
              description="Tinnitus Frequency и master gain меняются во время воспроизведения. White Noise применяет частоту сразу, AM меняет Active Band после подтверждения с плавным переходом. Hearing Correction требует нового запуска."
            />
            <FilterSettings
              session={props.session}
              canEdit={props.snapshot.capabilities.canEdit}
              canPreviewHearingCorrection={
                props.snapshot.capabilities.canPreviewHearingCorrection
              }
              dispatch={props.dispatch}
            />
            <MasterGainField
              session={props.session}
              canEdit={props.snapshot.capabilities.canEdit}
              dispatch={props.dispatch}
            />
          </Show>

          <Show when={props.step === 4}>
            <GuidedHeading
              step="Шаг 4 · полная форма"
              title="Проверьте все настройки"
              description="Здесь можно изменить готовую Therapy Session, сохранить Therapy Preset и управлять воспроизведением."
            />
            <div class="complete-form">
              <section
                class="form-section"
                aria-labelledby="shared-settings-heading"
              >
                <h3 id="shared-settings-heading">Общие настройки</h3>
                <FrequencyFields
                  session={props.session}
                  previewFrequencyHz={props.snapshot.previewFrequencyHz}
                  canPreview={
                    props.snapshot.capabilities.canPreviewMatchingStimulus
                  }
                  canEdit={props.snapshot.capabilities.canEdit}
                  dispatch={props.dispatch}
                />
                <MasterGainField
                  session={props.session}
                  canEdit={props.snapshot.capabilities.canEdit}
                  dispatch={props.dispatch}
                />
              </section>

              <section
                class="form-section"
                aria-labelledby="filter-settings-heading"
              >
                <h3 id="filter-settings-heading">Therapy Filter</h3>
                <FilterSelection
                  selectedFilter={props.selectedFilter}
                  filters={props.snapshot.filters}
                  canEdit={props.snapshot.capabilities.canEdit}
                  dispatch={props.dispatch}
                />
                <FilterSettings
                  session={props.session}
                  canEdit={props.snapshot.capabilities.canEdit}
                  canPreviewHearingCorrection={
                    props.snapshot.capabilities.canPreviewHearingCorrection
                  }
                  dispatch={props.dispatch}
                />
              </section>

              <PresetsPanel
                presets={props.snapshot.presets}
                dirtyPresetId={props.snapshot.dirtyPresetId}
                loadedPresetId={props.snapshot.loadedPresetId}
                canSave={props.snapshot.capabilities.canSavePreset}
                canLoad={props.snapshot.capabilities.canLoadPreset}
                dispatch={props.dispatch}
              />

              <PlaybackControls
                playback={props.snapshot.playback}
                capabilities={props.snapshot.capabilities}
                dispatch={props.dispatch}
              />
            </div>
          </Show>

          <div class="guided-card__footer">
            <Button
              type="button"
              variant="ghost"
              disabled={props.step === 1}
              onClick={() => props.setStep(props.step - 1)}
            >
              Назад
            </Button>
            <Button
              type="button"
              disabled={props.step === 4}
              onClick={() => props.setStep(props.step + 1)}
            >
              Далее
            </Button>
          </div>
        </section>

        <p class="workspace-disclaimer">
          Приложение не измеряет SPL, не диагностирует слух и не подтверждает
          лечебный эффект. Начинайте с низкой системной громкости.
        </p>
      </main>

      <Show when={props.snapshot.pendingConfirmation}>
        {confirmation => (
          <ConfirmationPanel
            confirmation={confirmation()}
            dispatch={props.dispatch}
          />
        )}
      </Show>
    </div>
  );
}

function GuidedHeading(props: {
  readonly step: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <header class="guided-heading">
      <p class="eyebrow">{props.step}</p>
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </header>
  );
}

function WorkspaceBooting() {
  return (
    <main class="workspace-shell workspace-shell--centered" aria-busy="true">
      <section
        class="booting-panel"
        aria-labelledby="workspace-booting-heading"
      >
        <div class="booting-panel__visual" aria-hidden="true" />
        <p class="eyebrow">Tinnitus Notch</p>
        <h1 id="workspace-booting-heading">Загружаем Frequency Workspace</h1>
        <p>Проверяем локальные настройки. Звук не запускается автоматически.</p>
      </section>
    </main>
  );
}

function persistenceLabel(snapshot: WorkspaceSnapshot): string {
  switch (snapshot.persistence.status) {
    case 'saving':
      return 'Сохраняем…';
    case 'saved':
      return 'Сохранено локально';
    case 'unavailable':
      return 'Локальное сохранение недоступно';
    case 'conflict':
      return 'Конфликт между вкладками';
    case 'recovery':
      return 'Нужно восстановление';
    default:
      return snapshot.persistence.dirty
        ? 'Есть несохранённые изменения'
        : 'Готово';
  }
}
