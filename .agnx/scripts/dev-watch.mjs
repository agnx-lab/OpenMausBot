#!/usr/bin/env node
// 场景：OpenMausBot 胶水热更 — 改 .agnx/src 后重建 dist。
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agnxRoot = path.resolve(__dirname, "..");
const srcDir = path.join(agnxRoot, "src");
const buildScript = path.join(__dirname, "build.mjs");

let busy = false;
let queued = false;

function runBuild() {
  if (busy) {
    queued = true;
    return;
  }
  busy = true;
  const child = spawn(process.execPath, [buildScript], {
    cwd: agnxRoot,
    stdio: "inherit",
  });
  child.on("exit", () => {
    busy = false;
    if (queued) {
      queued = false;
      runBuild();
    }
  });
}

console.log("[openmausbot agnx] watching src/ …");
runBuild();
watch(srcDir, { recursive: true }, () => {
  runBuild();
});
