# Editing playbook

How Cutscene edits a real recording, and why each rule is there. Every rule names the failure
that produced it. Defaults, not law: the user's brief wins.

## The loop that keeps an edit improving

1. Edit, render a draft, check it.
2. The user says what they dislike in plain words ("I can't read that caption").
3. Fix the edit **and** offer to write the fix down as a rule, a check or a script change, in
   `.cutscene/project.md` for this video or in this playbook for every video.
4. The next edit starts from the improved rules.

*Why: the same note given twice is a process failure, not a taste disagreement.*

## Order of work

1. Transcribe with word timings (`cutscene edit transcribe`); read the phrases file.
2. Remove retakes: keep the last clean take of each line.
3. Trim dead air between phrases (`cut-silences`), keeping a breath.
4. Plan the story before any visuals: hook, proof, the points, the payoff, the call to action.
5. Find visuals for the nouns that carry the story (B-roll order below).
6. Build the composition with every graphic anchored to the word it illustrates.
7. Mix voice, music and effects; measure.
8. Render a draft, check frames, sync, sound and captions; fix; then the final.

## Cutting speech

- **Phrases are the unit.** Cut in the silence between phrases. Natural beats after a comma or a
  list word ("First,") stay. *Failure: removing every pause made sentences collide; adding a
  pause back inside a phrase made the next word sound muted.*
- **Fillers go only when silence surrounds them.** "First, what it does is it reads" is one
  phrase; cutting "what it does is" clips "First". *Failure: a filler cut that clipped the
  words around it sounded worse than the filler.*
- **Wait for the word to finish.** Speech recognisers end words a little before the consonant
  dies away; Cutscene tightens word edges against measured silence and keeps a breath. When the
  recording has music or room noise under it, word ends are estimated (marked `end_estimated`)
  and the joins deserve a listen on the review page.
- **Retakes:** keep the later, clean take; join two takes only where both sides are silent. If
  takes run together, play one take whole. *Failure: a join mid-sentence between two takes
  changed the speaker's tone halfway through a word.*
- **Never speed the voice up.** Tightness comes from removing dead air, not from rate changes.
- **Preserve peaks:** laughs, reactions and emphasis beats stay, and a cut after a punchline
  waits for the laugh.

## Pace

| Pace | Pause trimmed above | Feel |
|---|---|---|
| `tight` | 0.35 s | shorts, energetic tutorials |
| `normal` | 0.55 s | most talking-head videos |
| `loose` | 0.80 s | explainers, interviews, documentary |

Explainers need air; do not cut them so tight that ideas run into each other.

## B-roll, in order of preference

Every shot should move; a still image is a last resort, not B-roll.

1. Real footage of the thing named: the product's demo, the talk, your own earlier video.
2. A real screen recording of the site or app, zoomed to the part being talked about, with a
   visible cursor.
3. An animated interface mock (typing, rows filling, a counter rising), labelled as an example.
4. Generated video, for concrete metaphors only; generic "person at a laptop" reads as stock.
5. Very short crops of a real page (under a second) on a name, price or badge.

Rules that came from mistakes:
- **Never invent numbers, results or a successful test** to decorate a claim.
- **A whole web page at phone size is unreadable.** Crop to the phrase and highlight it on the
  spoken word.
- **Small UI floating in empty space** is the fastest tell of a machine-made edit; fill the panel.
- **Close cookie and consent dialogs** before recording a page; never click "Accept" on camera.
- **Generated video drifts:** many models cut to another angle after a few seconds and turn
  on-screen text to nonsense. Use the first continuous seconds and keep screens small in frame.
  Consecutive generated shots of the same person must match (clothes, room).
- **Each B-roll scene once per video.** A new crop, speed or grade is the same scene
  (`validate-footage` checks the ledger).

## Captions

Styling belongs to cutscene-captions; these are the editing rules it must respect.

- **Short chunks on phrase boundaries,** appearing a frame or two before the first word.
- **One treatment for the whole video.** Mixing boxed and bare captions looks cheap.
- **Measure contrast against the actual pixels behind every caption,** including small
  secondary text. *Failure: white captions over a bright web page were unreadable.* A dark box
  needs a thin light edge or it vanishes on dark footage.
- **Never over the mouth or chin,** least of all in the first second, when the viewer decides
  whether the person is real. A caption that runs across a cut moves with the cut.
- **On shots full of text to read, move captions to a clear zone** instead of hiding them.
- Captions are the speaker's exact words. Never rewrite them.

## Sound

- **Choose music by mood:** confident and darker for claims and news, relaxed for methods.
- **The bed sits clearly under the voice** and ducks under speech (`cutscene edit mix --voice`).
  When the user says the music is too loud, lower the bed relative to the voice and measure the
  change; *a quieter master with the same balance is not a fix.*
- **Effects follow visible actions, not every cut:** soft air on a real spatial move, a damped
  tap when something lands, a dry click for small UI, paper for documents, one short warm tone
  for a tick. Let some cuts pass silently. Vary the files for repeated items so a list does not
  sound like a drum loop. Avoid laser zaps, pitch-drop plops and a whoosh on every cut.
- **Align the audible impact, not the file start.** Many effect files begin with silence.
- **Master to −14 LUFS integrated, true peak at or below −1.5 dBTP, measured on the final
  stereo encode** (`cutscene edit loudness`). *Failure: a mono file measured 3 dB quiet, so the
  stereo delivery shipped too loud.*
- **Never fade the last spoken word.**
- Music on the beat: measure the track (`music-grid`), splice on the kick phase
  (`splice-music`), lay chapters on the grid (`beatgrid`), premix (`mix`).

## Checking the edit

- **Lip sync:** compare cut frames against the original; a matching frame count does not prove
  the right frames were kept. Cutscene renders every cut from the original in one pass.
- **Frame strips across every cut** (a few frames each side) catch one-frame flashes and
  captions over the wrong shot that single screenshots miss.
- **Every word whole:** `cutscene edit verify` re-transcribes the render and compares it with
  the retimed transcript. A transcript is not proof on its own: recognition can guess a clipped
  word that a listener hears broken.
- **The first seconds frame by frame:** nothing over the mouth, the first word not masked by an
  impact sound.
- **Loudness and true peak** on the delivered file.
- **Automated "watch" reviews are leads, not verdicts.** Confirm every complaint on real frames.
- **The user's review is the final gate.**

## Lessons that cost time

- Encoding segments separately and joining them drifts lip sync by about a frame at some joins.
  Select exact frames in one pass.
- Download whole source files and cut locally; seeking a few seconds over the network is slow.
- Browser recorders capture CSS pixels, so high-density screens come out small; capture frame
  by frame.
- Some documentation sites scroll an inner panel; scroll it with the mouse wheel.
- Animate transforms (position, scale), not layout properties.
- A version with fewer cuts, all between phrases, ran a few seconds longer and sounded far
  better than the tightest cut.
- A raw recording sets the ceiling: no hook and no call to action cannot be fixed in the edit.
  Script the hook before recording.
