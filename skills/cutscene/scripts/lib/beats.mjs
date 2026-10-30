// Built from src/skills/cutscene/scripts/lib/beats.mts by `npm run build`. Edit that file, not this one.
// The shared beat sheet: <project>/.cutscene/beats.json (contracts §7).
//
//   import { readBeats, updateBeat, validateBeats } from "../../cutscene/scripts/lib/beats.mjs";
//   const sheet = readBeats(file);
//   updateBeat(file, "b1", { voice: { file: "assets/voice/b1.wav", verified: true } });
//
// A part fills only its own fields and everything else stays exactly as it was: updates are
// spliced into the original text, so other fields, their order, spacing and number spelling
// (12.0 stays 12.0) are kept byte for byte. Patches are JSON merge patches: objects merge,
// `null` removes a field, arrays and other values replace. Writes are atomic and locked, so
// voice and 3d can update the same file at once. All helpers are synchronous (await works).
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { CutsceneError } from "./json.mjs";
import { mergePatch } from "./config.mjs";
import { withFileLock, writeFileAtomic } from "./atomic.mjs";
import { isNetworkPath } from "./paths.mjs";
export const BEATS_VERSION = 1;
export const FORMATS = ["landscape", "portrait", "square"];
/** `<project>/.cutscene/beats.json` */
export function beatsPath(projectDir) {
    return join(projectDir, ".cutscene", "beats.json");
}
// ---------------------------------------------------------------------------------------------
// Validation
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const decimals = (n) => {
    const s = String(n);
    if (/e/i.test(s))
        return 99;
    const i = s.indexOf(".");
    return i < 0 ? 0 : s.length - i - 1;
};
function checkRelPath(value, path, errors) {
    if (value === undefined)
        return;
    if (typeof value !== "string" || !value.trim()) {
        errors.push({ path, message: "must be a file path inside the project, as text." });
        return;
    }
    const p = value.trim();
    if (isNetworkPath(p))
        errors.push({ path, message: `is a network path (${p}); use a path inside the project.` });
    else if (isAbsolute(p) || /^[A-Za-z]:/.test(p))
        errors.push({ path, message: `is an absolute path (${p}); use a path relative to the project folder.` });
    else if (p.split(/[\\/]+/).includes(".."))
        errors.push({ path, message: `points outside the project (${p}).` });
}
function checkTime(value, path, errors, warnings, { required = false, min = 0 } = {}) {
    if (value === undefined) {
        if (required)
            errors.push({ path, message: "is required (seconds, as a number)." });
        return false;
    }
    if (!isNum(value)) {
        errors.push({ path, message: "must be a number of seconds." });
        return false;
    }
    if (value < min)
        errors.push({ path, message: `must be ${min} or more.` });
    if (decimals(value) > 3)
        warnings.push({ path, message: "has more than 3 decimals; round times to milliseconds." });
    return true;
}
/**
 * Check a beat sheet object against contracts §7. Never throws.
 */
export function validateBeats(obj) {
    const errors = [];
    const warnings = [];
    const done = () => ({ ok: errors.length === 0, errors, warnings });
    if (!isObj(obj)) {
        errors.push({ path: "", message: "The beat sheet must be a JSON object." });
        return done();
    }
    if (obj.version !== BEATS_VERSION) {
        errors.push({ path: "version", message: obj.version === undefined ? "is required and must be 1." : `must be 1 (got ${JSON.stringify(obj.version)}).` });
    }
    if (!isNum(obj.fps) || obj.fps <= 0 || obj.fps > 240)
        errors.push({ path: "fps", message: "is required: frames per second, a number from 1 to 240." });
    for (const k of ["width", "height"]) {
        if (!Number.isInteger(obj[k]) || obj[k] <= 0)
            errors.push({ path: k, message: "is required: a whole number of pixels." });
    }
    if (obj.format !== undefined && !FORMATS.includes(obj.format)) {
        warnings.push({ path: "format", message: `should be one of ${FORMATS.join(", ")}.` });
    }
    if (obj.duration !== undefined)
        checkTime(obj.duration, "duration", errors, warnings, { min: 0 });
    if (obj.voices !== undefined) {
        if (!isObj(obj.voices))
            errors.push({ path: "voices", message: "must be an object of named voices." });
        else {
            for (const [name, v] of Object.entries(obj.voices)) {
                if (!isObj(v))
                    errors.push({ path: `voices.${name}`, message: "must be an object." });
                else
                    checkRelPath(v.reference, `voices.${name}.reference`, errors);
            }
        }
    }
    if (!Array.isArray(obj.beats)) {
        errors.push({ path: "beats", message: "is required: a list of beats (it may be empty)." });
        return done();
    }
    const seen = new Map();
    let prev = null;
    obj.beats.forEach((b, i) => {
        const at = `beats[${i}]`;
        if (!isObj(b)) {
            errors.push({ path: at, message: "must be an object." });
            return;
        }
        const where = typeof b.id === "string" && b.id ? `beats[${i}] (${b.id})` : at;
        if (typeof b.id !== "string" || !b.id.trim())
            errors.push({ path: `${at}.id`, message: "is required: a short unique name such as b1." });
        else if (seen.has(b.id))
            errors.push({ path: `${at}.id`, message: `"${b.id}" is used twice (also beats[${seen.get(b.id)}]).` });
        else
            seen.set(b.id, i);
        const hasStart = checkTime(b.start, `${where}.start`, errors, warnings, { required: true });
        const hasEnd = checkTime(b.end, `${where}.end`, errors, warnings, { required: true });
        if (hasStart && hasEnd && b.end <= b.start)
            errors.push({ path: `${where}.end`, message: `must be after start (${b.start}s).` });
        if (hasEnd && isNum(obj.duration) && b.end > obj.duration + 1e-9) {
            warnings.push({ path: `${where}.end`, message: `is after the end of the video (${obj.duration}s).` });
        }
        if (hasStart && prev && isNum(prev.end) && b.start < prev.end - 1e-9) {
            warnings.push({ path: `${where}.start`, message: `starts before the previous beat (${prev.id}) ends at ${prev.end}s.` });
        }
        if (b.label !== undefined && typeof b.label !== "string")
            errors.push({ path: `${where}.label`, message: "must be text." });
        if (b.voice !== undefined) {
            const v = b.voice;
            if (!isObj(v))
                errors.push({ path: `${where}.voice`, message: "must be an object." });
            else {
                if (v.speaker !== undefined && typeof v.speaker !== "string")
                    errors.push({ path: `${where}.voice.speaker`, message: "must be the name of a voice." });
                else if (v.speaker !== undefined && isObj(obj.voices) && !(v.speaker in obj.voices)) {
                    warnings.push({ path: `${where}.voice.speaker`, message: `"${v.speaker}" isn't listed in voices.` });
                }
                if (v.line !== undefined && typeof v.line !== "string")
                    errors.push({ path: `${where}.voice.line`, message: "must be text." });
                checkRelPath(v.file, `${where}.voice.file`, errors);
                if (v.duration !== undefined)
                    checkTime(v.duration, `${where}.voice.duration`, errors, warnings);
                if (v.verified !== undefined && typeof v.verified !== "boolean")
                    errors.push({ path: `${where}.voice.verified`, message: "must be true or false." });
                if (v.words !== undefined) {
                    if (!Array.isArray(v.words))
                        errors.push({ path: `${where}.voice.words`, message: "must be a list of words." });
                    else {
                        v.words.forEach((w, j) => {
                            const wp = `${where}.voice.words[${j}]`;
                            if (!isObj(w))
                                return errors.push({ path: wp, message: "must be an object." });
                            if (typeof w.w !== "string")
                                errors.push({ path: `${wp}.w`, message: "must be the word, as text." });
                            const s = checkTime(w.start, `${wp}.start`, errors, warnings, { required: true });
                            const e = checkTime(w.end, `${wp}.end`, errors, warnings, { required: true });
                            if (s && e && w.end < w.start)
                                errors.push({ path: `${wp}.end`, message: "must not be before start." });
                            if (w.p !== undefined && (!isNum(w.p) || w.p < 0 || w.p > 1))
                                errors.push({ path: `${wp}.p`, message: "must be a confidence from 0 to 1." });
                        });
                    }
                }
            }
        }
        if (b.shot3d !== undefined) {
            const s = b.shot3d;
            if (!isObj(s))
                errors.push({ path: `${where}.shot3d`, message: "must be an object." });
            else {
                if (s.tier !== undefined && s.tier !== 1 && s.tier !== 2)
                    errors.push({ path: `${where}.shot3d.tier`, message: "must be 1 (Three.js) or 2 (Blender)." });
                checkRelPath(s.spec, `${where}.shot3d.spec`, errors);
                checkRelPath(s.file, `${where}.shot3d.file`, errors);
                if (s.duration !== undefined)
                    checkTime(s.duration, `${where}.shot3d.duration`, errors, warnings);
            }
        }
        if (b.graphics !== undefined) {
            if (!Array.isArray(b.graphics))
                errors.push({ path: `${where}.graphics`, message: "must be a list." });
            else
                b.graphics.forEach((g, j) => { if (!isObj(g))
                    errors.push({ path: `${where}.graphics[${j}]`, message: "must be an object." }); });
        }
        if (b.sfx !== undefined) {
            if (!Array.isArray(b.sfx))
                errors.push({ path: `${where}.sfx`, message: "must be a list." });
            else {
                b.sfx.forEach((x, j) => {
                    const xp = `${where}.sfx[${j}]`;
                    if (!isObj(x))
                        return errors.push({ path: xp, message: "must be an object." });
                    if (x.at !== undefined)
                        checkTime(x.at, `${xp}.at`, errors, warnings);
                    if (x.name !== undefined && typeof x.name !== "string")
                        errors.push({ path: `${xp}.name`, message: "must be text." });
                });
            }
        }
        prev = b;
    });
    return done();
}
function invalidError(file, result) {
    const first = result.errors.slice(0, 5).map((e) => (e.path ? `${e.path} ${e.message}` : e.message));
    return new CutsceneError("BEATS_INVALID", `The beat sheet has ${result.errors.length} problem(s): ${first.join("; ")}`, {
        hint: `Fix these fields in ${file}. The format is in the cutscene skill's references/beats.md.`,
        details: { errors: result.errors, warnings: result.warnings },
    });
}
// ---------------------------------------------------------------------------------------------
// Reading and writing
function readText(file) {
    try {
        return readFileSync(file, "utf8");
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new CutsceneError("BEATS_NOT_FOUND", `There's no beat sheet at ${file}.`, {
                hint: "Make the storyboard first; it writes .cutscene/beats.json in the project.",
            });
        }
        throw err;
    }
}
function parseText(text, file) {
    try {
        return JSON.parse(text.replace(/^﻿/, ""));
    }
    catch (err) {
        throw new CutsceneError("BEATS_INVALID_JSON", `The beat sheet isn't valid JSON: ${file} (${err.message}).`, {
            hint: "Fix the JSON syntax (a missing comma or quote is the usual cause), then try again.",
        });
    }
}
/** Read and parse a beat sheet. Throws BEATS_NOT_FOUND or BEATS_INVALID_JSON. Does not validate. */
export function readBeats(file) {
    return parseText(readText(file), file);
}
/** Write a whole beat sheet (for the storyboard step that creates it). Validates first. */
export function writeBeats(file, obj) {
    const result = validateBeats(obj);
    if (!result.ok)
        throw invalidError(file, result);
    withFileLock(file, () => writeFileAtomic(file, JSON.stringify(obj, null, 2) + "\n"));
    return obj;
}
/**
 * Merge `patch` into the beat with this id and save. Everything else stays byte for byte.
 * Returns the updated sheet. Throws BEAT_NOT_FOUND, BEATS_INVALID (nothing is written), ...
 * @param patch JSON merge patch for the beat
 */
export function updateBeat(file, id, patch) {
    if (!isObj(patch))
        throw new CutsceneError("BEAT_PATCH_INVALID", "A beat update must be an object of fields.", { hint: 'For example updateBeat(file, "b1", { voice: { verified: true } }).' });
    if ("id" in patch && patch.id !== id) {
        throw new CutsceneError("BEAT_ID_CHANGE", `A beat's id can't be changed through an update (${id}).`, { hint: "Rewrite the storyboard to rename beats." });
    }
    return withFileLock(file, () => {
        const text = readText(file);
        const sheet = parseText(text, file);
        if (!isObj(sheet) || !Array.isArray(sheet.beats))
            throw invalidError(file, validateBeats(sheet));
        const index = sheet.beats.findIndex((b) => isObj(b) && b.id === id);
        if (index < 0) {
            const ids = sheet.beats.map((b) => b && b.id).filter(Boolean);
            throw new CutsceneError("BEAT_NOT_FOUND", `There's no beat "${id}" in ${file}.`, {
                hint: ids.length ? `Use one of: ${ids.join(", ")}.` : "The beat sheet has no beats yet; make the storyboard first.",
            });
        }
        const next = { ...sheet, beats: sheet.beats.slice() };
        next.beats[index] = mergePatch(sheet.beats[index], patch);
        const result = validateBeats(next);
        if (!result.ok)
            throw invalidError(file, result);
        const root = parseSpans(text);
        const beatsNode = memberOf(root, "beats");
        const out = spliceMergePatch(text, beatsNode.items[index], sheet.beats[index], patch) ?? JSON.stringify(next, null, detectUnit(text)) + "\n";
        writeFileAtomic(file, out);
        return next;
    });
}
/**
 * Merge `patch` into the top level of the sheet (for example `voices` or `duration`) and save.
 * Everything else stays byte for byte. Returns the updated sheet.
 */
export function updateBeatSheet(file, patch) {
    if (!isObj(patch))
        throw new CutsceneError("BEAT_PATCH_INVALID", "A beat sheet update must be an object of fields.", { hint: "For example updateBeatSheet(file, { duration: 12 })." });
    return withFileLock(file, () => {
        const text = readText(file);
        const sheet = parseText(text, file);
        const next = mergePatch(sheet, patch);
        const result = validateBeats(next);
        if (!result.ok)
            throw invalidError(file, result);
        const out = spliceMergePatch(text, parseSpans(text), sheet, patch) ?? JSON.stringify(next, null, detectUnit(text)) + "\n";
        writeFileAtomic(file, out);
        return next;
    });
}
// ---------------------------------------------------------------------------------------------
// Span-preserving JSON editing. The text is already known to be valid JSON (JSON.parse ran).
/** Parse JSON text into a tree of nodes with their character spans. */
export function parseSpans(text) {
    let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const ws = () => {
        while (i < text.length && /\s/.test(text[i]))
            i++;
    };
    const str = () => {
        const start = i;
        i++; // opening quote
        while (text[i] !== '"')
            i += text[i] === "\\" ? 2 : 1;
        i++;
        return { type: "string", start, end: i };
    };
    const value = () => {
        ws();
        const c = text[i];
        if (c === "{") {
            const node = { type: "object", start: i, end: 0, members: [] };
            i++;
            ws();
            if (text[i] === "}") {
                i++;
                node.end = i;
                return node;
            }
            for (;;) {
                ws();
                const k = str();
                const key = JSON.parse(text.slice(k.start, k.end));
                ws();
                i++; // colon
                const v = value();
                node.members.push({ key, keyStart: k.start, value: v });
                ws();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                i++; // closing brace
                node.end = i;
                return node;
            }
        }
        if (c === "[") {
            const node = { type: "array", start: i, end: 0, items: [] };
            i++;
            ws();
            if (text[i] === "]") {
                i++;
                node.end = i;
                return node;
            }
            for (;;) {
                node.items.push(value());
                ws();
                if (text[i] === ",") {
                    i++;
                    continue;
                }
                i++;
                node.end = i;
                return node;
            }
        }
        if (c === '"')
            return str();
        const start = i;
        while (i < text.length && /[-+0-9.eEtruefalsn]/.test(text[i]))
            i++;
        return { type: "literal", start, end: i };
    };
    return value();
}
function memberOf(objNode, key) {
    if (!objNode || objNode.type !== "object")
        return undefined;
    let found;
    for (const m of objNode.members)
        if (m.key === key)
            found = m.value; // JSON.parse keeps the last duplicate
    return found;
}
function detectUnit(text) {
    const m = /\n([ \t]+)\S/.exec(text);
    return m ? m[1] : "  ";
}
/** Leading whitespace of the line that holds `pos`, or null when something else comes first. */
function lineIndent(text, pos) {
    let j = pos - 1;
    while (j >= 0 && (text[j] === " " || text[j] === "\t"))
        j--;
    if (j >= 0 && text[j] !== "\n")
        return null;
    return text.slice(j + 1, pos);
}
function lineStartIndent(text, pos) {
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    return /^[ \t]*/.exec(text.slice(lineStart))[0];
}
function serialize(value, indent, unit, nl) {
    if (indent === null)
        return JSON.stringify(value);
    return JSON.stringify(value, null, unit).split("\n").join(nl + indent);
}
function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
/**
 * Apply a merge patch to the object at `node` by editing only the text that changes.
 * Returns the new text, or null when the result can't be verified (caller re-serializes).
 */
export function spliceMergePatch(text, node, current, patch) {
    const unit = detectUnit(text);
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    const edits = [];
    collectEdits(text, node, current, patch, edits, unit, nl);
    edits.sort((a, b) => b.start - a.start);
    let out = text;
    for (const e of edits)
        out = out.slice(0, e.start) + e.text + out.slice(e.end);
    // Verify: the spliced text must parse to exactly the merged value.
    try {
        const before = JSON.parse(text.replace(/^﻿/, ""));
        const expectedNode = mergeAt(before, findPath(parseSpans(text), node), patch);
        if (!deepEqual(JSON.parse(out.replace(/^﻿/, "")), expectedNode))
            return null;
    }
    catch {
        return null;
    }
    return out;
}
// Locate `node` inside the tree as a list of keys/indexes, so the check can merge at that spot.
function findPath(tree, target, path = []) {
    if (tree.type === target.type && tree.start === target.start && tree.end === target.end)
        return path;
    if (tree.type === "object") {
        for (const m of tree.members) {
            const p = findPath(m.value, target, [...path, m.key]);
            if (p)
                return p;
        }
    }
    else if (tree.type === "array") {
        for (let k = 0; k < tree.items.length; k++) {
            const p = findPath(tree.items[k], target, [...path, k]);
            if (p)
                return p;
        }
    }
    return null;
}
function mergeAt(root, path, patch) {
    if (!path || path.length === 0)
        return mergePatch(root, patch);
    const [head, ...rest] = path;
    const copy = (Array.isArray(root) ? root.slice() : { ...root });
    copy[head] = mergeAt(root[head], rest, patch);
    return copy;
}
function collectEdits(text, node, current, patch, edits, unit, nl) {
    const objIndent = lineStartIndent(text, node.start);
    // Fields set to null are cut out of the text one by one (with their comma), so the fields
    // around them keep their exact spelling. Only when nothing would be left is the object
    // rewritten as a whole.
    const removed = new Set(Object.entries(patch).filter(([k, v]) => v === null && current && Object.hasOwn(current, k)).map(([k]) => k));
    const kept = node.members.filter((m) => !removed.has(m.key));
    if (kept.length === 0) {
        const merged = mergePatch(current, patch);
        const compact = !text.slice(node.start, node.end).includes("\n") && node.members.length > 0;
        edits.push({ start: node.start, end: node.end, text: serialize(merged, compact ? null : objIndent, unit, nl) });
        return;
    }
    // Removal ranges: a run of removed members followed by a kept one is cut from its first key
    // to the next kept key; a run at the end is cut from the end of the last kept value.
    let trailing = null;
    const n = node.members.length;
    for (let a = 0; a < n; a++) {
        if (!removed.has(node.members[a].key))
            continue;
        let b = a;
        while (b + 1 < n && removed.has(node.members[b + 1].key))
            b++;
        if (b + 1 < n)
            edits.push({ start: node.members[a].keyStart, end: node.members[b + 1].keyStart, text: "" });
        else
            trailing = { start: node.members[a - 1].value.end, end: node.members[b].value.end, text: "" };
        a = b;
    }
    const last = kept[kept.length - 1];
    const memberIndent = lineIndent(text, last.keyStart);
    const additions = [];
    for (const [k, v] of Object.entries(patch)) {
        if (v === null)
            continue;
        const member = [...kept].reverse().find((m) => m.key === k);
        if (!member) {
            additions.push([k, isObj(v) ? mergePatch(undefined, v) : v]);
            continue;
        }
        const cur = current[k];
        if (isObj(v) && member.value.type === "object" && isObj(cur)) {
            collectEdits(text, member.value, cur, v, edits, unit, nl);
        }
        else {
            const value = isObj(v) ? mergePatch(isObj(cur) ? cur : undefined, v) : v;
            if (!deepEqual(cur, value)) {
                edits.push({ start: member.value.start, end: member.value.end, text: serialize(value, lineIndent(text, member.keyStart), unit, nl) });
            }
        }
    }
    let addText = "";
    if (additions.length) {
        const sep = memberIndent === null ? ", " : `,${nl}${memberIndent}`;
        addText = sep + additions.map(([k, v]) => `${JSON.stringify(k)}: ${serialize(v, memberIndent, unit, nl)}`).join(sep);
    }
    // New fields go after the last kept field; when the tail was removed they replace it.
    if (trailing)
        edits.push({ ...trailing, text: addText });
    else if (addText)
        edits.push({ start: last.value.end, end: last.value.end, text: addText });
}
