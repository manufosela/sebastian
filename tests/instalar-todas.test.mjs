// sebastian instalar|desinstalar --todas: los hooks en cada configuración de ~/.sebastian/config.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "./helpers.mjs";

describe("instalar --todas", () => {
  let home;
  let env;
  const settings = (cuenta) => path.join(home, cuenta, "settings.json");
  const leer = (cuenta) => JSON.parse(fs.readFileSync(settings(cuenta), "utf8"));

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "sebastian-todas-"));
    env = { HOME: home };
    for (const c of [".claude", ".claude-trabajo"]) fs.mkdirSync(path.join(home, c));
    fs.writeFileSync(settings(".claude"), JSON.stringify({ theme: "dark" }));
    fs.mkdirSync(path.join(home, ".sebastian"));
    fs.writeFileSync(
      path.join(home, ".sebastian", "config.json"),
      JSON.stringify({ configuraciones: ["~/.claude", "~/.claude-trabajo"] })
    );
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("añade los hooks en cada configuración de la lista y respeta lo que ya había", async () => {
    const r = await runCli(["instalar", "--todas"], { env });
    expect(r.code).toBe(0);
    expect(leer(".claude").theme).toBe("dark");
    expect(Object.keys(leer(".claude").hooks)).toHaveLength(7);
    expect(Object.keys(leer(".claude-trabajo").hooks)).toHaveLength(7);
  });

  it("con --ver enseña lo que añadiría en cada una sin tocar nada", async () => {
    const r = await runCli(["instalar", "--todas", "--ver"], { env });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(settings(".claude"));
    expect(r.stdout).toContain(settings(".claude-trabajo"));
    expect(leer(".claude").hooks).toBeUndefined();
    expect(fs.existsSync(settings(".claude-trabajo"))).toBe(false);
  });

  it("desinstalar --todas los quita de todas", async () => {
    await runCli(["instalar", "--todas"], { env });
    const r = await runCli(["desinstalar", "--todas"], { env });
    expect(r.code).toBe(0);
    expect(leer(".claude")).toEqual({ theme: "dark" });
    expect(leer(".claude-trabajo").hooks).toBeUndefined();
  });

  it("sin lista en ~/.sebastian/config.json falla y no toca nada", async () => {
    fs.rmSync(path.join(home, ".sebastian", "config.json"));
    const r = await runCli(["instalar", "--todas"], { env });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("config.json");
    expect(leer(".claude").hooks).toBeUndefined();
  });

  it("si una configuración de la lista no existe falla antes de tocar ninguna", async () => {
    fs.writeFileSync(
      path.join(home, ".sebastian", "config.json"),
      JSON.stringify({ configuraciones: ["~/.claude", "~/.claude-noexiste"] })
    );
    const r = await runCli(["instalar", "--todas"], { env });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(".claude-noexiste");
    expect(leer(".claude").hooks).toBeUndefined();
  });
});
