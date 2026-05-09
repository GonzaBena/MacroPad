# Guía de Creación de Temas para PokePad

¡Bienvenido! Crear un tema para PokePad es muy sencillo. Solo necesitas crear un archivo `.json` en esta carpeta.

## Pasos para crear tu tema:
1. Copia el archivo `template-example.json` que se encuentra en la carpeta de instalación de la app (o usa el código de ejemplo de abajo).
2. Pégalo en esta carpeta con un nombre nuevo (ej: `mi-tema.json`).
3. Modifica los campos `id`, `name` y los colores a tu gusto.
4. Reinicia PokePad o abre la ventana de configuración para ver tu nuevo tema.

## Estructura del archivo JSON:
- `id`: Un identificador único (sin espacios ni caracteres especiales).
- `name`: El nombre que aparecerá en el selector de temas.
- `type`: Puede ser `dark` o `light`.
- `colors`: Un objeto que contiene las variables CSS que definen el aspecto de la app.

### Variables de Color principales:
- `--bg`: Color de fondo principal.
- `--surface`: Color de tarjetas y paneles.
- `--text`: Color del texto principal.
- `--amber`: Color de acento (usado en botones y estados activos).
- `--border`: Color de los bordes sutiles.

¡Diviértete personalizando tu PokePad!
