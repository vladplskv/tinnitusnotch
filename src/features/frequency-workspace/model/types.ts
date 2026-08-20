export type TherapyFilterId = 'white-noise' | 'decorrelating-am';

export type TinnitusType = 'tone' | 'noise';

export type Audibility = 'unknown' | 'audible' | 'inaudible';

export type HearingCorrectionId = 'a1' | 'a2' | 'c1' | 'c2';

export interface TinnitusMatch {
  readonly frequencyHz: number;
  readonly type: TinnitusType;
  readonly audibilityByFrequencyHz: Readonly<Record<string, Audibility>>;
}

export interface WhiteNoiseSettings {
  readonly q: number;
}

export interface DecorrelatingAMSettings {
  readonly hearingCorrection: HearingCorrectionId;
  readonly confirmedProjectionHz: number | null;
}

export interface TherapyFilterSettings {
  readonly 'white-noise': WhiteNoiseSettings;
  readonly 'decorrelating-am': DecorrelatingAMSettings;
}

export interface TherapySession {
  readonly tinnitusMatch: TinnitusMatch;
  readonly masterGain: number;
  readonly selectedFilterId: TherapyFilterId;
  readonly filterSettings: TherapyFilterSettings;
}

interface TherapyPresetBase {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly tinnitusMatch: TinnitusMatch;
  readonly masterGain: number;
}

export type TherapyPreset =
  | (TherapyPresetBase & {
      readonly filterId: 'white-noise';
      readonly filterSettings: WhiteNoiseSettings;
    })
  | (TherapyPresetBase & {
      readonly filterId: 'decorrelating-am';
      readonly filterSettings: DecorrelatingAMSettings;
    });

export interface TherapyFilterDescription {
  readonly id: TherapyFilterId;
  readonly label: string;
  readonly experimental: boolean;
  readonly ready: boolean;
  readonly unavailableReason: string | null;
}
