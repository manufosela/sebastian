// sebastian vigilar solo imprime los eventos que merecen despertar a Sebastian.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../sebastian.mjs", import.meta.url));
const TODOS = [
  "aviso",
  "inicio",
  "cerrada",
  "entregado",
  "permiso",
  "necesita-te",
  "terminada",
  "parada",
  "limite-empujones",
  "permiso-expirado",
];
const QUE_DESPIERTAN = [
  "permiso",
  "necesita-te",
  "terminada",
  "parada",
  "limite-empujones",
  "permiso-expirado",
];

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Arranca vigilar, escribe un evento de cada tipo y devuelve lo que imprime.
async function vigilarConEventos(entorno, args = []) {
  const hijo = spawn(process.execPath, [CLI, "vigilar", ...args], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...entorno.env },
  });
  let salida = "";
  hijo.stdout.on("data", (d) => {
    salida += d;
  });
  await esperar(500);
  const lineas = TODOS.map((tipo, i) =>
    JSON.stringify({ ts: new Date().toISOString(), tipo, sid: `s${i}`, texto: tipo })
  );
  fs.appendFileSync(path.join(entorno.dir, "eventos.jsonl"), `${lineas.join("\n")}\n`);
  await esperar(2800);
  hijo.kill();
  return salida;
}

describe("sebastian vigilar", () => {
  let entorno;
  beforeEach(async () => {
    entorno = crearEntorno();
    await runCli([], { env: entorno.env }); // crea la carpeta de estado
  });
  afterEach(() => entorno.limpiar());

  it("solo imprime los eventos que piden algo a Mánu o le dan información", async () => {
    const salida = await vigilarConEventos(entorno);
    const lineas = salida.trim().split("\n").filter(Boolean);
    expect(lineas).toHaveLength(QUE_DESPIERTAN.length);
    for (const tipo of ["aviso", "inicio", "cerrada", "entregado"]) {
      const sid = `s${TODOS.indexOf(tipo)}`;
      expect(lineas.some((l) => l.includes(sid))).toBe(false);
    }
  }, 10000);

  it("con --todo imprime todos los eventos", async () => {
    const salida = await vigilarConEventos(entorno, ["--todo"]);
    expect(salida.trim().split("\n").filter(Boolean)).toHaveLength(TODOS.length);
  }, 10000);
});
