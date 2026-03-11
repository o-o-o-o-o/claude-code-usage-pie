import { spawn } from "node:child_process";

const children = [
  spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "watch:tsc"],
    {
      stdio: "inherit",
    },
  ),
  spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "watch:esbuild"],
    {
      stdio: "inherit",
    },
  ),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(code), 50);
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      shutdown(1);
      return;
    }

    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
