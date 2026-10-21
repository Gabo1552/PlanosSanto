# Ajustes posteriores a la validación local 0.7.4

## Ciclo 0 — Revisión y preservación

Usuario autoriza continuar ajustes y postergar aceptación comercial. La 0.7.4 conserva 35/35 controles locales aprobados en su alcance; esa evidencia no se transfiere automáticamente a una versión nueva.

Respaldo de 199 archivos: artifacts/respaldo-074-antes-ajustes.tar.gz, SHA256 b454efc69f5adf855b4380890a0e2a8986a355264994a425c564380e683784d1. RBZ0.7.4 y paquete local permanecen intactos.

## Ciclo 1 — Biblioteca y recuperación de interfaz (en curso)

- Reproducidos y corregidos dos defectos: assetRevision0.0 aceptado como0 y falta de coherencia entre nombre SKM/hash de índice.
- Biblioteca:19 pruebas/148aserciones aprobadas, incluye revisión visual obsoleta sin cambio de revisión comercial, UUID duplicados y activos desactualizados.
- En curso: envío de revisión visual desde UI, actualización explícita de biblioteca y recuperación de vista previa consumida/cancelaciones.
- Conservados schema1 de catálogo/guía, A4, nombres, anotaciones y formato TXT. No se agregan presupuestos ni optimización.

## Ciclo 2 — Interfaz y cancelaciones

- PaintPanel pasa assetRevision al vincular/instalar; incorpora Actualizar biblioteca con cancelación de preview y reinicio de autorizaciones.
- Error al aplicar consume la vista previa en UI y exige revisión nueva; cancelar selección SKM conserva guía/PDF.
- offline.rb permite cancelar sin depender del modelo activo. Dos pruebas nuevas cubren cambio de modelo y cancelar sin análisis previo.
- Pruebas focalizadas:8/8 Playwright de pintado aprobadas; controlador11/129; biblioteca19/148. ESLint/TypeScript focalizados aprobados.
- Se incrementó a0.7.5 y se agregó versión al esquema de importación. Build offline inicial aprobado; artefactos históricos0.7.4 preservados.
- Verificación completa en curso. No se ejecutó SketchUp ni se inició otro alcance comercial.

## Ciclo3 — Verificación completa y entrega

- `npm run verify`:exit0; Ruby214/1475, TypeScript119, web16, offline47. Lint/build/typecheck aprobados.
- RBZ auditado:23archivos+2carpetas,17Ruby/JS sintácticamente correctos, CRC/hashes válidos e inventario0.7.4 conservado. SHA2560.7.5: 8902ff7405ab92fbe72411a5c389ee710f3a6af195b3b3d035e6e9a4bcef59ff.
- Tres demos A4 sintéticas generadas; documentación y paquete reproducible preparados, sin modelos/texturas privados.
- Estado final: candidata0.7.5 con pruebas de nube aprobadas. No se ensayó en SketchUp. Los temas comerciales continúan diferidos según el usuario.
