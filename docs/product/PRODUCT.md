# PRODUCT — Embat Flow (Embat · X-Ray)

Source of truth de producto: **quién compra, quién usa, quién paga, quién
decide compartir, qué se construye y con qué palabras**. Entrega al jurado:
[para-el-jurado.md](./para-el-jurado.md). Cómo se calcula el score, la
previsión y la decisión vive en [SOURCE.md](./SOURCE.md); lo visual en
[`DESIGN.md`](../../DESIGN.md) (raíz del repo, Impeccable lo busca ahí); las
convenciones técnicas en [`AGENTS.md`](../../AGENTS.md). En producto manda
este documento; en cálculo manda `SOURCE.md`. Cambios respecto al enfoque
inicial en §13.

| §   | Contenido                                |
| --- | ---------------------------------------- |
| 0   | En pocas palabras                        |
| 1   | Problema                                 |
| 2   | Enfoque: la empresa es dueña de su score |
| 3   | Actores y qué gana cada uno              |
| 4   | Las dos caras (mejora y deterioro)       |
| 5   | Usuarios y pantallas                     |
| 6   | Casos de uso                             |
| 7   | Reglas de producto (invariantes)         |
| 8   | Cómo se enseña una decisión              |
| 9   | Vocabulario                              |
| 10  | Prioridades                              |
| 11  | Qué no construir                         |
| 12  | Mapa a código                            |
| 13  | Cambios respecto al enfoque inicial      |
| 14  | Cómo lo contamos al jurado               |

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

Frase corta: _Hoy el crédito a empresas es una radiografía anual. Nosotros lo
convertimos en un pulsómetro, y el pulsómetro lo lleva la empresa, no el
banco._

---

## 1. Problema

Una empresa paga a proveedores hoy y cobra a 60-90 días. En ese hueco
necesita dinero aunque el negocio vaya bien.

|                      | Hoy                                | Embat Flow                                   |
| -------------------- | ---------------------------------- | -------------------------------------------- |
| Se revisa            | Una vez al año                     | Cada mes                                     |
| Con qué datos        | Cuentas anuales de hace 6-8 meses  | Movimientos de ayer                          |
| Quién ve la película | Cada banco, sus propias cuentas    | Embat: todos los bancos, facturación y grupo |
| Si la empresa mejora | Nada cambia                        | Más límite o mejor precio                    |
| Si empeora           | Nadie se entera hasta que es tarde | El límite se ajusta antes del problema       |
| Historial necesario  | 3 años de cuentas                  | 3 meses de movimientos                       |

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

| Actor                        | Qué ve                                                                                  | Qué gana                                                                                                   | Qué paga                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Empresa** (tesorero / CFO) | Su score, cascada, benchmark, oferta pre-aprobada, alertas de mejora y deterioro        | Financiación más rápida y barata; saber cómo está antes que el banco; informe para negociar                | Módulo dentro de su suscripción a Embat                       |
| **Partner financiero**       | Cartera de empresas que han pedido; score y límite mensual; alertas de cambio de acción | Prestar viendo; clientes pre-cualificados; deterioro meses antes que con cuentas anuales                   | Fee por límite vivo monitorizado y/o comisión por originación |
| **Embat**                    | Todo (es su plataforma)                                                                 | Ingreso variable sobre un SaaS con techo; más retención; ningún cliente perdido porque compartir es opt-in | —                                                             |

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

| Dirección                                                           | Qué pasa                                                                                                                                                                                  | Quién lo agradece                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Mejora** (`direccion = mejora`, sube de banda)                    | Alerta a la empresa: "puedes pedir más o pagar menos". Informe de negociación. `ampliar` si hay línea                                                                                     | La empresa                                                  |
| **Deterioro** (`direccion = deterioro`, `naturaleza = estructural`) | Sin línea: la oferta se encoge o desaparece **en su propia pantalla**; nadie más lo ve. Con línea: `reducir` o `cerrar` con freno; el partner lo ve porque la empresa lo aceptó al firmar | El partner (y la empresa, que se entera antes que su banco) |

Cara mala reformulada: no _"avisamos al banco"_, sino _"la oferta se ajusta
sola y el partner nunca presta a ciegas"_.

---

## 5. Usuarios y pantallas

La UI no calcula: pinta `company_month_score`, `company_month_forecast` y
`company_month_decision` materializados en `portfolio_snapshots`. Selector de
mes global `2024-09 … 2026-08`: toda pantalla es «a cierre de mes t».

| Pantalla          | Ruta                   | Quién                               | Qué demuestra                                                  |
| ----------------- | ---------------------- | ----------------------------------- | -------------------------------------------------------------- |
| **Vista empresa** | `/empresa`             | La empresa                          | Score, benchmark, oferta preaprobada, botón «pedir circulante» |
| **Cartera**       | `/cartera`             | Analista del partner / CFO de grupo | Quién está sano, quién mejora, quién se tuerce                 |
| **Ficha**         | `/cartera/[companyId]` | Ambos                               | Cascada, decisión, slider mensual, playbook                    |
| **Grupo**         | `/grupos`              | CFO de grupo / analista             | Aval, contagio, techo, cross-default                           |
| **Alertas**       | `/alertas`             | Ambos                               | Mejora y deterioro                                             |
| **Pares**         | `/pares`               | Empresa (anónimos) / partner        | Posición frente a cohorte                                      |
| **Backtest**      | `/backtest`            | Jurado                              | Anticipación y estabilidad medidas                             |

La cartera del partner aún lista el dataset completo. El opt-in se demuestra en
`/empresa` (sesión del navegador); el filtro de servidor no está en esta entrega.

---

## 6. Casos de uso

Empresas reales del run `scoreSolo-holding-v7`, corte 2026-08. La demo grabada
son dos pares. Introducción y cifras en [`../demo/README.md`](../demo/README.md).

1. **Fichas `COMP_0524` y `COMP_0563`.** Empate a 67. Una recupera y el grupo
   le drena caja (`abrir`). La otra se tuerce y el grupo la sostiene (`reducir`).
   La nota autónoma no es la empresa.
2. **Grupo `GROUP_0217`.** `COMP_0512` absorbe (Solo 52, Grupo 71) y cierra:
   el aval no tapa déficit ni vencidos. `COMP_0926` drena y `ampliar`.

Puertas a 59, impago con nota buena, forecast en sombra, `sin_datos`, aval
condicionado y pignoración de caja son factibles en el mismo run. Relato
teórico, sin recorrido de demo, en
[`../demo/use_cases_factibles/`](../demo/use_cases_factibles/).
Datos precargados, app con run importado, vídeo de respaldo.

---

## 7. Reglas de producto (invariantes)

1. **Nada llega al partner sin que la empresa haya pedido.** Toda pantalla,
   API o export "del partner" filtra por empresas con línea solicitada o viva.
2. **La empresa siempre ve su score completo**, con cascada y benchmark,
   tenga o no línea.
3. **Score y decisión son deterministas** (`SOURCE.md` decisiones 29 y 35).
   Ningún LLM decide elegibilidad, límite, plazo, precio ni naturaleza. Un LLM
   solo puede _redactar_ a partir de la cascada.
4. **La UI no calcula.** Cualquier número nuevo (coste actual de financiación,
   sobrecoste) se calcula en el pipeline y se guarda con `version_parametros`.
5. **Simetría**: toda alerta o acción de deterioro tiene su equivalente de
   mejora.
6. **Grupo antes que empresa**: límites, techos y alertas se razonan a nivel
   de grupo cuando hay hermanas.

Las reglas 1 y 2 se demuestran en `/empresa`. El filtro de cartera y API del
partner a empresas con línea solicitada o viva no está cerrado en esta entrega.

---

## 8. Cómo se enseña una decisión

Lo que ve el usuario tiene que ser operativo, no un panel de motor.

1. **La decisión primero, la evidencia a un clic.** Titular = acción + importe
   - cambio + una frase de motivo ("Reducir de 80 k€ a 50 k€: la caja cubre
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

| Concepto                                | Palabra correcta                                            | Evitar                                        |
| --------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Quien compra                            | **Embat**                                                   | "el cliente" a secas                          |
| Quien pone el dinero                    | **partner financiero** / **partner**                        | "el banco" como comprador                     |
| Quien usa Embat y es dueña de los datos | **la empresa** / **tesorero** / **CFO**                     | "la pyme" (Embat vende a mid-market y grupos) |
| Quien mira la cartera                   | **analista del partner** o **CFO de grupo**                 | "el usuario"                                  |
| Compartir datos con el partner          | **opt-in** / "la empresa pide"                              | "avisar al banco", "enviar datos"             |
| Lo que se comparte                      | **score, cascada, límite, menú**                            | movimientos, facturas, saldos                 |
| Nombre del producto                     | **Embat Flow** (decisión 33; en pitch se declara propuesta) | "Grifo" (nombre interno antiguo)              |

---

## 10. Prioridades

Qué quedó hecho para la entrega y qué no se vende como cerrado.

### En el producto que se enseña

| Pieza                                                 | Estado                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| UI sobre Prisma (`source.ts` → `portfolio_snapshots`) | Hecho. Sin run compatible: 503, no fixtures                                               |
| Vista empresa `/empresa`                              | Hecho: score, benchmark, oferta, informe de negociación                                   |
| Botón «pedir circulante»                              | Hecho en sesión del navegador. La cartera partner no filtra aún                           |
| Alertas simétricas                                    | Hecho en `/alertas`                                                                       |
| Pares y benchmark                                     | Hecho en `/pares` y en la ficha                                                           |
| Lecturas de ficha                                     | Materializadas en el snapshot; no hay LLM en la petición                                  |
| Categorías de movimientos                             | Cacheadas en el pipeline (`transaction_categories`); la demo no llama a un modelo en vivo |

### Fuera de esta entrega

| #   | Funcionalidad                                                 | Por qué sigue fuera                                      |
| --- | ------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Filtro de cartera partner por opt-in de servidor              | El botón existe; la regla 1 de §7 no está cerrada en API |
| 2   | Slack / feed externo de alertas                               | El panel basta para la demo                              |
| 3   | Jev en vivo para reclasificar el 25 % sin categoría           | API inestable; el pipeline usa el CSV cacheado           |
| 4   | LLM redactando la cascada                                     | Opcional (decisión 29); el cálculo no lo usa             |
| 5   | Grafo B2B `counterparty_id` × `company_id`                    | Exploratorio                                             |
| 6   | Recomendación de estructura de deuda (factoring / confirming) | El menú de circulante cubre el golden path               |

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

| Concepto                              | Dónde vive                                                 |
| ------------------------------------- | ---------------------------------------------------------- |
| Score, cascada, dirección, naturaleza | `lib/features/scoring/`, tabla `company_month_scores`      |
| Previsión                             | `lib/features/forecast/`, tabla `company_month_forecasts`  |
| Elegibilidad, límite, menú, acción    | `lib/features/decision/`, tabla `company_month_decisions`  |
| Playbook RCA                          | `lib/features/rca/`                                        |
| Cartera y ficha                       | `app/(panel)/cartera/`, `components/grifo/`                |
| Vista empresa                         | `app/(panel)/empresa/`                                     |
| Fuente de la UI                       | `lib/features/portfolio/source.ts` → `portfolio_snapshots` |
| API                                   | `app/api/scoring/*`, `app/api/portfolio/*`                 |

---

## 13. Cambios respecto al enfoque inicial

Lo que este documento cambia sobre `SOURCE.md` §4 y las decisiones 13, 25 y 32. `SOURCE.md` se actualiza para reflejarlo; hasta entonces manda esto.

| Antes                                                                      | Ahora                                                                                                           | Por qué                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Usuario principal: analista del partner; vista pyme "solo si sobra tiempo" | Dos usuarios. La empresa decide; el analista ve solo quien pidió. Vista pyme obligatoria (prioridades 1, 2 y 5) | Sin opt-in, la empresa pierde y se da de baja de Embat. Además, los datos son suyos |
| "Si la empresa va a peor, se avisa a quien presta meses antes"             | Frase retirada. "La oferta se ajusta sola y el partner nunca presta a ciegas"                                   | Dicho como antes es un chivatazo                                                    |
| Cartera = toda la base de empresas                                         | Cartera = empresas con línea solicitada o viva; se presenta como "cartera del grupo"                            | Regla 1 de §7                                                                       |
| Alertas de deterioro                                                       | Alertas simétricas: mejora y deterioro                                                                          | El reto pide señal en las dos direcciones; la mejora es la que agradece la empresa  |
| Nombre interno "Grifo"                                                     | **Embat Flow** en todo (app, docs, código nuevo)                                                                | Decisión 33                                                                         |
| Casos de uso empiezan en cartera                                           | Empiezan en las fichas 0524/0563 y el grupo 0217; el resto queda como factible no grabado                       | El vídeo enseña nota vs evidencia y holding; el opt-in cierra la lectura            |

---

## 14. Cómo lo contamos al jurado

El texto corto, las limitaciones y el orden de lectura están en
[`para-el-jurado.md`](./para-el-jurado.md).

> _"Embat no le cuenta al banco cómo va la empresa. Le da a la empresa una
> nota y una oferta; la empresa decide si la usa. El banco presta viendo, la
> empresa paga lo que merece, y Embat cobra por ponerlos en contacto."_

| Pregunta                                         | Respuesta                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ¿No se van los clientes si compartís sus datos?  | No compartimos nada hasta que la empresa pide. Opt-in, como Shopify o Stripe Capital. Y compartimos score y límite, no movimientos. |
| ¿Por qué solo Embat puede hacerlo?               | Un banco ve sus propias cuentas; Embat ve todos los bancos, el ERP y el grupo. Tres meses de movimientos bastan.                    |
| ¿Quién paga?                                     | La empresa, el módulo dentro de Embat; el partner, fee por límite monitorizado y/o comisión por originación.                        |
| ¿Por qué el partner se fía del score?            | Catorce variables explicables, cascada exacta, backtest publicado con sus cifras (buenas y malas), cero LLM en el cálculo.          |
| ¿Y el riesgo regulatorio de intermediar crédito? | Punto a estudiar; no lo afirmamos resuelto.                                                                                         |

No decimos: "avisamos al banco", "vendemos datos", "Embat presta".
