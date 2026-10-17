import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli } from "./helpers.mjs";

const leer = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const comandosDe = (cfg) =>
  Object.values(cfg.hooks ?? {})
    .flat()
    .flatMap((g) => g.hooks.map((h) => h.command));
const deSebastian = (cfg) => comandosDe(cfg).filter((c) => c.includes("sebastian.mjs"));

describe("instalar y desinstalar", () => {
  let entorno;
  beforeEach(() => {
    entorno = crearEntorno();
    const hookDelUsuario = { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hola" }] }] } };
    fs.writeFileSync(entorno.settings, JSON.stringify(hookDelUsuario));
  });
  afterEach(() => entorno.limpiar());

  it("instalar dos veces deja un solo juego de hooks", async () => {
    await runCli(["instalar"], { env: entorno.env });
    await runCli(["instalar"], { env: entorno.env });
    expect(deSebastian(leer(entorno.settings))).toHaveLength(7);
  });

  it("desinstalar quita los hooks de sebastian y deja los del usuario", async () => {
    await runCli(["instalar"], { env: entorno.env });
    const r = await runCli(["desinstalar"], { env: entorno.env });
    expect(r.code).toBe(0);
    expect(comandosDe(leer(entorno.settings))).toEqual(["echo hola"]);
  });

  it("desinstalar no toca hooks ajenos con un nombre parecido", async () => {
    const ajeno = 'node "/tools/misebastian.mjs" hook Stop';
    fs.writeFileSync(
      entorno.settings,
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: ajeno }] }] } })
    );
    await runCli(["desinstalar"], { env: entorno.env });
    expect(comandosDe(leer(entorno.settings))).toEqual([ajeno]);
  });
});
