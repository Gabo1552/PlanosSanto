# Validación local de Planos Santo 0.8.24

Candidata para SketchUp 2026 en Windows. Validación nativa pendiente; la coincidencia completa con el proveedor sigue pendiente.

1. Guardar el modelo y cerrar SketchUp. Instalar `PlanosSanto-0.8.24-candidata.rbz` mediante el Administrador de extensiones y reiniciar SketchUp.
2. Abrir una copia de un modelo de prueba, entrar a Maderera y seleccionar **Experto**. Verificar que usa el formato de la ficha de cada material y que muestra todos los grupos de material y espesor.
3. Recrear en un modelo sintético las piezas de los ensayos A/B/C definidos en `docs/auditoria-experto-0822/ensayos`: A con giro permitido, B/C bloqueado, placa 2750 × 1830, sierra 4,4 y refilado total 10. Esperado: una placa en cada ensayo; A con cinco piezas giradas de 500 × 1600. El TXT no incluye la distribución: corresponde observar el diagrama local además del archivo exportado.
4. En los cuatro pedidos auditados, con la misma configuración, esperar 28/12/13/56 placas. La referencia del proveedor sigue siendo 27/11/12/56. Registrar tiempo de respuesta, piezas, veta y cualquier diferencia del diagrama.
5. Abrir cada optimización y exportar su TXT. Verificar cantidades, medidas, giro y los cuatro campos de cantos; no confirmar compras como parte de esta validación.
6. Cambiar a **General** y comprobar que recupera sus opciones de disco, refilado por lado y giro. Reabrir el modelo y comprobar la preferencia elegida.
7. Comprobar que la asociación de materiales nativos sigue abriendo su ficha, sin activar Pintar; las fichas, texturas y datos OCL de 0.8.23 deben conservarse.

El verificador de solo lectura `docs/validacion-0811/verificar_0811_sketchup.rb` reconoce ahora 0.8.24 y verifica la instalación. No certifica las decisiones del optimizador ni sustituye estos ensayos.

Si hay un problema, conservar el modelo y el reporte, y volver a instalar la candidata 0.8.23 anterior. Esta entrega no cambia el esquema de catálogo ni el formato de datos persistidos.
