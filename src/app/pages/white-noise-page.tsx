import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Slider,
  SliderFill,
  SliderInputLabel,
  SliderLabel,
  SliderThumb,
  SliderTrack,
} from '@/components/ui/slider';
import { AudioGenerator, type PlayState } from '@/lib/audio';
import { getPositionToElement } from '@solid-primitives/mouse';
import createRAF from '@solid-primitives/raf';
import { makePersisted } from '@solid-primitives/storage';
import {
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  Show,
  untrack,
} from 'solid-js';

function mapRange(
  value: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  return Math.max(
    Math.min(((value - x1) * (y2 - x2)) / (y1 - x1) + x2, y2),
    x2,
  );
}

const MAX_FREQUENCY = 22000;
const MAX_VOLUME = 100;

const [frequency, setFrequency] = makePersisted(createSignal(3000), {
  name: 'frequency',
});
const [volume, setVolume] = makePersisted(createSignal(10), {
  name: 'volume',
});
const volumePercent = () => volume() / 1000;
const [qFactor, setQFactor] = makePersisted(createSignal(1), {
  name: 'q-factor',
});

const [state, setState] = createSignal<PlayState>('idle');
let readyAudio: AudioGenerator | undefined;

const audio = createMemo(async () => {
  const player = new AudioGenerator(
    untrack(volumePercent),
    untrack(frequency),
    untrack(qFactor),
  );
  await player.initModules();
  return player;
});

function createCanvasVis(getCanvas: () => HTMLCanvasElement | undefined) {
  let canvasContext: CanvasRenderingContext2D | undefined;
  onSettled(() => {
    const canvas = getCanvas();
    if (!canvas) {
      return;
    }

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context is not available');
    }
    canvasContext = context;
  });

  const [, start] = createRAF(() => {
    const canvas = getCanvas();
    const player = readyAudio;
    if (!canvas || !player || !canvasContext) {
      return;
    }

    canvasContext.clearRect(0, 0, canvas.width, canvas.height);

    const freqData = player.getByteFrequencyData();
    const barWidth = canvas.width / freqData.length;
    for (let i = 0; i < freqData.length; i += 1) {
      const barHeight = mapRange(freqData[i], 0, 255, 0, canvas.height);

      canvasContext.fillStyle = window
        .getComputedStyle(canvas)
        .getPropertyValue('--primary');
      canvasContext.fillRect(
        i * barWidth,
        canvas.height - barHeight,
        barWidth - 1,
        barHeight,
      );
    }
  });

  function onPointerDown(e: PointerEvent) {
    const target = e.currentTarget as HTMLElement;

    e.preventDefault();
    e.stopPropagation();
    target.setPointerCapture(e.pointerId);
    target.focus();
  }

  function onPointerMove(e: PointerEvent) {
    e.stopPropagation();

    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      const canvas = getCanvas();
      if (!canvas) {
        return;
      }
      const pos = getPositionToElement(e.pageX, e.pageY, canvas);

      setVolume(Math.ceil(50 - mapRange(pos.y, 0, pos.height, 0, 50)));
      setFrequency(Math.ceil(mapRange(pos.x, 0, pos.width, 0, 22000)));
    }
  }

  function onPointerUp(e: PointerEvent) {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;

    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
  }

  return {
    start,
    containerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  };
}

export default function WhiteNoiseTherapyPage() {
  let canvas: HTMLCanvasElement | undefined;
  const canvasHandle = createCanvasVis(() => canvas);
  onSettled(() => {
    canvasHandle.start();
  });

  const pointerX = () => {
    if (!canvas) {
      return 0;
    }
    return mapRange(frequency(), 1, 22000, 0, canvas.clientWidth) - 6;
  };
  const pointerY = () => {
    if (!canvas) {
      return 0;
    }
    return (
      canvas.clientHeight -
      mapRange(volume(), 0, 50, 0, canvas.clientHeight) -
      6
    );
  };

  createEffect(
    () => audio(),
    player => {
      readyAudio = player;
      return () => {
        void player.setState('idle');
        if (readyAudio === player) {
          readyAudio = undefined;
        }
      };
    },
  );
  createEffect(
    () => [audio(), volumePercent()] as const,
    ([audio, value]) => audio.setVolume(value),
  );
  createEffect(
    () => [audio(), frequency()] as const,
    ([audio, value]) => audio.setFrequency(value),
  );
  createEffect(
    () => [audio(), qFactor()] as const,
    ([audio, value]) => audio.setQFactor(value),
  );
  createEffect(
    () => [audio(), state()] as const,
    ([audio, value]) => void audio.setState(value),
  );

  return (
    <div class="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Терапия белым шумом</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-muted-foreground text-sm">
            Страница для обычной терапии белым шумом и поиска частоты.
          </p>
        </CardContent>
      </Card>

      <div class="relative h-75" {...canvasHandle.containerProps}>
        <canvas
          class="h-full w-full rounded-xl border"
          ref={el => (canvas = el)}
        />
        <div
          class="bg-background border-primary absolute top-(--pos-y) left-(--pos-x) size-4 rounded-full border-2"
          style={{
            '--pos-x': `${pointerX()}px`,
            '--pos-y': `${pointerY()}px`,
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Подбор частоты</CardTitle>
        </CardHeader>
        <CardContent>
          <Slider
            class="space-y-3"
            minValue={1}
            maxValue={MAX_FREQUENCY}
            getValueLabel={params => `${params.values} Гц`}
            value={[frequency()]}
            onChange={([value]) => setFrequency(value)}
          >
            <div class="flex w-full justify-between">
              <SliderLabel>Частота</SliderLabel>
              <SliderInputLabel />
            </div>
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </CardContent>
        <CardFooter>
          <Button
            variant="secondary"
            class="w-full"
            onClick={() =>
              setState(value => (value === 'sound' ? 'idle' : 'sound'))
            }
          >
            <Show when={state() !== 'sound'} fallback="Остановить звук">
              Включить звук
            </Show>
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Белый шум</CardTitle>
        </CardHeader>
        <CardContent class="space-y-6">
          <Slider
            class="space-y-3"
            minValue={0}
            maxValue={5}
            step={0.1}
            value={[qFactor()]}
            onChange={([value]) => setQFactor(value)}
          >
            <div class="flex w-full justify-between">
              <SliderLabel>Ширина выреза (Q)</SliderLabel>
              <SliderInputLabel />
            </div>
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
          <Slider
            class="space-y-3"
            minValue={0}
            maxValue={MAX_VOLUME}
            value={[volume()]}
            onChange={([value]) => setVolume(value)}
          >
            <div class="flex w-full justify-between">
              <SliderLabel>Громкость</SliderLabel>
              <SliderInputLabel />
            </div>
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>
        </CardContent>
        <CardFooter>
          <Button
            class="w-full"
            onClick={() =>
              setState(value => (value === 'noise' ? 'idle' : 'noise'))
            }
          >
            <Show
              when={state() !== 'noise'}
              fallback="Остановить терапию белым шумом"
            >
              Включить терапию белым шумом
            </Show>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
