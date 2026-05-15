# SP1NG 🌀

Plugin de juego para PokePad inspirado en SP!NG (SMG Studio).

## Mecánica

- **Mantener presionado** → la pelota orbita alrededor del nodo más cercano
- **Soltar** → se lanza con el momentum acumulado
- **Objetivo** → alcanzar el nodo ★ verde
- **Cuidado** → los nodos ✕ rojos te eliminan

## Niveles

| # | Descripción |
|---|---|
| 1 | Tutorial — 3 nodos en línea |
| 2 | Zigzag — cambiá de altura entre nodos |
| 3 | Obstáculo — evitá el nodo central |
| 4 | Espiral — 6 nodos encadenados |
| 5 | Laberinto — navegá entre kills |

## Instalación

Comprime la carpeta `sp1ng-plugin/` en un `.zip` e instalá desde la sección
**Plugins → Instalar Local (.zip)** en PokePad.

## Personalización

El juego usa automáticamente las variables CSS de PokePad (`--bg`, `--surface`, `--accent`, etc.).
Para agregar más niveles, editá el array `LEVEL_DEFS` en `ui/index.html`.

## Autor

Atlas
