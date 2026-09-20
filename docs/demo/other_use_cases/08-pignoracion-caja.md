# 08 — Una empresa sana puede estar drenando caja al grupo

> Caso documentado con datos del corte 2026-08.

## Qué demuestra

Una empresa puede ser muy sólida por sí sola y, al mismo tiempo, representar
una exposición menos favorable para el banco porque parte de su caja sale hacia
el grupo. Ambas realidades deben aparecer separadas en la decisión.

**Ejemplo localizado** (corte 2026-08):

| Campo                      |                    Valor |
| -------------------------- | -----------------------: |
| Empresa                    | `COMP_1022` (GROUP_0126) |
| `scoreSolo` / `scoreGrupo` |              90,2 / 60,2 |
| Ajuste holding             |                      −30 |
| Perfil                     |      `drenaje_tesoreria` |
| A / B / C                  |             98 / 97 / 68 |
| Estado Solo / Grupo        |           Sana / Vigilar |
| `alertaPignoracionCaja`    |                       Sí |
| Plazo máximo               |                  90 días |

## Explicación del caso

`COMP_1022` presenta una situación autónoma excelente. Su `scoreSolo` es 90,2,
con 98 puntos en caja, 97 en fiabilidad y 68 en circulante. Si se analizara la
empresa sin su entorno corporativo, la lectura sería **Sana** y parecería una
candidata clara para ampliar financiación.

El bloque de holding añade una información que el score autónomo no puede
contener. El ajuste es −30, el máximo negativo previsto por la política, y
reduce `scoreGrupo` hasta 60,2. El perfil `drenaje_tesoreria` resume que los
flujos observados son compatibles con una salida relevante de recursos hacia
otras empresas del grupo. Por eso el estado consolidado baja de **Sana** a
**Vigilar**, aunque la capacidad propia siga siendo alta.

La respuesta no consiste necesariamente en cerrar la financiación. La alerta
`alertaPignoracionCaja` activa un cortafuegos que limita la ampliación y fija un
plazo máximo de 90 días. Así, el banco puede reconocer la fortaleza autónoma de
la empresa y, al mismo tiempo, evitar que una operación de largo plazo termine
financiando indirectamente necesidades del holding que no estaban en el análisis
individual.

La pantalla debe mantener visibles los cuatro elementos que justifican esta
lectura: `scoreSolo` 90,2, ajuste −30, `scoreGrupo` 60,2 y perfil de drenaje. Si
solo se mostrara el score de grupo, parecería que el negocio se ha deteriorado;
si solo se mostrara el autónomo, desaparecería el riesgo de que la caja no se
quede en la prestataria.

El término «pignoración» describe aquí una medida de protección propuesta por
el motor, no un contrato ya firmado. Tampoco implica que la empresa esté
quebrada ni atribuye al grupo una intención concreta. El sistema observa flujos,
identifica una exposición y traduce esa exposición en condiciones prudentes de
plazo y control.

**Pantallas:** `/cartera/COMP_1022?mes=2026-08` y grupo
`/grupos?mes=2026-08` buscando `GROUP_0126`.

## Capturas sugeridas y ubicación

| Dónde pegarla               | Qué debe mostrar                                                                                              | Archivo sugerido                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Después del primer párrafo  | Cabecera y cascada autónoma con score 90,2, estado **Sana** y bloques 98 / 97 / 68.                           | `../use_cases_implementados/images/08-empresa-sana.png`    |
| Después del segundo párrafo | Bloque de holding con ajuste −30, `scoreGrupo` 60,2, estado **Vigilar** y perfil `drenaje_tesoreria`.         | `../use_cases_implementados/images/08-drenaje-holding.png` |
| Después del tercer párrafo  | Decisión con `alertaPignoracionCaja`, cortafuegos y plazo máximo de 90 días. Esta es la captura principal.    | `../use_cases_implementados/images/08-cortafuegos.png`     |
| Después del cuarto párrafo  | Vista del `GROUP_0126` o grafo de flujos que contextualice hacia dónde sale la caja, sin atribuir causalidad. | `../use_cases_implementados/images/08-vista-grupo.png`     |

**Qué no decir.** Que la empresa esté quebrada. Que exista un contrato de
pignoración firmado. Que el ajuste de −30 sea una pérdida autónoma de la
empresa.
