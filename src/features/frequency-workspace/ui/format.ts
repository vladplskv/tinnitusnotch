import type { HearingCorrectionId, TherapyFilterId } from '../index';

const groupFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});
const decimalFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 1,
});

/** Exact value for readouts, for example "3 000 Гц". */
export function formatHz(frequencyHz: number): string {
  return `${groupFormatter.format(Math.round(frequencyHz))} Гц`;
}

/** Compact value for summaries and axes, for example "2,8 кГц". */
export function formatHzShort(frequencyHz: number): string {
  if (frequencyHz < 1_000) return `${Math.round(frequencyHz)} Гц`;
  return `${decimalFormatter.format(frequencyHz / 1_000)} кГц`;
}

/** A frequency band as "от 2 кГц до 4 кГц". */
export function formatBandHz(bandHz: readonly [number, number]): string {
  return `от ${formatHzShort(bandHz[0])} до ${formatHzShort(bandHz[1])}`;
}

/**
 * Hearing Correction profiles as the paper names them (Yukhnovich et al.
 * 2025, Fig. 1): extra gain for high frequencies, up to 0, 15, 30 or 45 dB.
 * The stored ids are older and do not match the paper's A1/C1 band labels.
 */
export const HEARING_CORRECTION_COPY: Readonly<
  Record<HearingCorrectionId, { readonly name: string; readonly gain: string }>
> = {
  a1: { name: 'Нет', gain: 'ровно' },
  a2: { name: 'Слабая', gain: 'до +15 дБ' },
  c1: { name: 'Средняя', gain: 'до +30 дБ' },
  c2: { name: 'Сильная', gain: 'до +45 дБ' },
};

export const FILTER_COPY: Readonly<
  Record<
    TherapyFilterId,
    {
      readonly name: string;
      readonly hint: string;
      readonly description: string;
    }
  >
> = {
  'white-noise': {
    name: 'Белый шум с вырезом',
    hint: 'работает сразу',
    description:
      'Ровный шум, из которого убрана полоса вокруг вашей частоты. Работает сразу, без подготовки.',
  },
  'decorrelating-am': {
    name: 'АМ-терапия',
    hint: 'эксперимент, нужна подготовка',
    description:
      'Амплитудная модуляция октавной полосы рядом с вашей частотой (De-correlating AM). Перед запуском нужно подтвердить полосу, проверить слух и выбрать коррекцию.',
  },
  'cr-neuromodulation': {
    name: 'CR-тоны',
    hint: 'эксперимент, без подготовки',
    description:
      'Четыре тона вокруг вашей частоты в случайном порядке (CR-нейромодуляция, ACRN). Нужна точно подобранная частота от 500 до 10 000 Гц.',
  },
};

const MIN_SLIDER_HZ = 20;
const MAX_SLIDER_HZ = 22_000;
const SLIDER_STEPS = 1_000;

const LOG_SPAN = Math.log(MAX_SLIDER_HZ / MIN_SLIDER_HZ);

export function sliderPositionFromHz(frequencyHz: number): number {
  const clamped = Math.min(MAX_SLIDER_HZ, Math.max(MIN_SLIDER_HZ, frequencyHz));
  return Math.round(
    (Math.log(clamped / MIN_SLIDER_HZ) / LOG_SPAN) * SLIDER_STEPS,
  );
}

export function hzFromSliderPosition(position: number): number {
  return Math.round(
    MIN_SLIDER_HZ * Math.exp((position / SLIDER_STEPS) * LOG_SPAN),
  );
}

export function clampHz(frequencyHz: number): number {
  return Math.min(
    MAX_SLIDER_HZ,
    Math.max(MIN_SLIDER_HZ, Math.round(frequencyHz)),
  );
}
