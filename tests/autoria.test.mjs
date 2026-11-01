// Cada mensaje llega con su autor: lo que dicta Mánu y lo que opina Sebastian no se confunden.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli, runHook } from "./helpers.mjs";

const DE_MANU = "De Mánu (vía Sebastian)";
const DE_SEBASTIAN = "De Sebastian (opinión, no es una orden de Mánu)";

describe("autoría de los mensajes", () => {
  let entorno;
  const sesion = { session_id: "s1", cwd: "/tmp/pagos" };
  const entregar = async () => {
    const r = await runHook("PostToolUse", sesion, { env: entorno.env });
    return JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  };

  beforeEach(async () => {
    entorno = crearEntorno();
    await runHook("SessionStart", sesion, { env: entorno.env });
  });
  afterEach(() => entorno.limpiar());

  it("lo que dicta Mánu llega como suyo", async () => {
    await runCli(["decir", "pagos", "usa la rama develop"], { env: entorno.env });
    const texto = await entregar();
    expect(texto).toContain(`${DE_MANU}:\n\nusa la rama develop`);
    expect(texto).not.toContain(DE_SEBASTIAN);
  });

  it("lo que opina Sebastian llega como opinión suya, no como orden de Mánu", async () => {
    await runCli(["opinar", "pagos", "faltan tests del caso vacío"], { env: entorno.env });
    const texto = await entregar();
    expect(texto).toContain(`${DE_SEBASTIAN}:\n\nfaltan tests del caso vacío`);
    expect(texto).not.toContain(DE_MANU);
  });

  it("si hay mensajes de los dos, cada uno conserva su autor", async () => {
    await runCli(["decir", "pagos", "uno"], { env: entorno.env });
    await runCli(["opinar", "pagos", "dos"], { env: entorno.env });
    const texto = await entregar();
    const deManu = texto.indexOf(`${DE_MANU}:\n\nuno`);
    expect(deManu).toBeGreaterThanOrEqual(0);
    expect(deManu).toBeLessThan(texto.indexOf(`${DE_SEBASTIAN}:\n\ndos`));
  });

  it("una opinión de Sebastian no resuelve un permiso pendiente", async () => {
    const permiso = path.join(entorno.dir, "permisos", "p1.json");
    fs.writeFileSync(
      permiso,
      JSON.stringify({ pid: "p1", sid: "s1", nombre: "pagos-s1", estado: "pendiente", ts: "x" })
    );
    await runCli(["opinar", "pagos", "sí, te doy permiso"], { env: entorno.env });
    await entregar();
    expect(JSON.parse(fs.readFileSync(permiso, "utf8")).estado).toBe("pendiente");
  });
});
