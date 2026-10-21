# Correcciones de Hito 1 — candidata 0.8.9

## Ciclo 1 — base y reproducción

Base verificada: main af434dd (0.8.8), actualizada sin sobrescribir trabajo local. Informe nativo registrado en EVIDENCIA_LOCAL_088.md, con sus límites y sin afirmar recepción de binarios. No Hito 2.

Se reprodujo con dobles el contrato nil de ImageRep y la colisión de Materials.load sobre un objeto ya existente. La invalidación de biblioteca no se difundía entre paletas. Las observaciones de picking no se consideran confirmadas.

## Ciclo 2 — perfil antes de optimizar

Modelo sintético: 1560 piezas y 43 grupos raíz (1603 ocurrencias), sin modelos privados. Plan readonly con cinco muestras sin TracePoint: mediana 191,77 ms. Un plan instrumentado confirmó **tres llamadas a NameManager.inventory**, dos desde las comprobaciones de caras. No son los tiempos Windows del informe.

Se comparte exclusivamente el inventario recién construido dentro de una misma planificación síncrona: tres inventarios pasan a uno, sin caché persistente. Las llamadas separadas preview/apply continúan tomando un inventario fresco y bloquean cambios entre ambas. Después, mediana sintética 57,32 ms; TracePoint confirma un inventario. No se declara alcanzado el objetivo Windows ni diez escrituras reales. Scripts y JSON del perfil incluidos.

- [x] Terminar correcciones P1 y revisión independiente.
- [x] Build, Ruby, tipos/lint, TS e interfaz offline.
- [x] RBZ, hash, entrega reproducible e instrucciones nativas.
- [ ] Repetición real V1/V2/V3/V6/V7/V12/V15/V19 y pendientes de foto/UV/TXT.

## Ciclo 3 — revisión, correcciones y verificación

P1foto: nil solo con ImageRepnuevo, cabecera/dimensiones y buffer RGB24/RGBA32 exacto dentrodelímite;false/excepción/corruptos/extensiónfalsa rechazados. Crear/reemplazar probados con dobles, sin foto privada. P1SKM: primerload conobjetoexistente seabortayreintenta importandonuevo conaliastransitorio/restauración antescommit, nunca bindingpornombre. Siabortfalla oestadooriginalnodemuestrarestauración, no retry ni falso éxito. Biblioteca/foto/motor/Undo y rollback tienen regresiones específicas.

RevisiónRuby detectórollbackignorado; corregidoyrevisado. RevisiónTS detectóinvalidaciónperdida siotrodiálogoocupado; reintentoacotadoporesperahasta2segundos soloerrorbusy ycancelaciónporcontexto/revisión, sinciclosdecorrupción. Seguridadsinbloqueosadicionales; PBR/colorize ycontratoImageRep reales pendientes. Catálogo/estados/miniaturas sincronizados sin resetearTool/UUID/borrador ni scan porhover.

Verificación final: 481 Ruby / 3594 aserciones / 35 suites;140TS;113UIoffline;16web: **750 casos**. Build/typecheck/lint sinerroresniavisos. RBZ55archivos/54hashes/58entradas, mismosarchivosque0.8.8; diezserviciossin cambiosincluidosnombres,maderera,UV/pickingyguías. SHA256 `8b72f90dd19e342864beb4b2f53dbfe8d2455393535bba95b92b2c3306e7d231`. Baseline0.8.8intacta.

InformeWindows088con10PASS/4FAIL/5PENDIENTEconservado comoevidenciarecibida, no comoaprobación089. Las pruebas de corrección son nube; los tiempos191,77→57,32msson sintéticos, noWindows. Repetirfotos/UV,SKMcollision,PBR/Undo,diezescrituras,V18yregresiones. ProducciónNOaprobada;Hito2NOiniciado.

Reproducción desde ZIP: buildRBZ idéntico y regresiones Ruby completas aprobadas; dependencias Node locales reutilizadas. No es SketchUp.
