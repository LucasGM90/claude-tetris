---
name: clima
description: Consulta el clima actual y el pronóstico de una ciudad usando wttr.in. Usar cuando el usuario pida el clima, la temperatura o el pronóstico de una ciudad (/clima <ciudad>).
argument-hint: <ciudad>
allowed-tools: Bash(curl:*), PowerShell(curl.exe:*)
---

# Clima

Consulta el clima de la ciudad indicada en `$ARGUMENTS` usando wttr.in (gratis, sin API key).

## Pasos

1. Si `$ARGUMENTS` está vacío, pedile al usuario la ciudad (ej. `/clima Buenos Aires`) y **no hagas ninguna llamada de red**.
2. Codificá la ciudad para URL: espacios → `+` (ej. `Buenos+Aires`).
3. Ejecutá:

       curl -s "https://wttr.in/<ciudad>?format=j1&lang=es"

   En Windows con PowerShell usá `curl.exe` (no el alias `curl`).
4. Del JSON extraé:
   - `nearest_area[0]`: ciudad y país resueltos (`areaName[0].value`, `country[0].value`).
   - `current_condition[0]`: `temp_C`, `FeelsLikeC`, `humidity`, `windspeedKmph`, y `lang_es[0].value` como descripción.
   - `weather[0..2]`: `date`, `maxtempC`, `mintempC` y la condición de mediodía (`hourly[4].lang_es[0].value`).
5. Respondé en español, breve:
   - Ubicación resuelta.
   - Ahora: temperatura, sensación térmica, descripción, humedad y viento.
   - Tabla con el pronóstico de 3 días (fecha, mínima, máxima, condición).

## Errores

- Si `curl` falla, no devuelve JSON válido o responde "Unknown location", avisá que no se pudo obtener el clima y sugerí revisar el nombre de la ciudad.
