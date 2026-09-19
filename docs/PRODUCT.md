# PRODUCT — Embat Flow (Embat · X-Ray)

Source of truth de producto: **quién compra, quién usa, quién paga, quién
decide compartir, qué se construye y con qué palabras**. Cómo se calcula el
score, la previsión y la decisión vive en [`docs/SOURCE.md`](./SOURCE.md);
lo visual en [`DESIGN.md`](../DESIGN.md); las convenciones técnicas en
[`AGENTS.md`](../AGENTS.md). En producto manda este documento; en cálculo manda
`SOURCE.md`. Cambios respecto al enfoque inicial en §13.

| § | Contenido |
| --- | --- |
| 0 | En pocas palabras |
| 1 | Problema |
| 2 | Enfoque: la empresa es dueña de su score |
| 3 | Actores y qué gana cada uno |
| 4 | Las dos caras (mejora y deterioro) |
| 5 | Usuarios y pantallas |
| 6 | Golden path de demo |
| 7 | Reglas de producto (invariantes) |
| 8 | Cómo se enseña una decisión |
| 9 | Vocabulario |
| 10 | Prioridades |
| 11 | Qué no construir |
| 12 | Mapa a código |
| 13 | Cambios respecto al enfoque inicial |
| 14 | Cómo lo contamos al jurado |

---

## 0. En pocas palabras

Embat Flow es financiación de circulante embebida en Embat. Cada empresa
conectada tiene un **score de salud financiera** (0-100) que se recalcula cada
mes con sus movimientos bancarios y facturas. Encima del score hay un
**límite de crédito** (cuánto, plazo, precio) que también se recalcula cada mes.

- **Comprador**: Embat. Lo integra como módulo de su plataforma.
- **Quién pone el dinero**: un partner financiero (banco, fondo, fintech).
  Embat no presta con su balance.
- **Usuario 1**: la empresa cliente de Embat (tesorero / CFO). Ve su score,
  por qué, cómo está frente a pares y cuánto debería costarle financiarse.
  **Decide si pide dinero.**
- **Usuario 2**: el analista de riesgo del partner. Ve solo las empresas que
  **han pedido**, con score y límite al día cada mes.
- **Regla de oro**: Embat no comparte nada con el partner hasta que la
  empresa pulsa "pedir circulante".

Frase corta: *Hoy el crédito a empresas es una radiografía anual. Nosotros lo
convertimos en un pulsómetro, y el pulsómetro lo lleva la empresa, no el
banco.*

---

## 1. Problema

Una empresa paga a proveedores hoy y cobra a 60-90 días. En ese hueco
necesita dinero aunque el negocio vaya bien.

| | Hoy | Embat Flow |
| --- | --- | --- |
| Se revisa | Una vez al año | Cada mes |
| Con qué datos | Cuentas anuales de hace 6-8 meses | Movimientos de ayer |
| Quién ve la película | Cada banco, sus propias cuentas | Embat: todos los bancos, facturación y grupo |
| Si la empresa mejora | Nada cambia | Más límite o mejor precio |
| Si empeora | Nadie se entera hasta que es tarde | El límite se ajusta antes del problema |
| Historial necesario | 3 años de cuentas | 3 meses de movimientos |

Y el matiz: **el límite se da al grupo, no a la empresa**. El 94,5 % de las
empresas del dataset están en grupos; un banco ve la filial que tiene
delante, Embat ve el grupo entero (`SOURCE.md` §1.7).

---

## 2. Enfoque: la empresa es dueña de su score

Mismo modelo que Shopify Capital, Stripe Capital o Square Loans: la
plataforma calcula con sus datos, enseña una oferta pre-aprobada y **el
cliente decide si la usa**.

```text
[1] Embat calcula el score cada mes              → lo ve solo la empresa
[2] La empresa ve nota, por qué y oferta          → lo ve solo la empresa
    pre-aprobada (cuánto, plazo, precio)
[3] La empresa pulsa "pedir circulante"           → Embat comparte score + informe
                                                    con el partner
[4] El partner presta. Mientras la línea viva     → el partner ve el score de ESA
                                                    empresa, cada mes
[5] Mejora → límite sube / precio baja (se avisa)
    Deterioro → límite baja antes del problema (se avisa)
[6] Línea cerrada y devuelta                      → el partner deja de ver
```

Por qué la empresa no sale a perder:

1. **Si no pide, nadie ve nada.** El score es información para ella.
2. **Si pide, es porque le compensa.** Tres meses de movimientos en vez de
   tres años de cuentas; una oferta en vez de ocho dossiers; precio que baja
   si mejora.
3. **Mientras la línea viva, el seguimiento mensual es una condición del
   crédito** que aceptó al firmar. Y le protege: un límite que se ajusta poco
   a poco (histéresis ±25 %/mes, cierre confirmado a dos meses, `SOURCE.md`
   §3.6) es mejor que un banco que cierra el grifo de golpe.

Lo que se comparte con el partner: **score, cascada, límite y menú**
(`company_month_score`, `company_month_decision`). Nunca movimientos,
facturas ni saldos.

---

## 3. Actores y qué gana cada uno

| Actor | Qué ve | Qué gana | Qué paga |
| --- | --- | --- | --- |
| **Empresa** (tesorero / CFO) | Su score, cascada, benchmark, oferta pre-aprobada, alertas de mejora y deterioro | Financiación más rápida y barata; saber cómo está antes que el banco; informe para negociar | Módulo dentro de su suscripción a Embat |
| **Partner financiero** | Cartera de empresas que han pedido; score y límite mensual; alertas de cambio de acción | Prestar viendo; clientes pre-cualificados; deterioro meses antes que con cuentas anuales | Fee por límite vivo monitorizado y/o comisión por originación |
| **Embat** | Todo (es su plataforma) | Ingreso variable sobre un SaaS con techo; más retención; ningún cliente perdido porque compartir es opt-in | — |

**Embat cobra dos veces**: upsell del módulo y comisión por cada financiación.

### 3.1 El CFO de grupo

Embat vende a holdings y portfolios de private equity. El CFO de un grupo con
ocho filiales es, pantalla por pantalla, **el mismo usuario que el analista
del partner**: qué filial tensiona al resto, score consolidado, quién avala a
quién, cuánto puede pedir el grupo. Es cliente actual, mira sus propias
empresas (sin problema de consentimiento). Por eso la cartera de la demo se
presenta como **"la cartera del grupo"**; el partner, cuando el grupo pide,
ve exactamente lo mismo.

---

## 4. Las dos caras

| Dirección | Qué pasa | Quién lo agradece |
| --- | --- | --- |
| **Mejora** (`direccion = mejora`, sube de banda) | Alerta a la empresa: "puedes pedir más o pagar menos". Informe de negociación. `ampliar` si hay línea | La empresa |
| **Deterioro** (`direccion = deterioro`, `naturaleza = estructural`) | Sin línea: la oferta se encoge o desaparece **en su propia pantalla**; nadie más lo ve. Con línea: `reducir` o `cerrar` con freno; el partner lo ve porque la empresa lo aceptó al firmar | El partner (y la empresa, que se entera antes que su banco) |

Cara mala reformulada: no *"avisamos al banco"*, sino *"la oferta se ajusta
sola y el partner nunca presta a ciegas"*.

---

## 5. Usuarios y pantallas

Cuatro pantallas de `SOURCE.md` §4.1 más la vista pyme. La UI no calcula:
pinta `company_month_score` y `company_month_decision`. Selector de mes
global `2024-09 … 2026-08`: toda pantalla es "a cierre de mes t".

| Pantalla | Quién | Qué demuestra |
| --- | --- | --- |
| **Vista pyme** | La empresa | Score, benchmark frente a pares, "con este perfil tu línea debería costar X, hoy pagas Y", botón "pedir circulante" |
| **Cartera** | Analista del partner / CFO de grupo | Quién está sano, quién mejora, quién se tuerce. Solo empresas que han pedido |
| **Ficha de empresa** | Ambos | Por qué (cascada), decisión y motivo, cuándo se vio venir (slider) |
| **Grupo** | CFO de grupo / analista | Aval, contagio, techo de grupo, cross-default |
| **Backtest** | Jurado | Anticipación medida, estabilidad |

---

## 6. Golden path de demo (90 s)

1. **Vista pyme de Y** (en mejora): score sube, benchmark, oferta
   pre-aprobada mejor que su coste actual. Pulsa "pedir circulante".
2. **Cartera del partner**: aparece Y con `ampliar`. Filtro "deterioro" →
   empresa X con alerta desde `t−3`.
3. **Ficha de X**: cascada, `reducir`. Slider a `t+3`: déficit tres meses.
   Anticipamos `k` meses.
4. **Grupo Z**: filial sana con contagio; hermana cerrada; techo de grupo.

X, Y, Z salen del backtest. Datos precargados, app pre-calentada, vídeo de
respaldo.

---

## 7. Reglas de producto (invariantes)

1. **Nada llega al partner sin que la empresa haya pedido.** Toda pantalla,
   API o export "del partner" filtra por empresas con línea solicitada o viva.
2. **La empresa siempre ve su score completo**, con cascada y benchmark,
   tenga o no línea.
3. **Score y decisión son deterministas** (`SOURCE.md` decisiones 29 y 35).
   Ningún LLM decide elegibilidad, límite, plazo, precio ni naturaleza. Un LLM
   solo puede *redactar* a partir de la cascada.
4. **La UI no calcula.** Cualquier número nuevo (coste actual de financiación,
   sobrecoste) se calcula en el pipeline y se guarda con `version_parametros`.
5. **Simetría**: toda alerta o acción de deterioro tiene su equivalente de
   mejora.
6. **Grupo antes que empresa**: límites, techos y alertas se razonan a nivel
   de grupo cuando hay hermanas.

---

## 8. Cómo se enseña una decisión

Lo que ve el usuario tiene que ser operativo, no un panel de motor.

1. **La decisión primero, la evidencia a un clic.** Titular = acción + importe
   + cambio + una frase de motivo ("Reducir de 80 k€ a 50 k€: la caja cubre
   1,1 meses de pagos; mínimo 1,5"). La cascada de 14 variables siempre
   accesible, nunca lo primero.
2. **Lenguaje llano antes que notación.** "Le queda un 14 % de caja tras
   pagar la operación, sano (umbral 10 %)" antes de `A1 = 0,14`.
3. **Todo número con su umbral.** Un 68 no dice nada solo: banda, umbral que
   pasa o falla, qué lo movería.
4. **Confianza visible.** "Sin datos suficientes" es una respuesta válida y
   se enseña; nunca un número seguro sobre tres meses de datos.
5. **Cierre pendiente = preaviso.** `cierre_pendiente` se enseña como estado
   propio, con la condición que hay que cumplir el mes siguiente.
6. **Estado nunca solo por color.** Etiqueta de texto y glifo además del
   color; legible en proyector y en gris.

---

## 9. Vocabulario

| Concepto | Palabra correcta | Evitar |
| --- | --- | --- |
| Quien compra | **Embat** | "el cliente" a secas |
| Quien pone el dinero | **partner financiero** / **partner** | "el banco" como comprador |
| Quien usa Embat y es dueña de los datos | **la empresa** / **tesorero** / **CFO** | "la pyme" (Embat vende a mid-market y grupos) |
| Quien mira la cartera | **analista del partner** o **CFO de grupo** | "el usuario" |
| Compartir datos con el partner | **opt-in** / "la empresa pide" | "avisar al banco", "enviar datos" |
| Lo que se comparte | **score, cascada, límite, menú** | movimientos, facturas, saldos |
| Nombre del producto | **Embat Flow** (decisión 33; en pitch se declara propuesta) | "Grifo" (nombre interno antiguo) |

---

## 10. Prioridades

Ordenadas por valor para la demo / esfuerzo. Las dos de nivel 0 son
prerrequisito de todo lo demás.

| # | Funcionalidad | Por qué | Esfuerzo |
| --- | --- | --- | --- |
| 0 | UI conectada a datos reales (`source.ts` → Prisma) | Es lo único que el jurado ve; hoy lee fixtures | Medio |
| 0 | Backtest de alerta defendible (hoy recall 0,14, 95 % falsas alarmas) | Sin esto no se vende anticipación | Medio-alto |
| 1 | **Informe de negociación** (vista pyme): score, cascada, TAE implícita actual (`interest_charge` / saldo medio de deuda) vs precio del menú → **sobrecoste en €/año**, por empresa y agregado | Convierte el score en dinero; "en esta cartera hay X M€ de sobrecoste" | Bajo-medio |
| 2 | **Benchmark frente a pares**: percentil por variable con los p5/p95 congelados ("tus clientes te pagan 12 días más tarde que la mediana") | Lo único que un tesorero no sabe de su empresa | Bajo |
| 3 | **Alertas en las dos direcciones** (feed + Slack), incluida subida de banda | Bonus del reto; nadie enseñará una alerta de mejora | Bajo |
| 4 | **Anticipación en texto** en la ficha ("alerta 2025-11 · evento 2026-02 · 3 meses") y distribución de lead times en backtest | Bonus del reto; hoy hay que deducirlo del slider | Bajo |
| 5 | **Botón "pedir circulante"** en vista pyme que hace aparecer la empresa en la cartera del partner | Enseña el opt-in en directo; corazón de §2 | Bajo (estado local basta) |
| 6 | **Jev (TypeSafe AI)** para clasificar el 25 % de movimientos sin categoría, umbral ≥ 0,95, resultados cacheados | Sube la confianza → más empresas pasan la puerta `historia` (la que más cierra). Devuelve probabilidades, no texto: "el modelo interpreta, el código decide". Nunca decide | Medio; API inestable |
| 7 | "Explicar en palabras": LLM redactando cascada y `delta_contrib` en 3 frases | Opcional (decisión 29) | Bajo |
| 8 | Grafo B2B: ¿`counterparty_id` cruza con `company_id` de otras empresas? | Si cruza, contagio de red; si no, descartar en 10 min | Muy bajo |
| 9 | Recomendación de estructura de deuda (factoring / confirming / leasing vs menú) | El "agente de recomendaciones" del reto | Alto; solo si sobra |

**Jev**: modelo de TypeSafe AI (`jev-1.13.0`, alias `jev-latest`). Recibe
estado y preguntas tipadas, devuelve probabilidades calibradas; ~100 ms por
llamada. Disponible vía Vercel AI Gateway (`typesafe-ai/jev`, AI SDK 7
`evaluate`). Sufrió caídas la semana del lanzamiento: **la demo no depende de
una llamada en vivo**; se cachea en el pipeline como `transaction_categories`.

---

## 11. Qué no construir

- Marketplace multi-lender con varios bancos compitiendo.
- Chatbot libre (Embat ya tiene TellMe).
- Simulador "qué pasa si pido X": el menú ya lo es (decisión 26).
- Login, multi-tenant, disposiciones reales, pagos, parámetros desde UI
  (decisión 32).
- Cualquier flujo donde el partner vea empresas que no han pedido.

---

## 12. Mapa a código

| Concepto | Dónde vive |
| --- | --- |
| Score, cascada, dirección, naturaleza | `lib/features/scoring/`, tabla `company_month_scores` |
| Elegibilidad, límite, menú, acción | `lib/features/decision/` en la rama `docs/decisiones-jurado`, **pendiente de mergear a main**. Sin tabla propia aún: la salida es JSONL de `scripts/scoring.ts`; falta `company_month_decisions` |
| Cartera y ficha (analista / CFO de grupo) | `app/(panel)/cartera/`, `components/grifo/` |
| Fuente de datos de la UI | `lib/features/portfolio/source.ts` (hoy fixtures; objetivo Prisma) |
| API | `app/api/scoring/*`, `app/api/portfolio/*` |
| Vista pyme | no existe aún; misma fuente de datos, filtrada a una empresa |

---

## 13. Cambios respecto al enfoque inicial

Lo que este documento cambia sobre `SOURCE.md` §4 y las decisiones 13, 25 y
32. `SOURCE.md` se actualiza para reflejarlo; hasta entonces manda esto.

| Antes | Ahora | Por qué |
| --- | --- | --- |
| Usuario principal: analista del partner; vista pyme "solo si sobra tiempo" | Dos usuarios. La empresa decide; el analista ve solo quien pidió. Vista pyme obligatoria (prioridades 1, 2 y 5) | Sin opt-in, la empresa pierde y se da de baja de Embat. Además, los datos son suyos |
| "Si la empresa va a peor, se avisa a quien presta meses antes" | Frase retirada. "La oferta se ajusta sola y el partner nunca presta a ciegas" | Dicho como antes es un chivatazo |
| Cartera = toda la base de empresas | Cartera = empresas con línea solicitada o viva; se presenta como "cartera del grupo" | Regla 1 de §7 |
| Alertas de deterioro | Alertas simétricas: mejora y deterioro | El reto pide señal en las dos direcciones; la mejora es la que agradece la empresa |
| Nombre interno "Grifo" | **Embat Flow** en todo (app, docs, código nuevo) | Decisión 33 |
| Golden path empieza en cartera | Empieza en la vista pyme de Y y su "pedir circulante" | Enseña el opt-in antes que el monitor |

---

## 14. Cómo lo contamos al jurado

> *"Embat no le cuenta al banco cómo va la empresa. Le da a la empresa una
> nota y una oferta; la empresa decide si la usa. El banco presta viendo, la
> empresa paga lo que merece, y Embat cobra por ponerlos en contacto."*

| Pregunta | Respuesta |
| --- | --- |
| ¿No se van los clientes si compartís sus datos? | No compartimos nada hasta que la empresa pide. Opt-in, como Shopify o Stripe Capital. Y compartimos score y límite, no movimientos. |
| ¿Por qué solo Embat puede hacerlo? | Un banco ve sus propias cuentas; Embat ve todos los bancos, el ERP y el grupo. Tres meses de movimientos bastan. |
| ¿Quién paga? | La empresa, el módulo dentro de Embat; el partner, fee por límite monitorizado y/o comisión por originación. |
| ¿Por qué el partner se fía del score? | Catorce variables explicables, cascada exacta, backtest publicado con sus cifras (buenas y malas), cero LLM en el cálculo. |
| ¿Y el riesgo regulatorio de intermediar crédito? | Punto a estudiar; no lo afirmamos resuelto. |

No decimos: "avisamos al banco", "vendemos datos", "Embat presta".
