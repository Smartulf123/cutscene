"""The music bed for the Cutscene launch video: original, synthesised here, seeded.

    py .cutscene/audio/make-bed.py        (from the project folder)

Writes assets/music/bed.wav (48 kHz stereo, 16-bit). The sections follow .cutscene/beats.json:
near silence under the raw take (0-3.6 s), a riser through the prompt into the edit (3.6-6.4 s),
a soft pulse under Kasper's edited take (6.4-22.4 s), the logo hit and a build (22.4-25.9 s), the
montage at full energy, one bar per shot on a 2.25 s grid (25.9-34.9 s), a lighter groove for the
voice and the preview (34.9-42.5 s) and a resolving chord with a long tail on the end card (42.5-47.9 s).
"""
import wave
from pathlib import Path

import numpy as np

SR = 48000
DUR = 47.9
N = int(SR * DUR)
rng = np.random.default_rng(871146)  # look.json seed
t = np.arange(N) / SR

BEAT = 2.25 / 4  # 107 bpm; each montage shot is one bar
GRID0 = 25.9     # bar line where the montage starts


def env(start, end, attack=0.05, release=0.2):
    """A 0-1 gain lane that is 1 between start and end, with linear ramps."""
    g = np.zeros(N)
    a, b = int(start * SR), int(end * SR)
    g[a:b] = 1.0
    ra = max(1, int(attack * SR))
    g[a:a + ra] *= np.linspace(0, 1, min(ra, b - a))
    rr = max(1, int(release * SR))
    g[max(a, b - rr):b] *= np.linspace(1, 0, len(g[max(a, b - rr):b]))
    return g


def lowpass(x, cutoff):
    """One-pole lowpass; cutoff may be an array (Hz per sample)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    k = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # fine for 35 s
        acc += k[i] * (x[i] - acc)
        y[i] = acc
    return y


def saw(freq, detune=0.0):
    ph = np.cumsum(np.full(N, freq * (1 + detune)) / SR)
    return 2 * (ph % 1.0) - 1


def note(f):
    return 440.0 * 2 ** ((f - 69) / 12)


# --- pad: four chords, detuned saws through a slow filter --------------------------------------
CHORDS = [  # (start, end, midi notes)  D minor 9 -> Bb maj7 -> F add9 -> C sus2 -> D minor 9
    (3.0, 22.4, [50, 57, 60, 64, 65]),
    (22.4, 25.9, [46, 53, 57, 62, 65]),
    (25.9, 34.9, [41, 53, 57, 60, 67]),
    (34.9, 42.5, [48, 55, 62, 64, 67]),
    (42.5, 47.9, [50, 57, 62, 64, 69]),
]
pad = np.zeros(N)
for s, e, notes in CHORDS:
    g = env(s, min(DUR, e + 0.6), attack=0.8, release=1.2)
    for m in notes:
        f = note(m)
        pad += g * (saw(f, -0.004) + saw(f, 0.0045)) * 0.5
cut = 500 + 2400 * np.clip((t - 3.6) / 2.8, 0, 1)  # opens through the prompt into the edit
cut = np.where(t > 6.4, 1100 + 400 * np.sin(2 * np.pi * t / 7.0), cut)
cut = np.where(t > 22.4, 1600 + 900 * np.clip((t - 22.4) / 3.5, 0, 1), cut)
cut = np.where(t > 42.5, 1800 + 2200 * np.clip((t - 42.5) / 1.2, 0, 1), cut)
pad = lowpass(pad, cut) * 0.06

# --- sub pulse: a short sine kick on every beat, sidechains the pad ----------------------------
kick = np.zeros(N)
duck = np.ones(N)
klen = int(0.32 * SR)
kt = np.arange(klen) / SR
kshape = np.sin(2 * np.pi * (48 * kt + 90 * (1 - np.exp(-kt * 30)) / 30)) * np.exp(-kt * 9)
dshape = 1 - 0.55 * np.exp(-np.arange(int(0.3 * SR)) / SR * 14)
beats = GRID0 + BEAT * np.arange(-60, 60)
sections = [(6.4, 22.4, 0.35), (23.6, 25.9, 0.7), (25.9, 34.9, 1.0), (34.9, 42.2, 0.45)]
for b in beats:
    level = next((lv for s, e, lv in sections if s <= b < e), 0)
    if not level:
        continue
    i = int(b * SR)
    kick[i:i + klen] += kshape[: N - i] * level
    duck[i:i + len(dshape)] = np.minimum(duck[i:i + len(dshape)], dshape[: N - i])

# --- hats in the montage: offbeat noise ticks ----------------------------------------------------
hats = np.zeros(N)
hlen = int(0.05 * SR)
hshape = np.exp(-np.arange(hlen) / SR * 90)
noise = rng.standard_normal(N)
hp = noise - lowpass(noise, 6000)
for b in beats:
    for off, lv in ((BEAT / 2, 1.0), (BEAT / 4, 0.35), (3 * BEAT / 4, 0.35)):
        tt = b + off
        if 25.9 <= tt < 34.7:
            i = int(tt * SR)
            hats[i:i + hlen] += hp[i:i + hlen] * hshape[: N - i] * lv

# --- risers: filtered noise swelling into the logo and into the montage -------------------------
riser = np.zeros(N)
for s, e in ((3.8, 6.4), (20.8, 22.4), (24.4, 25.9)):
    g = env(s, e, attack=e - s - 0.02, release=0.02) ** 2
    riser += g * lowpass(noise, 300 + 7000 * g)
riser *= 0.18

# --- bass under the montage and the end card -----------------------------------------------------
bass = np.zeros(N)
for s, e, notes in CHORDS[2:]:
    bass += env(s, e, attack=0.02, release=0.3) * np.sin(2 * np.pi * note(notes[0] - 12) * t)
bass = lowpass(np.tanh(bass * 1.6), 380) * 0.22

mono = (pad * duck + kick * 0.42 + hats * 0.05 + riser + bass * duck)

# under the voice: dip about 6 dB while she or Kasper speaks (times from beats.json), with soft ramps
import json
sheet = json.loads(Path(".cutscene/beats.json").read_text(encoding="utf8"))
speech = []
for b in sheet["beats"]:
    v = b.get("voice") or {}
    f = b.get("footage") or {}
    if b["id"] == "b1":  # Kasper's "Hey, I'm Kasper." in the raw take
        speech.append((b["start"] + 5.19 - f["media_start"], b["start"] + 6.82 - f["media_start"]))
    if b["id"] == "b3":  # Kasper's edited take plays from f["at"] to the beat's end
        speech.append((f["at"], b["end"]))
    if b.get("montage"):
        speech += [(m["voice_at"], m["voice_at"] + m["media_end"] - m["media_start"]) for m in b["montage"]]
    elif b.get("voice_at") is not None and v.get("duration"):
        speech.append((b["voice_at"], b["voice_at"] + v["duration"]))
talk = np.zeros(N)
for s, e in speech:
    talk = np.maximum(talk, env(s - 0.08, e + 0.15, attack=0.08, release=0.25))
mono *= 1 - 0.5 * talk

# the end: a long fade after the last line
mono *= np.where(t > 45.9, np.clip((DUR - t) / 2.0, 0, 1), 1)

# stereo: the pad and hats get a little width from a short Haas delay
d = int(0.011 * SR)
wide = (pad * duck + hats * 0.05) * (1 - 0.5 * talk)
left = mono
right = mono - wide + np.concatenate([np.zeros(d), wide[:-d]])
st = np.stack([left, right], axis=1)
st /= max(1e-9, np.abs(st).max()) / 0.7  # about -3 dBFS peak; the host sets the bed level
pcm = (st * 32767).astype("<i2")

out = Path("assets/music/bed.wav")
out.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {out} ({DUR} s)")
