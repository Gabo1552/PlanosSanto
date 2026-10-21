# Contrato del lector SketchUp C SDK (alternativa anterior)

El flujo actual usa la extensión Ruby de `sketchup/` dentro de SketchUp de Windows y no requiere C SDK. Esta documentación conserva la alternativa de carga directa en servidor. La muestra real ahora está en `fixtures/private/`, pero sigue sin ejecutarse un lector C SDK ni SketchUp aquí.

No se incluye ni se simula una implementación nativa de SketchUp C SDK. `lib/reader.ts` es un adaptador de proceso con validación, temporales privados, timeout, límites y limpieza. La API devuelve **503** si no hay lector; no interpreta JSON renombrado como `.skp`.

## Bloqueo verificado

El host es Linux x86_64. La búsqueda en las ubicaciones accesibles del entorno no encontró SDK/headers/bibliotecas/lector. El primer ZIP contenía solo instrucciones; un segundo ZIP aportó una muestra `.skp` real, ahora privada y pendiente de validación en SketchUp. Ninguno contiene C SDK. Las consultas HTTPS a la documentación oficial en `extensions.sketchup.com` fueron rechazadas por el proxy con 403. Por eso no se afirma haber confirmado la matriz vigente de plataformas, licencias o versiones compatibles.

Fuentes oficiales a consultar con acceso habilitado:

- https://extensions.sketchup.com/developers/sketchup_c_api/sketchup/index.html
- https://help.sketchup.com/en/sketchup/sketchup-api

La política de red debe permitir esos dominios para consultar documentación; esto por sí solo no instala el SDK ni resuelve compatibilidad/licencia. No se intentó sustituir bibliotecas propietarias ni desactivar verificación TLS.

## Interfaz del proveedor

Configurar `SKETCHUP_READER_BIN` con una ruta absoluta a un ejecutable instalado y autorizado para el host. Se invoca **sin shell**:

```text
lector --input /ruta/privada/model.skp --output /ruta/privada/model.json
```

Debe terminar con código cero en menos de 90 segundos y escribir JSON UTF-8 del siguiente protocolo. Fallos o archivos no soportados deben producir código distinto de cero. No imprimir datos de usuario en logs. Debe rechazar archivos inválidos a través del SDK, admitir las versiones acordadas y liberar correctamente recursos del SDK.

```json
{
  "version": 1,
  "units": "in",
  "name": "Proyecto taller",
  "furniture": [
    {
      "id": "instancia-padre-1",
      "name": "Módulo",
      "kind": "group",
      "transform": [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
      "children": [
        {
          "id": "ruta-instancia-1-tabla-1",
          "definition": "definicion-compartida-opcional",
          "name": "Lateral",
          "kind": "component",
          "transform": [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
          "mesh": {
            "vertices": [[0,0,0],[1,0,0],[0,1,0],[0,0,1]],
            "triangles": [[0,2,1],[0,1,3],[1,2,3],[2,0,3]]
          },
          "children": []
        }
      ]
    }
  ]
}
```

El ejemplo solo ilustra el protocolo con un tetraedro; no es un tablón ni una lectura SketchUp. `lib/demo.ts` contiene modelos sintéticos de tablones completos.

## Reglas que debe implementar el lector nativo

- Recorrer grupos e instancias de componentes. Los padres de primer nivel representan muebles; los grupos intermedios conservan el anidamiento. La geometría suelta, muebles sin agrupar y clasificación ambigua deben informarse/rechazarse, no descartarse silenciosamente.
- Identificar cada instancia por ruta estable de instancias, no por definición compartida. Mantener el mismo ID al reabrir el mismo proyecto guardado.
- Emitir transformaciones **locales al padre**, matrices 4×4 afines en orden de columnas. El servicio compone las matrices; no hornear transformaciones y luego volver a aplicarlas.
- Emitir vértices en ejes locales del grupo/pieza y triangulación real de las caras, con orientación exterior coherente. No sustituir la malla por una caja: la caja solo calcula medidas locales.
- Declarar unidades `in` para las coordenadas nativas del SDK o `mm` si ya fueron convertidas. No aplicar ambas conversiones. Los vectores de traslación usan las mismas unidades.
- Resolver mallas de caras, agujeros y todas las instancias físicas; mantener escalas no uniformes y reflejos. Investigar geometrías abiertas/ambiguas antes de aceptar medidas como fiables.
- Acordar visibilidad de entidades ocultas/capas y detectar geometría no física (herrajes/texto/guías) con muestras del taller. Actualmente no hay una política nativa implementada ni probada.

## Prueba requerida para cerrar el MVP

Obtener un lector construido con SDK autorizado y plataforma soportada, más un `.skp` real del taller con al menos dos muebles, componentes repetidos y rotados, y medidas de referencia. Probar la carga por la interfaz; comparar geometría, jerarquía, medidas/cantidades; guardar/reabrir notas; generar y revisar exactamente dos A3 con etiquetas y flechas. Registrar versiones del SDK, sistema y resultados. Hasta entonces `CODEX_STATUS.json` no puede pasar a `done`.

`tests/reader.test.ts` usa un ejecutable de prueba que devuelve un fixture para verificar el **contrato del adaptador y sus errores**. Esto no verifica SketchUp ni su SDK.
