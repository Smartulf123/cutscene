# Formats, on-screen copy and the pre-export check

Playbooks carried over from Cutscene 1 (rewritten), by kind of video. Pick the one that matches
the request; short-form has its own file ([short-form.md](short-form.md)).

## YouTube talking head (long form)

- Pace `normal`. Remove retakes and dead air; keep the speaker's natural beats.
- Open with the question or claim the video answers, then pay it off at the end.
- Full-frame title cards are for chapter starts, one big number, a thesis or a quote: rarely,
  and never over the first words of the hook. Smaller graphics over the speaker carry names and
  supporting points, one at a time.
- Keep the speaker on screen most of the time in long videos; B-roll supports, it doesn't
  replace the person.
- Chapters: write them from the phrases file, at real topic changes, with timestamps from the
  **edited** transcript.

## Explainer

- One idea per beat; if it isn't said, it isn't drawn ([storytelling.md](storytelling.md)).
- Plant the question in a section card early and pay it off at the end.
- About twenty on-screen words per section; labels of one or two words.
- Pace `normal` or `loose`: explanations need room.
- With an AI voice (cutscene-voice): put picture, music and effects on one clock (a beat grid)
  so everything moves when a line changes; re-transcribe the narration and compare with the
  script before every render; level every line to the same loudness and limit only peaks. Don't
  lay a narrator over footage of a real person talking: viewers think that person is speaking.

## Tutorial and screen recording

- Show the real thing: the real app, real clicks, a visible cursor; zoom to the part being
  discussed rather than shrinking a whole screen.
- Cut waiting (loading, typing long strings) but keep the moment a result appears.
- When a camera and a screen were recorded separately, line them up with
  `cutscene edit sync camera.mp4 screen.mp4` before editing.
- Never show passwords, keys or private data; blur or re-record.

## Podcast and interview

- Pace `loose`; leave air at speaker changes (around half a second).
- Retakes are rarer; fillers and false starts are common: review them in context, many are part
  of how a person talks.
- For long recordings (an hour or more) use `rough-cut` for a fast first pass, then transcript
  tools on the result; use `highlights` to find standalone moments for shorts.
- Hum and room noise: `clean-audio` on a copy; listen to a quiet part before and after.

## On-screen copy

- Write like a person: plain words, short lines, the user's own facts. Titles and cards are two
  to eight words.
- Avoid the patterns that read as machine-written: "not just X, but Y", "it's not X, it's Y",
  inflated words (pivotal, seamless, unlock, elevate, game-changer, delve, robust, landscape,
  testament), sales words (groundbreaking, next-level), three-part slogans ("Faster. Smarter.
  Better."), dashes in short copy.
- Never invent statistics, names, quotes or results. Use numbers the user said or gave;
  otherwise leave the stat card out or ask.
- Captions are the speaker's exact words.

## Motion

- Motion explains; it doesn't decorate. One thing moves at a time.
- Entrances ease out, quick and confident; exits are faster than entrances.
- Nothing within about 60 px of the frame edge; big type, strong contrast, one accent colour.

## Pre-export check

Run before any final render (and say which ones you checked):

- **No slivers.** A piece of footage shorter than about a quarter second between two cuts reads
  as a flash. (The edit tools fold slivers under 0.04 s into the cut automatically; look at the
  rest on the review page.)
- **Big cards never overlap each other**, and text cards don't stack on top of each other.
- **Captions and lower thirds** share the bottom of the frame: check they don't collide.
- **Captions over a full-screen card** can be fine; if it looks busy, shorten the card or move it
  into a pause.
- **Nothing plays after the footage ends** (a graphic over black).
- **The same effect isn't applied twice** at the same moment.
- **Every captioned clip has a transcript**, and captions come from the retimed one.
- **Loudness measured on the encode** (−14 LUFS, ≤ −1.5 dBTP).
