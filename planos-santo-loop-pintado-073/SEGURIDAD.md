# Seguridad, privacidad y compatibilidad

- No borrar ni sustituir `.skp` originales. Usar copias para pruebas. Evitar `File.delete`, sobrescritura directa y comandos destructivos sobre Plugins o carpetas personales.
- No desinstalar ni deshabilitar OpenCutList del equipo del usuario sin aprobación. Conservarlo durante la transición; pruebas de independencia solo en entorno controlado.
- Catálogo del taller y modelos son datos privados. No publicarlos, no compartirlos, no subirlos a servidores ni versionarlos en repositorios públicos sin autorización.
- Permitir cambios de materiales únicamente con confirmación explícita. `model.start_operation` / `commit_operation` / `abort_operation` y `Undo`; comprobación de alcances compartidos obligatoria.
- Evitar dependencia del `Ladb::OpenCutList::PLUGIN` o tocar internals. Leer atributos OCL existentes como compatibilidad, no escribirlos. Si se reutiliza código upstream GPLv3, cumplir aviso de copyright, licencia y obligaciones de redistribución.
- No inventar precios, texturas, espesor, veta, clasificación de canto, tipos de material ni orientación. Registrar `needs_review` en lugar de suponer.
- La exportación de pedido no implica autorización de compra; no automatizar navegación, login ni envío al proveedor.
- Asegurar que el catalogo no se reemplace silenciosamente cuando existan discrepancias; usar copia, revisión incremental y backups de revisiones.
- Los scripts de Codex CLI usan sandbox `workspace-write`; no habilitar `danger-full-access` para evitar trabas sin pedir autorización específica.
- Cualquier instalación de extensiones y verificación con acceso a la computadora la hará Codex local/Dot posteriormente, no el Codex de la nube.
