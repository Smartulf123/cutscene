<!-- Adapted from HyperFrames (Apache-2.0, HeyGen, Inc.); modified for Cutscene. -->

# Generate a project beat grid

Use `cutscene beats` when an existing Cutscene project needs the Studio-compatible beat file for its music track. This is a CLI utility, not a complete video workflow.

```bash
cutscene beats
cutscene beats ./my-video
cutscene beats ./my-video --json
```

The project must contain a local music `<audio>` source. Mark it with `data-timeline-role="music"`; an id containing `music`, `bgm`, or `soundtrack` is also recognized. The command decodes that file with ffmpeg, tracks its beats, and writes `beats/<audio-relative-path>.json`.

If the track has no steady beat, the command fails and writes nothing. If ffmpeg is missing, run `cutscene doctor`.

