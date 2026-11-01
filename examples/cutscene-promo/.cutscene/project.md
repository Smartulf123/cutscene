# Project memory

Short notes the agent keeps for this video: decisions, approvals (with the date) and what was
checked. Read this before asking the user anything; never ask twice for an approval listed here.

## Approvals
- 2026-10-30 brief and script approved (7 beats, about 35 s)
- 2026-10-30 voice: designed female narrator with OmniVoice (non-commercial weights, fine for the README)
- 2026-10-30 narrator reference voice approved by the user after listening (seed 42)
- 2026-10-30 music: an original bed made for this video, plus the bundled sound library

- 2026-10-31 rework approved: about 42 s storyboard opening on Kasper's own take, edited for real by Cutscene; Blender shots removed (Blender is no longer part of Cutscene)
- 2026-10-31 edit plan for footage/take.mp4: cut pauses (pace normal) and remove the first "I don't open any editor" (candidate c001, later take kept); 29.6 s to about 11.6 s
- 2026-10-31 downloads: 4 Pexels clips (9935090, 12570193, 9981939, 36328529; Pexels License), about 98 MB
- 2026-10-31 captions spell the speaker's name "Kasper"

- 2026-11-01 new take (footage/take.mp4, recorded with OBS noise suppression, compressor and limiter): pauses cut 23.5 s to 16.0 s, no retake; verified (41 words kept, all heard); later beats moved 2.5 s, video now 47.9 s. The 2026-10-31 take is kept as footage/take-2026-10-31.mp4.

## Decisions
- Lives in the Cutscene repo as examples/cutscene-promo; it replaces the README screenshot
- Create, don't export: the user renders the final file with Export

## Checks
- 2026-10-30 voice: 7 of 7 lines verified by Whisper (b6 flagged "very fast", passed)
- 2026-10-30 3D: logo (Tier 2, EEVEE), blender (Tier 2, Cycles, 60% scale), title (Tier 1) rendered; alpha checked
- 2026-10-30 cutscene check: 0 errors, 7 warnings (file size, track density, one DOM measurement in the montage captions); stills at 1.5, 2.9, 3.6, 5.5, 6.9, 8.8, 11.8, 13.4, 15.2, 16.9, 18.9, 20.6, 23.2, 24.6, 26.2, 27.9, 30.4, 34.5 s look right
- 2026-10-30 draft preview shown to the user (checkpoint 1)

## Rules from the user's notes
- 2026-10-31 The first cut felt bland and too "HTML only": show real footage, and show Cutscene editing it for real.
- 2026-10-31 No Blender anywhere in this video.
- 2026-10-31 No 3D at all (no Three.js either): the logo is the flat mark, the montage's 3D shot became a face cam.
- 2026-10-31 No buzzing/glitch sounds under the edit animation (6-8 s); keep effects soft.
- 2026-11-01 The logo is the favicon's mark exactly (cream #F4F3EE tile, dark #0B0D12 cut), never recoloured.
- 2026-10-31 No progress ticks and no decorative glowing dots: they look "AI typical".

## Edit log

- 2026-10-31 13:42 edit transcribe: 43 words, 29.6 s, 22 word edges tightened, 1 estimated (engine )
- 2026-10-31 13:43 edit cut-silences: 13.20 s removed in 6 cuts (44.5%), dry run; edl .cutscene/edit/take.silence-edl.json
- 2026-10-31 13:43 edit find-cuts: 2 candidates (1 restart, 1 repeat), awaiting review
- 2026-10-31 13:46 edit find-cuts: 2 candidates (1 repeat, 1 restart), awaiting review
- 2026-10-31 13:46 edit apply-cuts: 15.50 s removed in 6 cuts (52.3%), rendered; edl .cutscene/edit/take.mistakes-edl.json; self-check passed
- 2026-10-31 13:46 edit verify: passed, 100% of words heard again
- 2026-10-31 13:47 edit reframe: 9:16 faces crop (5 keyframes) -> C:\Users\kaspe\OneDrive\Desktop\Video Editing AI Program\examples\cutscene-promo\.cutscene\edit\take.clean.reframed-9x16.mp4
- 2026-11-01 10:39 edit transcribe: 41 words, 23.5 s, 14 word edges tightened, 1 estimated (engine )
- 2026-11-01 10:42 edit cut-silences: 7.47 s removed in 6 cuts (31.8%), rendered; edl .cutscene/edit/take.silence-edl.json; self-check passed
- 2026-11-01 10:42 edit find-cuts: 0 candidates (none), awaiting review
- 2026-11-01 10:42 edit verify: passed, 98% of words heard again
