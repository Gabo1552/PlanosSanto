# Seguridad, privacidad y compatibilidad

- Trabajar en rama separada o copia, no sobrescribir versiones previas ni proyectos de cliente.
- Nunca subir `referencias_privadas/`, texturas, modelos o material de cliente a repositorio público. El ZIP puede contener información privada; repositorio `.gitignore` debe excluir.
- La selección de imágenes entra sólo por diálogo nativo con extensiones y firmas válidas. Rechazar rutas remotas, symlinks, archivos corruptos y exceso de píxeles/tamaño. No usar `eval` ni comandos shell con nombres sin escapar.
- Respetar CSP de UI interna, sanitizar nombres y datos mostrados, y límites de memoria/base64.
- Operaciones sobre SketchUp con `start_operation`, `commit_operation`/`abort_operation`, en el modelo activo correcto; un `Ctrl+Z` debe revertir pintados.
- La definición de componente puede compartirse: no aplicar pintura de cara/definición sin advertir y comprobar propagación.
- Hacer backup del catálogo y del índice de activos antes de migrar; no migrar con pérdida silenciosa.
- Conservar compatibilidad lectura de OpenCutList; no desinstalarlo del usuario hasta superar comparativas.
- OpenCutList GPL-3.0: inspiración conceptual permitida; cualquier reutilización de código o assets requiere auditoría de licencia/atribuciones, no copiar marca ni iconos originales.
