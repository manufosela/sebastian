import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ARRANCAR = fileURLToPath(new URL("../supervisor/arrancar.sh", import.meta.url));

// Sustituye a claude por un script que apunta sus argumentos y su entorno.
describe("arrancar.sh", () => {
  let dir;
  let salida;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sebastian-arrancar-"));
    salida = path.join(dir, "salida.json");
    const falso = [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.env.SALIDA, JSON.stringify({",
      "  args: process.argv.slice(2),",
      "  cwd: process.cwd(),",
      "  rol: process.env.SEBASTIAN_ROL,",
      "  baseUrl: process.env.ANTHROPIC_BASE_URL ?? null,",
      "  config: process.env.CLAUDE_CONFIG_DIR ?? null,",
      "}));",
      "if (process.env.DORMIR) setTimeout(() => {}, Number(process.env.DORMIR));",
    ].join("\n");
    fs.writeFileSync(path.join(dir, "claude"), falso, { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const entorno = (extra = {}) => ({
    PATH: `${dir}${path.delimiter}${process.env.PATH}`,
    SALIDA: salida,
    SEBASTIAN_DIR: dir,
    ANTHROPIC_BASE_URL: "http://localhost:9999",
    CLAUDE_CONFIG_DIR: path.join(dir, ".claude-trabajo"),
    ...extra,
  });
  const arrancar = (args = []) => {
    const r = spawnSync("bash", [ARRANCAR, ...args], { env: entorno() });
    expect(r.status).toBe(0);
    return JSON.parse(fs.readFileSync(salida, "utf8"));
  };

  it("usa siempre la configuración personal de Claude, venga de donde venga", () => {
    expect(arrancar().config).toBeNull();
  });

  it("si ya hay un Sebastian vivo, avisa y no abre otro", async () => {
    const primero = spawn("bash", [ARRANCAR], { env: entorno({ DORMIR: "5000" }) });
    for (let i = 0; i < 50 && !fs.existsSync(salida); i++) await new Promise((r) => setTimeout(r, 100));
    fs.rmSync(salida);
    const segundo = spawnSync("bash", [ARRANCAR], { env: entorno(), encoding: "utf8" });
    primero.kill();
    expect(segundo.status).toBe(1);
    expect(segundo.stderr).toContain("Ya hay un Sebastian");
    expect(fs.existsSync(salida)).toBe(false);
  });

  it("abre una sesión en la terminal conectada en remoto y le dice que arranque", () => {
    expect(arrancar().args).toEqual(["--rc", "Sebastian", "arranca"]);
  });

  it("pasa los argumentos extra a claude", () => {
    expect(arrancar(["--verbose"]).args).toEqual(["--rc", "Sebastian", "arranca", "--verbose"]);
  });

  it("se marca como supervisor, quita ANTHROPIC_BASE_URL y arranca en su carpeta", () => {
    const r = arrancar();
    expect(r.rol).toBe("supervisor");
    expect(r.baseUrl).toBeNull();
    expect(r.cwd).toBe(path.dirname(ARRANCAR));
  });
});
