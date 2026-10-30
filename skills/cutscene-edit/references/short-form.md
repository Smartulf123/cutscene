# Short-form edits (shorts, reels, short ads)

## The first gate

**"In the first 3 seconds, is someone convinced they need to watch until the end?"**

Everything else (effects, polish, asset count) comes after this. It is an editorial judgement
until real audience data exists: record the reason, never a made-up percentage.

For each candidate opening write down:
- the **benefit**: what the viewer will have by the end;
- the **open question** the first seconds raise;
- the **evidence visible by second three** (an action, a result glimpse, a contradiction, a face
  reacting);
- the **payoff time**: where in the video the question is answered.

Reject vague teasing and any promise the footage cannot keep. *Failure: an opening that grabbed
attention but gave no reason to stay lost viewers right after it.*

### Treat the first three seconds as their own edit

- Draft **three materially different openings** from the same truthful speech: problem first,
  result first, recognition first. Render the first three seconds of each cheaply and compare
  for clarity, curiosity, muted comprehension and follow-through. Record the choice and why;
  don't pick the loudest.
- **The first frame must mean something.** No logo bumper, no added silence, no flash for its own
  sake, no stamp that every video gets.
- **It must work muted:** the topic or tension is clear at once, and something new is revealed
  before second three.
- **Sound in the opening:** trim the effect's lead-in so its impact lands with the picture (within
  two frames), and keep the first spoken word clear of it. Loudness is not a hook.
- Inspect the encoded opening frame by frame: first frame, impact, reveal, return to the edit.

## Open loops

An open loop is an honest question the viewer can see is unanswered, closed later with spoken
evidence. Keep one main loop and at most one secondary loop open at once. Close the promised
point **before** any call to action; a request to comment is never the only answer.

A recurring object is not a loop by itself: show what is missing, then visibly change that state.

Ledger: `.cutscene/edit/OPEN-LOOPS.json` (times in seconds on the edited video):

```json
{
  "opening": { "benefit": "Cut a 20-minute take to 8 in one pass", "evidenceBy3": "the timeline collapsing on screen", "payoffTime": 41.2 },
  "loops": [
    {
      "id": "main",
      "question": "What are the three steps?",
      "object": "three empty slots beside the editor",
      "setup": 2.1,
      "updates": [{ "time": 12.4, "state": "slot one fills: transcribe" }],
      "closure": 38.0,
      "resolution": "all three slots filled and the finished cut plays",
      "supportingSpeech": "and that's the whole loop: read, cut, check"
    }
  ]
}
```

`supportingSpeech` is verbatim when quoted; label a paraphrase as one.

## Structure

hook → open question → escalation → evidence → payoff → (optional) call to action.

- Each item in a spoken list gets its own shot.
- Name things before using them; every number on screen must be explainable from what the
  short showed.
- Never assemble a call to action the speaker did not say.
- From a long video: put the value or claim first, then the proofs in the original's order, and
  end on a complete takeaway (`cutscene edit highlights`, then `--make`).

## Rhythm

- Vary density by sequence: a quick cluster of discoveries, a brief breath, then a payoff. A
  regular cut every N seconds is a metronome, not rhythm.
- Long holds are fine when a developing action or the speaker's conviction earns them; write the
  reason down (`holdReason` in the plan).
- Audit duplication: narration and captions carry the words; graphics show the example, the
  relationship or the consequence, not a third copy of the sentence.
- For every shot note what the viewer expects and what new information or consequence it gives.

## Frame and safe zones (1080×1920)

- Keep text in the phone-safe area: clear of the top tenth and the bottom fifth of the frame,
  and away from the right edge, where the platform's buttons sit.
- Place captions against the real face position in every layout; never over the mouth.
- Contain the full source frame when a tighter crop hides the action; a filled frame is useless
  if the viewer cannot see what happens.
- Each requested aspect ratio is framed and reviewed on its own, opening and ending included.

## Review

- Watch the rough cut uninterrupted when possible and write timestamped weak spots (predictable
  stretches, unresolved promises, reading overload) to `ENTERTAINMENT-REVIEW.md`.
- When only stills and signal analysis are available, say so; playback finishing is not a
  viewing.
- Never invent retention numbers or call an internal comparison an A/B test.
