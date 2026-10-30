/** What a tool's run returns: one JSON object. Checks add passed, failMessage and failHint. */
export type ToolResult = Record<string, unknown>;
/** One `cutscene edit` tool: its name, help text, what it does and how it prints for people. */
export interface Tool {
    name: string;
    aliases?: string[];
    summary: string;
    usage: string;
    run(argv: string[]): ToolResult | Promise<ToolResult>;
    human?(r: ToolResult): string;
}
