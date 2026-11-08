# Glossary

Domain terms used in code, tests and docs. Architecture belongs in the [overview](./overview.md).

| Term | Meaning | Avoid |
| --- | --- | --- |
| Therapy Filter | A selectable way of shaping or generating therapy sound. White Noise and De-correlating AM are the current Therapy Filters; more may be added later. | Page, route, AM mode |
| Tinnitus Frequency | The frequency a person identifies as matching their tinnitus and which most Therapy Filters use for configuration. | Filter frequency, selected tone |
| Frequency Matching | The process of finding a Tinnitus Frequency by listening and comparing frequencies. It is a shared capability for most Therapy Filters, not a Therapy Filter itself. | Filter selection |
| Frequency Visualization | A persistent view of the current Therapy Playback spectrum, the selected Tinnitus Frequency, and the configured effect of the selected Therapy Filter. It can help with Frequency Matching but does not measure perceived or calibrated loudness. | Spectrum chart, canvas, loudness meter |
| Tinnitus Match | The confirmed result of Frequency Matching: an exact Tinnitus Frequency together with the tinnitus type and frequency-audibility observations. It is shared by Therapy Filters, though each filter may support only a projection of it. | AM match, selected match |
| Matching Stimulus | A temporary pure tone or narrow-band noise used during Frequency Matching according to tinnitus type. It is not a Therapy Filter. | Preview Tone, therapy sound, filter |
| Active Band | The octave-wide frequency band that De-correlating AM modulates for a confirmed Tinnitus Match. | AM mode, filter frequency |
| Hearing Correction | A relative frequency-gain profile confirmed by comparing four 17-tone sequences for equal subjective loudness before using De-correlating AM. It is not a hearing diagnosis or master volume. | Hearing label, session gain |
| Sham Control | A research-only De-correlating AM condition that modulates an alternative band. It is not a Therapy Filter, user therapy setting, or Therapy Preset option. | Sham therapy, AM mode |
| Therapy Session | An editable configuration with one selected Therapy Filter. It keeps the shared Tinnitus Match and master volume while each Therapy Filter retains its own settings; transient playback status is not part of the Therapy Session. | Page state, audio context |
| Therapy Playback | The transient rendering of either a Matching Stimulus or one selected Therapy Filter for a Therapy Session. It is mutually exclusive and may be stopped, paused, or fail without changing the Therapy Session configuration. | Audio player, PlayState, audio context |
| Therapy Preset | A named, ready-to-start snapshot of shared matching fields, master volume, one selected Therapy Filter, and the matching observations and settings that filter needs. It does not include playback or retained settings for other Therapy Filters. | Saved session, filter preset |
