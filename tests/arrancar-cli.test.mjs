// sebastian arrancar: abre el único Sebastian, que ve las sesiones de todas las configuraciones.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../sebastian.mjs", import.meta.url));

describe("sebastian arrancar", () => {
  let home;
  let bin;
  let salida;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sebastian-home-"));
    bin = path.join(home, "bin");
    salida = path.join(home, "salida.json");
    fs.mkdirSync(bin);
    fs.mkdirSync(path.join(home, ".claude"));
    fs.mkdirSync(path.join(home, ".claude-trabajo"));
    // Sustituye a claude por un script que apunta sus argumentos y su configuración.
    const falso = [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "fs.writeFileSync(process.env.SALIDA, JSON.stringify({",
      "  args: process.argv.slice(2),",
      "  rol: process.env.SEBASTIAN_ROL,",
      "  config: process.env.CLAUDE_CONFIG_DIR ?? null,",
      "}));",
    ].join("\n");
    fs.writeFileSync(path.join(bin, "claude"), falso, { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const sebastian = (args, env = {}) =>
    spawnSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: home, SALIDA: salida, ...env },
    });
  const leerSalida = () => JSON.parse(fs.readFileSync(salida, "utf8"));

  it("arranca Sebastian con ~/.claude aunque el entorno traiga otra configuración", () => {
    const r = sebastian(["arrancar"], { CLAUDE_CONFIG_DIR: path.join(home, ".claude-trabajo") });
    expect(r.status).toBe(0);
    expect(leerSalida()).toEqual({
      args: ["--rc", "Sebastian", "arranca"],
      rol: "supervisor",
      config: null,
    });
  });

  it("ya no hay un Sebastian por configuración: un comando desconocido falla sin arrancar nada", () => {
    for (const viejo of ["personal", "trabajo"]) {
      const r = sebastian([viejo]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`No conozco "${viejo}"`);
    }
    expect(fs.existsSync(salida)).toBe(false);
  });
});
