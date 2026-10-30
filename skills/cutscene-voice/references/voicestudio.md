# Using VoiceStudio (optional)

VoiceStudio (https://github.com/debpalash/VoiceStudio) is a separate desktop app some users
already have. Cutscene never installs, bundles or copies it (it's AGPL); it only talks to the
app's local API **when the app is already running** on this computer.

## Is it running?

`cutscene voice status` checks `http://127.0.0.1:3900/health` (1 second timeout). Not running is
normal and fine: Cutscene's own voices don't need it. Cutscene only talks to VoiceStudio on this
computer (localhost); another address is refused, so recordings and lines never leave the PC.
Set another local port with `CUTSCENE_VOICESTUDIO_URL=http://127.0.0.1:<port>`.

## What Cutscene uses

| Cutscene | VoiceStudio API |
|---|---|
| `voice design --model voicestudio` | `POST /v1/audio/speech` with `instruct` (the description), `seed`, `language`, `model` (its engine, default `omnivoice`) |
| `voice speak` for a VoiceStudio voice | the same call per line, same description and seed, or `voice: <profile id>` |
| `voice verify` when Whisper isn't installed | `POST /v1/audio/transcriptions` (`verbose_json`, word timestamps) |
| status | `GET /health` |

Every answer is checked: an error page that arrives as "200 OK" isn't audio and is refused.
Authentication errors (401/403) are reported as such; Cutscene never disables VoiceStudio's
sign-in.

## Saved voices (profiles)

Over the OpenAI-style API, VoiceStudio clones from **saved profiles**. For a voice that never
drifts between lines, save it as a profile in the VoiceStudio app (its design or clone screens),
then list them with `GET http://127.0.0.1:3900/v1/audio/voices` and use the id:

```bash
cutscene voice design --project my-video --speaker narrator --model voicestudio --voice <profile id>
```

Without a profile, each line is spoken from the same description and seed: close, but not as
steady as Cutscene's own reference-based cloning with OmniVoice.

## Dubbing

VoiceStudio has dubbing projects (translate and re-voice a video). That's a VoiceStudio feature,
done in its app; Cutscene doesn't drive it. If the user dubs there, bring the finished audio
into the project like any other file, then run `cutscene voice verify` only if the lines are in
beats.json.

## Rules carried over from VoiceStudio's own agent guidance

- Discover what's installed (`/v1/audio/voices`) instead of guessing profile ids or engines.
- Model downloads inside VoiceStudio are the user's choice; never trigger one silently.
- Check the saved file is real audio and report its real duration; never claim a generation
  worked without the file.
- Clone only voices the user is authorised to use.
