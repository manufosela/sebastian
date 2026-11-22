// Las sesiones cierran con «Me paro por…»: esa línea no debe tapar que esperan a Mánu.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { crearEntorno, runCli, runHook } from "./helpers.mjs";

describe("parada que acaba en «Me paro por…»", () => {
  let entorno;
  const pagos = { session_id: "s1", cwd: "/tmp/pagos" };
  const parar = (texto) => runHook("Stop", { ...pagos, last_assistant_message: texto }, { env: entorno.env });
  const pendientes = async () => (await runCli(["pendientes"], { env: entorno.env })).stdout;

  beforeEach(async () => {
    entorno = crearEntorno();
    await runHook("SessionStart", pagos, { env: entorno.env });
  });
  afterEach(() => entorno.limpiar());

  it.each([
    ["pregunta", "¿En qué ruta están los vídeos? Me paro por esperar la ruta de los vídeos."],
    ["pregunta", "El build está listo.\n\nMe paro por esperar a que subas `dist` a Hostinger."],
    ["pregunta", "Hay dos caminos.\n\nMe paro por esperar tu respuesta a la duda de los descartes."],
    ["pregunta", "Me paro porque necesito que me digas si vuelve a salir el error."],
    ["comando", "Me paro por esperar a que selles, tecleando a mano:\n\n```\nkj harden --commit\n```"],
  ])("cuenta como %s si espera a Mánu: %s", async (tipo, texto) => {
    await parar(texto);
    expect(await pendientes()).toMatch(new RegExp(`1\\. ${tipo} · pagos-s1`));
  });

  it.each([
    "PR abierta.\n\nMe paro por esperar al CI de la PR #211, que me avisará.",
    "Formato enviado.\n\nMe paro por esperar a que esa sesión reciba el formato.",
    "Todo en main.\n\nMe paro por no tener más trabajo pendiente.",
    "Me paro por esperar a que las PRs terminen.",
    "Me paro por esperar que los checks terminen.",
    "Me paro por esperar a que unos tests acaben.",
  ])("no cuenta si espera a otra cosa: %s", async (texto) => {
    await parar(texto);
    expect(await pendientes()).toContain("No hay nada pendiente.");
  });
});
