#!/usr/bin/env node
// `cutscene voice <command>`: local AI voices for Cutscene videos.
// Started by skills/cutscene/scripts/cli.mjs (env: CUTSCENE_HOME, CUTSCENE_CLI,
// CUTSCENE_ENGINE_VERSION), or directly with `node voice.mjs <command>`.
// Node built-ins only; the speech models run in Python inside <CUTSCENE_HOME>/voice/venv.
// Copyright 2026 Cutscene contributors. Apache-2.0.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cmdBenchmark, cmdClone, cmdDesign, cmdSetup, cmdSpeak, cmdStatus, cmdVerify } from "./lib/commands.mjs";
import { cmdSpeakOne, isOneShot } from "./lib/oneshot.mjs";
import { EXIT, VoiceError, envelope, parseFlags, usage } from "./lib/util.mjs";
import type { CommandResult, Ctx, ErrorLike, FlagSpec, Flags } from "./lib/types.mjs";

/** A command as main() calls it. Each command reads only the options in its own spec. */
type Command = (flags: Flags, ctx: Ctx) => Promise<CommandResult>;

export const HELP = `Cutscene voices: design, clone, speak and check voiceover lines on this computer.

Usage: cutscene voice <command> [options] [--json]

  setup      Install the voice environment and models (asks first; --yes to go ahead)
               --model omnivoice,whisper (default) | voxcpm2   --dry-run   --repair
  status     What's installed, licences, speed on this computer, VoiceStudio
               --project <dir> also lists the project's voices and lines
  design     Make a voice from a description; its sample becomes the reference
               --speaker narrator --describe "female, young adult, american accent"
               --sample "Hi! I'm so glad you're here."  --seed 42  --language en
               --model omnivoice|voxcpm2|kokoro|voicestudio  --preset af_heart (kokoro)
               --steps 16  --fast  --tries 3  --replace  --project <dir>
  clone      Clone a voice from a recording (needs the speaker's permission)
               --speaker host --from <audio> --text "<exact words in it>"
               --consent "<who gave permission>"  --model omnivoice|voxcpm2  --force
  speak      Speak every beat's voice.line into assets/voice/<beat>.wav, then check it
               --project <dir>  --beats b1,b2  --retry (new seed)  --seed N
               --yes (agree to the built-in voice's one-time download)
               --model ...  --steps N  --fast  --no-verify
             One line without a beat sheet (used by the sound engine):
               --text-file <line.txt> --out <file.wav> [--voice <speaker|kokoro preset>]
               [--project <dir>] [--describe "..."] [--seed N]
               --json -> {ok, file, duration, model, license, verified, words}
  verify     Transcribe each line, compare it word by word with the script, write
             word timings for captions; fails if any line is wrong
               --project <dir>  --beats b1,b2  --accept b2 --reason "<who listened>"
  benchmark  Time each installed model on this computer (for time estimates)
               --model omnivoice  --steps N  --fast

Every command takes --json (one JSON object on stdout). Exit code 0 = ok, 1 = failed, 2 = wrong usage.`;

const COMMON: FlagSpec = { json: "bool", help: "bool" };
const SPECS: Record<string, FlagSpec> = {
  setup: { ...COMMON, model: "list", yes: "bool", "dry-run": "bool", repair: "bool" },
  status: { ...COMMON, project: "string" },
  design: { ...COMMON, yes: "bool", project: "string", speaker: "string", describe: "string", sample: "string", seed: "int", language: "string", model: "string", preset: "string", voice: "string", engine: "string", steps: "int", fast: "bool", tries: "int", replace: "bool" },
  clone: { ...COMMON, yes: "bool", project: "string", speaker: "string", from: "string", text: "string", consent: "string", model: "string", seed: "int", language: "string", sample: "string", steps: "int", fast: "bool", force: "bool", replace: "bool" },
  speak: { ...COMMON, yes: "bool", project: "string", beats: "list", retry: "bool", seed: "int", model: "string", steps: "int", fast: "bool", "no-verify": "bool", "text-file": "string", text: "string", out: "string", voice: "string", describe: "string", language: "string", provider: "string" },
  verify: { ...COMMON, project: "string", beats: "list", accept: "list", reason: "string" },
  benchmark: { ...COMMON, yes: "bool", model: "list", steps: "int", fast: "bool" },
};
// parseFlags checked the options against the command's spec, so each command gets the ones it knows.
const RUN = { setup: cmdSetup, status: cmdStatus, design: cmdDesign, clone: cmdClone, speak: cmdSpeak, verify: cmdVerify, benchmark: cmdBenchmark } as Record<string, Command>;

/** Parse argv into {cmd, flags}. Throws a usage VoiceError (exit 2) for wrong usage. */
export function parseArgs(argv: string[]): { cmd: string; flags: Flags } {
  const [cmd, ...rest] = argv;
  const json = rest.includes("--json");
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return { cmd: "help", flags: { json } };
  const spec = SPECS[cmd];
  if (!spec) throw usage(`Unknown voice command "${cmd}".`);
  const { flags, positionals } = parseFlags(rest, spec);
  if (positionals.length) {
    if (cmd === "status" && !flags.project && positionals.length === 1) flags.project = positionals[0];
    else throw usage(`Unexpected argument "${positionals[0]}".`, "Options start with --, for example --project my-video.");
  }
  return { cmd: flags.help ? "help" : cmd, flags };
}

function print(json: boolean, result: CommandResult): void {
  if (json) {
    const { message, ...rest } = result;
    process.stdout.write(JSON.stringify({ ok: true, ...rest, summary: message }) + "\n");
  } else if (result.message) process.stdout.write(result.message + "\n");
}

export async function main(argv: string[] = process.argv.slice(2), ctx: Ctx = {}): Promise<number> {
  let json = argv.includes("--json");
  try {
    const { cmd, flags } = parseArgs(argv);
    json = !!flags.json;
    if (cmd === "help") {
      if (json) process.stdout.write(JSON.stringify({ ok: true, commands: Object.keys(SPECS), help: HELP }) + "\n");
      else process.stdout.write(HELP + "\n");
      return EXIT.OK;
    }
    const run = cmd === "speak" && isOneShot(flags) ? (cmdSpeakOne as Command) : RUN[cmd];
    const result = await run(flags, ctx);
    print(json, result);
    return EXIT.OK;
  } catch (err) {
    const env = envelope(err);
    if (json) process.stdout.write(JSON.stringify(env) + "\n");
    else {
      process.stderr.write(`${env.error.message}\n`);
      if (env.error.hint) process.stderr.write(`${env.error.hint}\n`);
      if (!(err instanceof VoiceError)) process.stderr.write(`${(err as ErrorLike)?.stack || err}\n`);
    }
    return err instanceof VoiceError ? err.exitCode : EXIT.FAIL;
  }
}

function isMain(): boolean {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  main().then((code) => {
    process.exitCode = code;
  });
}
