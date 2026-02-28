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
	type DecorrMode,
	type HearingProfile,
	MODULATION_BANDS_HZ,
	type PlayState,
	selectTinnitusMatch,
	TINNITUS_MATCH_FREQUENCIES_HZ,
	type TinnitusType,
} from '@/lib/audio';
import {makePersisted} from '@solid-primitives/storage';
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	onCleanup,
	Show,
} from 'solid-js';

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function formatFrequencyHz(frequencyHz: number): string {
	if (frequencyHz < 1000) {
		return `${frequencyHz} Гц`;
	}

	const inKhz = frequencyHz / 1000;
	if (Number.isInteger(inKhz)) {
		return `${inKhz.toFixed(0)} кГц`;
	}

	return `${inKhz.toFixed(1)} кГц`;
}

function formatBandHz(band: readonly [number, number]): string {
	return `${formatFrequencyHz(band[0])} - ${formatFrequencyHz(band[1])}`;
}

function createDefaultAudibleMap(): Record<number, boolean> {
	return Object.fromEntries(TINNITUS_MATCH_FREQUENCIES_HZ.map((frequencyHz) => [frequencyHz, true]));
}

const HEARING_PROFILES: HearingProfile[] = ['normal', 'mild', 'moderate', 'severe'];
const HEARING_PROFILE_LABELS: Record<HearingProfile, string> = {
	normal: 'Нормальный',
	mild: 'Лёгкий',
	moderate: 'Средний',
	severe: 'Сильный',
};

function formatPlayStateLabel(value: PlayState): string {
	switch (value) {
		case 'idle':
			return 'Остановлено';
		case 'decorr-am-active':
			return 'AM-терапия: Активный';
		case 'decorr-am-sham':
			return 'AM-терапия: Шам';
		default:
			return value;
	}
}

export function AMTherapyPage() {
	const [state, setState] = createSignal<PlayState>('idle');
	const [tinnitusType, setTinnitusType] = makePersisted(createSignal<TinnitusType>('tone'), {name: 'decorr-tinnitus-type'});
	const [selectedMatchHz, setSelectedMatchHz] = makePersisted(createSignal<number>(4000), {name: 'decorr-selected-match-hz'});
	const [audibleMap, setAudibleMap] = makePersisted(
		createSignal<Record<number, boolean>>(createDefaultAudibleMap()),
		{name: 'decorr-audible-map'},
	);
	const [hearingProfile, setHearingProfile] = makePersisted(createSignal<HearingProfile>('normal'), {name: 'decorr-hearing-profile'});
	const [decorrMode, setDecorrMode] = makePersisted(createSignal<DecorrMode>('active'), {name: 'decorr-mode'});
	const [sessionGainPercent, setSessionGainPercent] = makePersisted(createSignal<number>(20), {name: 'decorr-session-gain'});
	const [masterVolumePercent, setMasterVolumePercent] = makePersisted(createSignal<number>(40), {name: 'decorr-master-volume'});
	const [previewingFrequencyHz, setPreviewingFrequencyHz] = createSignal<number | null>(null);

	let previewAudioContext: AudioContext = null;
	let previewOscillator: OscillatorNode = null;

	const normalizedSelectedMatchHz = createMemo(() => {
		const selected = selectedMatchHz();
		if (TINNITUS_MATCH_FREQUENCIES_HZ.includes(selected as never)) {
			return selected;
		}
		return TINNITUS_MATCH_FREQUENCIES_HZ[0];
	});

	const matchResult = createMemo(() => selectTinnitusMatch({
		selectedHz: normalizedSelectedMatchHz(),
		audibleMap: audibleMap(),
	}));

	const selectedBandState = createMemo<PlayState>(() => (
		decorrMode() === 'active' ? 'decorr-am-active' : 'decorr-am-sham'
	));
	const isDecorrPlaying = createMemo(() => state() === 'decorr-am-active' || state() === 'decorr-am-sham');

	const [audio] = createResource(async () => {
		const player = new AudioGenerator(clamp(masterVolumePercent() / 100, 0, 1), 3000, 1);
		await player.initModules();
		return player;
	});

	createEffect(() => {
		audio()?.setVolume(clamp(masterVolumePercent() / 100, 0, 1));
	});
	createEffect(() => {
		const match = matchResult();
		audio()?.setDecorrMatchResult(match);
		audio()?.setDecorrConfig({
			mode: decorrMode(),
			tinnitusHz: match.matchedHz,
			tinnitusType: tinnitusType(),
			hearingProfile: hearingProfile(),
			sessionGain: clamp(sessionGainPercent() / 100, 0, 1),
		});
	});
	createEffect(() => {
		void audio()?.setState(state());
	});
	createEffect(() => {
		const targetState = selectedBandState();
		if (isDecorrPlaying() && state() !== targetState) {
			setState(targetState);
		}
	});

	onCleanup(() => {
		stopPreviewTone();
		if (previewAudioContext) {
			void previewAudioContext.close();
			previewAudioContext = null;
		}
		void audio()?.setState('idle');
	});

	function updateAudible(frequencyHz: number, value: boolean) {
		setAudibleMap((previous) => ({
			...previous,
			[frequencyHz]: value,
		}));
	}

	function stopPreviewTone() {
		if (previewOscillator) {
			previewOscillator.onended = null;
			try {
				previewOscillator.stop();
			} catch {
				// Oscillator can already have a scheduled stop time.
			}
			previewOscillator.disconnect();
			previewOscillator = null;
		}

		if (previewAudioContext && previewAudioContext.state === 'running') {
			void previewAudioContext.suspend();
		}

		setPreviewingFrequencyHz(null);
	}

	async function playPreviewTone(frequencyHz: number) {
		stopPreviewTone();

		if (!previewAudioContext) {
			previewAudioContext = new AudioContext();
		}
		await previewAudioContext.resume();

		const oscillator = new OscillatorNode(previewAudioContext, {
			type: 'sine',
			frequency: frequencyHz,
		});
		const gainNode = new GainNode(previewAudioContext, {
			gain: 0,
		});

		oscillator.connect(gainNode);
		gainNode.connect(previewAudioContext.destination);

		const now = previewAudioContext.currentTime;
		gainNode.gain.setValueAtTime(0, now);
		gainNode.gain.linearRampToValueAtTime(0.07, now + 0.03);
		gainNode.gain.linearRampToValueAtTime(0.07, now + 0.45);
		gainNode.gain.linearRampToValueAtTime(0, now + 0.6);

		oscillator.start(now);
		oscillator.stop(now + 0.65);
		previewOscillator = oscillator;
		setPreviewingFrequencyHz(frequencyHz);

		oscillator.onended = () => {
			if (previewOscillator === oscillator) {
				previewOscillator = null;
				setPreviewingFrequencyHz(null);
			}
			gainNode.disconnect();
			oscillator.disconnect();
		};
	}

	function toggleDecorrPlayback() {
		stopPreviewTone();
		const targetState = selectedBandState();
		setState((previous) => (previous === targetState ? 'idle' : targetState));
	}

	return (
		<div class="w-full space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>AM-терапия (экспериментальный режим)</CardTitle>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">Страница с настройкой и запуском de-correlating AM терапии.</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>AM-терапия</CardTitle>
				</CardHeader>
				<CardContent class="space-y-6">
					<div class="space-y-2">
						<p class="text-sm font-medium">Шаг 1. Тип тиннитуса</p>
						<div class="flex gap-2">
							<Button
								variant={tinnitusType() === 'tone' ? 'default' : 'outline'}
								onClick={() => setTinnitusType('tone')}
							>
								Тон
							</Button>
							<Button
								variant={tinnitusType() === 'noise' ? 'default' : 'outline'}
								onClick={() => setTinnitusType('noise')}
							>
								Шум
							</Button>
						</div>
					</div>

					<div class="space-y-2">
						<p class="text-sm font-medium">Шаг 2. Подбор частоты (17 тонов) и слышимость</p>
						<div class="grid gap-2 md:grid-cols-2">
							{TINNITUS_MATCH_FREQUENCIES_HZ.map((frequencyHz) => (
								<div class="flex items-center justify-between gap-2 rounded-md border p-2">
									<div class="flex items-center gap-2">
										<Button
											variant={normalizedSelectedMatchHz() === frequencyHz ? 'default' : 'outline'}
											onClick={() => setSelectedMatchHz(frequencyHz)}
										>
											{formatFrequencyHz(frequencyHz)}
										</Button>
										<Button
											size="sm"
											variant={previewingFrequencyHz() === frequencyHz ? 'secondary' : 'outline'}
											onClick={() => void playPreviewTone(frequencyHz)}
										>
											{previewingFrequencyHz() === frequencyHz ? 'Играет...' : 'Прослушать'}
										</Button>
									</div>
									<label class="flex items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={audibleMap()[frequencyHz] ?? true}
											onChange={(event) => updateAudible(frequencyHz, event.currentTarget.checked)}
										/>
										Слышу
									</label>
								</div>
							))}
						</div>
					</div>

					<div class="space-y-2">
						<p class="text-sm font-medium">Шаг 3. Профиль коррекции слуха</p>
						<div class="flex flex-wrap gap-2">
							{HEARING_PROFILES.map((profile) => (
								<Button
									variant={hearingProfile() === profile ? 'default' : 'outline'}
									onClick={() => setHearingProfile(profile)}
								>
									{HEARING_PROFILE_LABELS[profile]}
								</Button>
							))}
						</div>
						<p class="text-xs text-muted-foreground">Профили соответствуют максимальному усилению высоких частот: 0 / 15 / 30 / 45 дБ.</p>
					</div>

					<div class="space-y-2 rounded-md border p-3">
						<p class="text-sm font-medium">Шаг 4. Рассчитанные диапазоны модуляции</p>
						<p class="text-sm">Подобранная частота: <span class="font-medium">{formatFrequencyHz(matchResult().matchedHz)}</span></p>
						<p class="text-sm">Активный диапазон: <span class="font-medium">{formatBandHz(matchResult().activeBand)}</span></p>
						<p class="text-sm">Шам-диапазон: <span class="font-medium">{formatBandHz(matchResult().shamBand)}</span></p>
						<p class="text-xs text-muted-foreground">Доступные октавные диапазоны: {MODULATION_BANDS_HZ.map((band) => formatBandHz(band)).join(', ')}</p>
					</div>

					<div class="space-y-3">
						<p class="text-sm font-medium">Шаг 5. Режим терапии и воспроизведение</p>
						<div class="flex gap-2">
							<Button
								variant={decorrMode() === 'active' ? 'default' : 'outline'}
								onClick={() => setDecorrMode('active')}
							>
								Активный
							</Button>
							<Button
								variant={decorrMode() === 'sham' ? 'default' : 'outline'}
								onClick={() => setDecorrMode('sham')}
							>
								Шам
							</Button>
						</div>
						<Slider class="space-y-3" minValue={0} maxValue={100} value={[sessionGainPercent()]}
						        onChange={([value]) => setSessionGainPercent(value)}>
							<div class="flex w-full justify-between">
								<SliderLabel>Уровень сессии (%)</SliderLabel>
								<SliderInputLabel/>
							</div>
							<SliderTrack>
								<SliderFill/>
								<SliderThumb/>
							</SliderTrack>
						</Slider>
						<Slider class="space-y-3" minValue={0} maxValue={100} value={[masterVolumePercent()]}
						        onChange={([value]) => setMasterVolumePercent(value)}>
							<div class="flex w-full justify-between">
								<SliderLabel>Общая громкость (%)</SliderLabel>
								<SliderInputLabel/>
							</div>
							<SliderTrack>
								<SliderFill/>
								<SliderThumb/>
							</SliderTrack>
						</Slider>
						<p class="text-xs text-muted-foreground">
							Текущее состояние: {formatPlayStateLabel(state())}.
						</p>
					</div>
				</CardContent>
				<CardFooter>
					<Button class="w-full" onClick={toggleDecorrPlayback}>
						<Show when={state() !== selectedBandState()} fallback={`Остановить ${decorrMode() === 'active' ? 'активную' : 'шам'} AM-терапию`}>
							Запустить {decorrMode() === 'active' ? 'активную' : 'шам'} AM-терапию
						</Show>
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
