import type {
  PendingWorkspaceConfirmation,
  WorkspaceIntent,
  WorkspacePersistenceSnapshot,
} from '../../index';
import { formatHz, formatHzShort } from '../format';
import { Button } from '@/components/ui/button';
import { Show, type ParentProps } from 'solid-js';

interface RecoveryPanelProps {
  readonly persistence: WorkspacePersistenceSnapshot;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function RecoveryPanel(props: RecoveryPanelProps) {
  return (
    <main class="fw fw-centered">
      <section class="fw-notice-panel" aria-labelledby="recovery-heading">
        <p class="fw-brand">Tinnitus Notch</p>
        <h1 id="recovery-heading">
          Не удалось прочитать сохранённые настройки
        </h1>
        <p>
          Звук не запущен, данные не изменены. Скачайте копию данных, если они
          вам нужны, затем попробуйте снова или начните с чистого листа.
        </p>
        <div class="fw-button-row">
          <Button
            type="button"
            onClick={() => props.dispatch({ type: 'retry-persistence' })}
          >
            Попробовать снова
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.dispatch({ type: 'download-recovery-data' })}
          >
            Скачать копию данных
          </Button>
          <Button
            type="button"
            variant="ghost"
            class="fw-danger-text"
            onClick={() => props.dispatch({ type: 'request-reset-local-data' })}
          >
            Начать заново
          </Button>
        </div>
        <Show when={props.persistence.errorCode}>
          {code => <p class="fw-help">Код ошибки: {code()}</p>}
        </Show>
      </section>
    </main>
  );
}

type ModalDialogProps = ParentProps<{
  readonly labelledBy: string;
  readonly class?: string;
  readonly onCancel: () => void;
}>;

/** Native modal dialog: top layer, focus containment and Escape for free. */
export function ModalDialog(props: ModalDialogProps) {
  return (
    <dialog
      class={`fw-dialog ${props.class ?? ''}`}
      aria-labelledby={props.labelledBy}
      ref={element => {
        queueMicrotask(() => {
          if (element.isConnected && !element.open) element.showModal();
        });
      }}
      onCancel={event => {
        event.preventDefault();
        props.onCancel();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) props.onCancel();
      }}
    >
      <div class="fw-dialog__body">{props.children}</div>
    </dialog>
  );
}

interface ConfirmationPanelProps {
  readonly confirmation: PendingWorkspaceConfirmation;
  readonly dispatch: (intent: WorkspaceIntent) => void;
}

export function ConfirmationPanel(props: ConfirmationPanelProps) {
  const cancel = () =>
    props.dispatch({
      type: 'cancel-confirmation',
      confirmationId: props.confirmation.id,
    });

  return (
    <ModalDialog labelledBy="confirmation-heading" onCancel={cancel}>
      <Show when={props.confirmation.kind === 'am-projection'}>
        <h2 id="confirmation-heading">Подтвердите рабочую полосу</h2>
        <p>
          Ваша частота{' '}
          <strong>
            {'exactFrequencyHz' in props.confirmation &&
              formatHz(props.confirmation.exactFrequencyHz)}
          </strong>{' '}
          остаётся без изменений. АМ-терапия будет работать с октавой вокруг
          ближайшей поддерживаемой частоты{' '}
          <strong>
            {'projectedFrequencyHz' in props.confirmation &&
              formatHzShort(props.confirmation.projectedFrequencyHz)}
          </strong>
          . Если терапия уже идёт, полоса сменится плавно.
        </p>
        <div class="fw-button-row">
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
            Подтвердить
          </Button>
          <CancelButton onClick={cancel} />
        </div>
      </Show>

      <Show when={props.confirmation.kind === 'storage-conflict'}>
        <h2 id="confirmation-heading">Настройки изменились в другой вкладке</h2>
        <p>
          Выберите, какую версию оставить. Пока вы не выберете, звук не
          запустится.
        </p>
        <div class="fw-button-row">
          <Button
            type="button"
            onClick={() => resolveConflict(props, 'load-external')}
          >
            Взять из другой вкладки
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => resolveConflict(props, 'overwrite-local')}
          >
            Оставить эти
          </Button>
          <CancelButton onClick={cancel} />
        </div>
      </Show>

      <Show when={props.confirmation.kind === 'reset-local-data'}>
        <h2 id="confirmation-heading">Удалить все сохранённые настройки?</h2>
        <p>
          Сессия и все пресеты в этом браузере будут удалены без возможности
          восстановить. Если данные нужны, сначала скачайте копию.
        </p>
        <div class="fw-button-row">
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
            Удалить всё
          </Button>
          <CancelButton onClick={cancel} />
        </div>
      </Show>

      <Show when={props.confirmation.kind === 'delete-preset'}>
        <h2 id="confirmation-heading">Удалить пресет?</h2>
        <p>
          Пресет «
          {'presetName' in props.confirmation && props.confirmation.presetName}»
          будет удалён. Вернуть его не получится.
        </p>
        <div class="fw-button-row">
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (props.confirmation.kind !== 'delete-preset') return;
              props.dispatch({
                type: 'confirm-delete-preset',
                confirmationId: props.confirmation.id,
                originRevision: props.confirmation.originRevision,
              });
            }}
          >
            Удалить
          </Button>
          <CancelButton onClick={cancel} />
        </div>
      </Show>

      <Show when={props.confirmation.kind === 'discard-preset-edits'}>
        <h2 id="confirmation-heading">Отбросить несохранённые изменения?</h2>
        <p>
          Вы меняли настройки открытого пресета и не сохранили их. Если
          продолжить, эти изменения пропадут.
        </p>
        <div class="fw-button-row">
          <Button
            type="button"
            onClick={() => {
              if (props.confirmation.kind !== 'discard-preset-edits') return;
              props.dispatch({
                type: 'confirm-discard-preset-edits',
                confirmationId: props.confirmation.id,
                originRevision: props.confirmation.originRevision,
              });
            }}
          >
            Отбросить
          </Button>
          <CancelButton onClick={cancel} />
        </div>
      </Show>
    </ModalDialog>
  );
}

function CancelButton(props: { readonly onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={() => props.onClick()}>
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
