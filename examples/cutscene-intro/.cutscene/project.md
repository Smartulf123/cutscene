# Project memory

Short notes the agent keeps for this video: decisions, approvals (with the date) and what was
checked. Read this before asking the user anything; never ask twice for an approval listed here.

## Approvals

- 2026-10-30: brief approved by the owner, as the showcase for the README.

## Decisions

- Look: Cutscene brand colours; DM Serif Display + Space Grotesk. The orange "cut" bar is the
  one recurring device.
- 2026-10-31: everything is flat 2D now. The logo is the `assets/logo.svg` mark animated with
  GSAP in b1, and the title is a GSAP title (`compositions/title.html`). The middle b3 part is
  "Footage".
- 2026-10-31: b3 voice line trimmed to "It animates and speaks every line." (the middle words cut
  out of the existing take with FFmpeg, not spoken again).
- Narrator: OmniVoice design "female, young adult, american accent", seed 42 (non-commercial
  weights; fine for an open-source README).
- Beat 3 is 3.5 s (line is 2.15 s since the trim); video is 12.4 s.
- No sound effects yet: the bundled set's licence is still being checked.

## Checks

- 2026-10-30: 4 voice lines spoken and verified by Whisper.
- 2026-10-31: trimmed b3 line verified again by Whisper (heard exactly the new script).
- 2026-10-30: cutscene check: 0 errors. Stills at 8 times looked at; fixed logo/wordmark gap,
  wipe sliver, logo crop, end-card repetition.

## Rules from the user's notes
