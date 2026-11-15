// Lo que las sesiones tienen para Mánu: preguntas, comandos y respuestas, que se van solas.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli, runHook } from "./helpers.mjs";

describe("sebastian pendientes", () => {
  let entorno;
  const pagos = { session_id: "s1", cwd: "/tmp/pagos" };
  const api = { session_id: "s2", cwd: "/tmp/api" };
  const parar = (sesion, texto) =>
    runHook("Stop", { ...sesion, last_assistant_message: texto }, { env: entorno.env });
  const pendientes = async (...args) => (await runCli(["pendientes", ...args], { env: entorno.env })).stdout;

  beforeEach(async () => {
    entorno = crearEntorno();
    await runHook("SessionStart", pagos, { env: entorno.env });
    await runHook("SessionStart", api, { env: entorno.env });
  });
  afterEach(() => entorno.limpiar());

  it("lista numerada con pregunta, comando y respuesta", async () => {
    await parar(pagos, "¿Uso la rama develop?");
    await parar(api, "Ejecuta esto:\n\n```\nbash /tmp/x.sh\n```\n\n[NECESITO-A-MÁNU]");
    const lista = await pendientes();
    expect(lista).toMatch(/1\. pregunta · pagos-s1/);
    expect(lista).toMatch(/2\. comando · api-s2/);
    await runHook("UserPromptSubmit", api, { env: entorno.env });
    await parar(api, "Hecho: tests en verde.");
    expect(await pendientes()).toMatch(/2\. respuesta · api-s2 .*Hecho: tests en verde\./);
  });

  it("sin pendientes lo dice", async () => {
    expect(await pendientes()).toContain("No hay nada pendiente.");
  });

  it("una pregunta desaparece cuando la sesión se mueve", async () => {
    await parar(pagos, "¿Sigo?");
    await runHook("UserPromptSubmit", pagos, { env: entorno.env });
    expect(await pendientes()).toContain("No hay nada pendiente.");
  });

  it("abrir una pregunta la muestra entera y no la quita", async () => {
    await parar(pagos, `${"contexto ".repeat(80)}¿Uso la rama develop?`);
    expect(await pendientes("1")).toContain("¿Uso la rama develop?");
    expect(await pendientes()).toMatch(/1\. pregunta · pagos-s1/);
  });

  it("abrir una respuesta la marca como leída y sale de la lista", async () => {
    await parar(pagos, "Hecho: PR mergeada.");
    expect(await pendientes("pagos")).toContain("Hecho: PR mergeada.");
    expect(await pendientes()).toContain("No hay nada pendiente.");
  });

  it("un número que no está da error", async () => {
    const r = await runCli(["pendientes", "7"], { env: entorno.env });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("No hay pendiente 7");
  });
});
