// sebastian_enviar y sebastian_buzon: las sesiones se hablan entre sí, con el remitente sellado.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirMcp, runCli, runHook } from "./helpers.mjs";

describe("MCP: mensajes entre sesiones", () => {
  let home;
  let comun;
  let registro;
  let mcp;
  const trabajo = () => ({ HOME: home, CLAUDE_CONFIG_DIR: path.join(home, ".claude-trabajo") });
  const iniciar = (sid, cwd, env = { HOME: home }) =>
    runHook("SessionStart", { session_id: sid, cwd }, { env });
  const buzones = () => fs.readdirSync(path.join(comun, "buzon"));

  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sebastian-enviar-"));
    comun = path.join(home, ".sebastian");
    await iniciar("p1", "/tmp/grebla");
    await iniciar("t1", "/tmp/portal", trabajo());
    // Este proceso hace de sesión p1, renombrada GREBLA en Claude Code.
    registro = path.join(home, ".claude", "sessions", `${process.pid}.json`);
    fs.mkdirSync(path.dirname(registro), { recursive: true });
    fs.writeFileSync(registro, JSON.stringify({ sessionId: "p1", name: "GREBLA", cwd: "/tmp/grebla" }));
    mcp = abrirMcp({ HOME: home, CLAUDE_CONFIG_DIR: path.join(home, ".claude") });
  });
  afterEach(() => {
    mcp.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("GREBLA manda un mensaje a portal, de otra cuenta, y le llega firmado por GREBLA", async () => {
    const r = await mcp.llamar("sebastian_enviar", { destino: "portal", texto: "ya está el endpoint" });
    expect(r.isError).toBeFalsy();
    const entrega = await runHook(
      "PostToolUse",
      { session_id: "t1", cwd: "/tmp/portal" },
      { env: trabajo() }
    );
    expect(JSON.parse(entrega.stdout).hookSpecificOutput.additionalContext).toContain(
      "De GREBLA (vía Sebastian):\n\nya está el endpoint"
    );
    const eventos = fs
      .readFileSync(path.join(comun, "eventos.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    expect(eventos.find((e) => e.tipo === "mensaje-sesion")).toMatchObject({
      de: "GREBLA",
      nombre: "portal-t1",
      ts: expect.any(String),
    });
  });

  it("no se puede firmar como otro: el remitente no es un parámetro", async () => {
    await mcp.llamar("sebastian_enviar", { destino: "portal", texto: "hola", de: "Mánu" });
    expect(fs.readFileSync(path.join(comun, "buzon", "t1.txt"), "utf8")).toMatch(
      /^De GREBLA \(vía Sebastian\)/
    );
  });

  it.each([
    ["ambiguo", "portal", "ambiguo"],
    ["inexistente", "nadie", "No encuentro"],
    ["ella misma", "grebla", "eres tú"],
    ["todas", "todas", "todas"],
  ])("un destino %s falla en claro y no escribe nada", async (_caso, destino, error) => {
    await iniciar("t2", "/tmp/portal-api", trabajo());
    const r = await mcp.llamar("sebastian_enviar", { destino, texto: "hola" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain(error);
    expect(buzones()).toEqual([]);
  });

  it("sin registro de su sesión, no firma a ciegas", async () => {
    fs.rmSync(registro);
    const r = await mcp.llamar("sebastian_enviar", { destino: "portal", texto: "hola" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("No sé qué sesión eres");
    expect(buzones()).toEqual([]);
  });

  it("sebastian_buzon entrega los mensajes pendientes con su autor y vacía el buzón", async () => {
    await runCli(["decir", "grebla", "revisa el PR"], { env: { HOME: home } });
    const r = await mcp.llamar("sebastian_buzon");
    expect(r.content[0].text).toContain("De Mánu (vía Sebastian):\n\nrevisa el PR");
    expect((await mcp.llamar("sebastian_buzon")).content[0].text).toBe("No tienes mensajes.");
  });
});
