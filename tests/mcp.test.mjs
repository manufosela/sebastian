// sebastian mcp: servidor MCP por stdio que ven las sesiones de todas las cuentas.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirMcp, runHook } from "./helpers.mjs";

describe("servidor MCP", () => {
  let home;
  let personal;
  let mcp;
  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sebastian-mcp-"));
    personal = path.join(home, ".claude");
    await runHook("SessionStart", { session_id: "p1", cwd: "/tmp/grebla" }, { env: { HOME: home } });
    await runHook(
      "SessionStart",
      { session_id: "t1", cwd: "/tmp/portal" },
      { env: { HOME: home, CLAUDE_CONFIG_DIR: path.join(home, ".claude-trabajo") } }
    );
    // Claude Code registra cada sesión por su pid: aquí, este proceso hace de sesión p1.
    fs.mkdirSync(path.join(personal, "sessions"), { recursive: true });
    fs.writeFileSync(
      path.join(personal, "sessions", `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: "p1", name: "GREBLA", cwd: "/tmp/grebla" })
    );
    mcp = abrirMcp({ HOME: home, CLAUDE_CONFIG_DIR: personal });
  });
  afterEach(() => {
    mcp.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("se presenta como servidor MCP de herramientas", async () => {
    const r = await mcp.pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    expect(r.result.serverInfo.name).toBe("sebastian");
    expect(r.result.capabilities.tools).toBeDefined();
    const { result } = await mcp.pedir("tools/list");
    expect(result.tools.map((t) => t.name)).toContain("sebastian_lista");
  });

  it("sebastian_lista devuelve las sesiones de todas las cuentas y marca a quien pregunta", async () => {
    const r = await mcp.llamar("sebastian_lista");
    expect(r.isError).toBeFalsy();
    const texto = r.content[0].text;
    expect(texto).toMatch(/grebla-p1.*personal.*← tú/);
    expect(texto).toMatch(/portal-t1.*trabajo/);
    expect(texto).not.toMatch(/portal-t1.*← tú/);
  });

  it("un método desconocido devuelve un error JSON-RPC", async () => {
    const r = await mcp.pedir("no/existe");
    expect(r.error.code).toBe(-32601);
  });

  it("una petición malformada recibe un error y el servidor sigue vivo", async () => {
    for (const linea of ["null", "[]", '{"id":7}']) {
      expect((await mcp.enviarLinea(linea)).error.code).toBe(-32600);
    }
    expect((await mcp.pedir("ping")).result).toEqual({});
  });
});
