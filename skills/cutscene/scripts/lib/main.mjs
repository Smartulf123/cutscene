// Built from src/skills/cutscene/scripts/lib/main.mts by `npm run build`. Edit that file, not this one.
// True when this module is the script Node was started with (works with Windows drive-letter
// case differences and symlinked install folders).
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function isMainModule(metaUrl, argv1 = process.argv[1]) {
    if (!argv1)
        return false;
    const norm = (p) => {
        let real;
        try {
            real = realpathSync(p);
        }
        catch {
            real = resolve(p);
        }
        return process.platform === "win32" ? real.toLowerCase() : real;
    };
    return norm(fileURLToPath(metaUrl)) === norm(argv1);
}
