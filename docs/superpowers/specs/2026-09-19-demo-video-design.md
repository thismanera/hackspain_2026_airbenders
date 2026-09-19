# Demo y vídeo — diseño (19-09-2026)

Entregables obligatorios: repo, vídeo y demo. Este documento cubre **demo**
y **vídeo**. Manda `PRODUCT.md` en producto y `docs/SOURCE.md` en cálculo;
aquí solo se decide qué se enseña, en qué orden y con qué piezas de UI.

Restricciones dadas por Pablo (19-09): quedan 12-24 h; hay demo en directo
ante jurado **y** vídeo; el vídeo no tiene límite de duración conocido;
**la demo tiene que valer también como vídeo** (una grabación de pantalla
captura toda la demo, sin depender de dos pantallas físicas).

## 0. En pocas palabras

Una ruta `/demo` muestra en una sola ventana la pantalla del tesorero a la
izquierda y la cartera del partner a la derecha. El tesorero ve su pulso
(score 24 meses), su benchmark y una oferta pre-aprobada; pulsa **"Pedir
circulante"** y la empresa aparece en la cartera del partner, que hasta ese
momento no la veía. Después, en la ficha, un scrubber de tiempo enseña que
la alerta salió `k` meses antes del problema, y el grafo de grupo (ya
existe) enseña aval y contagio. Esa misma ruta, grabada a 1080p, es el cuerpo
del vídeo; Remotion le pone apertura y cierre.

## 1. Idea de demo: "Dos pantallas, un grifo"

El corazón de `PRODUCT.md` §2 es la regla de oro: **nada llega al partner
hasta que la empresa pide**. La demo la hace física: dos paneles lado a
lado, el del partner vacío (o con dos líneas ya vivas), y un botón que hace
aparecer la empresa en el otro panel. Diez segundos, sin explicar nada.

Referentes de lanzamientos recientes en SF que confirman el patrón:
Plaid *Subscriber Data Refresh* (el prestamista se suscribe al dato del
prestatario tras originar, revocable), Mercury *Command* y Claude for Small
Business (el sistema prepara, el humano firma). No los citamos en la demo;
sí en el pitch si preguntan "¿por qué opt-in?".

Descartado: "Rebobinar" como demo única (un lienzo de cartera respirando
con un scrubber gigante) porque el backtest de alerta hoy es malo (recall
0,14, `SOURCE.md` §9.3) y con fixtures sería ficción; nos quedamos con su
scrubber como momento 2. Descartado: agente LLM redactando en directo,
porque la demo no puede depender de una llamada en vivo (`PRODUCT.md` §10)
y en 2026 todo el mundo enseña un agente.

## 2. Piezas de UI

Todas leen `lib/features/portfolio/source.ts`. La UI no calcula
(`PRODUCT.md` §7.4). Estética: `DESIGN.md` tal cual, sin tema nuevo.

### 2.1 Vista pyme — `app/(panel)/empresa/[companyId]/page.tsx` (nueva)

Lo que ve el tesorero de **una** empresa, a cierre del mes `mes` de la URL.

| Bloque | Contenido | De dónde |
| --- | --- | --- |
| Pulso | Línea del score 24 meses con estética de electrocardiograma (línea única, trazo fino, punto final que late suave). Etiqueta de estado en texto + glifo, no solo color | `CompanyFileResponse.history` (score por mes) |
| Cabecera | "Tu salud financiera a cierre de {mes}": score, banda, dirección | `score`, `decision.band`, `direccion` |
| Benchmark | Tres o cuatro variables con "tú vs mediana de pares" en llano ("tus clientes te pagan 12 días más tarde que la mediana"). Si `source.ts` no expone percentiles, se enseña solo `raw` con su umbral (`PRODUCT.md` §8.3) | `contributions` + umbrales de `indicators.ts` |
| Oferta pre-aprobada | Titular: acción + importe + cambio ("Puedes ampliar de 50 k€ a 80 k€"); menú (plazo, máximo, TAE). Si `eligible=false`: "Sin oferta este mes" con la puerta que falla | `decision` |
| Botón | **"Pedir circulante"** (primario). Al pulsar: estado `solicitada` para esa empresa, confirmación inline ("Compartido con el partner: score, cascada, límite y menú. Nunca movimientos ni facturas"), botón pasa a "Solicitud enviada" | `lib/features/demo/request-state.ts` |

Fuera: coste actual de financiación y sobrecoste (falta decisión de proxy de
deuda, `PRODUCT.md` §10 prioridad 1). No se inventa un número.

### 2.2 Estado "solicitada" y sincronización — `lib/features/demo/request-state.ts` (nuevo)

Sin backend ni tabla (`PRODUCT.md` §10 prioridad 5: "estado local basta").

- Conjunto de `companyId` solicitadas en `localStorage` (clave
  `embat-flow:solicitadas`), con semilla de 2-3 ids fijos para que la
  cartera del partner no esté vacía al arrancar.
- `BroadcastChannel("embat-flow")` con un mensaje
  `{ type: "solicitud", companyId, month }`. Lo emite la vista pyme; lo
  escuchan la cartera del partner y `/demo`. Funciona entre iframes,
  pestañas y ventanas del mismo origen: sirve para el plató de una ventana y
  para dos pantallas físicas.
- Hook `useSolicitadas()` que devuelve el conjunto y se actualiza con el
  canal y con el evento `storage`.
- Botón "Reiniciar demo" (solo en `/demo`) que borra la clave y recarga los
  dos paneles.

### 2.3 Cartera del partner — `app/(panel)/cartera` (cambio)

Nuevo parámetro de URL `vista=partner` (por defecto `grupo`, lo de hoy).

- Con `vista=partner`: filtra a empresas en `useSolicitadas()`. Cabecera
  "Cartera del partner · {n} empresas con línea". Sin más cambios de layout.
- Al recibir `solicitud` por el canal: la fila entra con animación de
  aparición (altura + opacidad, 400 ms) y un aviso arriba: "{empresa} ha
  pedido circulante · {acción} {anterior} → {nuevo} k€". El aviso se queda
  hasta el siguiente cambio de pantalla, no desaparece solo (proyector).
- Con `vista=grupo` nada cambia.

### 2.4 Scrubber de tiempo en la ficha — `components/grifo/month-scrubber.tsx` (nuevo)

Sustituye a `MonthSelect` **solo en la ficha de empresa**; la cartera
mantiene el `Select`. El mes sigue viviendo en la URL (`mes`), así que
cartera, ficha y grupo siguen sincronizados.

- Slider horizontal `2024-09 … 2026-08`, ticks por mes, etiqueta del mes
  grande encima del cursor.
- Marcas: alerta en `alert.confirmedMonth` (glifo + "alerta"), evento en el
  mes en que la empresa entró en `riesgo` o la acción pasó a
  `reducir`/`cerrar` (glifo + "evento"). Entre ambas, una banda con el texto
  "Anticipación: {k} meses" (`PRODUCT.md` §10 prioridad 4).
- Teclado: `←`/`→` mes a mes; barra espaciadora = reproducir a 2 meses/s
  hasta el final; `Esc` para. Ratón: arrastrar.
- El cambio de mes actualiza la URL con `shallow: false` (como hoy), así que
  la ficha entera se recalcula del `source`.

### 2.5 Grafo de grupo — sin cambios

`components/grifo/group/group-flow.tsx` ya enseña aval (pulso teal) y
contagio (pulso rosa). Solo entra en el guion.

### 2.6 Plató — `app/demo/page.tsx` (nueva, fuera del layout de panel)

Una ventana, 1920×1080, fondo de `DESIGN.md`.

- Dos iframes al 50 %: izquierda `/empresa/{Y}?mes={t}`, derecha
  `/cartera?vista=partner&mes={t}`. Reutiliza las rutas reales sin
  refactor; la sincronización ya viene del canal.
- Barra inferior (72 px) con la frase del narrador del beat actual, en
  `typography.headline`, y un contador "beat 3/7" pequeño a la derecha.
- Teclado: `PageDown` siguiente beat, `PageUp` anterior, `R` reinicia
  (borra `solicitadas`, recarga iframes). Son las teclas de un pasador de
  diapositivas y no chocan con el scrubber (`←`/`→`/`Espacio`). Los
  iframes no propagan teclas al padre, así que cada ruta hija reenvía
  `PageDown`/`PageUp` con `postMessage` y `/demo` los escucha por las dos
  vías; el foco puede estar donde esté. Cada beat es un objeto
  `{ narrator, left?: url, right?: url }` en `lib/features/demo/beats.ts`;
  cambiar de beat cambia el `src` del iframe que toque. Los beats no pulsan
  botones por el driver: "Pedir circulante" lo pulsa el driver dentro del
  iframe.
- Sin cursor personalizado, sin zoom automático: los zooms se hacen en
  edición si hacen falta.

## 3. Datos: X, Y, Z

Se eligen de lo que devuelva `source.ts` cuando se congele la demo:
fixtures hoy; Prisma si el equipo conecta la UI antes de H−8 (prioridad 0
de `PRODUCT.md` §10). Criterios:

| Empresa | Papel | Criterio |
| --- | --- | --- |
| Y | Mejora | `direccion=mejora`, `action=ampliar` en `t`, historial con subida visible en 6 meses |
| X | Deterioro | Alerta con `confirmedMonth ≤ t−3` y entrada en `riesgo` o `reducir` en `t`; `k ≥ 3` |
| Z | Grupo | Grupo con una filial sana con `adjustment ≤ −0,5` (contagio) y otra en `cerrar` |

`t` = último mes con las tres condiciones a la vez; si no hay uno común, `t`
se fija por X y los otros dos se miran en su propio mes. Los ids se anotan
en `docs/demo-script.md` cuando se elijan; hasta entonces `[missing]`.

Si los datos son fixtures, el narrador lo dice una vez: "datos sintéticos
con la forma del dataset; el pipeline real corre en el repo".

## 4. Vídeo

Duración objetivo 75-90 s. Sin límite conocido de la organización; si lo
hay y es menor, se corta el cuerpo, no la apertura.

| Tramo | Duración | Qué se ve | Voz |
| --- | --- | --- | --- |
| Apertura | 6 s | Radiografía de tórax (SVG en blanco sobre negro) que se funde a una línea de electrocardiograma y esta se convierte en la línea del score de Y | "Hoy el crédito a empresas es una radiografía al año. Nosotros lo convertimos en un pulso cada mes." |
| Cuerpo | 60-70 s | Grabación de `/demo` siguiendo el golden path de `docs/demo-script.md`, con la barra del narrador visible | Narración en español, misma frase por beat que la barra |
| Cierre | 6 s | Móvil con notificación "Embat Flow · Tu límite sube a 80 k€" y logo. Texto: "Embat Flow, nombre propuesto" | "La empresa decide. El partner presta viendo. Embat cobra por ponerlos en contacto." |

Producción:

- **Remotion** (gratis para ≤3 personas) en `video/` del repo: apertura y
  cierre como composiciones React con los mismos tokens de `DESIGN.md`;
  cuerpo con `<OffthreadVideo>` del mp4 grabado; subtítulos quemados desde un
  JSON de beats con tiempos. Un `pnpm --filter video render` produce el mp4.
- Grabación: OBS o la captura del sistema, 1920×1080, 30 fps, sin audio,
  navegador al 125 %, sin barra de URL (modo kiosco o F11).
- Voz: ElevenLabs (plan gratuito, ~10 min de TTS al mes), voz en español
  neutra; se generan los clips por beat y se alinean en Remotion. Si la
  cuenta falla, voz propia grabada con el móvil.
- Fallback de producción: si Remotion no está montado a H−5, CapCut con la
  grabación, la voz y una tarjeta de título estática.
- Versión en inglés con ElevenLabs Dubbing v2 solo si sobra tiempo tras
  subir la española.

## 5. Calendario (H = hora de entrega)

| Hora | Hito |
| --- | --- |
| H−20 | Spec aprobado; ids X, Y, Z elegidos si hay datos |
| H−16 | Vista pyme + estado solicitada + cartera `vista=partner` en `main` |
| H−12 | Scrubber + `/demo` en `main`; primer ensayo del golden path |
| H−8 | **Feature freeze.** Solo se arreglan cosas que rompen el golden path |
| H−7 | Grabación de `/demo`: tres tomas, se elige una |
| H−5 | Remotion + voz + subtítulos; render |
| H−3 | Vídeo subido; enlace en `README.md` |
| H−2 | Cinco ensayos de la demo, dos con fallback forzado |

## 6. Fuera de alcance

- Zoom automático de cursor, cursor personalizado, tema oscuro para la demo.
- Coste actual de financiación / sobrecoste en la vista pyme.
- Tabla `solicitudes` en Prisma; el estado es local.
- Vídeo en formatos verticales o cortos; solo el horizontal de entrega.
- Cualquier LLM en la demo o en el vídeo.

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| UI sigue en fixtures a H−8 | Se graba con fixtures y el narrador lo declara una vez; el pipeline real se enseña en el repo |
| No hay X con `k ≥ 3` en los datos | Se enseña el mejor caso real y se dice el `k` real; nunca se inventa |
| BroadcastChannel no dispara entre iframes en el navegador del jurado | Fallback: `storage` event; y en último caso el driver recarga el iframe derecho a mano (`R` no, `F5` dentro del iframe) |
| ElevenLabs caído | Voz grabada con el móvil |
| Remotion no renderiza a tiempo | CapCut |

## 8. Siguiente paso

Con el spec aprobado: plan de implementación (`writing-plans`) en tres
bloques independientes para repartir entre el equipo: (a) vista pyme +
estado + cartera partner, (b) scrubber + `/demo`, (c) `video/` con
Remotion. El guion de demo ya está en `docs/demo-script.md`.
