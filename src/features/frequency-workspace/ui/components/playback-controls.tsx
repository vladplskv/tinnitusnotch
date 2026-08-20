import type {
  TherapyPlaybackSnapshot,
  WorkspaceCapabilities,
  WorkspaceIntent,
} from '../../index';
import { Button } from '@/components/ui/button';
import { Show } from 'solid-js';

interface PlaybackControlsProps {
  readonly playback: TherapyPlaybackSnapshot;
  readonly capabilities: WorkspaceCapabilities;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function PlaybackControls(props: PlaybackControlsProps) {
  return (
    <section
      class="playback-controls"
      aria-labelledby="playback-controls-heading"
    >
      <div>
        <p class="eyebrow">Therapy Playback</p>
        <h3 id="playback-controls-heading">{statusText(props.playback)}</h3>
      </div>
      <div class="button-row">
        <Show when={props.capabilities.canStart}>
          <Button
            type="button"
            size="lg"
            onClick={() => props.dispatch({ type: 'start-therapy' })}
          >
            Начать терапию
          </Button>
        </Show>
        <Show when={props.capabilities.canPause}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => props.dispatch({ type: 'pause-therapy' })}
          >
            Пауза
          </Button>
        </Show>
        <Show when={props.capabilities.canContinue}>
          <Button
            type="button"
            onClick={() => props.dispatch({ type: 'continue-therapy' })}
          >
            Продолжить
          </Button>
        </Show>
        <Show when={props.playback.status === 'error'}>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.dispatch({ type: 'retry-playback' })}
          >
            Повторить запуск
          </Button>
        </Show>
        <Button
          type="button"
          variant="outline"
          disabled={!props.capabilities.canStop}
          onClick={() => props.dispatch({ type: 'stop-playback' })}
        >
          Остановить
        </Button>
      </div>
      <Show when={props.playback.error}>
        {error => (
          <p class="field-error" role="alert">
            {playbackErrorText(error().code)}
          </p>
        )}
      </Show>
    </section>
  );
}

function statusText(playback: TherapyPlaybackSnapshot): string {
  switch (playback.status) {
    case 'starting':
      return 'Запускаем звук…';
    case 'previewing':
      return 'Звучит Matching Stimulus';
    case 'playing':
      return 'Терапия воспроизводится';
    case 'stopping':
      return 'Останавливаем…';
    case 'paused':
      return 'Воспроизведение на паузе';
    case 'error':
      return 'Не удалось запустить звук';
    default:
      return 'Готово к запуску';
  }
}

function playbackErrorText(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    'user-gesture-required':
      'Браузер требует ещё одного нажатия для запуска звука.',
    'filter-unavailable': 'Выбранный Therapy Filter сейчас недоступен.',
    'audio-context-failed': 'Браузер не смог создать звуковой контекст.',
    'source-failed': 'Источник звука завершился с ошибкой.',
  };
  return messages[code] ?? 'Неизвестная ошибка воспроизведения.';
}
