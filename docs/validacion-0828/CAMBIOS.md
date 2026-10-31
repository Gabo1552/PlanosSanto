# Candidata 0.8.28 — «Ocultar frente» en Sugerencias de nombres

Base: 0.8.27 (`c179374`). Estado: **pendiente de validación real; producción no aprobada**. No se ejecutó SketchUp: las pruebas usan dobles de la API.

## Cambio

En Muebles → «Proponer nombres por geometría…», junto a «Marcar frente en el dibujo», hay un botón nuevo: **«Ocultar frente (N)»**. Saca del dibujo del diálogo las puertas y los frentes de cajón del frente elegido en ese momento.

- **Detección:** usa la misma del interior de Planos, `frontPieceIds` en `lib/scene.ts`, y calcula el frente con la orientación del diálogo.
- **Interior a la vista:** con el frente oculto se pueden ver y tocar los estantes, los divisores y el resto del interior. Tocar una pieza lleva a su fila para cambiarle el nombre.
- **Las piezas ocultas no se pierden:** siguen en la lista, se pueden nombrar y se confirman igual. «Mostrar frente» las vuelve a dibujar.
- **Marcar el frente:** al activar «Marcar frente en el dibujo», el frente vuelve a mostrarse solo, porque hace falta tocar una cara exterior. Mientras tanto, «Ocultar frente» queda deshabilitado.
- **Sin puertas ni frentes de cajón:** el botón queda deshabilitado y explica por qué.
- **Alcance:** sólo cambia el dibujo de ese diálogo. No modifica el modelo ni la guía.

Archivos tocados:
- `sketchup_offline/ui/NameSuggestions.tsx`
- `sketchup_offline/ui/name-batch-preview.css`
- `sketchup_offline/test/iguales_bridge_driver_fixture.rb`: tablero sintético compartido entre drivers de prueba
- `sketchup_offline/test/frente_bridge_driver.rb`: placard sintético con puertas
- `tests/offline/nombres-frente.spec.ts`

## Prueba nueva

La prueba recorre este flujo:
1. Oculta las 2 puertas (de 8 piezas dibujadas quedan 6).
2. Toca un estante y llega a su fila.
3. Pasa axe.
4. Marcar el frente vuelve a mostrar las puertas y deshabilita el botón.
5. Las puertas, con su fila tildada, reciben el nombre aunque estén ocultas.

La prueba falla con el `NameSuggestions.tsx` de 0.8.27 y pasa con el cambio.
