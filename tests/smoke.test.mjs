import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli, runHook } from "./helpers.mjs";

describe("helpers de test", () => {
  let entorno;
  beforeEach(() => {
    entorno = crearEntorno();
  });
  afterEach(() => entorno.limpiar());

  it("el CLI sin argumentos muestra la ayuda y crea el estado en la carpeta temporal", async () => {
    const r = await runCli([], { env: entorno.env });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("sebastian: gestiona tus sesiones");
    for (const d of ["sesiones", "buzon", "permisos", "noparar"]) {
      expect(fs.existsSync(path.join(entorno.dir, d))).toBe(true);
    }
  });

  it("un hook registra la sesión en la carpeta temporal", async () => {
    const r = await runHook(
      "SessionStart",
      { session_id: "abc123", cwd: "/tmp/proyecto" },
      { env: entorno.env }
    );
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(entorno.dir, "sesiones", "abc123.json"))).toBe(true);
  });

  it("limpiar() borra todo lo temporal", () => {
    const { raiz } = entorno;
    entorno.limpiar();
    expect(fs.existsSync(raiz)).toBe(false);
  });
});
