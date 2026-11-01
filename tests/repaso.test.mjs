// sebastian repaso: una ficha por sesión activa, con los riesgos que se pueden medir.
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli, runHook } from "./helpers.mjs";

const linea = (type, texto) => JSON.stringify({ type, message: { content: texto } });

describe("sebastian repaso", () => {
  let entorno;
  const ficha = (sid) => path.join(entorno.dir, "sesiones", `${sid}.json`);
  // Registra una sesión con su transcript y deja su ficha con el estado y la hora dados.
  const sesion = async (sid, cwd, mensajes, cambios = {}) => {
    const transcript = path.join(entorno.raiz, `${sid}.jsonl`);
    fs.writeFileSync(transcript, mensajes.map(([rol, t]) => linea(rol, t)).join("\n"));
    await runHook("SessionStart", { session_id: sid, cwd, transcript_path: transcript }, { env: entorno.env });
    const s = JSON.parse(fs.readFileSync(ficha(sid), "utf8"));
    fs.writeFileSync(ficha(sid), JSON.stringify({ ...s, ...cambios }));
  };
  const repaso = async () => (await runCli(["repaso"], { env: entorno.env })).stdout;
  const hace = (min) => new Date(Date.now() - min * 60e3).toISOString();

  beforeEach(() => {
    entorno = crearEntorno();
  });
  afterEach(() => entorno.limpiar());

  it("resume cada sesión con su última petición y su último mensaje", async () => {
    await sesion("p1", "/tmp/pagos", [
      ["user", "añade el endpoint de cobros"],
      ["assistant", "Hecho el endpoint, faltan los tests."],
    ]);
    const salida = await repaso();
    expect(salida).toContain("## pagos-p1 (personal)");
    expect(salida).toContain("Pidió: añade el endpoint de cobros");
    expect(salida).toContain("Último: Hecho el endpoint, faltan los tests.");
    expect(salida).toContain("Riesgos: ninguno a la vista");
  });

  it("señala una espera larga y un bucle", async () => {
    await sesion("e1", "/tmp/api", [["assistant", "¿Sigo?"]], { estado: "esperando", ts: hace(45) });
    await sesion("b1", "/tmp/web", [
      ["assistant", "Reintento el build."],
      ["assistant", "Reintento el build."],
      ["assistant", "Reintento el build."],
    ]);
    const salida = await repaso();
    expect(salida).toMatch(/## api-e1[\s\S]*espera larga \(esperando hace 45m\)/);
    expect(salida).toMatch(/## web-b1[\s\S]*bucle: repite el mismo mensaje/);
  });

  it("en un transcript enorme lee solo el final", async () => {
    const relleno = Array.from({ length: 50_000 }, () => JSON.stringify({ type: "progress", x: "·".repeat(100) }));
    await sesion("g1", "/tmp/grande", [["user", "petición antigua"]]);
    const transcript = path.join(entorno.raiz, "g1.jsonl");
    fs.appendFileSync(transcript, `\n${relleno.join("\n")}\n${linea("assistant", "lo más reciente")}`);
    const salida = await repaso();
    expect(salida).toContain("Pidió: (nada)");
    expect(salida).toContain("Último: lo más reciente");
  });

  it("no repasa las sesiones cerradas", async () => {
    await sesion("c1", "/tmp/vieja", [["assistant", "adiós"]], { estado: "cerrada", cerrada: true });
    expect(await repaso()).toBe("No hay sesiones activas que repasar.\n");
  });
});
