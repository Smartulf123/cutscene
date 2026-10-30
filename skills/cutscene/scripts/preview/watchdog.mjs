// Preloaded into the engine's Studio process (`node --import`). If the Cutscene preview that
// started it goes away without stopping it (a closed terminal, a crash), the Studio ends itself
// and everything it started, so nothing is left running in the background.
// Node built-ins only.
import { isMainThread } from "node:worker_threads";
import { spawnSync } from "node:child_process";

const watched = Number(process.env.CUTSCENE_PREVIEW_WATCH_PID);
// Only the Studio process itself watches; programs it starts don't inherit the job.
delete process.env.CUTSCENE_PREVIEW_WATCH_PID;

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

if (isMainThread && Number.isInteger(watched) && watched > 0) {
  const timer = setInterval(() => {
    if (alive(watched)) return;
    clearInterval(timer);
    if (process.platform === "win32") {
      // Ends this process and its children (browsers, FFmpeg) in one go.
      spawnSync("taskkill", ["/T", "/F", "/PID", String(process.pid)], { stdio: "ignore", windowsHide: true });
    } else {
      try {
        process.kill(-process.pid, "SIGTERM");
      } catch {
        // not a group leader
      }
    }
    process.exit(0);
  }, 1500);
  timer.unref();
}
