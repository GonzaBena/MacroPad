# Guía de Contribución a PokePad 🤝

¡Gracias por tu interés en ayudar a mejorar PokePad! Este es un proyecto creado por programadores para programadores, y tu ayuda es bienvenida.

---

## 🚀 Cómo empezar

1. **Haz un Fork** del repositorio.
2. **Clona** tu fork localmente:
   ```bash
   git clone https://github.com/TU_USUARIO/MacroPad.git
   ```
3. **Instala las dependencias**:
   ```bash
   npm install
   ```
4. **Crea una rama** para tu mejora o corrección:
   ```bash
   git checkout -b feat/mi-nueva-funcionalidad
   ```

---

## 🛠️ Reglas de Oro

### 1. No rompas los Tests
Antes de enviar cualquier cambio, asegúrate de que todas las pruebas pasen:
```bash
npm test
```
Si añades una nueva funcionalidad, **debes añadir un test** que verifique que funciona correctamente en la carpeta `test/`.

### 2. Estilo de Código
- Usamos **TypeScript** para todo el código nuevo.
- Mantén el código limpio y bien comentado (usa JSDoc para funciones públicas).
- Respeta las variables de CSS y el sistema de temas. No uses colores "hardcoded".

### 3. Commits Atómicos
Intenta que cada commit haga una sola cosa. Preferimos mensajes de commit descriptivos siguiendo la convención de [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` para nuevas funcionalidades.
- `fix:` para corrección de errores.
- `docs:` para cambios en documentación.
- `refactor:` para cambios en el código que no afectan la funcionalidad.

---

## 📬 Enviando tu Pull Request

1. Asegúrate de que tu rama esté actualizada con `master`.
2. Haz push de tus cambios a tu fork.
3. Abre un **Pull Request** (PR) en el repositorio principal.
4. Describe claramente qué hace tu PR y por qué es necesario. Si soluciona un Issue, menciónalo (ej: `Closes #123`).

---

## 📝 Reportando Bugs o Sugerencias

Si encuentras un error o tienes una idea genial pero no sabes cómo programarla:
- Abre un **Issue** en GitHub.
- Sé lo más detallado posible: pasos para reproducir el error, capturas de pantalla, sistema operativo, etc.

---

## ⚖️ Código de Conducta

Sé respetuoso con los demás colaboradores. Estamos aquí para aprender y construir algo útil juntos.
