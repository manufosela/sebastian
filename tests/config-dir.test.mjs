import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli, runHook } from "./helpers.mjs";

// Sin SEBASTIAN_DIR ni SEBASTIAN_SETTINGS: las rutas salen de la configuración de Claude.
describe("un Sebastian por configuración de Claude", () => {
  let entorno;
  let trabajo;
  beforeEach(() => {
    entorno = crearEntorno();
    trabajo = path.join(entorno.raiz, ".claude-trabajo");
  });
  afterEach(() => entorno.limpiar());

  const sesion = { session_id: "s1", cwd: "/tmp/proyecto" };

  it("con CLAUDE_CONFIG_DIR, el estado va a <config>/sebastian", async () => {
    await runHook("SessionStart", sesion, { env: { HOME: entorno.raiz, CLAUDE_CONFIG_DIR: trabajo } });
    expect(fs.existsSync(path.join(trabajo, "sebastian", "sesiones", "s1.json"))).toBe(true);
  });

  it("sin CLAUDE_CONFIG_DIR, el estado va a ~/.claude/sebastian", async () => {
    await runHook("SessionStart", sesion, { env: { HOME: entorno.raiz } });
    expect(fs.existsSync(path.join(entorno.raiz, ".claude", "sebastian", "sesiones", "s1.json"))).toBe(true);
  });

  it("instalar escribe los hooks en el settings.json de CLAUDE_CONFIG_DIR", async () => {
    const r = await runCli(["instalar"], { env: { HOME: entorno.raiz, CLAUDE_CONFIG_DIR: trabajo } });
    expect(r.code).toBe(0);
    const cfg = JSON.parse(fs.readFileSync(path.join(trabajo, "settings.json"), "utf8"));
    expect(cfg.hooks.Stop[0].hooks[0].command).toMatch(/sebastian\.mjs" hook Stop$/);
    expect(fs.existsSync(path.join(entorno.raiz, ".claude", "settings.json"))).toBe(false);
  });

  it("SEBASTIAN_DIR manda sobre CLAUDE_CONFIG_DIR", async () => {
    await runHook("SessionStart", sesion, {
      env: { HOME: entorno.raiz, CLAUDE_CONFIG_DIR: trabajo, SEBASTIAN_DIR: entorno.dir },
    });
    expect(fs.existsSync(path.join(entorno.dir, "sesiones", "s1.json"))).toBe(true);
    expect(fs.existsSync(path.join(trabajo, "sebastian"))).toBe(false);
  });
});
