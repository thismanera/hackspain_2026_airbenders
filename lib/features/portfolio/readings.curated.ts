/**
 * Lecturas escritas a mano por un analista mirando la ficha real del run
 * (agosto de 2026): las empresas del recorrido de la demo y su grupo. Se
 * materializan en `scoring:import` como las demás y pasan el mismo
 * sanitizador que cualquier redacción: si una cifra o una cita no está en
 * la ficha, la importación falla. Fuente `analista`, nunca `helmcode`.
 *
 * Las cifras que citan son las de una ejecución concreta: solo se aplican al
 * run cuya versión de parámetros coincide con `CURATED_PARAMETER_VERSION`.
 * Tras un refit hay que releer las fichas y actualizar textos y versión; hasta
 * entonces esas empresas vuelven a la plantilla.
 *
 * Clave: `COMP_xxxx` → `YYYY-MM` → kind. Lo que no está aquí se redacta con
 * la plantilla determinista de `narrative.ts`.
 */
import type { ReadingBody, ReadingKind } from "./reading";

export const CURATED_PARAMETER_VERSION =
  "fb8f86281fe09d45d111fa1a33d23544d7874e48dc24c3b230238f514c4f744a";

type Curated = Partial<Record<ReadingKind, ReadingBody>>;

const A1 = { ref: "A1", label: "Margen de caja" };
const A2 = { ref: "A2", label: "Meses en déficit" };
const A3 = { ref: "A3", label: "Cobertura de deuda" };
const A4 = { ref: "A4", label: "Carga de deuda existente" };
const A5 = { ref: "A5", label: "Dependencia de crédito" };
const B1 = { ref: "B1", label: "Cumplimiento acumulado" };
const B2 = { ref: "B2", label: "Racha de retraso" };
const B3 = { ref: "B3", label: "Puntualidad con proveedores" };
const C1 = { ref: "C1", label: "Concentración de clientes" };
const C2 = { ref: "C2", label: "Concentración de proveedores" };
const C3 = { ref: "C3", label: "Retraso de cobro" };
const C4 = { ref: "C4", label: "Vencido sin cobrar" };
const C5 = { ref: "C5", label: "Volatilidad de cobros" };
const C6 = { ref: "C6", label: "Recibos devueltos" };
const D1 = { ref: "D1", label: "Peso en el grupo" };
const D5 = { ref: "D5", label: "Interdependencia" };
const CAJA = { ref: "puerta:caja", label: "Caja" };
const BANDA = { ref: "banda", label: "Banda" };
const GRUPO = { ref: "grupo", label: "Bloque D · grupo" };
const TECHO = { ref: "techo", label: "Techo de grupo" };
const TENDENCIA = { ref: "tendencia", label: "Tendencia 3 m" };
const CONFIANZA = { ref: "confianza", label: "Confianza" };

const CURATED = {
  // X del golden path: deterioro con cierre de línea. Grupo GROUP_0106.
  COMP_0160: {
    "2026-08": {
      decision: {
        headline:
          "Se cierra la línea de 284.000 €: la caja ya no cubre (capacidad de deuda 44,2, mínimo 50) tras perder 16 puntos de nota en un mes.",
        sentences: [
          {
            text: "Cinco de las seis puertas siguen abiertas; falla solo la de caja, y con una puerta cerrada el motor no concede aunque el resto acompañe.",
            citations: [CAJA],
          },
          {
            text: "La cobertura de deuda se ha desplomado a 0,04× y el margen de caja se queda en 0,3 %: el aviso saltó en julio y se confirma en agosto.",
            citations: [A3, A1],
          },
          {
            text: "El forecast no ve rebote (51 a tres meses, 49 a seis), pero el motor clasifica el deterioro como temporal: la línea reabre en cuanto la caja vuelva a cubrir.",
            citations: [TENDENCIA],
          },
        ],
      },
      score: {
        headline:
          "Vigilar, 58 sobre 100: pierde 16 puntos en un mes porque la cobertura de deuda cae a 0,04× y dos de cada tres meses cierran en déficit.",
        sentences: [
          {
            text: "El bloque de caja (44) es el que lastra: margen del 0,3 %, meses en déficit al 66,7 % y cobertura de deuda con nota 2.",
            citations: [A1, A2, A3],
          },
          {
            text: "Paga: cumplimiento acumulado del 100 % y cero recibos devueltos. El problema es de liquidez, no de voluntad.",
            citations: [B1, C6],
          },
          {
            text: "Hasta junio se movía entre 74 y 81; el giro es reciente y el motor lo etiqueta como temporal, no estructural.",
            citations: [TENDENCIA],
          },
        ],
      },
      grupo: {
        headline:
          "Va sola: el resto del grupo no mueve su nota este mes, aunque su cierre de 284.000 € sí vacía el techo conjunto.",
        sentences: [
          {
            text: "Con su línea a cero, la exposición viva del grupo se reduce a la de su hermana.",
            citations: [GRUPO],
          },
        ],
      },
      improvement: {
        headline:
          "Primero la caja: volver a cubrir la deuda por encima del mínimo de 50 reabre la línea sin tocar nada más.",
        sentences: [
          {
            text: "Cobertura de deuda 0,04× y margen de caja 0,3 %: son las dos variables con peor nota y las que disparan la puerta de caja.",
            citations: [A3, A1],
          },
          {
            text: "Con 2 puntos más pasaría a banda B: más plazo y menos precio.",
            citations: [BANDA],
          },
        ],
      },
    },
  },

  // Hermana de X: sana, pero con el techo de grupo encima.
  COMP_0555: {
    "2026-08": {
      decision: {
        headline:
          "La línea queda en 105.000 €, por debajo de su capacidad propia de 175.824 €: el techo del grupo la recorta mientras su hermana cierra.",
        sentences: [
          {
            text: "Pasa las seis puertas y está en banda B (7,5 % hasta 120 días); lo que la limita no es ella, es el grupo.",
            citations: [BANDA],
          },
          {
            text: "Su nota propia sube a 70 con un margen de caja del 51,2 % y solo el 16,7 % de meses en déficit; el grupo le resta 4,4 puntos porque sus hermanas puntúan 56.",
            citations: [A1, A2, GRUPO],
          },
          {
            text: "La recuperación se detectó en junio y se confirma en agosto; la confianza es del 51 %, con más meses clasificados la misma nota valdría más.",
            citations: [CONFIANZA],
          },
        ],
      },
      score: {
        headline:
          "Vigilar, 70 sobre 100 y subiendo 13 puntos en tres meses: la caja ha dado la vuelta.",
        sentences: [
          {
            text: "Margen de caja del 51,2 % (nota 100) y meses en déficit al 16,7 %: es una mejora estructural, no un mes bueno.",
            citations: [A1, A2],
          },
          {
            text: "Lo que la frena: cobros muy volátiles (0,91×, nota 9) y una carga de deuda del 0 % que no aporta historial.",
            citations: [C5, A4],
          },
          {
            text: "Con la confianza al 51 %, el motor le pide más meses antes de darla por sana.",
            citations: [CONFIANZA],
          },
        ],
      },
      grupo: {
        headline:
          "El grupo la arrastra: −4,4 puntos, porque su hermana grande cierra y la otra no tiene datos.",
        sentences: [
          {
            text: "Pesa el 13 % del grupo y su interdependencia es del 13 %; con las hermanas en 56, el ajuste la baja de 70 a 66 en nota de grupo.",
            citations: [D1, D5],
          },
          {
            text: "El techo de grupo es la razón de que su línea sea 105.000 € y no los 175.824 € de capacidad propia.",
            citations: [TECHO],
          },
        ],
      },
      improvement: {
        headline:
          "Su palanca no está dentro: recuperar el techo del grupo vale más que cualquier variable propia.",
        sentences: [
          {
            text: "Cobros volátiles (0,91×) es la única variable propia con nota baja; el resto de la caja ya puntúa alto.",
            citations: [C5],
          },
          {
            text: "En banda A (75) tendría hasta 180 días y menos precio.",
            citations: [BANDA],
          },
        ],
      },
    },
  },

  // Tercera del grupo: sin historial suficiente.
  COMP_1150: {
    "2026-08": {
      decision: {
        headline:
          "Sin línea: historial insuficiente (confianza 0,22, mínimo 0,4); el grupo le suma 3,8 puntos, pero el aval no sustituye datos.",
        sentences: [
          {
            text: "Cuatro alertas activas, dos desde junio: el motor ve deterioro estructural, pero con un 22 % de confianza no lo convierte en decisión.",
            citations: [CONFIANZA],
          },
        ],
      },
      grupo: {
        headline:
          "Sus hermanas la sostienen: +3,8 puntos, pero sin historial propio el aval no abre nada.",
        sentences: [
          {
            text: "Pesa el 8 % del grupo y la interdependencia es del 8 %.",
            citations: [D1, D5],
          },
        ],
      },
    },
  },

  // Y del golden path: mejora con ampliación en banda A. Va sola.
  COMP_0357: {
    "2026-08": {
      decision: {
        headline:
          "Se amplía la línea de 137.000 € a 236.000 € en banda A (4,5 %, hasta 180 días): cinco meses seguidos subiendo y las seis puertas abiertas.",
        sentences: [
          {
            text: "El margen de caja sube al 13,7 % y aporta casi 8 puntos de la mejora; paga el 100 % de sus obligaciones.",
            citations: [A1, B1],
          },
          {
            text: "El forecast la sitúa en 86 a tres meses (rango 69–91): la ampliación va con la tendencia, no por delante.",
            citations: [TENDENCIA],
          },
          {
            text: "El riesgo que no ha cambiado: un solo cliente concentra el 100 % de la facturación.",
            citations: [C1],
          },
        ],
      },
      score: {
        headline:
          "Vigilar, 77 sobre 100 y +11 en tres meses: la caja mejora, la concentración de clientes sigue al 100 %.",
        sentences: [
          {
            text: "Lo que la sostiene: cumplimiento del 100 %, cero vencidos sin cobrar y cobros estables (0,12×).",
            citations: [B1, C4, C5],
          },
          {
            text: "Lo que la lastra: un solo cliente (100 % de concentración) y proveedores al 81 %; la caja, con la mitad de los meses en déficit, va a medias.",
            citations: [C1, C2, A2],
          },
          {
            text: "Con confianza del 99 %, la nota es fiable: lo que ves es lo que hay.",
            citations: [CONFIANZA],
          },
        ],
      },
      improvement: {
        headline:
          "Diversificar clientes es la única palanca con recorrido: la caja ya empuja y la banda ya es A.",
        sentences: [
          {
            text: "Concentración de clientes al 100 % (nota 0) y de proveedores al 81 %: un impago la deja sin cobros.",
            citations: [C1, C2],
          },
          {
            text: "Racha de retraso de 1 mes en pagos: limpiarla devuelve los 3,6 puntos que ha restado este mes.",
            citations: [B2],
          },
        ],
      },
    },
  },

  // Segunda Y: sana, amplía hasta el tope de su capacidad. Es el 71 % de su grupo.
  COMP_1048: {
    "2026-08": {
      decision: {
        headline:
          "Se amplía de 2.093.000 € a 2.763.000 €, el tope de su capacidad, en banda A al 5,5 % hasta 180 días.",
        sentences: [
          {
            text: "Sana con 80: margen de caja del 40,5 %, cobertura de deuda de 86,29× y cero meses de retraso.",
            citations: [A1, A3, B2],
          },
          {
            text: "Es el 71 % del grupo y sus cinco hermanas puntúan 57: el ajuste le resta 2,6 puntos, pero con el 1 % de interdependencia no la contagian.",
            citations: [GRUPO],
          },
          {
            text: "La recuperación se detectó en julio y se confirma en agosto; el forecast la mantiene en 84 a tres y a seis meses.",
            citations: [TENDENCIA],
          },
        ],
      },
      score: {
        headline:
          "Sana, 80 sobre 100 y +8 en tres meses: caja sobrada, pago impecable y la única sombra es un tercio de meses en déficit.",
        sentences: [
          {
            text: "Bloque de caja en 85: margen del 40,5 %, cobertura 86,29× y carga de deuda del 0,5 %.",
            citations: [A1, A3, A4],
          },
          {
            text: "Paga el 100 % a tiempo; recibos devueltos al 0,1 %.",
            citations: [B1, C6],
          },
          {
            text: "El 33,3 % de meses en déficit es lo que separa un 80 de un 90: estructural, no de un mes.",
            citations: [A2],
          },
        ],
      },
      grupo: {
        headline:
          "Ella es el grupo: pesa el 71 % de la facturación y sus hermanas le restan 2,6 puntos sin llegar a frenarla.",
        sentences: [
          {
            text: "Interdependencia del 1 %: casi no hay caja cruzada, así que el aval va de ella hacia el grupo y no al revés.",
            citations: [D5],
          },
        ],
      },
    },
  },

  // Segunda X: cierre por caja con cliente único.
  COMP_0522: {
    "2026-08": {
      decision: {
        headline:
          "Se cierra la línea de 898.000 €: la capacidad de deuda cae a 47,1 (mínimo 50) y la nota pierde 12 puntos en un mes.",
        sentences: [
          {
            text: "Solo falla la puerta de caja; el resto (historia, obligaciones, clientes, grupo) sigue abierta.",
            citations: [CAJA],
          },
          {
            text: "El margen de caja es negativo (−2,8 %) y la cobertura de deuda se ha ido a nota 0: es la segunda vez en tres meses que la línea se cierra.",
            citations: [A1, A3],
          },
          {
            text: "El forecast la devuelve a 66 a tres meses y el motor lo etiqueta temporal: candidata a reabrir, no a olvidar.",
            citations: [TENDENCIA],
          },
        ],
      },
      score: {
        headline:
          "Vigilar, 68 sobre 100: −19 en tres meses, todo por la caja; pagos y cobros siguen sanos.",
        sentences: [
          {
            text: "Margen de caja del −2,8 % y cobertura de deuda con nota 0: la caja no llega para la deuda que tiene.",
            citations: [A1, A3],
          },
          {
            text: "Cumple el 93,5 % de las obligaciones, cobra con 0 días de retraso y solo el 0,7 % está vencido.",
            citations: [B1, C3, C4],
          },
          {
            text: "Un cliente concentra el 99,6 %: la caja se mueve al ritmo de un solo pagador.",
            citations: [C1],
          },
        ],
      },
      improvement: {
        headline:
          "Una sola palanca: que la caja vuelva a cubrir la deuda (capacidad 47,1, mínimo 50) reabre la línea.",
        sentences: [
          {
            text: "Margen negativo (−2,8 %) y cobertura de deuda en nota 0 son las dos variables que fallan; el cliente único (99,6 %) es el riesgo de fondo.",
            citations: [A1, A3, C1],
          },
        ],
      },
    },
  },

  // Z del golden path: GROUP_0108, filiales sanas con contagio y dos hermanas cerradas.
  COMP_0927: {
    "2026-08": {
      decision: {
        headline:
          "Se mantiene la línea pese a perder 10 puntos en un mes: pasa las seis puertas, pero la alerta temprana de julio y el grupo (−9,6) la ponen en vigilancia.",
        sentences: [
          {
            text: "El margen de caja baja al 8,1 % (−6,6 puntos) y un tercio de los meses cierra en déficit.",
            citations: [A1, A2],
          },
          {
            text: "Sus 17 hermanas puntúan 65 y comparten el 26 % de la caja: el ajuste de grupo le resta 9,6 puntos.",
            citations: [GRUPO],
          },
          {
            text: "El forecast la deja plana en 77 a tres meses: sin rebote, pero sin caída.",
            citations: [TENDENCIA],
          },
        ],
      },
      score: {
        headline:
          "Vigilar, 77 sobre 100 tras caer 10 en un mes: la caja se estrecha, el pago sigue impecable.",
        sentences: [
          {
            text: "Margen de caja 8,1 % (nota 66) y cobros volátiles (0,60×, nota 41): las dos variables que más pesan en contra.",
            citations: [A1, C5],
          },
          {
            text: "Cumplimiento del 100 %, cero meses de retraso, proveedores a 0 días.",
            citations: [B1, B2, B3],
          },
        ],
      },
      grupo: {
        headline:
          "El grupo la arrastra −9,6 puntos: comparte el 26 % de su caja con 17 hermanas que puntúan 65.",
        sentences: [
          {
            text: "Pesa el 26 % del grupo y ella representa el 20 %; con esta interdependencia, lo que pase a las hermanas le llega.",
            citations: [D1, D5],
          },
        ],
      },
    },
  },
  COMP_1081: {
    "2026-08": {
      decision: {
        headline:
          "Línea de 3.147.000 € en banda B (6,5 %, hasta 120 días), con dos señales cruzadas: la recuperación de julio y una alerta temprana de deterioro este mes.",
        sentences: [
          {
            text: "Sube 23 puntos en tres meses y aun así cae 5 desde julio: el margen de caja baja al 10,2 % y dos de cada tres meses cierran en déficit.",
            citations: [A1, A2],
          },
          {
            text: "El forecast es el aviso serio: 57 a tres meses y 50 a seis. La línea es de hoy; la vigilancia, de mañana.",
            citations: [TENDENCIA],
          },
          {
            text: "Sus 17 hermanas puntúan 67 y le restan 5,6 puntos; comparten el 17 % de la caja.",
            citations: [GRUPO],
          },
        ],
      },
      score: {
        headline:
          "Sana, 74 sobre 100: la caja mejoró mucho desde mayo, pero un cliente al 89,9 % y cobros a saltos (0,91×) la hacen frágil.",
        sentences: [
          {
            text: "Paga el 100 %, cero meses de retraso, proveedores al día.",
            citations: [B1, B2, B3],
          },
          {
            text: "Concentración de clientes 89,9 % (nota 14) y volatilidad de cobros 0,91× (nota 10): las dos notas más bajas de la ficha, con el margen de caja (10,2 %) perdiendo casi 5 puntos este mes.",
            citations: [C1, C5, A1],
          },
        ],
      },
      grupo: {
        headline: "El grupo le resta 5,6 puntos: sus 17 hermanas puntúan 67, por debajo de su 74.",
        sentences: [
          {
            text: "Pesa el 17 % del grupo y representa el 15 %; el aval que recibe es parcial.",
            citations: [D1, D5],
          },
        ],
      },
    },
  },
  COMP_0101: {
    "2026-08": {
      decision: {
        headline:
          "Se amplía de 190.000 € a 288.000 € en banda B (7,0 %, hasta 120 días): nota estable en 78 y las seis puertas abiertas.",
        sentences: [
          {
            text: "La caja sobra (margen del 79,5 %, cobertura 3,19×), pero la deuda existente pesa un 509,7 % y la dependencia de crédito un 464,2 %: por eso banda B y no A.",
            citations: [A1, A3, A4, A5],
          },
          {
            text: "El grupo le resta 8,6 puntos: comparte el 38 % de su caja con hermanas que puntúan 68.",
            citations: [GRUPO],
          },
          {
            text: "El forecast la deja en 80 a tres y a seis meses.",
            citations: [TENDENCIA],
          },
        ],
      },
      score: {
        headline:
          "Sana, 78 sobre 100 y estable: caja holgada y pago perfecto, pero vive del crédito (dependencia 464,2 %) y de un cliente (94,5 %).",
        sentences: [
          {
            text: "Carga de deuda del 509,7 % y dependencia de crédito del 464,2 %, ambas con nota 0.",
            citations: [A4, A5],
          },
          {
            text: "Margen de caja del 79,5 %, cumplimiento del 100 % y cero vencidos.",
            citations: [A1, B1, C4],
          },
        ],
      },
      grupo: {
        headline:
          "El grupo la arrastra −8,6 puntos: es pequeña (el 2 % del grupo) pero comparte el 38 % de su caja con él.",
        sentences: [
          {
            text: "Interdependencia del 38 %: el ajuste no viene de su tamaño sino de cuánto se mueve la caja entre hermanas.",
            citations: [D1, D5],
          },
        ],
      },
      improvement: {
        headline:
          "Dos palancas: bajar la deuda existente (509,7 %) y la dependencia de crédito (464,2 %); la caja ya está.",
        sentences: [
          {
            text: "Son las dos únicas variables con nota 0; el resto del bloque de caja puntúa alto.",
            citations: [A4, A5],
          },
        ],
      },
    },
  },
} satisfies Record<string, Record<string, Curated>>;

export function curatedReading(
  parameterVersion: string,
  companyId: string,
  month: string,
  kind: ReadingKind,
): ReadingBody | null {
  if (parameterVersion !== CURATED_PARAMETER_VERSION) return null;
  const months: Record<string, Curated> | undefined = CURATED[companyId as keyof typeof CURATED];
  return months?.[month]?.[kind] ?? null;
}

/** Para los tests: qué fichas tienen lectura de analista. */
export function curatedKeys(): { companyId: string; month: string; kind: ReadingKind }[] {
  const keys: { companyId: string; month: string; kind: ReadingKind }[] = [];
  for (const [companyId, months] of Object.entries(CURATED)) {
    for (const [month, kinds] of Object.entries(months)) {
      for (const kind of Object.keys(kinds) as ReadingKind[]) keys.push({ companyId, month, kind });
    }
  }
  return keys;
}
