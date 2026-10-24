# Ensayos discriminantes · SOLO PRUEBA, no confirmar compra

Tres TXT sintéticos de nueve columnas, TAB, UTF-8 y CRLF. No contienen datos del cliente ni código de producto. El portal determina placa, espesor y veta al importar. Usar un pedido separado para cada ensayo; no agregar piezas ni descontar canto.

| Archivo | Formato bruto | Giro | Resultado local actual | Distribución válida demostrada |
|---|---|---|---:|---:|
| A-giro-2750x1830.txt |2750×1830,18mm|Sin veta, rota1|2 placas|1 placa al evaluar giro aunque ambas orientaciones entren|
| B-horizontal-2750x1830.txt |2750×1830,18mm|rota0|2 placas|1 placa con cortes horizontales|
| C-vertical-2600x1830.txt |2600×1830,18mm|rota0|2 placas|1 placa con un corte vertical inicial|

En todos: sierra4,4mm, refilado10mm TOTAL por eje, sin cantos. A debe usar una placa lisa/sin veta que permita giro. B y C mantienen las orientaciones del TXT; no normalizar base/altura intercambiándolas.

La columna «distribución válida» está comprobada geométricamente por el laboratorio local, **no ejecutada en el portal de Experto**. No predice obligatoriamente su respuesta.

1. Importar cada TXT por separado en el portal, elegir el formato exacto y confirmar que aparecen todas las piezas/cantidades.
2. Ejecutar optimización sin confirmar pedido/comprar.
3. Guardar JSON y PDF del resultado. Conservar parámetros de sierra/refilado/giro y cualquier aviso.
4. Devolver esos seis archivos para comparar direcciones, orientaciones y aprovechamiento.

Interpretación: A aísla la elección de giro; B el aprovechamiento de una franja inferior común; C la conservación de una columna lateral alta. Si Experto resuelve B y C en una placa, una regla fija «siempre horizontal» o «siempre vertical» queda descartada. Si resuelve A en una, debe evaluar una orientación alternativa antes de comprometer la primera pieza.

Validación local del formato: `python3 scripts/validar_txt_maderera.py archivo.txt`, aprobada para los tres. Esto no es aceptación de importación comercial.
