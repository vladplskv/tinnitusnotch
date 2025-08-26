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
import {makePersisted} from '@solid-primitives/storage';
import {
	createEffect,
	createResource,
	createSignal,
	Show,
} from 'solid-js';


export function IndexPage() {
	const [frequency, setFrequency] = makePersisted(createSignal(3000), {name: 'frequency'});
	const [volume, setVolume] = makePersisted(createSignal(10), {name: 'volume'});
	const volumePercent = () => volume() / 100;

	const [state, setState] = createSignal<PlayState>('idle');

	const [audio] = createResource(async () => {
		const audio = new AudioGenerator(volumePercent(), frequency());
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
		audio()?.setState(state()).then(() => {
		});
	});

	return (
		<div class="w-full space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Find your frequency</CardTitle>
				</CardHeader>
				<CardContent>
					<Slider class="space-y-3" minValue={1} maxValue={24000} getValueLabel={(params) => `${params.values} Hz`}
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
				<CardContent>
					<Slider class="space-y-3" minValue={0} maxValue={100} value={[volume()]}
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
