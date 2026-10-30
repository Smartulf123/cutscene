<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# Voiceover carve

**The problem it solves.** A music bed under a voice makes the voice hard to
follow. The reflex is to duck the whole bed, which works and costs the bed all of
its presence — the music goes limp for the entire voiceover. But the voice does
not need the whole spectrum. It needs the few bands it actually occupies. Carve
takes only those, and the bed keeps its low end and its top, so it is still music
while the voice is still intelligible.

**It is a relationship, not an effect.** The settings live on the _bed_ — the
track that gets processed — and they name the voices to listen to, exactly as a
sidechain compressor does: you select the track that gets quieter and pick what
makes it quieter. **Never put a carve on a voice track.** A voice carved against
itself is a bug, not a subtle mix choice.

**Every voice, not one of them.** `sources` is a list, because a bed usually runs
under a whole sequence — a narrator, an interview answer, a second presenter. They
are summed onto the bed's own clock before anything is measured (`mixCarveSources`),
so one analysis covers all of them: the bands come from all the speech there is, and
the envelopes rise wherever any of it is happening. Voices that never play while the
bed does are left out; they cannot mask it.

**A carve against more than one clip id is wrong. Group the clips and carve
against the group.** This is an invariant, not a tip. Naming clips one by one has
to be exhaustively right and stays right only until the next edit — a fourth
narration clip added later plays outside the carve's awareness, and the bed
fails to duck under it silently. Naming the group instead resolves membership at
analysis time, so a clip added to the group later is covered without touching
`sources` at all:

```html
<!-- group the narration, then carve the bed against the group -->
<audio id="vo-intro" data-audio-group="voiceover" …></audio>
<audio id="vo-middle" data-audio-group="voiceover" …></audio>
<audio id="vo-outro" data-audio-group="voiceover" …></audio>

<audio id="music" data-fx-carve='{"enabled":true,"sources":["voiceover"],"strength":0.8}' …></audio>
```

A `sources` list naming two or more plain clip ids instead of a group is caught
by the `audio_carve_ungrouped_sources` lint rule — it still works, but it is the
version that silently rots when a clip is added.

**Keep the carve group a voice group: no bed, no SFX, no music.** A group id in
`sources` resolves to every _current_ member on _every_ analysis, so the group
you name is the group you get later — not the tracks that were measured when it
was written. Two ways that bites:

- **The bed in its own source group.** It is handed to itself as a voice and
  carved against its own content — the "never carve a track against itself" rule
  arriving one re-analysis later.
- **An SFX or music clip in the voice group.** It enters the sidechain on the
  next analysis and the bed starts ducking under a whoosh, even though the run
  that wrote the attribute never measured it.

Both are invisible at the moment the carve is written: the analysis sums the
voices it detected and never round-trips through group resolution, so the first
pass is genuinely correct and only the next one is wrong. So give each role its
own group — `music` for the bed, `voiceover` for the narration, `sfx` for the
hits — and keep the group named in `sources` holding nothing but voices.

`carve.mjs` refuses to write the group form when it sees either case, records
clip ids, and says on stderr which member blocked it. The
`audio_carve_ungrouped_sources` rule then points at the arrangement instead of
the CLI quietly persisting a wider carve than it measured.

A voice that this run left out is **not** one of these cases and does not block
the group form: `carve.mjs` only analyses voices that overlap the bed, and
picking up a clip that plays later without an edit to `sources` is the whole
reason to name the group.

## One bus for many tracks

Membership alone is enough to carve against, as above — but add an
`<hf-audio-group>` element with that id and the group becomes a real submix bus:
one chain, one fader, one automation clock for every member.

```html
<hf-audio-group
  id="voiceover"
  data-label="Voiceover"
  data-volume="0.9"
  data-fx-chain='{"version":1,"nodes":[
    {"type":"compressor","id":"g1","params":{"threshold":-18,"ratio":3}},
    {"type":"peaking","id":"g2","params":{"frequency":3000,"gain":2,"q":1}}]}'
></hf-audio-group>

<audio id="vo-intro" data-audio-group="voiceover" …></audio>
<audio id="vo-middle" data-audio-group="voiceover" …></audio>
```

**Reach for the bus when the same treatment belongs on several tracks.** Four
narration clips that each want the same compressor is four chains to keep in
step, and they drift the moment one is edited; on the bus it is one chain, and
the compressor sees the whole voice rather than each clip in isolation — which is
the point, since a compressor cannot ride a sequence it only hears a third of.
Per-clip chains remain right for what is genuinely per-clip: one noisy take that
needs its own de-esser.

| On the bus        | Does                                      |
| ----------------- | ----------------------------------------- |
| `data-fx-chain`   | one chain over the summed members         |
| `data-automation` | envelopes on the bus, in COMPOSITION time |
| `data-volume`     | one fader for every member (default 1)    |
| `data-label`      | the display name; falls back to the id    |
| `data-hidden`     | drops every member from the mix           |

**Group automation is composition time, not clip time.** A bus has no
`data-start` — members are already at their composition positions when they
reach it — so `t: 0` in a group lane is the start of the composition, not of any
clip. A lane on a clip is clip-local; the same numbers mean different instants on
the two, which is the one thing to get right when moving an envelope from a clip
up onto its bus.

**A carve stays on the clip.** `data-fx-carve` is not a group attribute. The bed
being carved is a single track, and it is that track which carries
`data-fx-carve` — pointed AT a group, per the rule above. Group and carve meet in
`sources`, not on one element. A carve written onto a bus is half an effect
applied twice: the level half measures the bed's own audio, which a bus has none
of, so only the filters survive — and a bus and its members are one signal path,
so the bed then runs through the bus's filters AND its own. The
`audio_group_carve_attr` lint rule catches it.

**One effect across the whole mix: the master bus.** A clip names exactly one
group, so a limiter or EQ over everything cannot be a group. Put it in
`data-fx-chain` on the top-level composition root: it runs once over the sum of all clips and groups, after each
group's chain and fader. A delivery ceiling is the usual use — `truepeak` last in
the master chain. Only the top-level root is read as the master bus; a
sub-composition root's `data-fx-chain` is not applied inside a parent composition. No master automation.

**One clip is not a bus.** A group exists to give several tracks one chain, one
fader and one clock. Wrapping a single clip in a bus buys nothing the clip's own
`data-fx-chain` does not already do, and it doubles the places a later edit has
to land. The one reason to do it anyway: a bus's automation clock is composition
time, so a single-member bus is how a lane on that clip gets composition-time
timing.

**One knob.** `strength` is 0..1 and derives everything: how deep to cut, how
many bands, how wide, how far to favour intelligibility over raw voice energy,
how far the level may drop, how far under the voice to aim. Those six move
together in any real mix — a gentle carve is a shallow cut in few bands with
little ducking, a hard one is deeper in more bands with more — so they are one
relationship written once, in `carveProfile`. `carve.mjs` defaults to `0.8` —
six bands from 250 Hz to 2.5 kHz cut about 7 dB each and 15 dB at 1.6 kHz, with
19 dB of level room — because a bed under narration has to get out of the way
first and be music second; `0.25` (a 6 dB dip in three bands, 6 dB of room) kept
the bed present but still let it fight the voice, and was judged too weak in
practice. At `0.5` the dip reaches 10 dB, which is where a carve starts being
heard as an effect rather than as room for the voice. Drop the strength when the
bed is the point and the voice is sparse. `0` is spectral only — one band, no
level match at all.

**Carve by default — required whenever music plays under a voice.** A bed
under any voice track (narration, avatar speech, interview, voiceover) gets a
carve as part of finishing the mix, not as a polish step to get to if there is
time. Place both tracks, run the command below (default strength `0.8`; add
`--bed` / `--voice` when detection picks wrong), confirm the written
`data-fx-carve`, `data-fx-chain` and `data-automation` with `cutscene check`,
and only then render. A volume duck on its own is not a finished mix: it leaves
the voice and the bed fighting in the 1–3 kHz band and costs the bed all of its
presence for the whole voiceover. Skip the carve only when there is no voice for
the music to sit under — a music video, a title card, a montage cut to the track.

**It always follows the voice.** There is no static mode: a fixed depth thins the
bed through every pause, and once you have heard both there is no reason to want it.
Every value becomes an envelope of the speech's own level — silence leaves the bed
alone, a loud passage pushes the carve to full depth — written as ordinary automation,
which is why the lanes show up in the timeline and can be edited afterwards.

**Level matching is part of it.** Spectral carving cannot fix a bed that is
simply louder than the voice. So the carve also measures how far over the voice
the bed sits and writes a `gain` stage driven by an envelope. That envelope releases slowly on
purpose — music that snaps back to full the instant a word ends sounds like a
machine doing it.

**Running it.** In Studio the carve is one module at the top of a track's effect
rack — voice, strength, and the analysis it produced, in one card. It is
there whenever another track could be the voice, and a bed with exactly **one**
candidate above it is carved by default, at the default strength:
that is what a bed under narration wants, and the module is where you change or
switch it off. Several candidates leaves the picker waiting rather than guessing.
Headless —
which is the path when you are authoring a composition rather than editing one:

```bash
node "<this skill's folder>/scripts/carve.mjs" --comp index.html
```

That is the whole command. It finds the voice and the bed itself, carves
at the default strength, and prints what it decided:

```
bed    music-bed (name looks like music)
voice  narration (only track left)
carve  strength 0.8, 1 voice
bands  250Hz -7.4dB q2.06, 400Hz -7.4dB q2.06, 630Hz -7.4dB q2.06, 1000Hz -7.4dB q2.06, 1600Hz -14.8dB q2.06, 2500Hz -7.4dB q2.06
level  273-point envelope, floor -19.2 dB
```

Name the tracks with `--bed` / `--voice` (repeatable) when the automatic choice is
wrong, `--strength` to push it, `--dry-run` to see that report and write nothing.

**How it picks the tracks.** Names first, because that is what you already told it
and the answer is explainable — `classifyAudioName` in core, the same classifier
Studio's own picker uses, so the two cannot disagree. A track whose id or filename
looks like music (`music`, `bgm`, `bed`, `score`…) is the bed; everything else that
plays over it and is not SFX-shaped is a voice. Audio elements are preferred: video
counts only when no audio track is left to be the voice, or every B-roll clip in the
composition would read as somebody talking. **It refuses when it cannot tell which
track is the bed** rather than carving the wrong one — typing one id is cheap.

Same analysis functions as the panel, so the result is identical. Needs `ffmpeg`
on PATH and `@hyperframes/core` installed in the project (ask the user first, then
`npm i -D --save-exact @hyperframes/core@0.8.162`) — the CLI inlines core rather than shipping it, so it cannot
be borrowed from there.

**What it writes** is an ordinary chain of peaking filters plus a gain stage,
tagged `fromCarve`. That tagging is the whole trick: a re-run replaces the
previous carve and leaves every effect you built by hand — and every lane you
drew by hand — exactly where it was. So re-carving at a new strength is safe and
repeatable, and `data-fx-carve` exists so the settings can be read back rather
than guessed from the filters.
