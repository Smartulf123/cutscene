import type { Check } from "./doctor.mjs";
/** Something setup would download, for the consent message. */
export interface SetupDownload {
    id: string;
    name: string;
    package: string;
    version?: string;
    size: string;
    license: string;
    source: string;
    location?: string;
}
/** Something setup leaves to another command, and how to get it. */
export interface SetupElsewhere {
    id: string;
    name: string;
    how: string | undefined;
}
export interface SetupPlan {
    downloads: SetupDownload[];
    elsewhere: SetupElsewhere[];
}
export declare function browserPlan(): {
    id: string;
    name: string;
    package: string;
    size: string;
    license: string;
    source: string;
    location: string;
};
/** What setup would install, and what it leaves to other commands, from the doctor checks. */
export declare function planSetup(checks: Check[], pin: string): SetupPlan;
export declare function runSetup(args?: string[], { json, yes }?: {
    json?: boolean;
    yes?: boolean;
}): Promise<number>;
