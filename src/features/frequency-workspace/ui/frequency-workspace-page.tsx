export default function FrequencyWorkspacePage() {
  return (
    <main class="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header class="space-y-3">
        <p class="text-primary text-sm font-medium">Tinnitus Notch</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
          Frequency Workspace
        </h1>
        <p class="text-muted-foreground max-w-2xl text-sm sm:text-base">
          Подготавливаем единое пространство для подбора частоты, настройки
          фильтра и управления воспроизведением.
        </p>
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
          Управление звуком станет доступно после проверки локальных данных.
        </p>
      </section>
    </main>
  );
}
