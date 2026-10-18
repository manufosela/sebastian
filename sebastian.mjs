#!/usr/bin/env node
// sebastian: proxy entre una sesión supervisora de Claude Code y el resto de sesiones.
// Sin dependencias. Estado en <config de Claude>/sebastian (o $SEBASTIAN_DIR).
// La config de Claude es $CLAUDE_CONFIG_DIR o ~/.claude: un Sebastian por cada una.
//
// Dos usos:
//   sebastian hook <Evento>        lo llaman los hooks de Claude Code (stdin JSON)
//   sebastian <comando> [...]      lo usas tú o la supervisora

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Una variable vacía cuenta como no definida.
const variable = (nombre) => process.env[nombre] || undefined;
const CONFIG_CLAUDE = variable("CLAUDE_CONFIG_DIR") ?? path.join(os.homedir(), ".claude");
const DIR = variable("SEBASTIAN_DIR") ?? path.join(CONFIG_CLAUDE, "sebastian");
const D = {
  sesiones: path.join(DIR, "sesiones"),
  buzon: path.join(DIR, "buzon"),
  permisos: path.join(DIR, "permisos"),
  noparar: path.join(DIR, "noparar"),
  eventos: path.join(DIR, "eventos.jsonl"),
};
const ESPERA_PERMISO = Number(process.env.SEBASTIAN_PERM_ESPERA || 180); // segundos
const MAX_EMPUJONES = Number(process.env.SEBASTIAN_MAX_EMPUJONES || 5);
const MARCA_NECESITA = "[NECESITO-A-MÁNU]";
const MARCA_TERMINADO = "[TERMINADO]";
const SEP = "\n\n---\n\n";

const ESTE_FICHERO = fileURLToPath(import.meta.url);

// ---------- utilidades ----------

function asegurarDirs() {
  for (const d of [D.sesiones, D.buzon, D.permisos, D.noparar]) fs.mkdirSync(d, { recursive: true });
}
function leerJSON(f, defecto = null) {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return defecto;
  }
}
function escribirJSON(f, obj) {
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, f);
}
function ahora() {
  return new Date().toISOString();
}
function corto(id) {
  return String(id || "").slice(0, 8);
}
function recortar(t, n = 400) {
  const s = String(t || "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
function hace(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s)) return "?";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
function evento(tipo, datos = {}) {
  fs.appendFileSync(D.eventos, `${JSON.stringify({ ts: ahora(), tipo, ...datos })}\n`);
}

// ---------- sesiones ----------

const fSesion = (sid) => path.join(D.sesiones, `${sid}.json`);
const fBuzon = (sid) => path.join(D.buzon, `${sid}.txt`);
const fNoParar = (sid) => path.join(D.noparar, `${sid}.json`);

function sesiones() {
  return fs
    .readdirSync(D.sesiones)
    .filter((f) => f.endsWith(".json"))
    .map((f) => leerJSON(path.join(D.sesiones, f)))
    .filter(Boolean)
    .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
}

function actualizarSesion(p, cambios) {
  const f = fSesion(p.session_id);
  const previa = leerJSON(f, {});
  const base = path.basename(p.cwd || previa.cwd || "sesion");
  const s = {
    sid: p.session_id,
    nombre: previa.nombre || `${base}-${corto(p.session_id).slice(0, 4)}`,
    cwd: p.cwd || previa.cwd,
    transcript: p.transcript_path || previa.transcript,
    ...previa,
    ...cambios,
    ts: ahora(),
  };
  if (p.transcript_path) s.transcript = p.transcript_path;
  escribirJSON(f, s);
  return s;
}

function resolver(ref) {
  if (!ref) throw new Error("Falta la sesión (nombre o inicio del id).");
  const todas = sesiones();
  const exacta = todas.find((s) => s.nombre === ref || s.sid === ref);
  if (exacta) return exacta;
  const parecidas = todas.filter((s) => s.sid.startsWith(ref) || (s.nombre || "").includes(ref));
  if (parecidas.length === 1) return parecidas[0];
  if (parecidas.length > 1)
    throw new Error(`"${ref}" es ambiguo: ${parecidas.map((s) => s.nombre).join(", ")}`);
  throw new Error(`No encuentro la sesión "${ref}". Usa "sebastian lista --todas".`);
}

// ---------- buzón ----------

function sacarBuzon(sid) {
  const f = fBuzon(sid);
  if (!fs.existsSync(f)) return null;
  const tomado = `${f}.${process.pid}.entregando`;
  try {
    fs.renameSync(f, tomado);
  } catch {
    return null;
  } // otro hook se lo llevó
  const texto = fs.readFileSync(tomado, "utf8").trim();
  fs.unlinkSync(tomado);
  return texto || null;
}
function pendienteBuzon(sid) {
  return fs.existsSync(fBuzon(sid));
}

// ---------- transcript ----------

function textoDeContenido(content) {
  if (typeof content === "string") return { texto: content, herramientas: [] };
  const partes = Array.isArray(content) ? content : [];
  return {
    texto: partes
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n"),
    herramientas: partes.filter((c) => c.type === "tool_use").map((c) => c.name),
    esResultado: partes.some((c) => c.type === "tool_result"),
  };
}

function leerTranscript(f) {
  if (!f || !fs.existsSync(f)) return [];
  const out = [];
  for (const linea of fs.readFileSync(f, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    let r;
    try {
      r = JSON.parse(linea);
    } catch {
      continue;
    }
    if (r.type !== "user" && r.type !== "assistant") continue;
    if (r.isMeta) continue;
    const { texto, herramientas, esResultado } = textoDeContenido(r.message?.content);
    if (r.type === "user" && esResultado && !texto) continue;
    if (!texto && herramientas.length === 0) continue;
    out.push({ rol: r.type, texto, herramientas, ts: r.timestamp });
  }
  return out;
}

function ultimoMensajeAsistente(p) {
  if (p.last_assistant_message) {
    const m = p.last_assistant_message;
    return typeof m === "string" ? m : textoDeContenido(m.content ?? m).texto;
  }
  const t = leerTranscript(p.transcript_path).filter((e) => e.rol === "assistant" && e.texto);
  return t.length ? t[t.length - 1].texto : "";
}

// ---------- hooks ----------

function salir(obj) {
  if (obj) process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

function textoMensaje(texto) {
  return `Mensaje de Mánu (a través de la sesión supervisora):\n\n${texto}`;
}

const TEXTO_EMPUJON = [
  "Mánu ha pedido que no pares mientras no necesites nada de él.",
  "Continúa con el siguiente paso pendiente de tu tarea.",
  `Si de verdad necesitas una decisión, respuesta o autorización suya, termina tu mensaje con una línea ${MARCA_NECESITA} y explica exactamente qué necesitas.`,
  `Si has terminado todo lo que se te pidió, termina tu mensaje con una línea ${MARCA_TERMINADO} y un resumen breve.`,
].join(" ");

async function leerStdin() {
  let datos = "";
  for await (const trozo of process.stdin) datos += trozo;
  try {
    return JSON.parse(datos || "{}");
  } catch {
    return {};
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function hook(nombreEvento) {
  if (process.env.SEBASTIAN_ROL === "supervisora") salir();
  const p = await leerStdin();
  if (!p.session_id) salir();
  asegurarDirs();
  const ev = nombreEvento || p.hook_event_name;
  const base = { sid: p.session_id };

  switch (ev) {
    case "SessionStart": {
      const s = actualizarSesion(p, { estado: "activa", cerrada: false });
      evento("inicio", { ...base, nombre: s.nombre, origen: p.source });
      salir();
      break;
    }
    case "UserPromptSubmit": {
      actualizarSesion(p, { estado: "trabajando" });
      reiniciarEmpujones(p.session_id);
      salir();
      break;
    }
    case "PostToolUse": {
      const s = actualizarSesion(p, { estado: "trabajando" });
      reiniciarEmpujones(p.session_id);
      const msg = sacarBuzon(p.session_id);
      if (!msg) salir();
      evento("entregado", { ...base, nombre: s.nombre, cuando: "trabajando", texto: recortar(msg, 200) });
      salir({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: textoMensaje(msg) } });
      break;
    }
    case "Notification": {
      const tipo =
        p.notification_type ||
        (/permission/i.test(p.message || "")
          ? "permission_prompt"
          : /waiting|input/i.test(p.message || "")
            ? "idle_prompt"
            : "otro");
      const estado =
        tipo === "permission_prompt" ? "pide-permiso" : tipo === "idle_prompt" ? "esperando" : undefined;
      const s = actualizarSesion(p, estado ? { estado } : {});
      evento("aviso", { ...base, nombre: s.nombre, tipoAviso: tipo, texto: recortar(p.message, 300) });
      salir();
      break;
    }
    case "PermissionRequest": {
      await gestionarPermiso(p);
      break;
    }
    case "Stop": {
      gestionarParada(p);
      break;
    }
    case "SessionEnd": {
      const s = actualizarSesion(p, { estado: "cerrada", cerrada: true });
      evento("cerrada", { ...base, nombre: s.nombre, motivo: p.reason });
      salir();
      break;
    }
    default:
      salir();
  }
}

function reiniciarEmpujones(sid) {
  const f = fNoParar(sid);
  const np = leerJSON(f);
  if (np && np.empujones) escribirJSON(f, { ...np, empujones: 0 });
}

function gestionarParada(p) {
  const sid = p.session_id;
  const base = { sid };

  // 1. Si hay mensaje tuyo en el buzón, se le entrega y sigue.
  const msg = sacarBuzon(sid);
  if (msg) {
    const s = actualizarSesion(p, { estado: "trabajando" });
    evento("entregado", { ...base, nombre: s.nombre, cuando: "al-parar", texto: recortar(msg, 200) });
    salir({ decision: "block", reason: textoMensaje(msg) });
  }

  const ultimo = ultimoMensajeAsistente(p);
  const resumen = recortar(ultimo, 600);
  const np = leerJSON(fNoParar(sid));

  const necesita = ultimo.includes(MARCA_NECESITA) || /\?\s*$/.test(ultimo.trim());
  const terminado = ultimo.includes(MARCA_TERMINADO);

  if (necesita) {
    const s = actualizarSesion(p, { estado: "necesita-te" });
    evento("necesita-te", { ...base, nombre: s.nombre, texto: resumen });
    salir();
  }
  if (terminado) {
    const s = actualizarSesion(p, { estado: "terminada" });
    evento("terminada", { ...base, nombre: s.nombre, texto: resumen });
    salir();
  }

  // 2. Orden de no parar: empujón, con tope para no quemar tokens en bucle.
  if (np && np.activo) {
    const empujones = (np.empujones || 0) + 1;
    if (empujones <= MAX_EMPUJONES) {
      escribirJSON(fNoParar(sid), { ...np, empujones });
      const s = actualizarSesion(p, { estado: "trabajando" });
      evento("empujon", { ...base, nombre: s.nombre, n: empujones, texto: recortar(ultimo, 200) });
      salir({ decision: "block", reason: TEXTO_EMPUJON });
    }
    const s = actualizarSesion(p, { estado: "parada" });
    evento("limite-empujones", { ...base, nombre: s.nombre, texto: resumen });
    salir();
  }

  // 3. Parada normal.
  const s = actualizarSesion(p, { estado: "parada" });
  evento("parada", { ...base, nombre: s.nombre, texto: resumen });
  salir();
}

async function gestionarPermiso(p) {
  const sid = p.session_id;
  const pid = `${corto(sid).slice(0, 4)}-${Date.now().toString(36)}`;
  const f = path.join(D.permisos, `${pid}.json`);
  const s = actualizarSesion(p, { estado: "pide-permiso" });
  const herramienta = p.tool_name || p.tool?.name || "?";
  const entrada = p.tool_input || p.input || {};
  escribirJSON(f, { pid, sid, nombre: s.nombre, herramienta, entrada, ts: ahora(), estado: "pendiente" });
  evento("permiso", {
    sid,
    nombre: s.nombre,
    pid,
    herramienta,
    detalle: recortar(JSON.stringify(entrada), 300),
  });

  const limite = Date.now() + ESPERA_PERMISO * 1000;
  while (Date.now() < limite) {
    const r = leerJSON(f);
    if (r && r.estado === "si") {
      fs.unlinkSync(f);
      actualizarSesion(p, { estado: "trabajando" });
      evento("permiso-resuelto", { sid, pid, respuesta: "si" });
      salir({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
    }
    if (r && r.estado === "no") {
      fs.unlinkSync(f);
      actualizarSesion(p, { estado: "trabajando" });
      evento("permiso-resuelto", { sid, pid, respuesta: "no" });
      const motivo = r.motivo ? `Mánu lo ha denegado: ${r.motivo}` : "Mánu lo ha denegado.";
      salir({
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "deny", message: motivo },
        },
      });
    }
    if (!r) salir(); // alguien lo borró: se deja la pregunta normal en la terminal
    await dormir(1000);
  }
  // Sin respuesta a tiempo: se cancela aquí y aparece la pregunta normal en la terminal.
  try {
    fs.unlinkSync(f);
  } catch {}
  evento("permiso-expirado", { sid, pid, nombre: s.nombre });
  salir();
}

// ---------- comandos ----------

const HOOKS = [
  ["SessionStart", 10],
  ["UserPromptSubmit", 10],
  ["PostToolUse", 10],
  ["Notification", 10],
  ["PermissionRequest", ESPERA_PERMISO + 30],
  ["Stop", 30],
  ["SessionEnd", 10],
];
// Reconoce el comando que escribe instalar: node "<ruta>/sebastian.mjs" hook <Evento>
const MARCA_HOOK = /(?:^|[\\/"])sebastian\.mjs"?\s+hook\s/;

function rutaSettings() {
  return variable("SEBASTIAN_SETTINGS") ?? path.join(CONFIG_CLAUDE, "settings.json");
}

function instalar(args) {
  const f = rutaSettings();
  const actual = leerJSON(f, {});
  const copia = `${f}.antes-de-sebastian.${Date.now()}`;
  if (fs.existsSync(f)) fs.copyFileSync(f, copia);
  const nuevo = quitarHooks(actual);
  nuevo.hooks = nuevo.hooks || {};
  for (const [ev, timeout] of HOOKS) {
    nuevo.hooks[ev] = nuevo.hooks[ev] || [];
    nuevo.hooks[ev].push({
      ...(["PostToolUse", "PermissionRequest"].includes(ev) ? { matcher: "*" } : {}),
      hooks: [{ type: "command", command: `node "${ESTE_FICHERO}" hook ${ev}`, timeout }],
    });
  }
  if (args.includes("--ver")) {
    console.log(JSON.stringify(nuevo.hooks, null, 2));
    return;
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  escribirJSON(f, nuevo);
  console.log(`Hooks de sebastian instalados en ${f}`);
  if (fs.existsSync(copia)) console.log(`Copia de seguridad: ${copia}`);
}

function quitarHooks(cfg) {
  const c = JSON.parse(JSON.stringify(cfg || {}));
  if (!c.hooks) return c;
  for (const ev of Object.keys(c.hooks)) {
    c.hooks[ev] = c.hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !MARCA_HOOK.test(String(h.command ?? ""))) }))
      .filter((g) => g.hooks.length > 0);
    if (c.hooks[ev].length === 0) delete c.hooks[ev];
  }
  if (Object.keys(c.hooks).length === 0) delete c.hooks;
  return c;
}

function desinstalar() {
  const f = rutaSettings();
  if (!fs.existsSync(f)) return console.log("No hay settings.json.");
  fs.copyFileSync(f, `${f}.antes-de-quitar-sebastian.${Date.now()}`);
  escribirJSON(f, quitarHooks(leerJSON(f, {})));
  console.log(`Hooks de sebastian quitados de ${f}`);
}

function lista(args) {
  const todas = args.includes("--todas");
  const perms = permisosPendientes();
  const filas = sesiones().filter((s) => todas || (!s.cerrada && Date.now() - new Date(s.ts) < 24 * 3600e3));
  if (filas.length === 0) return console.log("No hay sesiones registradas todavía.");
  for (const s of filas) {
    const extras = [];
    const np = leerJSON(fNoParar(s.sid));
    if (np?.activo) extras.push(`no-parar${np.empujones ? ` (${np.empujones}/${MAX_EMPUJONES})` : ""}`);
    const n = perms.filter((p) => p.sid === s.sid).length;
    if (n) extras.push(`${n} permiso(s)`);
    if (pendienteBuzon(s.sid)) extras.push("mensaje sin entregar");
    console.log(
      `${s.nombre.padEnd(24)} ${corto(s.sid)}  ${String(s.estado).padEnd(13)} hace ${hace(s.ts).padEnd(4)} ${s.cwd || ""}${extras.length ? `  [${extras.join(", ")}]` : ""}`
    );
  }
}

function ver([ref, n = "12"]) {
  const s = resolver(ref);
  console.log(`# ${s.nombre} (${s.sid})\n# ${s.cwd}\n# estado: ${s.estado}, hace ${hace(s.ts)}\n`);
  const t = leerTranscript(s.transcript).slice(-Number(n));
  for (const e of t) {
    const quien = e.rol === "user" ? "TÚ" : "CLAUDE";
    const tools = e.herramientas.length ? ` [usa: ${e.herramientas.join(", ")}]` : "";
    console.log(`--- ${quien}${tools}\n${recortar(e.texto, 1500)}\n`);
  }
}

function decir([ref, ...resto]) {
  const texto = resto.join(" ").trim();
  if (!texto) throw new Error("Falta el texto del mensaje.");
  const destinos = ref === "todas" ? sesiones().filter((s) => !s.cerrada) : [resolver(ref)];
  for (const s of destinos) {
    const f = fBuzon(s.sid);
    fs.appendFileSync(f, (fs.existsSync(f) ? SEP : "") + texto);
    evento("mensaje-encolado", { sid: s.sid, nombre: s.nombre, texto: recortar(texto, 200) });
    const cuando = ["trabajando", "activa"].includes(s.estado)
      ? "se entregará en su siguiente paso"
      : 'está parada: se entregará cuando vuelva a moverse (si lleva rato parada, hay que escribirle "sigue" en su terminal)';
    console.log(`Encolado para ${s.nombre}: ${cuando}.`);
  }
}

function permisosPendientes() {
  return fs
    .readdirSync(D.permisos)
    .filter((f) => f.endsWith(".json"))
    .map((f) => leerJSON(path.join(D.permisos, f)))
    .filter((p) => p && p.estado === "pendiente")
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

function permisos() {
  const ps = permisosPendientes();
  if (ps.length === 0) return console.log("No hay permisos pendientes.");
  for (const p of ps) {
    console.log(
      `${p.pid}  ${p.nombre}  hace ${hace(p.ts)}  ${p.herramienta}\n    ${recortar(JSON.stringify(p.entrada), 500)}`
    );
  }
}

function responder([ref, respuesta, ...motivo]) {
  if (!["si", "sí", "no"].includes(respuesta))
    throw new Error("Uso: sebastian responder <permiso|sesión> si|no [motivo]");
  const ps = permisosPendientes();
  let p = ps.find((x) => x.pid === ref);
  if (!p) {
    const s = resolver(ref);
    p = ps.find((x) => x.sid === s.sid);
  }
  if (!p) throw new Error(`No hay permiso pendiente para "${ref}".`);
  const f = path.join(D.permisos, `${p.pid}.json`);
  escribirJSON(f, { ...p, estado: respuesta === "no" ? "no" : "si", motivo: motivo.join(" ") || undefined });
  console.log(`Respondido "${respuesta}" a ${p.nombre}: ${p.herramienta}.`);
}

function noParar([ref, modo = "on"]) {
  const destinos = ref === "todas" ? sesiones().filter((s) => !s.cerrada) : [resolver(ref)];
  for (const s of destinos) {
    if (modo === "off") {
      try {
        fs.unlinkSync(fNoParar(s.sid));
      } catch {}
    } else escribirJSON(fNoParar(s.sid), { activo: true, empujones: 0, desde: ahora() });
    console.log(`${s.nombre}: no-parar ${modo === "off" ? "desactivado" : "activado"}.`);
  }
}

function nombrar([ref, nombre]) {
  if (!nombre) throw new Error("Uso: sebastian nombre <sesión> <nombre>");
  const s = resolver(ref);
  escribirJSON(fSesion(s.sid), { ...s, nombre });
  console.log(`${corto(s.sid)} ahora se llama ${nombre}.`);
}

function eventos([n = "20"]) {
  if (!fs.existsSync(D.eventos)) return console.log("Sin eventos todavía.");
  const lineas = fs.readFileSync(D.eventos, "utf8").trim().split("\n").slice(-Number(n));
  for (const l of lineas) console.log(formatearEvento(JSON.parse(l)));
}

// Solo estos despiertan a Sebastian: cada despertar gasta tokens.
// "aviso" repite lo que ya dicen "permiso" y "parada"; "inicio" y "cerrada" no piden nada.
const IMPORTANTES = new Set([
  "permiso",
  "necesita-te",
  "terminada",
  "parada",
  "limite-empujones",
  "permiso-expirado",
]);

function formatearEvento(e) {
  const hora = e.ts.slice(11, 19);
  const quien = e.nombre || corto(e.sid);
  const extra = [e.herramienta, e.pid && `id ${e.pid}`, e.tipoAviso, e.origen, e.respuesta, e.n && `#${e.n}`]
    .filter(Boolean)
    .join(" · ");
  const texto = e.texto || e.detalle || "";
  return `${hora} ${e.tipo.toUpperCase()} ${quien}${extra ? ` (${extra})` : ""}${texto ? `: ${texto}` : ""}`;
}

// Para la herramienta Monitor: cada línea que imprime es un aviso para la supervisora.
async function vigilar(args) {
  const todo = args.includes("--todo");
  let pos = fs.existsSync(D.eventos) ? fs.statSync(D.eventos).size : 0;
  const yaAvisado = new Map(); // evita repetir el mismo aviso de "parada" de una sesión
  for (;;) {
    if (fs.existsSync(D.eventos)) {
      const tam = fs.statSync(D.eventos).size;
      if (tam < pos) pos = 0;
      if (tam > pos) {
        const fd = fs.openSync(D.eventos, "r");
        const buf = Buffer.alloc(tam - pos);
        fs.readSync(fd, buf, 0, buf.length, pos);
        fs.closeSync(fd);
        pos = tam;
        for (const l of buf.toString("utf8").split("\n")) {
          if (!l.trim()) continue;
          let e;
          try {
            e = JSON.parse(l);
          } catch {
            continue;
          }
          if (!todo && !IMPORTANTES.has(e.tipo)) continue;
          const clave = `${e.sid}:${e.tipo}:${e.texto || ""}`;
          if (yaAvisado.get(e.sid) === clave) continue;
          yaAvisado.set(e.sid, clave);
          console.log(formatearEvento(e));
        }
      }
    }
    await dormir(2000);
  }
}

const AYUDA = `sebastian: gestiona tus sesiones de Claude Code desde una sesión supervisora

  sebastian instalar [--ver]      añade los hooks a ~/.claude/settings.json (con copia)
  sebastian desinstalar           los quita
  sebastian lista [--todas]       sesiones y su estado
  sebastian ver <sesión> [n]      últimos n mensajes de una sesión (12 por defecto)
  sebastian decir <sesión|todas> ...  deja un mensaje tuyo en su buzón
  sebastian permisos              permisos pendientes
  sebastian responder <id|sesión> si|no [motivo]
  sebastian noparar <sesión|todas> [on|off]
  sebastian nombre <sesión> <nombre>  pone un nombre fácil a una sesión
  sebastian eventos [n]           últimos eventos
  sebastian vigilar [--todo]      sigue los eventos en directo (para Monitor)

<sesión> es un nombre o el inicio de su id.
Variables: SEBASTIAN_DIR, SEBASTIAN_PERM_ESPERA (seg, ${ESPERA_PERMISO}), SEBASTIAN_MAX_EMPUJONES (${MAX_EMPUJONES}).`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  asegurarDirs();
  const comandos = {
    hook: () => hook(args[0]),
    instalar: () => instalar(args),
    desinstalar,
    lista: () => lista(args),
    ver: () => ver(args),
    decir: () => decir(args),
    permisos,
    responder: () => responder(args),
    noparar: () => noParar(args),
    nombre: () => nombrar(args),
    eventos: () => eventos(args),
    vigilar: () => vigilar(args),
  };
  const fn = comandos[cmd];
  if (!fn) {
    console.log(AYUDA);
    return;
  }
  try {
    await fn();
  } catch (e) {
    if (cmd === "hook") process.exit(0); // un fallo de sebastian nunca debe molestar a la sesión
    console.error(e.message);
    process.exit(1);
  }
}

main();
