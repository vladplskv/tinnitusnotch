import type {
  PendingWorkspaceConfirmation,
  WorkspaceIntent,
  WorkspaceNotification,
  WorkspacePersistenceSnapshot,
} from '../../index';
import { Button } from '@/components/ui/button';
import { For, Show } from 'solid-js';

interface RecoveryPanelProps {
  readonly persistence: WorkspacePersistenceSnapshot;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function RecoveryPanel(props: RecoveryPanelProps) {
  return (
    <main class="workspace-shell workspace-shell--centered">
      <section class="recovery-panel" aria-labelledby="recovery-heading">
        <p class="eyebrow">Local recovery</p>
        <h1 id="recovery-heading">Не удалось безопасно прочитать настройки</h1>
        <p>
          Звук не запущен. Можно скачать исходные локальные данные перед сбросом
          или повторить чтение storage.
        </p>
        <div class="button-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => props.dispatch({ type: 'download-recovery-data' })}
          >
            Скачать исходные данные
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.dispatch({ type: 'retry-persistence' })}
          >
            Повторить
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => props.dispatch({ type: 'request-reset-local-data' })}
          >
            Сбросить локальные данные
          </Button>
        </div>
        <Show when={props.persistence.errorCode}>
          {code => <p class="field-error">Код: {code()}</p>}
        </Show>
      </section>
    </main>
  );
}

interface ConfirmationPanelProps {
  readonly confirmation: PendingWorkspaceConfirmation;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function ConfirmationPanel(props: ConfirmationPanelProps) {
  return (
    <div class="confirmation-backdrop">
      <section
        class="confirmation-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-heading"
        tabindex="-1"
        ref={element => {
          queueMicrotask(() => element.focus());
        }}
        onKeyDown={event => {
          if (event.key !== 'Escape') return;
          props.dispatch({
            type: 'cancel-confirmation',
            confirmationId: props.confirmation.id,
          });
        }}
      >
        <Show when={props.confirmation.kind === 'am-projection'}>
          <h2 id="confirmation-heading">Подтвердите Active Band</h2>
          <p>
            Точная Tinnitus Frequency:{' '}
            {'exactFrequencyHz' in props.confirmation &&
              props.confirmation.exactFrequencyHz}{' '}
            Hz. De-correlating AM использует ближайшую поддерживаемую частоту{' '}
            {'projectedFrequencyHz' in props.confirmation &&
              props.confirmation.projectedFrequencyHz}{' '}
            Hz.
          </p>
          <div class="button-row">
            <Button
              type="button"
              onClick={() => {
                if (props.confirmation.kind !== 'am-projection') return;
                props.dispatch({
                  type: 'confirm-am-projection',
                  confirmationId: props.confirmation.id,
                  originRevision: props.confirmation.originRevision,
                });
              }}
            >
              Подтвердить и применить
            </Button>
            <CancelConfirmation {...props} />
          </div>
        </Show>

        <Show when={props.confirmation.kind === 'storage-conflict'}>
          <h2 id="confirmation-heading">
            Настройки изменились в другой вкладке
          </h2>
          <p>Выберите, какую ревизию оставить. Звук останется остановленным.</p>
          <div class="button-row">
            <Button
              type="button"
              onClick={() => resolveConflict(props, 'load-external')}
            >
              Загрузить внешние изменения
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => resolveConflict(props, 'overwrite-local')}
            >
              Оставить мои настройки
            </Button>
            <CancelConfirmation {...props} />
          </div>
        </Show>

        <Show when={props.confirmation.kind === 'reset-local-data'}>
          <h2 id="confirmation-heading">Удалить текущий workspace document?</h2>
          <p>
            Сброс необратим внутри приложения. Сначала скачайте recovery data,
            если они нужны.
          </p>
          <div class="button-row">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (props.confirmation.kind !== 'reset-local-data') return;
                props.dispatch({
                  type: 'confirm-reset-local-data',
                  confirmationId: props.confirmation.id,
                  originRevision: props.confirmation.originRevision,
                });
              }}
            >
              Сбросить данные
            </Button>
            <CancelConfirmation {...props} />
          </div>
        </Show>
      </section>
    </div>
  );
}

function CancelConfirmation(props: ConfirmationPanelProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() =>
        props.dispatch({
          type: 'cancel-confirmation',
          confirmationId: props.confirmation.id,
        })
      }
    >
      Отмена
    </Button>
  );
}

function resolveConflict(
  props: ConfirmationPanelProps,
  resolution: 'load-external' | 'overwrite-local',
) {
  if (props.confirmation.kind !== 'storage-conflict') return;
  props.dispatch({
    type: 'resolve-storage-conflict',
    confirmationId: props.confirmation.id,
    originRevision: props.confirmation.originRevision,
    resolution,
  });
}

interface NotificationCenterProps {
  readonly notifications: readonly WorkspaceNotification[];
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function NotificationCenter(props: NotificationCenterProps) {
  return (
    <div
      class="notification-center"
      aria-live="polite"
      aria-relevant="additions"
    >
      <For each={props.notifications}>
        {notification => (
          <div
            class={`notification notification--${notification.kind}`}
            role={notification.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{notificationText(notification)}</span>
            <Show
              when={
                notification.code === 'preset-deleted' && notification.field
                  ? notification.field
                  : null
              }
            >
              {presetId => (
                <button
                  type="button"
                  class="notification__action"
                  onClick={() =>
                    props.dispatch({
                      type: 'undo-delete-preset',
                      id: presetId(),
                    })
                  }
                >
                  Отменить
                </button>
              )}
            </Show>
            <button
              type="button"
              aria-label="Закрыть уведомление"
              onClick={() =>
                props.dispatch({
                  type: 'dismiss-notification',
                  id: notification.id,
                })
              }
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

function notificationText(notification: WorkspaceNotification): string {
  const messages: Readonly<Record<string, string>> = {
    'preset-created': 'Therapy Preset сохранён.',
    'preset-updated': 'Therapy Preset обновлён.',
    'preset-deleted': 'Therapy Preset удалён.',
    'preset-restored': 'Therapy Preset восстановлен.',
    'storage-repaired': 'Некорректные поля заменены безопасными значениями.',
    'storage-unavailable': 'Локальное сохранение сейчас недоступно.',
    'revision-conflict': 'Обнаружены изменения из другой вкладки.',
    'am-projection-applied': 'Новый Active Band применён.',
  };
  return messages[notification.code] ?? notification.code;
}
