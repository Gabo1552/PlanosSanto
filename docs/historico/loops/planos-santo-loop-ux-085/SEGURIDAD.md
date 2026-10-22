# Límites de seguridad, privacidad y evolución

- Los SKP y fotos del usuario pueden incluir diseños privados. No mover `referencias_privadas/` a GitHub ni a servicios externos por defecto; `.gitignore` excluye esa carpeta.
- El desarrollo se hace sobre copias y git con historial; sin `git reset --hard`, cambios irreversibles ni eliminación de funciones anteriores.
- Madera y cantos: los datos de aspecto NO sustituyen validación de espesor, dimensiones, veta, posición de canto ni precio comercial.
- Las imágenes son datos no confiables; mantener validación de formato, tamaño, duplicados, hash y tratamiento de rutas en `PhotoMaterial`.
- Diferenciar pintura de instancia vs definición compartida, y representación de vista vs modelo real.
- No enviar pedidos ni reemplazar catálogo de producción sin consentimiento.
- Los atajos de rapidez NO pueden desactivar las barreras de seguridad de `NativePaint`, `SmartPaint`, `MaterialPolicy` o `Workshop`.
- No copiar los iconos de OpenCutList ni su marca. Si efectivamente se incorpora código de OpenCutList, gestionar GPLv3 y licencias; usar como referencia de UX no requiere copiar código.
