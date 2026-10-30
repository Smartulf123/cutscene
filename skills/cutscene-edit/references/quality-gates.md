# Quality gates

Apply these to the **encoded** result, not only to the composition. A validator passing proves
structure, not taste: say which checks were automated and which were looked at or listened to.

| Gate | Evidence | Fails when |
|---|---|---|
| Reason to stay | The first-three-seconds note: benefit, open question, evidence by 3 s, payoff time | Attention with no reason to continue; vague tease; promise never kept |
| Story | Retained script reads as hook → argument → payoff → CTA | A repeated retake survives; a needed qualification was cut; an unrelated insert |
| Open loops | `OPEN-LOOPS.json` with setup, updates and closure before the CTA | A decorative question mark; the answer withheld or never given |
| Plan agreed | Plain-words plan and the user's OK in `.cutscene/project.md` | Cutting started before the strategy was agreed |
| Cuts reviewed | Decisions file and review page; approved candidate ids | A candidate applied unread; emphasis cut as a stutter |
| Speech intact | `cutscene edit verify` passed: kept words heard again, offsets near 0 | A clipped consonant, a missing word, a muted word at a join |
| Timelines | Every transcript and EDL names its timeline; captions from the retimed transcript | Captions ahead of or behind speech; times from the raw recording on the cut video |
| Lip sync | One-pass render from the original; frame strips across cuts | Lips behind the voice by the end; one-frame flashes |
| Graphics on words | `validate-beat-sync` passed (−0.2…+1.8 s) | A graphic lands late or long before its word |
| Cadence | Shot and visual-event map; holds have a reason | Long stretches with nothing new and no reason; a metronomic template |
| Layout | Every hero frame at full size and at phone size | Face cropped, mouth covered, text outside the safe zone |
| Caption contrast | Measured against the pixels behind each caption | White on a bright page; a dark box lost on dark footage |
| Motion | Contiguous frames across every transition | A black flash, a one-frame pop, an unexpected freeze |
| B-roll | Moving footage, each scene once, ledger with hashes (`validate-footage`) | A still with a zoom passed off as B-roll; the same scene reused |
| Authenticity | Saved sources for logos, product pages, portraits | An approximated logo; invented results; a synthetic face shown as real |
| Sound | Measured stems and mix; effects aligned to visible actions | Voice buried; whoosh on every cut; effects louder than speech |
| Loudness | `cutscene edit loudness` on the final stereo encode | Outside −14 ±1 LUFS; true peak above −1.5 dBTP |
| Delivery | Each requested ratio checked; duration; fast-start MP4 | Last syllable cut off; stale export; wrong aspect ratio |

## Calibrate checks with negative controls

A caption shifted by 0.3 s, a one-frame gap between scenes and an omitted word must each fail
the relevant check. Never loosen a check until the current output passes.

## Honest limits

- A waveform proves levels and timing, not that the music suits the moment.
- Speech recognition proves the words, not that every join sounds natural.
- Contact sheets prove layout, not motion.
State which of these was unavailable.
