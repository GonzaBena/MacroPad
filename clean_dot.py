import os

def eliminar_archivos_mac_metadata(directorio_raiz="."):
    """
    Elimina de forma recursiva los archivos que comienzan con '._'
    dentro del directorio especificado.
    """
    eliminados = 0
    errores = 0

    print(f"Iniciando limpieza en: {os.path.abspath(directorio_raiz)}\n")

    for ruta_actual, carpetas, archivos in os.walk(directorio_raiz):
        for archivo in archivos:
            if archivo.startswith("._"):
                ruta_completa = os.path.join(ruta_actual, archivo)
                try:
                    os.remove(ruta_completa)
                    print(f"[ELIMINADO] {ruta_completa}")
                    eliminados += 1
                except Exception as e:
                    print(f"[ERROR] No se pudo eliminar {ruta_completa}: {e}")
                    errores += 1

    print(f"\n--- Resumen ---")
    print(f"Archivos eliminados: {eliminados}")
    print(f"Errores encontrados: {errores}")

if __name__ == "__main__":
    # Confirmación de seguridad
    confirmacion = input("¿Estás seguro de que quieres eliminar todos los archivos '._' recursivamente? (s/n): ")
    if confirmacion.lower() == 's':
        eliminar_archivos_mac_metadata()
    else:
        print("Operación cancelada.")