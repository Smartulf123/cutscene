# The Cutscene workflow

How a video goes from an idea to an approved preview. Each gate writes a file in the project's
`.cutscene/` folder, so any session (or another agent) can pick up where the last one stopped.

## Gate 1: the brief (`.cutscene/brief.md`)

Before asking anything, read what you already have: the user's message, `.cutscene/project.md`,
an existing brief, their brand files, the links they gave. Ask only for what is still missing,
in one message, and offer concrete choices ("15 s landscape intro, calm and premium, or 8 s
punchy portrait teaser?") rather than open questions.

Write the brief in this shape:

```markdown
# Brief: <working title>

- Purpose: what the video must achieve
- Audience: who watches it, where (YouTube, TikTok, a website, a pitch)
- Format: landscape 1920x1080 | portrait 1080x1920 | square 1080x1080, <fps> fps
- Length: about <n> seconds
- Message: the one thing viewers remember
- Must-haves: logo, product name, call to action, URLs, facts that must be exact
- Voice: none | narrator (describe the voice) | the user's own recording
- 3D: none | Tier 1 (Three.js) | Tier 2 (Blender), and for what
- Music and sound: none | mood | the user's file
- Look: brand colours and fonts if given, otherwise a direction (see Gate 3)
- Out of scope: what this video is not

Status: draft | approved <date>
```

Show it to the user in a few lines. **Build nothing until they approve it.** When they do, set
`Status: approved <date>` and add the approval to `project.md`.

## Gate 2: the project

```bash
cutscene init <folder>
```

`init` makes the engine project and Cutscene's `.cutscene/` folder with `project.md`. Move the
approved brief into `.cutscene/brief.md` if you drafted it elsewhere. If the user gave footage,
copy it into the project (`assets/`) rather than pointing at their originals.

## Gate 3: the look (`.cutscene/look.json`)

Every video gets its own look: palette, a type pair, a motion character (`snappy`, `smooth`,
`bouncy`, `cinematic` or `editorial`) and texture. Take it from the user's brand when there is
one; otherwise choose a direction from the brief. Don't reuse the look of the user's last video
unless they ask. The `cutscene-design` skill writes and checks `look.json`; 3D shots read its
palette and type so Blender and Three.js renders match the graphics.

```bash
node "<cutscene skill folder>/../cutscene-design/scripts/look.mjs" new --brief .cutscene/brief.md --against <folder with the user's earlier projects>
```

`--against` makes the new look differ from the user's recent videos; add `--brand <file.json>`
for brand colours and fonts. Details: the cutscene-design skill's `references/look-system.md`.

## Gate 4: the storyboard (`.cutscene/beats.json`)

Split the video into beats: a few seconds each, one idea per beat. For every beat decide what's
on screen, what's said, which 3D shot or graphic appears and which sound lands. Write the beat
sheet ([beats.md](beats.md)) and show the user a compact table:

| Time | On screen | Voice | Sound |
|---|---|---|---|
| 0.0–2.4 s | 3D logo turns in | "Meet Cutscene." | whoosh at 0.4 s |

Get a yes before building. Small timing changes later don't need a new approval; changing the
story does.

## Gate 5: build

Order that avoids rework:

1. **Voice first** when there is narration (`cutscene-voice`). Spoken lines set the real
   timing; update the beats with the measured durations before animating.
2. **Compositions** (`cutscene-compose`, `cutscene-animate`), timed from the beat sheet.
3. **3D shots** (`cutscene-3d`): stills first, the full render only after the stills look right.
4. **Captions, music and sound** (`cutscene-captions`, `cutscene-audio`).

Each part fills only its own beat fields and leaves the rest alone.

## Gate 6: checkpoint 1 (stills, then the draft preview)

1. `cutscene check` and fix every error. Review warnings.
2. `cutscene snapshot` at the important moments (each beat's middle, every transition, the
   last frame) and look at the images yourself. Check:
   - nothing cut off at the edges, text readable at phone size, no overlaps;
   - colours and fonts match `look.json`;
   - no blank or black frames at transitions;
   - 3D clips have clean transparent edges;
   - captions don't cover faces or key graphics.
3. Run the same-look check against the user's earlier videos and fix a look that's too close:
   `node "<cutscene skill folder>/../cutscene-design/scripts/look.mjs" compare <project> --against <folder with earlier projects> --strict`
4. Fix what you find, then start the preview with `cutscene preview <project> --background`,
   give the user the URL, and ask for notes. Say what you'd like them to look at.

The preview keeps running in the background and updates as you edit. Check it with
`cutscene preview <project> --status`; stop it with `cutscene preview <project> --stop` when
the user is done reviewing or the session ends.

## Gate 7: checkpoint 2 (final look)

Apply the notes, check and look at stills again, then show the preview again. The video is
done when the user says it is. Write the approval in `project.md`.

## Gate 8: render (only when asked)

Render the final file only when the user asks for it (`cutscene render`; options in the
`cutscene-render` skill). Previews, stills and checks never need permission; a final render
does.

## Project memory (`.cutscene/project.md`)

`cutscene init` creates it. Keep it short; it's what a new session reads first.

```markdown
## Approvals
- 2026-10-29 brief approved
- 2026-10-29 storyboard approved (6 beats, 14 s)
- 2026-10-29 voice clone permission confirmed by the user for "narrator" (their own voice)

## Decisions
- Portrait 1080x1920 for TikTok; captions in the lower third

## Checks
- 2026-10-29 cutscene check: 0 errors; stills at 0.5, 3.2, 7.8, 13.9 s look right

## Rules from the user's notes
- Never put text over the product's face; keep a 120 px margin
```

**Approvals persist.** Before asking the user to approve anything, look here. If it's listed,
it's approved; don't ask again in this or any later session.

## Notes become rules

When the user gives feedback:

1. Fix the specific thing.
2. Ask yourself what general rule would have prevented it ("keep text off faces", "slower
   ease-outs", "no exclamation marks").
3. Write that rule under "Rules from the user's notes" and follow it for the rest of the video.
4. If the same note comes up in more than one video, suggest saving it as part of the user's
   brand (the `cutscene-design` skill keeps brand rules).

## When something fails

- Read the `error.hint` in the JSON result; it says how to fix it.
- `NEEDS_CONSENT`: show the user what would be downloaded and ask.
- Engine missing or broken: `cutscene doctor`, then `cutscene setup`.
- A part isn't installed (`PART_MISSING`): tell the user to reinstall the Cutscene plugin.
- Never work around a failed check by deleting the check or the content it complains about
  without saying so.
