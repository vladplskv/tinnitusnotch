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
    <main class="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header class="space-y-3">
        <p class="text-primary text-sm font-medium">Tinnitus Notch</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
          Frequency Workspace
        </h1>
      </header>
      <section
        aria-busy="true"
        aria-labelledby="workspace-status"
        class="bg-card rounded-xl border p-6 shadow-sm"
      >
        <div class="bg-muted mb-5 h-56 animate-pulse rounded-lg motion-reduce:animate-none" />
        <h2 id="workspace-status" class="text-lg font-medium">
          Загружаем настройки
        </h2>
        <p class="text-muted-foreground mt-2 text-sm">
          Звук не запускается автоматически.
        </p>
      </section>
    </main>
  );
}
