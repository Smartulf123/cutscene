import type { FaceFrames } from "./reframe.mjs";
/** True when the face detector files are installed. */
export declare function faceDetectorInstalled(): boolean;
/** Samples a second: 4 up to half an hour, fewer for long recordings (the speaker moves slowly). */
export declare function faceSampleRate(seconds: number): number;
/**
 * Detect faces in a video.
 */
export declare function detectFaces(file: string, o: {
    fps: number;
    yes?: boolean;
}): Promise<FaceFrames>;
