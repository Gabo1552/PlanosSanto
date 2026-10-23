# Progreso 0.8.21

- **Ciclo 1 — Reproducción:** revisión de 0.8.20 (`6ac2cb1`), cuatro fallos confirmados con datos sintéticos. La nueva prueba PDF/TXT falló antes del cambio: zócalo con código 1 en referencias y 2 en TXT.
- **Ciclo 2 — Implementación:** comparación compartida de listas v4; plano frontal de candidatos; contrato común de códigos de canto por placa; revalidación del giro en Ruby e interfaz. Pruebas focalizadas agregadas por cada caso.
- **Ciclo 3 — Revisión y regresión:** revisión independiente de Ruby/seguridad y escena; resultados finales en `RESULTADOS.json`. Limitación preexistente de herrajes planos registrada, sin atribuirle aprobación a la corrección de tapas.
- **Ciclo 4 — Entrega:** RBZ 0.8.21 y paquete para validación local, con hashes, instrucciones y resultados automatizados. La validación Windows/SketchUp y comercial queda pendiente.

## Archivos del cambio

- Biblioteca: `sketchup_offline/catalog_store.rb`, `material_library.rb`; pruebas `catalog_espesores_test.rb` y `material_package_test.rb`.
- Pedidos y guía: `supplier_order.rb`, `order_references.rb`, `workshop.rb`, `offline.rb`, `ui/WorkshopPanel.tsx`, `ui/pdf.ts`; pruebas `maderera_placas_test.rb`, `order_pdf_fixture.rb`, `tests/pdf-txt-edge-contract.test.ts`, `tests/offline/maderera-placas.spec.ts`.
- Interior: `lib/scene.ts` y `tests/front-autohide.test.ts`.
- Versión y entrega: `sketchup_offline/version.json`, `lib/model.ts`, verificador nativo y su prueba, README principal y de dist, `docs/validacion-0821/`, candidata y ZIP de validación.

La revisión detectó un caso adicional de SKU de placa repetido; quedó corregido y cubierto por una tercera prueba cruzada. Los perfiles y borradores heredados se conservan; las referencias de la guía ahora siguen el mismo pedido sin perfil de la pantalla Maderera actual.
