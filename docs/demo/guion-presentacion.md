# Embat Flow — Guion de presentación

**Duración orientativa:** 5–6 minutos.  
**Formato:** cuatro miembros del equipo, una intervención por persona.  
**Criterios del jurado:** tecnología, producto y monetización.

Las indicaciones entre corchetes no se leen en voz alta. Sustituid los nombres
«Miembro 1–4» por los del equipo. Los tiempos incluyen las transiciones de pantalla.

| Turno | Ponente | Contenido | Tiempo |
| --- | --- | --- | --- |
| 1 | Miembro 1 | Problema, propuesta y usuario | 1 min |
| 2 | Miembro 2 | Tecnología y cálculo del score | 1 min 30 s |
| 3 | Miembro 3 | Producto y demostración | 1 min 30 s |
| 4 | Miembro 4 | Monetización, estado y cierre | 1 min 30 s |

## Parte 1 — Miembro 1: el problema y nuestra propuesta

**Objetivo:** explicar para quién construimos Embat Flow y por qué lo necesita.

[Mostrar una diapositiva con «Embat Flow» y la frase «De los datos de tesorería a las decisiones de financiación».]

«Una empresa puede vender, crecer y, aun así, quedarse sin caja. Porque paga
a sus proveedores hoy y cobra a sus clientes dentro de noventa días.

Para financiar ese hueco, necesita demostrar cómo está su negocio. Pero unas
cuentas anuales no cuentan todo lo que está pasando hoy.

Embat ya reúne movimientos bancarios, facturas y contexto de grupo. Nuestra
propuesta es aprovechar esa información para responder tres preguntas:
**cómo está la empresa, qué está cambiando y qué financiación puede sostener.**

Eso es Embat Flow: una propuesta de módulo de salud financiera y financiación
de circulante integrado en Embat.

El director financiero entiende su situación y consulta sus opciones. Si
decide solicitar financiación, un partner financiero aporta el capital.

Para Embat, esto abre una oportunidad: convertir la información que ya ayuda
a gestionar la tesorería en un servicio que también facilite financiarla.»

**Transición al miembro 2:**

«La base de todo esto es un score que podamos explicar. [Nombre del miembro 2]
os cuenta cómo lo hemos construido.»

## Parte 2 — Miembro 2: la tecnología y el score

**Objetivo:** demostrar criterio con los datos, explicar el cálculo y conectar
la implementación con su trazabilidad.

[Mostrar una ficha de empresa con el score y el desglose de sus tres bloques.]

«Calculamos cada mes un score de salud financiera de cero a cien, con catorce
variables agrupadas en tres bloques.

El primero mide generación de caja y capacidad financiera, con un peso del
45 %. El segundo, cumplimiento de obligaciones, con un 30 %. Y el tercero,
calidad y estabilidad de cobros y contrapartes, con un 25 %.

Antes de calcular, tuvimos que entender los datos. Normalizamos las divisas,
detectamos transferencias entre cuentas y empresas del grupo para no
confundirlas con actividad comercial y excluimos el último mes, que estaba
incompleto.

Cada variable se convierte en una subnota con escalas definidas y parámetros
congelados. La ponderamos según la evidencia disponible: cuando falta
información, la señal se acerca a un valor neutro y mostramos su confianza.

Después distinguimos la salud autónoma de la empresa del efecto de su grupo.
También mostramos su evolución para entender hacia dónde se mueve.

El motor está implementado en TypeScript, con cálculo determinista,
parámetros versionados y pruebas automatizadas. Separamos scoring, previsión
y decisión. Los resultados se guardan en PostgreSQL y la aplicación en
Next.js los presenta sin recalcularlos en pantalla.

Así podemos seguir el recorrido desde cada señal hasta la decisión. Ningún
modelo de lenguaje decide cuánto se presta.

**El score mide salud financiera; no es una probabilidad de impago ni una
aprobación de crédito.** La financiación tiene controles adicionales.»

**Transición al miembro 3:**

«Y esa diferencia entre tener una nota y poder tomar una decisión se entiende
mejor viendo el producto. [Nombre del miembro 3], vamos a la demo.»

## Parte 3 — Miembro 3: el producto y la demo

**Objetivo:** mostrar una utilidad concreta para el CFO y para el partner,
usando un único caso de grupo.

[Mostrar `/empresa`: score, explicación y propuesta de circulante.]

«El director financiero encuentra aquí su score, qué lo está condicionando,
cómo se compara con empresas similares y una propuesta de importe, plazo y
precio bajo nuestra política simulada.

Las alertas muestran tanto mejoras como deterioros. El diseño comercial parte
de que la empresa decide si solicita financiación y comparte su evaluación
con el partner.

Pero el valor se ve especialmente cuando analizamos un grupo.»

[Abrir `/grupos?mes=2026-08`, seleccionar `GROUP_0217` y mostrar las fichas
de `COMP_0512` y `COMP_0926`. Dejar las pantallas preparadas antes de empezar.]

«Estas dos empresas pertenecen al mismo grupo y viven situaciones opuestas.

La primera tiene un score autónomo de 52. El apoyo del grupo eleva su lectura
a 71,4. Sin embargo, sigue sin oferta porque no supera los controles de
financiación. El grupo aporta contexto, pero no borra los problemas de la filial.

La segunda tiene una nota autónoma de 95. Está aportando caja al grupo y su
lectura ajustada baja a 82,5. Aun así, el motor recomienda ampliar.

Para el CFO, esto permite identificar qué filial necesita apoyo y cuál está
sosteniendo al resto. Para el partner financiero, permite valorar cada
operación con el contexto del grupo.

**El producto conecta cada recomendación con sus motivos y con lo que hay
que revisar.** Esa es la utilidad de poner una aplicación encima del score.»

**Transición al miembro 4:**

«Ya hemos visto cómo se calcula y para qué sirve. [Nombre del miembro 4]
explica quién pagaría por ello y cómo lo llevaríamos al mercado.»

## Parte 4 — Miembro 4: monetización, estado y cierre

**Objetivo:** identificar quién paga, por qué paga y qué está construido,
cerrando con los tres pilares del jurado.

[Mostrar una diapositiva con los tres actores: empresa, Embat y partner financiero.]

«Nuestra propuesta es integrar Embat Flow como un módulo de Embat. El capital
lo aporta un partner financiero.

Planteamos dos vías de ingresos.

La primera es una suscripción adicional por el módulo. La empresa paga por
la visibilidad sobre su salud financiera, el seguimiento del grupo y las
herramientas para preparar y negociar su financiación.

La segunda son ingresos del partner: una comisión por financiación originada
y, potencialmente, una tarifa por monitorizar las líneas activas.

Como ejemplo ilustrativo, cien empresas pagando doscientos euros al mes
generarían doscientos cuarenta mil euros anuales. Si se originasen además
diez millones de euros al año con una comisión del uno por ciento, serían
otros cien mil euros: trescientos cuarenta mil euros de ingresos anuales,
antes de costes.

Son hipótesis comerciales que habría que validar. La lógica es combinar
ingresos recurrentes con ingresos por financiación facilitada, sin que
Embat aporte el capital del préstamo.

Hoy tenemos implementados el scoring explicable, el motor de decisión y las
vistas de empresa, cartera y grupo. Las ofertas son simuladas. La previsión
se muestra en modo sombra y no modifica la oferta. El consentimiento se
demuestra en la interfaz; el filtro de acceso del partner en servidor está
pendiente.

El siguiente paso sería un piloto con un partner para validar el score y la
política con resultados reales de financiación.

Embat Flow conecta los tres pilares: **tecnología que explica la salud
financiera, un producto que ayuda a decidir y un modelo de ingresos por
suscripción y financiación.**

De ver cómo se mueve el dinero a entender qué financiación puede sostener
cada empresa. Gracias.»

---

## Preparación del equipo — no se lee

- **Miembro 1:** abre y sitúa el problema. Evita entrar en fórmulas.
- **Miembro 2:** explica el cálculo y su implementación. Deja el ejemplo de
  grupo al miembro 3 para no repetirlo.
- **Miembro 3:** conduce la demo con las pantallas ya abiertas. Si falla,
  utiliza capturas del mismo mes y ejecución.
- **Miembro 4:** presenta los precios como hipótesis y cierra la presentación.
- Ensayad las transiciones. Cada persona entrega directamente la palabra a
  la siguiente sin volver a presentar el proyecto.
- Mantened agosto de 2026 como corte de toda la demo. Verificad que las cifras
  visibles coinciden con este guion antes de presentar.

### Pantallas que deben estar preparadas

1. Diapositiva de apertura: nombre y propuesta de valor.
2. Ficha con score y desglose de los tres bloques.
3. Vista de empresa con propuesta de circulante.
4. Grupo `GROUP_0217` y fichas de `COMP_0512` y `COMP_0926`.
5. Diapositiva de monetización con las hipótesis del ejemplo.

### Cifras de referencia de la demo

| Empresa | Score autónomo | Score con grupo | Recomendación del motor |
| --- | ---: | ---: | --- |
| `COMP_0512` | 52,0 | 71,4 | Cerrar por controles de financiación |
| `COMP_0926` | 95,0 | 82,5 | Ampliar |

Son resultados del caso documentado para agosto de 2026, no operaciones de
crédito contratadas. El ajuste de grupo no equivale a un aval jurídico.

### Respuestas breves para preguntas del jurado

**¿Por qué puede aportar valor dentro de Embat?**  
Porque combina movimientos de distintas entidades, facturas y contexto de
grupo en una misma evaluación de tesorería.

**¿Por qué confiar en el score?**  
Porque sus variables, pesos y aportaciones son trazables, muestra la evidencia
disponible y tiene pruebas y herramientas de backtest. Eso no sustituye una
validación con resultados reales de financiación antes de usarlo para prestar.

**¿Habéis demostrado anticipación de impagos reales?**  
No presentamos el score como una probabilidad de impago ni afirmamos esa
validación. El análisis detectó limitaciones temporales del dataset. La
previsión permanece en sombra y el piloto debe validar su utilidad real.

**¿Quién asume el préstamo?**  
El partner financiero aporta el capital. Proponemos que Embat cobre por el
módulo y por facilitar o monitorizar la financiación.

**¿Los precios están validados?**  
No. Son hipótesis ilustrativas de ingresos, pendientes de contrastar con
clientes y partners; no representan beneficio ni ventas existentes.

**¿Se comparten datos sin permiso?**  
El diseño exige que la empresa solicite financiación y contempla compartir
la evaluación y la propuesta, no los movimientos originales. En el prototipo,
la solicitud vive en la sesión del navegador; el filtro de servidor para la
cartera del partner todavía está pendiente.

### Documentación de apoyo

- [Producto](../product/PRODUCT.md).
- [Entrega para el jurado](../product/para-el-jurado.md).
- [Motor de scoring](../engines/scoring-engine.md).
- [Reglas vigentes y límites de validación](../product/SOURCE.md).
- [Caso de grupo utilizado en la demo](./use_cases_implementados/02-holding-absorbe-y-drena.md).

Se utiliza el caso de grupo porque sus cifras coinciden entre las fuentes
consultadas. El caso de «dos empresas con la misma nota» tiene versiones
distintas entre documentos y no forma parte de este guion.
