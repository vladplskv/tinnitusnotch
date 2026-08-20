import type {
  TherapySession,
  TinnitusType,
  WorkspaceIntent,
} from '../../index';
import { formatFrequency } from '../../visualization/frequency-scale';
import { createFrequencyInputRateLimiter } from '../../visualization/frequency-input-rate-limiter';
import { Button } from '@/components/ui/button';
import { For, createEffect, createSignal, onCleanup, untrack } from 'solid-js';

interface FrequencyFieldsProps {
  readonly session: TherapySession;
  readonly previewFrequencyHz: number | null;
  readonly canPreview: boolean;
  readonly canEdit: boolean;
  readonly dispatch: (intent: WorkspaceIntent) => void;
  readonly showStimulus?: boolean;
}

export function FrequencyFields(props: FrequencyFieldsProps) {
  let exactInput: HTMLInputElement | undefined;
  const [draft, setDraft] = createSignal(
    String(props.session.tinnitusMatch.frequencyHz),
  );
  const [invalid, setInvalid] = createSignal(false);
  let previewFrequency = (frequencyHz: number) =>
    props.dispatch({ type: 'preview-frequency', frequencyHz });
  let commitFrequency = (frequencyHz: number) =>
    props.dispatch({ type: 'commit-frequency', frequencyHz });

  createEffect(() => {
    untrack(() => {
      const limiter = createFrequencyInputRateLimiter({
        now: () => performance.now(),
        schedule: (callback, delayMs) => {
          const timeout = window.setTimeout(callback, delayMs);
          return () => window.clearTimeout(timeout);
        },
        onPreview: frequencyHz =>
          props.dispatch({ type: 'preview-frequency', frequencyHz }),
        onCommit: frequencyHz =>
          props.dispatch({ type: 'commit-frequency', frequencyHz }),
      });
      previewFrequency = limiter.preview;
      commitFrequency = limiter.commit;
      onCleanup(limiter.dispose);
    });
  });

  createEffect(() => {
    const frequencyHz = props.session.tinnitusMatch.frequencyHz;
    if (document.activeElement !== exactInput) {
      setDraft(String(frequencyHz));
      setInvalid(false);
    }
  });

  const commitDraft = () => {
    const frequencyHz = Number(draft());
    if (
      !Number.isInteger(frequencyHz) ||
      frequencyHz < 1 ||
      frequencyHz > 22_000
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    commitFrequency(frequencyHz);
  };

  const displayedFrequency = () =>
    props.previewFrequencyHz ?? props.session.tinnitusMatch.frequencyHz;

  return (
    <div class="field-stack">
      <div class="field-heading">
        <label for="tinnitus-frequency-slider">Tinnitus Frequency</label>
        <strong>{formatFrequency(displayedFrequency())}</strong>
      </div>
      <input
        id="tinnitus-frequency-slider"
        class="frequency-slider"
        type="range"
        min="20"
        max="22000"
        step="1"
        value={displayedFrequency()}
        disabled={!props.canEdit}
        aria-describedby="frequency-help"
        onInput={event => previewFrequency(Number(event.currentTarget.value))}
        onChange={event => commitFrequency(Number(event.currentTarget.value))}
      />
      <p id="frequency-help" class="field-help">
        Ползунок и визуализация используют диапазон 20–22 000 Hz. Точное поле
        принимает 1–22 000 Hz.
      </p>

      <div class="field-grid field-grid--compact">
        <label class="field-label" for="tinnitus-frequency-exact">
          Точное значение, Hz
          <input
            ref={element => {
              exactInput = element;
            }}
            id="tinnitus-frequency-exact"
            class="text-input"
            type="text"
            inputmode="numeric"
            value={draft()}
            disabled={!props.canEdit}
            aria-invalid={invalid() ? 'true' : undefined}
            aria-describedby={invalid() ? 'frequency-error' : undefined}
            onInput={event => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={event => {
              if (event.key === 'Enter') commitDraft();
            }}
          />
        </label>
        <fieldset class="choice-fieldset">
          <legend>Тип тиннитуса</legend>
          <div class="segmented-control">
            <For
              each={
                [
                  ['tone', 'Тон'],
                  ['noise', 'Шум'],
                ] as const
              }
            >
              {([value, label]) => (
                <label class="segmented-control__item">
                  <input
                    type="radio"
                    name="tinnitus-type"
                    value={value}
                    checked={props.session.tinnitusMatch.type === value}
                    disabled={!props.canEdit}
                    onChange={() =>
                      props.dispatch({
                        type: 'set-tinnitus-type',
                        value: value as TinnitusType,
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              )}
            </For>
          </div>
        </fieldset>
      </div>
      {invalid() && (
        <p id="frequency-error" class="field-error" role="alert">
          Введите целое значение от 1 до 22 000 Hz.
        </p>
      )}
      {props.showStimulus !== false && (
        <Button
          type="button"
          variant="outline"
          disabled={!props.canPreview}
          onClick={() => props.dispatch({ type: 'preview-matching-stimulus' })}
        >
          Прослушать Matching Stimulus
        </Button>
      )}
    </div>
  );
}
