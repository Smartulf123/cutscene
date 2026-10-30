#!/usr/bin/env node
// `cutscene edit <tool> ...`: footage clean-up for real recordings (talking heads, tutorials,
// podcasts). Every tool is a dry run unless --apply; every cut writes an edit list (EDL) and a
// transcript retimed to the edited video. Cutscene (Apache-2.0).
//
// Run through the Cutscene CLI: node <skills>/cutscene/scripts/cli.mjs edit <tool> [args]
// or directly:                  node <skills>/cutscene-edit/scripts/edit.mjs <tool> [args]
import { EditError, printError, printResult, usageError } from "./lib/cli.mjs";
import { applyCuts, cutSilences, findCuts, read, transcribe } from "./commands/cut.mjs";
import { review, verify, loudnessCmd } from "./commands/review.mjs";
import { exportCmd, install, roughCut } from "./commands/autoeditor.mjs";
import { validateBeatSync, validateFootageCmd, validatePlanCmd } from "./commands/validate.mjs";
import { beatgrid, mix, musicGrid, spliceMusic } from "./commands/music.mjs";
import { cleanAudio, highlights, reframe, sync } from "./commands/footage.mjs";

const TOOLS = [
  ["Read and cut", [transcribe, read, cutSilences, findCuts, applyCuts, roughCut]],
  ["Check", [review, verify, loudnessCmd, validateBeatSync, validatePlanCmd, validateFootageCmd]],
  ["Shorts, framing and sound", [highlights, reframe, sync, cleanAudio, musicGrid, spliceMusic, beatgrid, mix]],
  ["Hand off", [exportCmd, install]],
];

function find(name) {
  for (const [, list] of TOOLS) for (const t of list) if (t.name === name || t.aliases?.includes(name)) return t;
  return null;
}

function help() {
  const lines = ["Cutscene edit: clean up real recordings by reading their words.", "", "Usage: cutscene edit <tool> [options] [--json]", ""];
  for (const [group, list] of TOOLS) {
    lines.push(`${group}:`);
    for (const t of list) lines.push(`  ${t.name.padEnd(18)} ${t.summary}`);
    lines.push("");
  }
  lines.push("Every cutting tool is a dry run until you add --apply.", "Run `cutscene edit <tool> --help` for a tool's options.");
  return lines.join("\n");
}

async function main(argv) {
  const json = argv.includes("--json");
  const [name, ...rest] = argv;
  try {
    if (!name || name === "help" || name === "--help" || name === "-h") {
      if (json) printResult(true, { tools: TOOLS.flatMap(([g, l]) => l.map((t) => ({ name: t.name, group: g, summary: t.summary, usage: t.usage }))) });
      else process.stdout.write(help() + "\n");
      return name ? 0 : json ? 0 : 2;
    }
    const tool = find(name);
    if (!tool) throw usageError(`There is no edit tool called "${name}".`);
    if (rest.includes("--help") || rest.includes("-h")) {
      if (json) printResult(true, { name: tool.name, summary: tool.summary, usage: tool.usage });
      else process.stdout.write(`${tool.summary}\n\nUsage: ${tool.usage}\n`);
      return 0;
    }
    const result = await tool.run(rest);
    if (result?.passed === false) {
      // A check that ran and found problems: the contract's failure shape, with the findings.
      const message = result.failMessage ?? "The check found problems.";
      if (json) process.stdout.write(JSON.stringify({ ok: false, error: { code: "CHECK_FAILED", message, hint: result.failHint ?? "Fix the items listed, then run the check again." }, ...result }) + "\n");
      else process.stdout.write((tool.human ? tool.human(result) : JSON.stringify(result, null, 2)) + "\n");
      return 1;
    }
    printResult(json, result, tool.human);
    return 0;
  } catch (err) {
    return printError(json, err);
  }
}

process.exitCode = await main(process.argv.slice(2));
export { EditError };
