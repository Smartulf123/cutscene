// Built from src/skills/cutscene-edit/scripts/commands/autoeditor.mts by `npm run build`. Edit that file, not this one.
import { ms } from "../lib/cli.mjs";
import type { EditSummary } from "../lib/workflow.mjs";
type RoughCutResult = EditSummary & {
    autoEditorTimeline: string;
    transcriptRetimed: boolean;
};
type ExportResult = {
    to: string;
    output: string;
    app: string;
    via?: string;
    captions?: boolean;
    timeline?: string;
    clips?: number;
};
type InstallResult = {
    tool: string;
    installed: boolean;
    paths: (string | null)[];
    already?: boolean;
};
export declare const roughCut: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): Promise<RoughCutResult>;
    human: (r: RoughCutResult) => string;
};
export declare const exportCmd: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): Promise<ExportResult>;
    human: (r: ExportResult) => string;
};
export declare const install: {
    name: string;
    summary: string;
    usage: string;
    run(argv: string[]): Promise<InstallResult>;
    human: (r: InstallResult) => string;
};
export { ms };
