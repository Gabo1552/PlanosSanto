# Matriz de casos — renombrado automático

| Código | Situación | Resultado esperado |
|---|---|---|
| T01 | `Bajo Mesada`, 3 piezas | Prefijo propuesto `BM`; 3 líneas en preview |
| T02 | `M08 - Alacena Superior` | Prefijo propuesto `M08` |
| T03 | Editar grupo en panel | Vista previa cambia sin pulsar botón por pieza |
| T04 | Cancelar | Ningún nombre ni atributo del SKP se modifica |
| T05 | Confirmar una vez | Nombres del padre e hijos aplicados atómicamente |
| T06 | Confirmar dos veces | Sin duplicación y sin nueva transacción cuando es igual |
| T07 | Cambiar `BM` a `AS` | Reemplazo exacto del prefijo gestionado por la extensión |
| T08 | Pieza preexistente `Lateral - Blanco` | Se conserva el nombre base y el guion original |
| T09 | Nombre `BM - Lateral` preexistente sin metadata | No se supone automáticamente que el prefijo `BM` sea gestionado; se evita truncamiento |
| T10 | Dos muebles con instancias de pieza independientes de misma definición | Renombrar uno no cambia el otro |
| T11 | Padre cuya definición es compartida en dos posiciones | No hay modificación silenciosa de los hijos del otro padre; advertencia y bloqueo seguro |
| T12 | Subgrupo con pieza anidada | Identificación por ruta de ocurrencia, sin duplicados |
| T13 | Grupo vacío / sin nombre | Mensaje claro, sin crash ni placeholders destructivos |
| T14 | Pieza bloqueada o borrada desde vista previa | Aplicación falla de forma segura; sin cambios parciales |
| T15 | Vista previa vieja y modelo actualizado afuera | Se obliga a refrescar; no escribir sobre datos obsoletos |
| T16 | Guardar, cerrar y reabrir | Nombres, prefijos gestionados y bases conservados |
| T17 | Deshacer (Ctrl+Z) después de aplicar | Revierte grupo e hijos en un solo paso |
| T18 | Materiales, posiciones, dimensiones, notas existentes | Sin cambios colaterales |
| T19 | Unicode: `Módulo Ñandú`, `Puerta derecha` | Nombres intactos, abreviatura editable |
| T20 | Entrada con espacios duplicados o HTML en nombre | Texto mostrado de forma segura; sin ejecución de código ni nombres corruptos |

Automatizar todo lo que pueda probarse fuera de SketchUp; **T16, T17 y la interacción final deben validarse también en SketchUp 2026 instalado en Windows.**
