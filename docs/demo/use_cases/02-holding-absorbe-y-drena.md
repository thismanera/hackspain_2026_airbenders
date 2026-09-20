# 02 — El holding puede absorber o drenar caja

> «La misma estructura de grupo puede apoyar a una filial o extraer recursos de una empresa sana. El banco necesita ver ambas direcciones.»

**Empresas:** `COMP_0512` y `COMP_0926`, ambas en `GROUP_0217`  
**Pantallas:** `/grupos?mes=2026-08` y las fichas de ambas empresas  
**Corte:** 2026-08

## Qué demuestra

El `scoreSolo` se calcula sin mezclar los movimientos de las hermanas. Después,
el motor publica el contexto del holding como `scoreGrupo` y `ajusteHolding`.
Esto permite distinguir una filial que depende del grupo de otra que está
cediendo caja al grupo.

## Cifras de referencia

|              |  `COMP_0512` receptora | `COMP_0926` donante |
| ------------ | ---------------------: | ------------------: |
| `scoreSolo`  |                   52,0 |                95,0 |
| `scoreGrupo` |           71,4 (+19,4) |        82,5 (−12,5) |
| Perfil       | `filial_subvencionada` | `drenaje_tesoreria` |
| D4           |                  +0,90 |               −0,70 |
| Acción       |     Cerrar por puertas |             Ampliar |

## Cómo contarlo

1. Abre el grupo y sitúa sus miembros: «No estamos viendo una sola empresa,
   sino un techo de exposición compartido».
2. En `COMP_0512`, compara 52 autónomo con 71 dentro del grupo. Aclara que el
   apoyo explica la diferencia, pero no elimina las puertas de caja o clientes.
3. En `COMP_0926`, compara 95 autónomo con 82,5 de grupo. La empresa parece
   sana por sí sola, pero su aportación neta al grupo reduce el contexto.
4. Enseña las dos decisiones. «El holding cambia la lectura de exposición; no
   sustituye el diagnóstico autónomo».

## Texto para la presentación

> «Un banco puede ver una filial con buen apoyo y pensar que el 71 es generación
> propia. Aquí mostramos la separación: el 52 es de la empresa y el resto es
> contexto del holding. En la otra dirección, una empresa con 95 puede estar
> financiando al grupo. Las dos lecturas son necesarias para poner precio y
> límite al riesgo.»

## Capturas que debes añadir

- [ ] Vista del grupo `GROUP_0217`.  
      Archivo: `captures/02-grupo-0217.png`
- [ ] Ficha de la filial receptora.  
      Archivo: `captures/02-ficha-comp-0512.png`
- [ ] Ficha de la empresa donante.  
      Archivo: `captures/02-ficha-comp-0926.png`

## Qué no decir

- Que `scoreGrupo` sea la capacidad autónoma de la filial.
- Que el apoyo del grupo garantice el pago.
- Que el ajuste pruebe la existencia de un aval firmado.
