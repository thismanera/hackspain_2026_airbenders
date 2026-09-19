# Guion de demo — Embat Flow (75 s dentro del pitch de 3 min)

Diseño en `docs/superpowers/specs/2026-09-19-demo-video-design.md`. Este
guion se ensaya cinco veces y se graba tal cual para el vídeo. Nada se
depura en el escenario.

Marcas: `[missing: …]` = dato que falta y hay que rellenar antes del primer
ensayo. `(pendiente §x)` = pieza de UI que aún no existe; hasta que exista,
ese paso no está en el golden path sino en el plan B de alcance (§7).

## 1. El momento de la demo

**El jurado ve cómo una empresa aparece en la cartera del partner en el
instante en que ella pulsa "pedir circulante", y cómo tres meses antes de
un déficit ya había una alerta; hoy eso son cuentas anuales de hace ocho
meses y ocho dossiers.**

Qué funciona hoy de verdad (en `main`, con fixtures): cartera con filtros y
selector de mes, ficha de empresa con cascada, decisión, menú y alertas, y
grafo de grupo con pulsos. Qué está pendiente de construir: vista pyme,
estado "solicitada" sincronizado, cartera `vista=partner`, scrubber de
tiempo y plató `/demo`. Qué es fake y se dice: los datos son fixtures si la
UI no se ha conectado a Prisma antes de H−8.

Empresas: **Y** `[missing: id]` (mejora, `ampliar`), **X** `[missing: id]`
(deterioro, alerta desde `t−3`), grupo **Z** `[missing: id]`. Mes de la
demo `t` = `[missing: AAAA-MM]`.

## 2. Golden path (72 s; el aha cae en el segundo 12 y se remata en el 40)

Escenario: `/demo` a pantalla completa en 1920×1080. Izquierda vista pyme de
Y, derecha cartera del partner con dos líneas vivas de semilla. Barra
inferior con la frase del narrador.

| s | Actor | Acción | Entrada fija | Qué aparece | Narrador (ES) |
| --- | --- | --- | --- | --- | --- |
| 0 | Driver | Ya está en `/demo`, beat 1 | — | Izq: pulso de Y, score `[missing]`, banda, "Puedes ampliar de `[missing]` a `[missing]` k€". Der: cartera del partner con 2 empresas; Y no está | "Esta es la empresa. Ve su nota cada mes, su oferta pre-aprobada. El partner, a la derecha, no la ve." |
| 8 | Driver | Clic en **"Pedir circulante"** (izq) (pendiente §2.1-2.2) | — | Izq: "Solicitud enviada · compartido: score, cascada, límite y menú". Der: fila de Y entra animada; aviso "Y ha pedido circulante · ampliar `[missing]` → `[missing]` k€" | "Pulsa pedir. Ahora sí. Y solo ahora." |
| 16 | Driver | `PageDown` → beat 2: der. pasa a ficha de X en `t` | URL de beat | Ficha de X: score, estado, "Reducir de `[missing]` a `[missing]` k€: {motivo}" | "Esta otra empresa se está torciendo. La oferta se ajusta sola." |
| 24 | Driver | Clic en la marca "alerta" del scrubber (pendiente §2.4) | mes `t−3` | Scrubber salta a `t−3`; cascada de ese mes; alerta con "desde `t−3`" | "En `[missing: mes]` ya lo vimos: margen cayendo y dependencia de línea." |
| 32 | Driver | `Espacio` en el scrubber: reproduce hasta `t+3` | — | Meses pasan a 2 por segundo; en `t+3` la banda "Anticipación: `[missing: k]` meses" queda fija; déficit tres meses | "Tres meses después, déficit. Anticipamos `[missing: k]` meses. Un banco con cuentas anuales se entera en `[missing: mes]`." |
| 42 | Driver | `PageDown` → beat 3: der. pasa a grupo Z | URL de beat | Grafo de grupo: centro con score consolidado; filial sana con pulso rosa (contagio); hermana en `cerrar`; techo de grupo | "Y esto un banco no lo ve nunca: el grupo. Esta filial está sana, pero su hermana la arrastra. El límite es del grupo." |
| 54 | Driver | `PageDown` → beat 4: der. vuelve a cartera del partner | URL de beat | Cartera con Y dentro, X con `reducir`, filtro `deterioro` activo | "El partner presta viendo. Cada mes, no cada año." |
| 62 | Narrador | Pausa; driver no toca nada | — | Misma pantalla | "Nada llega al partner hasta que la empresa pide. Y cuando pide, le sale más barato que con tres años de cuentas." |
| 72 | — | Fin. Vuelta a slide | — | — | — |

Reglas: el driver no escribe texto libre nunca. Cada beat tiene su URL
fija en `lib/features/demo/beats.ts`. Si algún `[missing]` sigue vacío en
el primer ensayo, ese paso se corta, no se improvisa.

## 3. Pre-warm (dos minutos antes de subir)

1. `pnpm build && pnpm start` ya corriendo desde H−2 (no `dev`: sin
   recompilaciones en directo). Pestaña 1: `/demo` a pantalla completa
   (F11), beat 1, `R` pulsado para reiniciar `solicitadas`.
2. Recorrer los cuatro beats una vez y volver al 1 (calienta rutas y
   fixtures; con Prisma, calienta las consultas).
3. Navegador al 125 %. Notificaciones del sistema off. Bloqueo de pantalla
   off. Modo no molestar on.
4. Pestaña 2: vídeo de respaldo (mp4 local, sin voz) abierto y pausado en
   el segundo 0.
5. Pestaña 3: `/demo` de reserva ya cargada, por si la 1 se cuelga.
6. Hotspot del móvil encendido aunque no haga falta red (la app es local).
7. Volumen del portátil al 0 (el vídeo de respaldo va sin voz; narra Pablo).

## 4. Pre-flight (H−35 min)

- Cargador y adaptador HDMI/USB-C; probado en el proyector si dejan.
- Vídeo de respaldo en el portátil **y** en el móvil (descargado, no en la
  nube).
- Capturas de los cuatro beats en el móvil.
- Este guion impreso, una copia por persona.
- `git stash list` vacío y `main` limpio en el portátil de demo: nadie toca
  el repo después de H−2.

## 5. Escalera de fallback

| Peldaño | Disparador | Qué se hace | Línea del narrador mientras el driver cambia |
| --- | --- | --- | --- |
| 1. En directo | — | Golden path | — |
| 2. Respuestas cacheadas | Cualquier cambio de beat tarda más de 5 s, o un error en pantalla | Driver pasa a la pestaña 3 (`/demo` de reserva) y sigue en el beat que tocaba | "Mientras carga: esto es lo que el partner ve cada mes." |
| 3. Vídeo sin voz | Cuenta de tres sin nada en pantalla, o pestaña 3 también falla | Driver pasa a pestaña 2, reproduce desde el segundo del beat; Pablo narra encima con las mismas frases | "Os lo enseño grabado, es la misma pantalla de esta mañana." |
| 4. Capturas | Portátil muerto o sin señal | Móvil con las cuatro capturas, pasadas a mano; Pablo narra | "Sin pantalla, os lo cuento con capturas: la empresa, el partner, la alerta, el grupo." |

Vídeo de respaldo: se graba en **H−7** con la misma grabación del vídeo de
entrega (cuerpo sin voz, 60-70 s). La copia con voz **no** se usa en
directo: el narrador es Pablo.

## 6. Driver y narrador

- **Narrador**: Pablo. No toca el teclado. Mira al jurado, no a la
  pantalla.
- **Driver**: `[missing: nombre]`. Solo teclado y un clic. No habla.
- Líneas de traspaso:
  1. "Ahora `[driver]` pulsa pedir circulante." (s 8)
  2. "`[driver]`, llévanos a la empresa que se tuerce." (s 16)
  3. "`[driver]`, al grupo." (s 42)

## 7. Plan B de alcance (si a H−8 falta una pieza)

| Falta | Golden path sustituto |
| --- | --- |
| Vista pyme o sincronización (§2.1-2.3 del spec) | Empieza en cartera `t` con filtro `deterioro` → ficha X → grupo Z → ficha Y con `ampliar` (el golden path antiguo de `SOURCE.md` §4.3). Se pierde el aha del opt-in; se cuenta en voz |
| Scrubber (§2.4) | Se usa el `Select` de mes: driver elige `t−3`, luego `t+3`. El narrador dice el `k` en voz |
| `/demo` (§2.6) | Dos ventanas del navegador a mitad de pantalla cada una, `Win+←` / `Win+→`; el narrador señala con la mano |

## 8. Ensayos

1. Cinco pasadas completas cronometradas; se apunta el tiempo de cada una
   (objetivo 70-75 s).
2. Pasada 3 con el peldaño 2 forzado (cerrar pestaña 1 a la mitad).
3. Pasada 5 con el peldaño 3 forzado (tirar de la red y bloquear la app).
4. Tras cada pasada, un solo cambio de guion como máximo.
5. Última pasada con el proyector real o, si no hay, con una tele al 125 %.
