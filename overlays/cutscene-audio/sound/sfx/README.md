# Sound-effect library

`manifest.json` lists the 19 sound effects Cutscene knows by name (`whoosh`, `click`, `pop`,
`riser`, ...), with each one's file name, length and a placement hint.

**The sound files are not in this folder.** They are Pixabay sound effects, and the Pixabay
Content License (https://pixabay.com/service/license-summary/) does not allow sharing them as a
standalone library. Cutscene's video engine (the npm package that `cutscene setup` installs, with
the user's OK) already contains the same files, so the sound engine (`scripts/sound-engine.mjs`)
takes them from there:

- from the engine package's `dist/skills/media-use/audio/assets/sfx/` folder, under
  `<CUTSCENE_HOME>/engine/<pin>/node_modules/`;
- each file must match its SHA-256 in `sha256.json`, or it is skipped and reported;
- it is copied into the video project's `assets/sfx/`, where it becomes part of that video
  (using a Pixabay effect inside a video is allowed; no credit is required).

If the engine isn't installed, or the user wants a different sound, put a file in the project's
`assets/sfx/` and place it yourself.
