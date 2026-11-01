// Todas las configuraciones de Claude escriben en ~/.sebastian: un único sitio para un único Sebastian.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli, runHook } from "./helpers.mjs";

describe("estado común en ~/.sebastian", () => {
  let home;
  let comun;
  let trabajo;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sebastian-comun-"));
    comun = path.join(home, ".sebastian");
    trabajo = path.join(home, ".claude-trabajo");
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const ficha = (sid) => JSON.parse(fs.readFileSync(path.join(comun, "sesiones", `${sid}.json`), "utf8"));
  const escribir = (f, datos) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, typeof datos === "string" ? datos : JSON.stringify(datos));
  };

  it("una sesión de claude y otra de claude-trabajo escriben en ~/.sebastian con su cuenta", async () => {
    await runHook("SessionStart", { session_id: "p1", cwd: "/tmp/uno" }, { env: { HOME: home } });
    await runHook(
      "SessionStart",
      { session_id: "t1", cwd: "/tmp/dos" },
      { env: { HOME: home, CLAUDE_CONFIG_DIR: trabajo } }
    );
    expect(ficha("p1").cuenta).toBe(".claude");
    expect(ficha("t1").cuenta).toBe(".claude-trabajo");
    expect(fs.existsSync(path.join(trabajo, "sebastian"))).toBe(false);
  });

  it("lista muestra la cuenta de cada sesión", async () => {
    await runHook("SessionStart", { session_id: "p1", cwd: "/tmp/uno" }, { env: { HOME: home } });
    await runHook(
      "SessionStart",
      { session_id: "t1", cwd: "/tmp/dos" },
      { env: { HOME: home, CLAUDE_CONFIG_DIR: trabajo } }
    );
    const r = await runCli(["lista"], { env: { HOME: home } });
    expect(r.stdout).toMatch(/uno-p1.*personal/);
    expect(r.stdout).toMatch(/dos-t1.*trabajo/);
  });

  it("dos sesiones con el mismo nombre en cuentas distintas: el nombre es ambiguo y el sid manda", async () => {
    escribir(path.join(comun, "sesiones", "aaaa1111.json"), {
      sid: "aaaa1111",
      nombre: "api",
      cuenta: ".claude",
      estado: "activa",
    });
    escribir(path.join(comun, "sesiones", "bbbb2222.json"), {
      sid: "bbbb2222",
      nombre: "api",
      cuenta: ".claude-trabajo",
      estado: "activa",
    });
    const ambiguo = await runCli(["decir", "api", "hola"], { env: { HOME: home } });
    expect(ambiguo.code).toBe(1);
    expect(ambiguo.stderr).toContain("ambiguo");
    const porSid = await runCli(["decir", "bbbb2222", "hola"], { env: { HOME: home } });
    expect(porSid.code).toBe(0);
    expect(fs.readFileSync(path.join(comun, "buzon", "bbbb2222.txt"), "utf8")).toMatch(/hola$/);
  });

  it("migrar trae sesiones, noparar y buzones de cada configuración sin borrar las viejas", async () => {
    const viejaPersonal = path.join(home, ".claude", "sebastian");
    const viejaTrabajo = path.join(trabajo, "sebastian");
    escribir(path.join(viejaPersonal, "sesiones", "p1.json"), {
      sid: "p1",
      nombre: "pagos",
      ts: "2026-10-01T00:00:00Z",
    });
    escribir(path.join(viejaPersonal, "noparar", "p1.json"), { activo: true, empujones: 0 });
    escribir(path.join(viejaPersonal, "buzon", "p1.txt"), "pendiente");
    escribir(path.join(viejaTrabajo, "sesiones", "t1.json"), {
      sid: "t1",
      nombre: "portal",
      ts: "2026-10-01T00:00:00Z",
    });

    const r = await runCli(["migrar"], { env: { HOME: home } });
    expect(r.code).toBe(0);
    expect(ficha("p1")).toMatchObject({ nombre: "pagos", cuenta: ".claude" });
    expect(ficha("t1")).toMatchObject({ nombre: "portal", cuenta: ".claude-trabajo" });
    expect(fs.existsSync(path.join(comun, "noparar", "p1.json"))).toBe(true);
    expect(fs.readFileSync(path.join(comun, "buzon", "p1.txt"), "utf8")).toBe("pendiente");
    expect(fs.existsSync(path.join(viejaPersonal, "sesiones", "p1.json"))).toBe(true);
  });

  it("migrar no pisa una ficha más nueva que ya esté en ~/.sebastian", async () => {
    escribir(path.join(home, ".claude", "sebastian", "sesiones", "p1.json"), {
      sid: "p1",
      nombre: "viejo",
      ts: "2026-10-01T00:00:00Z",
    });
    escribir(path.join(comun, "sesiones", "p1.json"), {
      sid: "p1",
      nombre: "nuevo",
      cuenta: ".claude",
      ts: "2026-11-01T00:00:00Z",
    });
    await runCli(["migrar"], { env: { HOME: home } });
    expect(ficha("p1").nombre).toBe("nuevo");
  });
});
