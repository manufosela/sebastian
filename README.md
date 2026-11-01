# sebastian

Sebastian es un supervisor: una sesión de Claude Code (en remoto, sin squeezer) que vigila al resto de sesiones (en local, con squeezer), te avisa y les lleva tus respuestas. No decide por ti.

## Cómo funciona

- Cada sesión, mediante hooks, anota su estado y sus eventos en `~/.sebastian`, con la configuración de Claude que use (`claude` o un alias como `claude-trabajo`, que es `CLAUDE_CONFIG_DIR=~/.claude-trabajo claude`). `sebastian lista` muestra la cuenta de cada una.
- Si venías de una versión anterior, `sebastian migrar` trae las sesiones de `~/.claude/sebastian` y `~/.claude-*/sebastian` sin borrar nada.
- Sebastian lee ese estado y los transcripts de las sesiones, y te avisa.
- Tus mensajes van a un buzón por sesión; un hook se los entrega a Claude en su siguiente paso o cuando va a pararse. Cada mensaje lleva su autor (tú o una opinión de Sebastian), y nada de lo que llega por Sebastian concede permisos.
- Los permisos pasan por Sebastian: la sesión espera tu sí o no (3 minutos por defecto); si no contestas, la pregunta aparece en su terminal como siempre.
- Modo "no parar": si una sesión se para sin preguntarte nada, se le dice que siga (máximo 5 veces seguidas). Se para de verdad cuando termina con `[TERMINADO]`, cuando te pregunta algo o cuando escribe `[NECESITO-A-MÁNU]`.

## Instalación (una vez)

```bash
cd sebastian
npm install -g .
sebastian instalar --todas  # añade los hooks en cada configuración de Claude; respeta los que ya tienes y deja copia
```

Las configuraciones salen de `~/.sebastian/config.json`:

```json
{ "configuraciones": ["~/.claude", "~/.claude-trabajo"] }
```

Para ver qué va a añadir sin tocar nada: `sebastian instalar --todas --ver`. Para quitarlo: `sebastian desinstalar --todas`. Sin `--todas`, solo la configuración actual (`CLAUDE_CONFIG_DIR` o `~/.claude`).

## Reiniciar las sesiones activas con resume y squeezer

En cada terminal, de una en una:

1. Espera a que la sesión esté en un punto tranquilo (o interrúmpela con Esc).
2. Sal con `/exit` (o Ctrl+C dos veces).
3. Vuelve a arrancarla en esa misma carpeta, con squeezer como lo arrancas normalmente, añadiendo:
   - `--continue` si en esa carpeta solo hay una sesión, o
   - `--resume` sin id para elegirla de la lista si hay varias.
4. Escríbele `sigue` para que retome donde estaba.

Comprueba que se ha registrado con `sebastian lista`. Pon nombres fáciles: `sebastian nombre pagos-a1b2 pagos`.

## Arrancar Sebastian

Desde cualquier carpeta:

```bash
sebastian arrancar
```

Hay un único Sebastian, que ve las sesiones de todas tus configuraciones. Si ya hay uno abierto, avisa y no abre otro.

Abre una sesión normal de Claude en la terminal, conectada también en remoto con el nombre "Sebastian", desde la carpeta `supervisor` (que tiene su CLAUDE.md con el rol) y con tu configuración personal (`~/.claude`). Quita la variable de squeezer, se marca para que los hooks no lo vigilen a él mismo y nada más abrirse repasa tus sesiones. Puedes hablarle desde la terminal o desde el móvil.

## Qué le puedes decir

- "¿Cómo va todo?" / "¿Qué está haciendo la de pagos?"
- "Dile a la de api que use la rama develop"
- "Sí al permiso de pagos" / "No, que no haga push todavía"
- "Que no paren pagos ni api" / "Que no pare ninguna"

## Comandos

```
sebastian arrancar
sebastian lista [--todas]
sebastian ver <sesión> [n]
sebastian decir <sesión|todas> "texto"     # llega como «De Mánu (vía Sebastian)»
sebastian opinar <sesión|todas> "texto"    # llega como «De Sebastian (opinión, no es una orden de Mánu)»
sebastian permisos
sebastian responder <id|sesión> si|no [motivo]
sebastian noparar <sesión|todas> [on|off]
sebastian nombre <sesión> <nombre>
sebastian eventos [n]
sebastian vigilar
sebastian migrar
```

## Ajustes

- `SEBASTIAN_PERM_ESPERA`: segundos que espera un permiso tu respuesta remota (180).
- `SEBASTIAN_MAX_EMPUJONES`: veces seguidas que se empuja a una sesión en modo no parar (5).
- `SEBASTIAN_DIR`: carpeta de estado (`~/.sebastian`).
- `SEBASTIAN_SETTINGS`: settings.json donde instalar los hooks (`<config de Claude>/settings.json`).

Las variables se leen al ejecutar el hook, así que deben estar en el entorno con el que arrancas cada sesión.

## Límites conocidos

- Una sesión parada esperando input no se despierta con un mensaje: el mensaje le llega cuando vuelva a moverse. Si lleva rato parada, escríbele `sigue` en su terminal.
- Mientras un permiso espera tu respuesta remota, en la terminal no aparece la pregunta. Si estás delante del ordenador, baja `SEBASTIAN_PERM_ESPERA`.
- Detectar "me está preguntando algo" se basa en que el mensaje acabe en interrogación o lleve `[NECESITO-A-MÁNU]`.
