#!/usr/bin/env node
// Built from src/tools/validate-skills.mts by `npm run build`. Edit that file, not this one.
/** A frontmatter value: a string, or an object for a key that only holds an indented block. */
export type FrontmatterValue = string | Record<string, never>;
/** Parse simple YAML frontmatter: top-level keys with inline, quoted or block (> |) values. */
export declare function parseFrontmatter(text: string): {
    data: Record<string, FrontmatterValue>;
    endLine: number;
} | null;
/** Relative link targets in a Markdown file, with line numbers. */
export declare function markdownLinks(text: string): {
    target: string;
    line: number;
}[];
/** A problem on one line of a file. */
export interface LineFinding {
    line: number;
    message: string;
}
/** Engine names shown to users: errors for commands, warnings for the product name in prose. */
export declare function brandFindings(text: string): {
    errors: LineFinding[];
    warnings: LineFinding[];
};
/** Absolute paths into a real user's home folder. Placeholders such as <you> are fine. */
export declare function userPathFindings(text: string): LineFinding[];
/** A problem found in a skill. */
export interface SkillFinding {
    file: string;
    line: number;
    rule: string;
    message: string;
}
export interface ValidationResult {
    ok: boolean;
    skills: string[];
    errors: SkillFinding[];
    warnings: SkillFinding[];
}
/**
 * Validate every skill under <root>/skills.
 */
export declare function validateSkills({ root }?: {
    root?: string;
}): ValidationResult;
