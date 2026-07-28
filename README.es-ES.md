# smithue-cli

Interfaz de línea de comandos sin estado para el plugin de Unreal Engine SmithUE.

## Para Agentes de IA

### Despliegue Rápido
- **Windows**: `npm install -g smithue-cli`
- **macOS**: `npm install -g smithue-cli`
- **Linux**: `npm install -g smithue-cli`

*Nota: El servidor del plugin v1 es exclusivo para Windows. El paquete npm de la CLI se instala en cualquier sistema operativo, pero requiere una máquina Windows ejecutando el editor de UE.*

### Verificación de Prerrequisitos
Asegúrese de tener instalado Node.js 18+. Ejecute `node -v` para verificarlo.

### Verificación
Ejecute este comando para comprobar si la CLI puede encontrar su proyecto de Unreal Engine en ejecución:
```powershell
smithue-cli status
```

### Árbol de Fallos (si algo sale mal)
1. **Editor no se está ejecutando**: Inicie Unreal Engine y verifique que el plugin SmithUE esté activo.
2. **Múltiples instancias**: Si tiene dos editores abiertos, la CLI necesita ayuda. Use `smithue-cli status` para ver los PIDs, luego pase `--pid <número>` a su comando.
3. **Archivo de puerto obsoleto**: Si el editor se bloqueó, es posible que quede un archivo `.port` en `%LOCALAPPDATA%\.smithue\`. Ejecute `smithue-cli prune` para limpiar los archivos muertos.
4. **Conexión rechazada**: Verifique si su firewall bloquea el tráfico de puertos locales. SmithUE solo escucha en 127.0.0.1.

## Instalación
Instalación estándar vía npm:
```bash
npm install -g smithue-cli
```
O ejecute directamente sin instalar:
```bash
npx smithue-cli <command>
```

## Subcomandos

| Comando | Descripción |
|---|---|
| `exec` | Ejecuta un comando remoto en UE |
| `list` | Lista dominios u objetos disponibles |
| `search` | Busca assets u objetos mediante una cadena de texto |
| `status` | Muestra las instancias de UE en ejecución y sus puertos |
| `batch` | Ejecuta múltiples comandos de solo lectura secuencialmente |
| `upgrade` | Actualiza la CLI a la última versión vía npm |
| `prune` | Elimina archivos de puerto obsoletos de instancias bloqueadas |
| `purge` | Elimina todo el directorio `.smithue` (limpieza total de desinstalación) |
| `use` | Fija (o desfija) una instancia de SmithUE predeterminada para configuraciones de múltiples editores |
| `skill` | Imprime o instala el archivo SKILL.md adjunto para la integración de agentes de IA |

## Modos de Salida

Por defecto, `smithue-cli` devuelve JSON con formato legible (sangría de 2 espacios).

- `--terse` — JSON minificado (sin espacios). Recomendado para agentes de IA para ahorrar tokens.
- `--out <file>` — Escribe el resultado en un archivo; la salida estándar (stdout) permanece silenciosa. Útil para respuestas grandes.
- Combinado: `smithue-cli status --terse --out result.json`

## Modo Batch

Ejecute múltiples comandos de solo lectura en una sola llamada:

```bash
smithue-cli batch "status" "list"
```

Devuelve un array JSON: `[{command, ok, data?, error?}, ...]`

Comandos soportados: `status`, `list`, `search`. Solo ejecución secuencial.

## Actualización

```bash
smithue-cli upgrade
```

Actualiza `smithue-cli` a la última versión vía npm. Se imprimirá una advertencia en stderr si la versión de la CLI no coincide con la versión del plugin.

## Integración de Agentes de IA

Banderas recomendadas para el uso de agentes de IA:

```bash
# La salida minificada ahorra tokens
smithue-cli status --terse

# Escribe respuestas grandes en un archivo para mantener el contexto limpio
smithue-cli list --out tools.json

# Múltiples consultas en una sola llamada
smithue-cli batch "status" "list" --terse
```

## Ejemplos
Listar todos los assets de Material:
```bash
smithue-cli list Material
```

Buscar blueprints:
```bash
smithue-cli search blueprint
```

Ejecutar una acción personalizada:
```bash
smithue-cli exec my_action '{"key": "value"}'
```

### Paso de parámetros seguro para el shell (recomendado para JSON complejo)

Las cadenas JSON posicionales pueden ser alteradas por algunos shells, notablemente **Windows PowerShell 5.1**, que elimina comillas o divide por espacios. Use `--stdin` o `--params-file` para un paso de parámetros agnóstico al shell y a la versión de PowerShell:

```powershell
# --stdin: redirige JSON desde un archivo (seguro en todos los shells y versiones de PowerShell)
Get-Content params.json -Raw | smithue-cli exec my_action --stdin

# Abreviatura: pase "-" como argumento de params (equivalente a --stdin)
Get-Content params.json -Raw | smithue-cli exec my_action -

# --params-file: lee los parámetros directamente desde un archivo
smithue-cli exec my_action --params-file params.json
```

Los tres modos de entrada son **mutuamente excluyentes**: proporcionar más de uno a la vez provocará un error (exit 1). Una fuente explícita con contenido vacío también es un error. Omitir los parámetros por completo aplica `{}` por defecto.

## Notas de Seguridad
- Se vincula únicamente a 127.0.0.1. Sin exposición a redes externas.
- Los archivos de puerto en `%LOCALAPPDATA%\.smithue` están restringidos por ACL al usuario actual de Windows.

## Desinstalación

Use `purge` para limpiar completamente después de eliminar SmithUE. A diferencia de `prune` (que elimina archivos de puerto obsoletos durante el uso normal), `purge` elimina todo el directorio `%LOCALAPPDATA%\.smithue\` como paso final de la desinstalación de la CLI.

```bash
smithue-cli purge          # interactivo: lista los archivos y pide confirmación
smithue-cli purge --dry-run  # vista previa de lo que sería eliminado
smithue-cli purge -y       # purga total no interactiva (CI/scripts)
```

### Opciones

| Bandera | Descripción |
|---|---|
| `--force` | Omite la verificación de actividad; elimina todos los archivos, incluidos los que no son portfiles |
| `--dry-run` | Muestra qué se eliminaría sin realizar cambios |
| `-y, --yes` | Omite la solicitud de confirmación (requerido cuando stdin no es un TTY) |

### Códigos de salida

| Código | Significado |
|---|---|
| 0 | Éxito (incluyendo cancelaciones y dry-run) |
| 1 | Contexto no interactivo sin `-y` |
| 2 | `LOCALAPPDATA` no configurado (comando exclusivo de Windows) |
| 3 | `.smithue` es un enlace simbólico o junction — rechazado por seguridad |

Para la limpieza rutinaria de portfiles obsoletos sin eliminar el directorio, use `smithue-cli prune` en su lugar.

## Códigos de Salida

| Código | Significado | Causa común |
|---|---|---|
| `0` | Éxito | El comando se completó normalmente |
| `1` | Entrada incorrecta o se requiere desambiguación | Argumentos inválidos; múltiples instancias ejecutándose sin `--pid`/`--project`; `PAYLOAD_TOO_LARGE` |
| `2` | No encontrado o inalcanzable | No se encontraron portfiles; instancia inalcanzable; PID/proyecto no coinciden |
| `3` | Error de comando | `PIE_LOCKED`, `ASSET_NOT_FOUND`, `INVALID_REQUEST`, o error desconocido del plugin |
| `4` | Interno / editor no listo | `INTERNAL_ERROR`, `EDITOR_NOT_READY`, excepción inesperada |
| `5` | NID de sesión obsoleto | `STALE_NID` — el ID del nodo está desactualizado, vuelva a ejecutar el comando |
| `6` | Tiempo de espera agotado | Se excedió `--wait` sin que el editor estuviera listo |

Los scripts pueden ramificarse según los códigos de salida:
```powershell
smithue-cli status
if ($LASTEXITCODE -eq 2) { Write-Host "El editor no se está ejecutando" }
if ($LASTEXITCODE -eq 5) { Write-Host "Reconectando (NID obsoleto)..." }
```

## Limitaciones Conocidas
- La Versión 1 es exclusiva de Windows debido a las convenciones de ruta de los portfiles.
- No hay archivos de configuración persistentes. Use variables de entorno como `SMITHUE_PORT` o `SMITHUE_PID` para anulaciones.

## Mantenedores

La publicación de este paquete (git + npm) sigue un manual de ejecución fijo; consulte **[`docs/RELEASE.md`](docs/RELEASE.md)** (detalles del registro, incremento de versión, commit seguro para CJK, lista blanca de `files`, despliegue de skills). El plugin SmithUE (repositorio separado, versión independiente) tiene su propia especificación de lanzamiento en `docs/spec/RELEASE.md` del plugin.
