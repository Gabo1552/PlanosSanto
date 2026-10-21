# Evidencia recibida de la validación real 0.8.8

Fuente: entrega autorizada del Codex local en esta conversación (2026-10-21). **Se recibió el informe textual; no se recibieron el ZIP local ni fotos, modelos, SKM, capturas o geometría.** El checkout de nube se actualizó por fast-forward al commit indicado antes de corregir.

- Fuente validada: `af434dd23d7b1ca220f7e6e3efd920780c0ea99e`.
- RBZ 0.8.8: SHA256 `2a66f19d510a70a90d8bc074e92c0de2bd5dd7452c7861722267890fef805a20`.
- SketchUp Windows Gabonet 26.2.243, Ruby 3.2.2, OpenCutList 7.1.0.
- Matriz V1–V19: **10 PASS, 4 FAIL, 5 PENDIENTE**. Siete regresiones nativas complementarias PASS. No aprobación de producción; **no iniciar Hito 2**.
- Verificador oficial: 54 hashes sin diferencias; cuatro originales y biblioteca de producción intactos. Solo copias/biblioteca QA.

## Defectos confirmados

**P1 V1/V15, fotos.** JPG válido 1200×1200, 166.694 bytes; `ImageRep.load_file` devuelve nil pero dimensiones 1200×1200. El chequeo `== true` rechaza tanto +Material como Asignar foto a una ficha. SHA foto informado: `4af47551e59440084b6eeb19f9a23a2ea96632e47ade4a44ba823372d8bfd0ab`. La foto privada permanece local. Deben repetirse V1/V2/V3/V7/V12/V15 con foto nueva y UV, además de corruptos, formato falso y límites.

**P1 V6, SKM.** Caju18mm figuraba «Se instala al elegir». Un material nativo sin binding llamado Melamina petiribi18mm ya existía y `Materials.load` devolvió ese objeto; el código bloqueó solicitando vinculación explícita. Reproducido dos veces; el material activo anterior se conservó. Otro SKM Plywood sí instaló/pintó textura real. No confundir nombres con equivalencia visual.

**P2 V19, rendimiento.** 1560 piezas/1603 ocurrencias. Plan readonly oficial: 593,6 / 540,0 / 544,9 / 544,0 / 549,9 ms, mediana 544,9 ms (objetivo orientativo 300 ms). Los diez clics automatizados incluyeron cuatro escrituras y seis no-op; 876–951 ms hasta captura incluyen automatización y NO son tiempo aislado del motor. 0.8.8 ya evitaba el segundo plan; se debe perfilar y repetir diez escrituras reales.

## Observaciones pendientes

Clic cercano a arista: Edge precedía Face en puntos vecinos, pero no se registró el punto exacto. **No se trata como defecto confirmado ni se cambia la selección a ciegas.** La cara estrecha visible sí pintó solo la cara310. Dos paletas simultáneas conservaron un catálogo anterior hasta cerrar/reabrir; revisar invalidación entre diálogos.

## Alcance de los PASS reportados

Cinco piezas sin formularios con color; dos Undo; Escape; puerta repetida aislada con gemela intacta; cuatro caras menores protegidas; un canto sin afectar los demás; reutilización de color entre procesos; edición SKU/proveedor seguida de pintura; SKM real; ficha manual con color; atributos OCL reales; persistencia de caras/cantos/SKM; archivo faltante V16 con reinicio completo, aviso y recuperación por hash. Geometría/nombres/transformaciones intactos.

PDF A4 exterior y doble reales: una hoja 297×210 mm, 17 piezas, nota/flecha y render revisado. TXT bloqueado correctamente por revisión/orientación pendientes. **No se ejecutó pedido comercial válido ni se inventan aprobaciones.** Fotos nuevas/UV, rotación/espejo real, diez escrituras cronometradas y V18 siguen pendientes. Estos PASS corresponden a 0.8.8 y a las variantes ejecutadas; no aprueban automáticamente la candidata siguiente.
