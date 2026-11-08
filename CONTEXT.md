# Tinnitus Therapy

This context describes how a person finds their tinnitus frequency and configures sound for a therapy session.

## Language

**Therapy Filter**:
A selectable way of shaping or generating therapy sound. White Noise and De-correlating AM are the current Therapy Filters; more may be added later.
_Avoid_: Page, route, AM mode

**Tinnitus Frequency**:
The frequency a person identifies as matching their tinnitus and which most Therapy Filters use for configuration.
_Avoid_: Filter frequency, selected tone

**Frequency Matching**:
The process of finding a Tinnitus Frequency by listening and comparing frequencies. It is a shared capability for most Therapy Filters, not a Therapy Filter itself.
_Avoid_: Filter selection

**Frequency Visualization**:
A persistent view of the current Therapy Playback spectrum, the selected Tinnitus Frequency, and the configured effect of the selected Therapy Filter. It can help with Frequency Matching but does not measure perceived or calibrated loudness.
_Avoid_: Spectrum chart, canvas, loudness meter

**Tinnitus Match**:
The confirmed result of Frequency Matching: an exact Tinnitus Frequency together with the tinnitus type and frequency-audibility observations. It is shared by Therapy Filters, though each filter may support only a projection of it.
_Avoid_: AM match, selected match

**Matching Stimulus**:
A temporary pure tone or narrow-band noise used during Frequency Matching according to tinnitus type. It is not a Therapy Filter.
_Avoid_: Preview Tone, therapy sound, filter

**Active Band**:
The octave-wide frequency band that De-correlating AM modulates for a confirmed Tinnitus Match.
_Avoid_: AM mode, filter frequency

**Hearing Correction**:
A relative frequency-gain profile confirmed by comparing four 17-tone sequences for equal subjective loudness before using De-correlating AM. It is not a hearing diagnosis or master volume.
_Avoid_: Hearing label, session gain

**Sham Control**:
A research-only De-correlating AM condition that modulates an alternative band. It is not a Therapy Filter, user therapy setting, or Therapy Preset option.
_Avoid_: Sham therapy, AM mode

**Therapy Session**:
An editable configuration with one selected Therapy Filter. It keeps the shared Tinnitus Match and master volume while each Therapy Filter retains its own settings; transient playback status is not part of the Therapy Session.
_Avoid_: Page state, audio context

**Therapy Playback**:
The transient rendering of either a Matching Stimulus or one selected Therapy Filter for a Therapy Session. It is mutually exclusive and may be stopped, paused, or fail without changing the Therapy Session configuration.
_Avoid_: Audio player, PlayState, audio context

**Therapy Preset**:
A named, ready-to-start snapshot of shared matching fields, master volume, one selected Therapy Filter, and the matching observations and settings that filter needs. It does not include playback or retained settings for other Therapy Filters.
_Avoid_: Saved session, filter preset
