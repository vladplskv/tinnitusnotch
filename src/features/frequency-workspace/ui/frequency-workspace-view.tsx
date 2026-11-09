import type {
  FrequencyWorkspace,
  TherapyFilterDescription,
  TherapySession,
  WorkspaceSnapshot,
} from '../index';
import { Button } from '@/components/ui/button';
import { Show, createEffect, createSignal } from 'solid-js';
import { Coach } from './components/coach';
import { ConsoleModules, ScreenModule } from './components/console';
import { createHearingCheck } from './components/hearing-check';
import { PlayerBar } from './components/player-bar';
import { PresetCreateForm, PresetList } from './components/presets-panel';
import {
  ConfirmationPanel,
  ModalDialog,
  RecoveryPanel,
} from './components/workspace-feedback';
import './frequency-workspace.css';

export interface FrequencyWorkspaceViewProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly dispatch: FrequencyWorkspace['dispatch'];
  readonly readSpectrum: FrequencyWorkspace['readSpectrum'];
}

type Section = 'console' | 'coach';

export function FrequencyWorkspaceView(props: FrequencyWorkspaceViewProps) {
  const [section, setSection] = createSignal<Section>('console');
  const [presetsOpen, setPresetsOpen] = createSignal(false);
  let observedLoadedPresetId: string | null = null;

  createEffect(
    () => props.snapshot.loadedPresetId,
    loadedPresetId => {
      if (
        loadedPresetId !== null &&
        loadedPresetId !== observedLoadedPresetId
      ) {
        setSection('console');
        setPresetsOpen(false);
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
          <RecoveryPanel
            persistence={props.snapshot.persistence}
            dispatch={props.dispatch}
          />
        }
      >
        {ready => (
          <ReadyWorkspace
            snapshot={props.snapshot}
            session={ready().session}
            selectedFilter={ready().selectedFilter}
            section={section()}
            setSection={setSection}
            presetsOpen={presetsOpen()}
            setPresetsOpen={setPresetsOpen}
            dispatch={props.dispatch}
            readSpectrum={props.readSpectrum}
          />
        )}
      </Show>
      <Show when={props.snapshot.pendingConfirmation}>
        {confirmation => (
          <ConfirmationPanel
            confirmation={confirmation()}
            dispatch={props.dispatch}
          />
        )}
      </Show>
    </Show>
  );
}

interface ReadyWorkspaceProps extends FrequencyWorkspaceViewProps {
  readonly session: TherapySession;
  readonly selectedFilter: TherapyFilterDescription;
  readonly section: Section;
  readonly setSection: (section: Section) => void;
  readonly presetsOpen: boolean;
  readonly setPresetsOpen: (open: boolean) => void;
}

/**
 * The studio console: the spectrum on top, the working modules under it and
 * the player bar at the bottom. The coach is a separate section. In AM mode
 * the hearing check takes over the module area until it is closed.
 */
function ReadyWorkspace(props: ReadyWorkspaceProps) {
  const check = createHearingCheck(props);
  const capabilities = () => props.snapshot.capabilities;
  const go = (next: Section) => {
    /* A running check lives in the section it was started from. */
    if (next !== props.section) check.finish();
    props.setSection(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <div class="fw-app" data-tab={props.section}>
      <div class="fw-device">
        <header class="fw-app-top">
          <h1 class="fw-app-brand">Tinnitus Notch</h1>
          <nav class="fw-tabs" aria-label="Разделы">
            <SectionButtons section={props.section} onSelect={go} />
          </nav>
          <button
            type="button"
            class="fw-key fw-key--sm"
            onClick={() => props.setPresetsOpen(true)}
          >
            Пресеты
          </button>
        </header>

        <Show when={props.snapshot.persistence.status === 'unavailable'}>
          <div class="fw-warning" role="status">
            <span>
              Браузер не даёт сохранять настройки. Они действуют, пока открыта
              эта вкладка.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => props.dispatch({ type: 'retry-persistence' })}
            >
              Попробовать снова
            </Button>
          </div>
        </Show>

        <Show
          when={props.section === 'console'}
          fallback={
            <div class="fw-coach-panel">
              <Coach {...props} check={check} onDone={() => go('console')} />
            </div>
          }
        >
          <main class="fw-console">
            <ScreenModule {...props} check={check} />
            <ConsoleModules {...props} check={check} />
          </main>
        </Show>

        <p class="fw-disclaimer">
          Это экспериментальный звуковой инструмент, а не лечение. Он не
          измеряет громкость в наушниках и не проверяет слух. Начинайте с низкой
          системной громкости и сразу останавливайте звук, если он неприятен.
        </p>
      </div>

      <Show when={check.index() === null}>
        <PlayerBar
          snapshot={props.snapshot}
          session={props.session}
          dispatch={props.dispatch}
        />
      </Show>
      <nav class="fw-tabbar" aria-label="Разделы">
        <SectionButtons section={props.section} onSelect={go} />
      </nav>

      <Show when={props.presetsOpen}>
        <ModalDialog
          labelledBy="presets-heading"
          class="fw-dialog--sheet"
          onCancel={() => props.setPresetsOpen(false)}
        >
          <div class="fw-sheet__header">
            <h2 id="presets-heading">Пресеты</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => props.setPresetsOpen(false)}
            >
              Закрыть
            </Button>
          </div>
          <p class="fw-help">
            Пресет хранит частоту, громкость и один выбранный звук с его
            настройками. Открытие пресета не включает звук.
          </p>
          <PresetList
            presets={props.snapshot.presets}
            dirtyPresetId={props.snapshot.dirtyPresetId}
            loadedPresetId={props.snapshot.loadedPresetId}
            selectedFilterId={props.session.selectedFilterId}
            canSave={capabilities().canSavePreset}
            canLoad={capabilities().canLoadPreset}
            dispatch={props.dispatch}
          />
          <div class="fw-sheet__create">
            <h3>Сохранить текущую настройку</h3>
            <PresetCreateForm
              id="sheet-preset-name"
              presets={props.snapshot.presets}
              canSave={capabilities().canSavePreset}
              dispatch={props.dispatch}
            />
          </div>
        </ModalDialog>
      </Show>
    </div>
  );
}

function SectionButtons(props: {
  readonly section: Section;
  readonly onSelect: (section: Section) => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-current={props.section === 'console' ? 'page' : undefined}
        onClick={() => props.onSelect('console')}
      >
        Пульт
      </button>
      <button
        type="button"
        aria-current={props.section === 'coach' ? 'page' : undefined}
        onClick={() => props.onSelect('coach')}
      >
        Тренер
      </button>
    </>
  );
}

function WorkspaceBooting() {
  return (
    <main class="fw fw-centered" aria-busy="true">
      <section
        class="fw-notice-panel"
        aria-labelledby="workspace-booting-heading"
      >
        <p class="fw-brand">Tinnitus Notch</p>
        <div class="fw-notice-panel__pulse" aria-hidden="true" />
        <h1 id="workspace-booting-heading">Загружаем настройки</h1>
        <p>Звук не включится сам: вы запустите его, когда будете готовы.</p>
      </section>
    </main>
  );
}
