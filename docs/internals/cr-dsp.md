# CR Neuromodulation

The CR source reproduces the checkhearing.org ACRN generator, with the timing from Tass et al.,
"Counteracting tinnitus by acoustic coordinated reset neuromodulation", Restorative Neurology and
Neuroscience 30 (2012) 137-159. The [DSP](../../src/features/frequency-workspace/playback/dsp/cr-neuromodulation.ts)
runs sample by sample inside an AudioWorklet, like De-correlating AM.

## Taken from the site

- Tone spacing: `⌊0.773f − 44.5⌋`, `⌊0.903f − 21.5⌋`, `⌊1.09f + 52⌋`, `⌊1.395f + 26.5⌋` (the site
  cites Hauptmann et al. 2015).
- Tinnitus Frequency range of 500 to 10 000 Hz, as the site states. Its code accepts up to
  18 000 Hz, but its text does not.
- Tone rate: 360 BPM quarter notes, so a tone every 1/6 s and four-tone cycles at 1.5 Hz. A new random
  order of all four tones each cycle.

## Where it departs from the site

- Pattern: three cycles on, two cycles off, per Tass 2012. The site's sequencer counter is off by
  one and plays 15 tones followed by 5 silent slots. That pattern comes from the bug, not from a
  protocol.
- Envelope: each tone fills its 1/6 s slot with 20 ms raised-cosine ramps. The site's Tone.js
  envelope (decay 0, sustain 0.07) collapses each tone to a 100 ms swell, which is a side effect of
  the synth settings rather than a design.
- Level: tones peak at full scale, the level of the Matching Stimulus tone, so the master volume a
  user matched to their tinnitus sets the tones to that loudness, as the site asks. Each tone is not
  loudness-matched on its own.

## Notched noise mix

The optional mix follows checkhearing.org's notched neuromodulation: notched white noise under the
tones. Its notch generator uses a biquad notch with Q 1 at the Tinnitus Frequency, which is the
default here. That notch spans about 0.62f to 1.62f at -3 dB, so it clears most of the band the
tones occupy (0.77f to 1.4f). The site gives no level ratio. The level runs from -30 dB to 0 dB
against the full-scale tones, with -10 dB as the default.

The mix settings belong to CR, not shared with White Noise, because each Therapy Filter keeps its
own settings. The noise branch always runs and switching it off only mutes it, so every mix change
applies live without restarting the tone pattern.

## Why a worklet

Therapy runs for hours, often in a background tab or with the screen locked. Main-thread timers
are throttled or paused there, while the audio thread keeps running, so scheduling tones from
`setTimeout` would break the rhythm.
