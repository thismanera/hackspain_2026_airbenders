# Demo: guion de 90 s y mapa de casos

Los casos con empresas, cifras, playbook y hueco para capturas viven en
[`use_cases/`](./use_cases/). Este fichero es solo el orden de escena.

**Origen.** Run `73ef3e1227d705245c047eec`, contrato `scoreSolo-holding-v7`,
corte 2026-08. Forecast en **modo sombra**. Límites simulados. El ejemplo
ficticio Northbrook/Velasco está en
[`history/2026-09-19-demo-comparativa-empresas.md`](../history/2026-09-19-demo-comparativa-empresas.md).

## 90 s

1. [Empate a 67](./use_cases/01-empate-nota-holding-opuesto.md) — `COMP_0524` /
   `COMP_0563`. Misma nota, holding y rumbo opuestos, abrir vs reducir.
2. [Grupo que absorbe y drena](./use_cases/02-grupo-absorbe-vs-drena.md) —
   `GROUP_0217`. El 71 de la filial no es generación propia.
3. [Sin botón](./use_cases/03-misma-nota-sin-oferta.md) — `COMP_1228` /
   `COMP_0664`. Otro 59: una pide y la otra no.

Si hay 20 s más: [pedir circulante](./use_cases/04-pedir-circulante-en-mejora.md)
(`COMP_0447`) o [impago con nota buena](./use_cases/06-impago-con-nota-buena.md)
(`COMP_0540`).

## Catálogo

Índice completo en [`use_cases/README.md`](./use_cases/README.md): 17 fichas
(opt-in, puertas, aval, cross-default, techo, pignoración, histéresis, EWI,
control sano). Capturas en [`use_cases/captures/`](./use_cases/captures/).

## Lo que no se dice

- Que el score sea probabilidad de impago o una aprobación.
- Que el forecast conectado recorte o amplíe la oferta.
- Que el playbook pruebe una decisión de gestión.
- Que un ajuste positivo sea un aval jurídico.
