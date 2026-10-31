# Comprobación local de 0.8.27

1. Instalá `dist/PlanosSanto-0.8.27-candidata.rbz` y reiniciá SketchUp.
2. Respaldá `%LOCALAPPDATA%\PlanosSanto\` y trabajá sobre copias.

Los pasos de 0.8.26 siguen vigentes (`docs/validacion-0826/VALIDACION_LOCAL.md` y `SKETCHUP_2022.md`). Se agregan:

1. En Muebles, generá las guías **sin guardar**. Entrá a Maderera:
   - las placas se optimizan sin el mensaje «Guardá los cambios de la guía…»;
   - aparece el aviso de cambios sin guardar.
2. Exportá el TXT de una placa:
   - el mensaje final avisa que los nombres y códigos son los de la última guía guardada;
   - el archivo abre y lo acepta la maderera.
3. Cambiá un nombre en Muebles sin guardar y volvé a exportar. El TXT conserva el nombre guardado. Guardá la guía y exportá otra vez: ahora aparece el nombre nuevo.
