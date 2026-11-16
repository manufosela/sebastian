// La app de terminal: lista de pendientes, abrir uno y contestar al buzón, sin Claude.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli, runHook } from "./helpers.mjs";

describe("sebastian panel", () => {
  let entorno;
  const pagos = { session_id: "s1", cwd: "/tmp/pagos" };
  const parar = (texto) => runHook("Stop", { ...pagos, last_assistant_message: texto }, { env: entorno.env });
  const panel = (entrada) => runCli(["panel"], { env: entorno.env, stdin: entrada });
  const buzon = () => path.join(entorno.dir, "buzon", "s1.txt");

  beforeEach(async () => {
    entorno = crearEntorno();
    await runHook("SessionStart", pagos, { env: entorno.env });
  });
  afterEach(() => entorno.limpiar());

  it("abre un pendiente y la línea siguiente se envía como de Mánu", async () => {
    await parar(`${"contexto ".repeat(40)}¿Uso la rama develop?`);
    const r = await panel("1\nsí, develop\nq\n");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/ 1 {2}PREGUNTA {2}pagos-s1 · personal · hace/);
    expect(r.stdout).toContain("¿Uso la rama develop?");
    expect(r.stdout).toContain("Enviado a pagos-s1");
    expect(fs.readFileSync(buzon(), "utf8")).toBe("De Mánu (vía Sebastian):\n\nsí, develop");
  });

  it("Enter sin texto vuelve a la lista sin enviar nada", async () => {
    await parar("¿Sigo?");
    await panel("1\n\nq\n");
    expect(fs.existsSync(buzon())).toBe(false);
  });

  it("abrir una respuesta la deja leída", async () => {
    await runCli(["decir", "s1", "¿mergeas?"], { env: entorno.env });
    await runHook("PostToolUse", pagos, { env: entorno.env });
    await parar("Hecho: PR mergeada.");
    expect((await panel("1\n\nq\n")).stdout).toContain("Hecho: PR mergeada.");
    expect((await runCli(["pendientes"], { env: entorno.env })).stdout).toContain("No hay nada pendiente.");
  });

  it("cada pendiente es una tarjeta separada, sin color fuera de una terminal", async () => {
    await parar("¿Uso develop?");
    await runHook("SessionStart", { session_id: "s2", cwd: "/tmp/api" }, { env: entorno.env });
    await runHook(
      "Stop",
      { session_id: "s2", cwd: "/tmp/api", last_assistant_message: "¿Y tú?" },
      { env: entorno.env }
    );
    const { stdout } = await panel("q\n");
    expect(stdout).toMatch(/PREGUNTA {2}pagos-s1.*\n {4}¿Uso develop\?\n\n 2 {2}PREGUNTA {2}api-s2/);
    expect(stdout).not.toContain("\x1b[");
  });

  it("el resumen cabe en dos líneas: parte las palabras largas y acaba en «…»", async () => {
    await parar(`${"x".repeat(300)} fin?`);
    const { stdout } = await panel("q\n");
    // Fuera de una terminal el ancho es 100: 96 de tarjeta, 92 de resumen.
    expect(stdout).toContain(`\n    ${"x".repeat(92)}\n    ${"x".repeat(91)}…\n`);
  });

  it("los emojis cuentan como un carácter y no se parten", async () => {
    await parar(`${"😀".repeat(300)} fin?`);
    const { stdout } = await panel("q\n");
    expect(stdout).toContain(`\n    ${"😀".repeat(92)}\n    ${"😀".repeat(91)}…\n`);
  });

  it("un número que no está lo dice y sigue en la lista", async () => {
    const r = await panel("7\nq\n");
    expect(r.stdout).toContain("No hay pendiente 7");
    expect(r.code).toBe(0);
  });
});
