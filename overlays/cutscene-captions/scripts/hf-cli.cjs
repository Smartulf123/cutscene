// Built from src/overlays/cutscene-captions/scripts/hf-cli.cts by `npm run build`. Edit that file, not this one.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Cutscene overlay: replaces the upstream CLI locator (HyperFrames
// skills/embedded-captions/scripts/hf-cli.cjs, Apache-2.0, HeyGen, Inc.).
//
// The caption scripts call `node <hfCli()> <command> ...` for matting
// (remove-background), transcription and rendering. In Cutscene that is always
// the cutscene CLI, which forwards to the pinned engine with Cutscene's
// environment. Skills are installed side by side, so the CLI sits at
// ../../cutscene/scripts/cli.mjs relative to this skill's scripts folder.
const fs = require("node:fs");
const path = require("node:path");
function hfCli() {
    const candidates = [
        process.env.CUTSCENE_CLI,
        path.resolve(__dirname, "..", "..", "cutscene", "scripts", "cli.mjs"),
    ].filter(Boolean);
    for (const cli of candidates) {
        if (fs.existsSync(cli))
            return cli;
    }
    throw new Error("Cutscene's CLI was not found next to this skill (expected ../cutscene/scripts/cli.mjs). " +
        "Install the whole Cutscene skill pack, or set CUTSCENE_CLI to the path of cli.mjs.");
}
module.exports = { hfCli };
if (require.main === module)
    console.log(hfCli());
