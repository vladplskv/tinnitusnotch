import { createFrequencyWorkspace, type WorkspaceSnapshot } from '../index';
import { Show, createSignal, onCleanup, onSettled } from 'solid-js';
import { FrequencyWorkspaceView } from './frequency-workspace-view';

export default function FrequencyWorkspacePage() {
  const [snapshot, setSnapshot] = createSignal<WorkspaceSnapshot | null>(null);
  let workspace: ReturnType<typeof createFrequencyWorkspace> | null = null;
  let unsubscribe = () => {};

  onSettled(() => {
    if (typeof window === 'undefined') return;
    workspace = createFrequencyWorkspace();
    setSnapshot(workspace.getSnapshot());
    unsubscribe = workspace.subscribe(setSnapshot);
  });

  onCleanup(() => {
    unsubscribe();
    const currentWorkspace = workspace;
    workspace = null;
    void currentWorkspace?.dispose();
  });

  return (
    <Show when={snapshot() !== null} fallback={<ServerBootingShell />}>
      <FrequencyWorkspaceView
        snapshot={snapshot()!}
        dispatch={intent => workspace?.dispatch(intent)}
        readSpectrum={target =>
          workspace?.readSpectrum(target) ?? snapshot()!.playback.spectrum
        }
      />
    </Show>
  );
}

function ServerBootingShell() {
  return (
    <main class="fw fw-centered" aria-busy="true">
      <section class="fw-notice-panel" aria-labelledby="workspace-status">
        <p class="fw-brand">Tinnitus Notch</p>
        <div class="fw-notice-panel__pulse" aria-hidden="true" />
        <h1 id="workspace-status">Загружаем настройки</h1>
        <p>Звук не включится сам: вы запустите его, когда будете готовы.</p>
      </section>
    </main>
  );
}
