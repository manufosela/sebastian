import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ARRANCAR = fileURLToPath(new URL("../supervisora/arrancar.sh", import.meta.url));

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
      "}));",
    ].join("\n");
    fs.writeFileSync(path.join(dir, "claude"), falso, { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const arrancar = (args = []) => {
    const r = spawnSync("bash", [ARRANCAR, ...args], {
      env: {
        PATH: `${dir}${path.delimiter}${process.env.PATH}`,
        SALIDA: salida,
        ANTHROPIC_BASE_URL: "http://localhost:9999",
      },
    });
    expect(r.status).toBe(0);
    return JSON.parse(fs.readFileSync(salida, "utf8"));
  };

  it("arranca remote-control en modo same-dir sin preguntar", () => {
    expect(arrancar().args).toEqual(["remote-control", "--spawn=same-dir"]);
  });

  it("pasa los argumentos extra a claude", () => {
    expect(arrancar(["--verbose"]).args).toEqual(["remote-control", "--spawn=same-dir", "--verbose"]);
  });

  it("se marca como supervisora, quita ANTHROPIC_BASE_URL y arranca en su carpeta", () => {
    const r = arrancar();
    expect(r.rol).toBe("supervisora");
    expect(r.baseUrl).toBeNull();
    expect(r.cwd).toBe(path.dirname(ARRANCAR));
  });
});
