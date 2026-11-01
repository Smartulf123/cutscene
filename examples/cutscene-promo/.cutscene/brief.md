# Brief: Cutscene launch video

- Purpose: the video at the top of the Cutscene README on GitHub. It says who Cutscene is and what
  it does, and it is itself proof: it was made with Cutscene, on real footage.
- Audience: developers and creators who use an AI coding agent and film themselves, watching on
  GitHub (often muted at first, so the picture must carry the story on its own).
- Format: landscape 1920x1080, 30 fps
- Length: about 48 seconds (47.9 s)
- Message: film yourself, tell your AI agent what you want; Cutscene edits it, animates it, voices
  it and renders it on your computer.
- Must-haves:
  - Kasper's own raw take, edited for real by Cutscene on screen: the pauses cut
    (23.5 s to 16.0 s, every kept word verified), captions on each word, a 9:16 reframe
  - real footage in the montage (Pexels): a colour grade, text pinned to footage, a background
    swap on Kasper, a face cam over a screen
  - the product name "Cutscene", the flat logo mark and the wordmark
  - a real screen recording of the Cutscene preview
  - "Free and open source", the install command `claude plugin install cutscene@cutscene`, and
    github.com/Smartulf123/cutscene
- Voice: Kasper's own voice in his take; the designed female narrator (OmniVoice, seed 42)
  everywhere else; every line checked. OmniVoice weights are non-commercial: fine for a free,
  open-source README video.
- 3D: none (no Blender, no Three.js; the user's call, 2026-10-31).
- Music and sound: the original bed made for this video, plus the bundled sound library
- Look: the existing look (look.json), confident title-sequence feel
- Out of scope: not a SaaS ad, no fake testimonials or numbers, no other product's branding

## Script

| Time | On screen | Voice |
|---|---|---|
| 0-3.6 s | Kasper's raw take, untouched, dead air and all, labelled `take.mp4 · raw · 0:23.5` | Kasper: "Hey, I'm Kasper." |
| 3.6-6.4 s | The take shrinks into a chat as an attachment; "Cut the pauses, caption every word, make a vertical short." is typed and sent | (typing) |
| 6.4-22.4 s | The real edit: the pauses collapse on the waveform (0:23.5 to 0:16.0), then the clean take plays with captions on each word and reframes to 9:16 on "I don't open any editor" | Kasper: "I make videos about building things with AI. So today I wanted to show you how I edit my videos. I don't open any editor. I just tell Cutscene and my AI agents to do it for me." |
| 22.4-25.9 s | The Cutscene logo: the flat mark, its magenta bar drops in, then the wordmark | "Meet Cutscene, the video editor inside your AI agent." |
| 25.9-34.9 s | Montage on real footage, one shot per bar: grade (rain street), pinned text (coast), background swap (Kasper on city lights), face cam over a developer's screen | "Color grade it. Pin text to the footage. Swap the background. Add your face cam." |
| 34.9-37.9 s | A sound wave becomes her caption | "And a voice you design from a sentence, like mine." |
| 37.9-42.5 s | A real screen recording of the Cutscene preview playing this video | "One beat sheet keeps it all in sync, and you watch every change live." |
| 42.5-47.9 s | End card: wordmark, install command, GitHub link | "Cutscene. Free, open source, and ready when you are." |

Status: approved 2026-10-31 (replaces the 35 s cut approved 2026-10-30)
