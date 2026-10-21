# Recepción de validación local 0.8.1

ZIP adjunto `validation-081.zip`, SHA256 `9e5f6e33b1e18638303085c6c5364e6ea337fcd5056cbb59e62193f076206261`. No confundir con el ZIP completo de 92 archivos y SHA256 `18754115ddabdef1c32f51f65466422e1bc1266969452640d5f68a3de7918707`, anunciado por delegación pero no recibido.

80 entradas, 75 archivos, CRC válido; 74 hashes verificados y 17 referencias del manifiesto que apuntan fuera del subconjunto, sin hashes discrepantes. Archivo de recepción: `artifacts/recepcion-validacion-local-081.json`. Los SKP, capturas y datos permanecen en `fixtures/private/validacion-081-recibida/`; no se incluyen en la candidata ni el paquete de entrega.

Revisados informe, BUG-TIMEOUT, cuatro JSON de preferencias, resultados de clic/lote y tres PDF. Antes/después de reinicio de A idénticos; cuatro `passed`, `forbiddenKeysAbsent`, `modelModifiedUnchanged` verdaderos. Clic/lote informan cambio de caras, invariantes y Undo exacto. Los tres PDF tienen una página de 297 × 210 mm; el informe documenta render revisado localmente. El PDF del timeout existe y es válido pese al aviso falso. Tiempo registrado de elección: 158 s.

La validación nativa de preferencias se acepta según alcance informado. No se ejecutaron scripts adjuntos ni SketchUp en nube, ni se afirma aprobación de producción. Continúan pendientes proveedor, SKU/materiales reales del taller, veta industrial, perfil sin OpenCutList, modelos grandes y otros casos no cubiertos. La corrección de espera de 0.8.2 requiere una nueva prueba nativa específica.
