# Comprobación local de 0.8.26

Instalar `dist/PlanosSanto-0.8.26-candidata.rbz` desde el Gestor de extensiones y reiniciar SketchUp por completo. Antes, respaldar `%LOCALAPPDATA%\PlanosSanto\` y trabajar sobre **copias** de modelos y biblioteca. Si algo falla, conservar el modelo y la consola Ruby, y volver a instalar 0.8.25.

Registrar en cada paso: versión de SketchUp, escala de pantalla y resultado (PASS / FAIL / PENDIENTE). En Opciones → Ayuda → Ver diagnóstico se ven `sketchupVersion`, `rubyVersion`, `cefVersion` y `chromeVersion`.

## SketchUp 2026 (prioridad)

1. **Carga.** La extensión carga sin errores en la consola Ruby y la cabecera muestra v0.8.26. En 0.8.25 con el WIP, la extensión no cargaba.
2. **Dibujar pieza**
   1. Sobre el suelo: esquina, rectángulo y espesor. Queda un componente seleccionado, en el lugar del clic y con las medidas correctas.
   2. Sobre una cara vertical de un mueble.
   3. Con las flechas para fijar el plano.
   4. Escribiendo `600;400;18` y también `60cm;40cm`, y luego un espesor.
   5. **Dentro de un grupo abierto, rotado y desplazado:** la pieza tiene que quedar donde se hizo clic. Si queda corrida, anotarlo; el arreglo está identificado (una línea en `create!`).
   6. Esc en cada paso no deja nada creado, y un solo Ctrl+Z quita la pieza.
   7. El análisis de Muebles reconoce la pieza nueva.
3. **Vetas**
   1. Con una placa con veta en una puerta, un lateral, un estante y un fondo, Piezas muestra ↕ o ↔ según el criterio, y la textura visible sigue la veta.
   2. «Girar veta 90°» rota la textura y cambia el largo en Piezas, y en Maderera cambia la optimización y el TXT. Un solo Ctrl+Z vuelve todo atrás.
   3. «Veta automática» vuelve al criterio.
   4. Probar con una instancia compartida en dos muebles: sólo cambia la elegida. También con una cara sin material propio (que hereda del grupo): debe avisar que pintó caras.
   5. Probar con un frente de cajón: queda vertical y marcado para revisar. **Anotar si el taller lo quiere horizontal.**
   6. Exportar el TXT y comprobar que la base es el largo a lo largo de la veta.
   7. Probar con una textura SKM de terceros y comprobar si la fibra queda en la dirección correcta: el sistema supone que la U de la textura es la fibra.
4. **Cabecera**
   1. Una sola fila a pantalla completa.
   2. Guardar guía muestra «sin guardar», «guardado» o «falta SKP».
   3. Con un bloqueo, el motivo se ve en el recuadro del proyecto.
   4. «⋯ Opciones» abre las opciones de guardado, Plegar, el último aviso y la ayuda. Escape lo cierra.
   5. Ctrl+S, Ctrl+Shift+E, Alt+1 a Alt+5 y «?» siguen funcionando.
   6. Repetir con la ventana angosta.
5. **Nombres**
   1. En Sugerencias, «Agrupar piezas iguales» junta piezas iguales de componentes distintos con «×N», y el nombre se aplica a todas.
   2. Un Lateral y un Divisor iguales quedan separados.
   3. Editar un nombre, desagrupar y volver a agrupar conserva la edición.
   4. Guardar y comprobar los nombres en el Esquema de SketchUp. Un solo Ctrl+Z deshace.
6. **Regresión:** pintar placa y canto, Experto y General en Maderera, A4 con una y dos vistas, y Materiales (fichas y herrajes). Todo debe comportarse como en 0.8.25.

## SketchUp 2022 (preparado, no probado)

Seguir las pruebas **M1–M15** de `SKETCHUP_2022.md`. Lo primero es confirmar en el diagnóstico `rubyVersion` 2.7.2 y `chromeVersion` 88.x, y que la interfaz responde: en 0.8.25, cada pedido fallaba en Chromium 88. Hasta que esas pruebas pasen, la compatibilidad con 2022 **no está probada**.
