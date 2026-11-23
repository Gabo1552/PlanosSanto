# Candidata 0.8.35 — paquete de obra para App Santo

Base: 0.8.34 (`7b61220`) más la rama `claude/obra-json`. Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Cambio

**Paquete de obra** (`planos-santo.obra.v1`): en Piezas, el botón «Paquete de obra» guarda un JSON con **todos** los muebles generados y sus piezas, para que App Santo muestre la obra en 3D y coloree cada mueble según su etapa.

- **Mueble:**
  - `id` estable (ruta de `persistent_id`);
  - nombre, igual a la columna «Mueble» del CSV;
  - código de módulo;
  - medidas totales, las mismas cotas del plano A4.
- **Pieza:**
  - `id` y código;
  - nombre;
  - material: nombre, SKU y color;
  - medidas de corte (L, A, E);
  - caja en sus ejes locales;
  - matriz local → mundo en mm.
- **Liviano:** las piezas van como cajas, sin mallas. Una cocina de 30 muebles pesa unos 0,5 MB.
- **Controles antes de guardar:** se compara con los muebles generados vigentes (mismos muebles, nombres, piezas y posiciones). Si algo cambió, pide volver a generar.
- **Solo lectura:** no modifica el `.skp`, la guía ni el pedido.
- **Contrato:** `docs/integracion-app-santo/OBRA_JSON.md` explica el esquema y cómo dibujarlo en three.js, con un ejemplo que se valida en las pruebas.

## Revisión antes de entregar

| Punto | Estado |
|---|---|
| La prueba de instalación esperaba 92 archivos en el RBZ (ahora son 93) | Corregido en la rama original |
| El esquema limitaba el SKU a 100 caracteres; la biblioteca y el SKU automático llegan a 160 | Corregido (160) y con prueba |
| Había un cálculo de medidas totales de respaldo, inalcanzable y erróneo | Eliminado |
| Las pruebas de interfaz no encontraban Chromium en los contenedores nuevos (`chrome-linux64`) | `tests/chromium.ts` lo busca |
| Faltaba integrar con la 0.8.34 | Hecho; hubo un conflicto en la lista de pruebas Ruby, ya resuelto |
| El empaquetado copiaba una cantidad de archivos vieja | `preparar.py --archivos N` |

## Límites

- **Emparejamiento por nombre:** App Santo empareja los muebles por nombre exacto. Renombrar después de importar rompe el vínculo; conviene usar el `id` del mueble como clave. Con nombres repetidos, la extensión avisa.
- **Formas no rectangulares:** las piezas no rectangulares se dibujan como su caja.
- **Sin datos para cotizar:** el paquete no lleva cantos ni veta. Es para el visor de avance, no para cotizar.
- **Simulado:** falta validar en SketchUp real la exportación con un modelo real y la carga en App Santo.

Ver `RESULTADOS.json` y `VALIDACION_LOCAL.md`.
