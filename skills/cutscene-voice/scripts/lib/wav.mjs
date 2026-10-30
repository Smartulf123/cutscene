// Built from src/skills/cutscene-voice/scripts/lib/wav.mts by `npm run build`. Edit that file, not this one.
// Read WAV headers and samples without dependencies: duration for beats.json, and a sample
// comparison for the "same seed, same voice" check.
import { readFileSync } from "node:fs";
/**
 * Parse a RIFF/WAVE buffer. Supports PCM 16/24/32-bit and 32-bit float.
 */
export function parseWav(buf) {
    if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
        throw new Error("Not a WAV file (no RIFF/WAVE header).");
    }
    let off = 12;
    let fmt = null;
    while (off + 8 <= buf.length) {
        const id = buf.toString("ascii", off, off + 4);
        let size = buf.readUInt32LE(off + 4);
        const body = off + 8;
        if (id === "fmt ") {
            let format = buf.readUInt16LE(body);
            const channels = buf.readUInt16LE(body + 2);
            const sampleRate = buf.readUInt32LE(body + 4);
            const bits = buf.readUInt16LE(body + 14);
            if (format === 0xfffe && size >= 26)
                format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE
            fmt = { format, channels, sampleRate, bits };
        }
        else if (id === "data") {
            if (!fmt)
                throw new Error("WAV data comes before its format.");
            if (size === 0xffffffff || body + size > buf.length)
                size = buf.length - body; // streamed or truncated
            const frameBytes = (fmt.bits / 8) * fmt.channels;
            const frames = Math.floor(size / frameBytes);
            return { ...fmt, dataOffset: body, dataBytes: size, frames, duration: frames / fmt.sampleRate };
        }
        off = body + size + (size % 2);
    }
    throw new Error("WAV file has no audio data.");
}
export function wavInfo(file) {
    return parseWav(readFileSync(file));
}
/** Mono float samples (channels averaged). */
export function readSamples(file) {
    const buf = readFileSync(file);
    const w = parseWav(buf);
    const out = new Float32Array(w.frames);
    const bps = w.bits / 8;
    for (let f = 0; f < w.frames; f++) {
        let acc = 0;
        for (let c = 0; c < w.channels; c++) {
            const o = w.dataOffset + (f * w.channels + c) * bps;
            let v;
            if (w.format === 3 && w.bits === 32)
                v = buf.readFloatLE(o);
            else if (w.bits === 16)
                v = buf.readInt16LE(o) / 32768;
            else if (w.bits === 24)
                v = buf.readIntLE(o, 3) / 8388608;
            else if (w.bits === 32)
                v = buf.readInt32LE(o) / 2147483648;
            else if (w.bits === 8)
                v = (buf.readUInt8(o) - 128) / 128;
            else
                throw new Error(`Unsupported WAV bit depth ${w.bits}.`);
            acc += v;
        }
        out[f] = acc / w.channels;
    }
    return { samples: out, sampleRate: w.sampleRate };
}
/**
 * How alike two takes are: identical, or correlation of the samples (1 = same waveform).
 */
export function compareWavs(a, b) {
    const A = readSamples(a);
    const B = readSamples(b);
    const n = Math.min(A.samples.length, B.samples.length);
    let dot = 0;
    let na = 0;
    let nb = 0;
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
        const x = A.samples[i];
        const y = B.samples[i];
        dot += x * y;
        na += x * x;
        nb += y * y;
        const d = Math.abs(x - y);
        if (d > maxDiff)
            maxDiff = d;
    }
    const sameLength = A.samples.length === B.samples.length && A.sampleRate === B.sampleRate;
    const identical = sameLength && maxDiff === 0;
    const correlation = na && nb ? dot / Math.sqrt(na * nb) : 0;
    return { identical, sameLength, correlation, maxDiff, durations: [A.samples.length / A.sampleRate, B.samples.length / B.sampleRate] };
}
