import {Button} from '@/components/ui/button';
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
import {
	AudioGenerator,
	type PlayState,
} from '@/lib/audio';
import {getPositionToElement} from '@solid-primitives/mouse';
import createRAF from '@solid-primitives/raf';
import {makePersisted} from '@solid-primitives/storage';
import {
	batch,
	createEffect,
	createResource,
	createSignal,
	onMount,
	Show,
} from 'solid-js';

function mapRange(value: number, x1: number, y1: number, x2: number, y2: number) {
	return Math.max(Math.min((value - x1) * (y2 - x2) / (y1 - x1) + x2, y2), x2);
}

const MAX_FREQUENCY = 22000;
const MAX_VOLUME = 100;


export function IndexPage() {
	const [frequency, setFrequency] = makePersisted(createSignal(3000), {name: 'frequency'});
	const [volume, setVolume] = makePersisted(createSignal(10), {name: 'volume'});
	const volumePercent = () => volume() / 1000;
	const [qFactor, setQFactor] = makePersisted(createSignal(1), {name: 'q-factor'});

	const [state, setState] = createSignal<PlayState>('idle');

	const [audio] = createResource(async () => {
		const audio = new AudioGenerator(volumePercent(), frequency(), qFactor());
		await audio.initModules();
		return audio;
	});

	createEffect(() => {
		audio()?.setVolume(volumePercent());
	});
	createEffect(() => {
		audio()?.setFrequency(frequency());
	});
	createEffect(() => {
		audio()?.setQFactor(qFactor());
	});
	createEffect(() => {
		audio()?.setState(state()).then(() => {
		});
	});

	let canvas: HTMLCanvasElement;
	let canvasContext: CanvasRenderingContext2D;
	onMount(() => {
		canvas.width = canvas.clientWidth;
		canvas.height = canvas.clientHeight;

		canvasContext = canvas.getContext('2d');
	});

	const [, start] = createRAF(() => {
		const a = audio();
		if (!canvas || !a) return;

		canvasContext.clearRect(0, 0, canvas.width, canvas.height);

		const freqData = a.getByteFrequencyData();
		const barWidth = canvas.width / freqData.length;
		for (let i = 0; i < freqData.length; i++) {
			const barHeight = mapRange(freqData[i], 0, 255, 0, canvas.height);

			canvasContext.fillStyle = window.getComputedStyle(canvas).getPropertyValue('--primary');
			canvasContext.fillRect(
				i * barWidth,
				canvas.height - barHeight,
				barWidth - 1,
				barHeight,
			);
		}
	});


	start();

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
			const pos = getPositionToElement(e.pageX, e.pageY, canvas);

			batch(() => {
				setVolume(Math.ceil(50 - mapRange(pos.y, 0, pos.height, 0, 50)));
				setFrequency(Math.ceil(mapRange(pos.x, 0, pos.width, 0, 22000)));
			});
		}
	}

	function onPointerUp(e: PointerEvent) {
		e.stopPropagation();
		const target = e.currentTarget as HTMLElement;

		if (target.hasPointerCapture(e.pointerId)) {
			target.releasePointerCapture(e.pointerId);
		}
	}

	const pointerX = () => mapRange(frequency(), 1, 22000, 0, canvas.clientWidth) - 6;
	const pointerY = () => canvas.clientHeight - mapRange(volume(), 0, 50, 0, canvas.clientHeight) - 6;

	return (
		<div class="w-full space-y-6">
			<div class="relative h-[300px]" onPointerDown={onPointerDown}
			     onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
				<canvas class="w-full h-full rounded-xl border" ref={canvas}/>
				<div class="size-4 absolute bg-background border-primary border-2 rounded-full top-(--pos-y) left-(--pos-x)"
				     style={{
					     '--pos-x': `${pointerX()}px`,
					     '--pos-y': `${pointerY()}px`,
				     }}/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Find your frequency</CardTitle>
				</CardHeader>
				<CardContent>
					<Slider class="space-y-3" minValue={1} maxValue={MAX_FREQUENCY}
					        getValueLabel={(params) => `${params.values} Hz`}
					        value={[frequency()]}
					        onChange={([value]) => setFrequency(value)}>
						<div class="flex w-full justify-between">
							<SliderLabel>Frequency</SliderLabel>
							<SliderInputLabel/>
						</div>
						<SliderTrack>
							<SliderFill/>
							<SliderThumb/>
						</SliderTrack>
					</Slider>
				</CardContent>
				<CardFooter>
					<Button variant="secondary" class="w-full"
					        onClick={() => setState((state) => state === 'sound' ? 'idle' : 'sound')}>
						<Show when={state() !== 'sound'} fallback="Stop Sound">
							Play Sound
						</Show>
					</Button>
				</CardFooter>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Listen</CardTitle>
				</CardHeader>
				<CardContent class="space-y-6">
					<Slider class="space-y-3" minValue={0} maxValue={5} step={0.1} value={[qFactor()]}
					        onChange={([value]) => setQFactor(value)}>
						<div class="flex w-full justify-between">
							<SliderLabel>Q-Factor</SliderLabel>
							<SliderInputLabel/>
						</div>
						<SliderTrack>
							<SliderFill/>
							<SliderThumb/>
						</SliderTrack>
					</Slider>
					<Slider class="space-y-3" minValue={0} maxValue={MAX_VOLUME} value={[volume()]}
					        onChange={([value]) => setVolume(value)}>
						<div class="flex w-full justify-between">
							<SliderLabel>Volume</SliderLabel>
							<SliderInputLabel/>
						</div>
						<SliderTrack>
							<SliderFill/>
							<SliderThumb/>
						</SliderTrack>
					</Slider>
				</CardContent>
				<CardFooter>
					<Button class="w-full" onClick={() => setState((state) => state === 'noise' ? 'idle' : 'noise')}>
						<Show when={state() !== 'noise'} fallback="Stop White Noise Therapy">
							Play White Noise Therapy
						</Show>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
