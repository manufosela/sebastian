// Ejecuta sebastian.mjs como proceso hijo, igual que Claude Code, sobre un estado temporal.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../sebastian.mjs", import.meta.url));

// Crea un estado y un settings.json temporales. Llama a limpiar() al acabar el test.
export function crearEntorno() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "sebastian-test-"));
  const dir = path.join(raiz, "estado");
  const settings = path.join(raiz, "settings.json");
  const env = { SEBASTIAN_DIR: dir, SEBASTIAN_SETTINGS: settings };
  return {
    raiz,
    dir,
    settings,
    env,
    limpiar: () => fs.rmSync(raiz, { recursive: true, force: true }),
  };
}

function ejecutar(args, { env = {}, stdin = "" } = {}) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [CLI, ...args], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    });
    let stdout = "";
    let stderr = "";
    hijo.stdout.on("data", (d) => {
      stdout += d;
    });
    hijo.stderr.on("data", (d) => {
      stderr += d;
    });
    hijo.on("error", reject);
    hijo.on("close", (code) => resolve({ code, stdout, stderr }));
    hijo.stdin.end(stdin);
  });
}

export function runCli(args, opciones) {
  return ejecutar(args, opciones);
}

// Lanza un hook con su payload JSON por stdin, como hace Claude Code.
export function runHook(evento, payload, opciones = {}) {
  return ejecutar(["hook", evento], { ...opciones, stdin: JSON.stringify(payload) });
}
