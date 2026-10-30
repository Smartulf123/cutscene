# Storytelling for the visual layer of long videos

How to design what a talking-head video *shows* so a viewer is still oriented ten minutes in.
The failure this prevents: a new, unrelated graphic every few seconds. No single graphic is
wrong, so the feedback arrives as the vague "confusing" or "too much going on".

## One idea per beat

- **If it isn't said, it isn't drawn.** Every shape is a labelled thing, a connection between
  labelled things, the subject that travels, or quiet background. *Failure: unlabelled
  decorations in the same style as the meaningful shapes made viewers decode noise.*
- About twenty words on screen per section; labels of one or two words; no sentences on screen.
- Each graphic matches the words at that moment and enters just before its anchor word
  (`validate-beat-sync`).

## One world that persists

- The video lives in one space that never resets. What was shown stays where it was; new
  material is added to it.
- Decide the spatial grammar early and keep it (for example: left to right is toward the
  outcome). Break it once, on purpose, for meaning.
- **Move the camera through the world instead of cutting to new pictures.** A push-in means "look
  closer at what you already know"; the pull-back is where the payoff lands.
- Work at three distances: the whole world (orient, payoff), a region (most of the time), one
  detail (a number, a decision). Move between neighbouring distances.
- Frame by exact regions, with edges between labels, and reuse the same framing for the same
  purpose. *Failure: framing by scale factor sliced words at the frame edge.*
- Never let two moves on the same subject run back to back; merge them into one gesture.
  *Failure: a zoom, a stop, then a wipe read as a glitch and a pause.*
- No label within about 60 px of the frame edge.

## Attention is a spotlight

- Exactly one element at full brightness at a time; what was already shown stays visible but
  quiet. Hierarchy comes from the contrast between active and quiet, not from dimming
  everything. *Failure: an overall dim world was unreadable on a phone.*
- A label always follows its element's state.
- A prop that has done its job leaves (opacity 0) instead of lingering half-visible.
- One animation controls an element's opacity at any moment. *Failure: two overlapping fades on
  the same element flickered in the assembled render though each looked fine alone.*

## Open loops are spatial

Leave something visibly incomplete in the world and come back to it; never say "we'll get to
that". Plant it in the hook, show it again at every section boundary, advance it visibly, and
close on the image you opened on.

| Script shape | The world | What is incomplete |
|---|---|---|
| N parallel items | N empty slots | the slots |
| One deep process | the whole pipeline | a missing link |
| Levels | a stack | the top, as a ghost |
| Comparison | two columns on one axis | one column, or the scorecard |
| News | a timeline | the future side |
| Tutorial | the finished thing, ghosted | every part not yet built |

A counter needs a name as well as a number: pair "03" with the current item's one- or two-word
label, changing together.

## Pacing

- Vary move duration with distance travelled; one global preset feels mechanical.
- Any stretch of more than about a second and a half with nothing new during dense explanation
  feels dead; a small graphic or a B-roll insert helps. Holds that let a point land are fine.
- Leave air in the cut for explainers ("normal" or "loose" pace).
