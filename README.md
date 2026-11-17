---
title: "CETINVICTUS: Manual de usuario"
subtitle: "Monitor de calidad de agua con ESP32, MQTT y panel web"
lang: es
---

# 1. Introducción

CETINVICTUS mide la calidad del agua y las condiciones del ambiente con un **nodo sensor** (ESP32 WROOM), envía los datos por **ESP-NOW** a un **gateway** (ESP32-S3) y este los publica por **MQTT**. Un backend los guarda en TimescaleDB y un panel web los muestra en tiempo real, con alertas, reportes de servicio y descarga de reportes en PDF.

Este manual cubre la instalación, la configuración, el uso diario y la ampliación del sistema.

## 1.1 Arquitectura

```
Sensores ──► Nodo WROOM (esp32_node_08)
                │  ESP-NOW (tramas binarias, máx. 250 bytes)
                ▼
          Gateway ESP32-S3 (esp32s3_gw_01) ── pantalla OLED
                │  WiFi + MQTT (JSON)
                ▼
          Broker Mosquitto ──► Backend (Node.js) ──► TimescaleDB
                                     │ SSE / API REST
                                     ▼
                              Frontend (nginx, puerto 8080)
```

| Componente | Función |
|---|---|
| Nodo WROOM | Lee los sensores y manda una trama cada 2 s (o al instante si hay un cambio importante). |
| Gateway S3 | Recibe las tramas, las convierte a JSON, las publica en MQTT y muestra el estado en la OLED. |
| Mosquitto | Broker MQTT (puerto 1883). |
| Backend | Se suscribe al broker, guarda lecturas, calcula alertas y expone la API. |
| TimescaleDB | Base de datos de series de tiempo (PostgreSQL 16). |
| Frontend | Panel web servido por nginx (puerto 8080). |

## 1.2 Estructura del repositorio de firmware

```
firmware/
├── components/              # drivers y librerías compartidas (ambos chips)
│   ├── adc_input/           # ADC1 compartido con calibración
│   ├── button/  led/  fc51/
│   ├── ds18b20/  dht11/
│   ├── tsw20/  tds/  ph4502c/  mq135/  yfs201/
│   └── proto/               # protocolo de tramas + tabla de métricas (metrics.h)
├── wroom/                   # proyecto del nodo sensor (ESP32)
│   └── main/  board.h  config.h  main.c  sensors.c  tx.c
└── s3/                      # proyecto del gateway (ESP32-S3)
    └── main/  board.h  gw_config.h  secrets.h  main.c  net.c  link.c
               nodes.c  telemetry.c  ui.c  display.c  maint.c
```

Regla de diseño: **los pines viven solo en `board.h`**, y los drivers no saben nada de MQTT, tramas ni JSON.

# 2. Requisitos

## 2.1 Para el firmware

- ESP-IDF **v5.1.2** instalado (`~/esp/esp-idf`).
- Cable USB de datos para cada placa.
- Linux (Fedora en el equipo del proyecto). Agrega tu usuario al grupo del puerto serie y vuelve a iniciar sesión:

```bash
sudo usermod -aG dialout $USER
```

## 2.2 Para la web

- Podman con `podman-compose` (o Docker con Compose).
- Node.js 20 solo si vas a ejecutar scripts del backend desde tu equipo.

# 3. Hardware

## 3.1 Pines del nodo WROOM (`wroom/main/board.h`)

| Señal | GPIO | Sensor / dispositivo |
|---|---|---|
| `LED_PIN` | 2 | LED de estado (con resistencia de 220 a 330 Ω) |
| `PROX_PIN` | 4 | FC-51 (nivel / presencia de agua) |
| `TEMP_PIN` | 17 | DS18B20 (temperatura del agua) |
| `HUM_TEMP_PIN` | 25 | DHT11 (temperatura y humedad del aire) |
| `FLOW_PIN` | 27 | YF-S201 (caudal) |
| `COND_PIN` | 32 | TDS Meter V1.0 (conductividad) |
| `TURB_PIN` | 33 | TSW-20 (turbidez) |
| `PH_PIN` | 34 | PH-4502C (pH) |
| `GAS_PIN` | 36 | MQ135 (calidad del aire) |

Los pines 32, 33, 34 y 36 pertenecen al **ADC1**, que funciona junto con WiFi y ESP-NOW. No uses pines de ADC2 para sensores analógicos.

## 3.2 Alimentación

Con una fuente externa de 5 V para los módulos más exigentes, el ESP32 no se carga y la línea no cae.

| Módulo | Alimentación | Observaciones |
|---|---|---|
| MQ135 | **5 V externa** | Consume ~150 mA por el calefactor. |
| TSW-20 (turbidez) | **5 V externa** | Salida hasta ~4.5 V: divisor obligatorio. |
| PH-4502C | **5 V externa** | Salida `Po` hasta ~5 V: divisor obligatorio. `Do` y `To` quedan sin conectar. |
| YF-S201 (caudal) | **5 V externa** | Divisor solo si la señal en reposo mide ~5 V. |
| TDS (Gravity) | 3.3 V o 5 V | Salida máxima 2.3 V, sin divisor. |
| FC-51 | **3.3 V** | A 5 V su salida excedería lo que tolera el GPIO. |
| DHT11 | **3.3 V** (ver §11) | Pull-up de 4.7 kΩ si es el sensor suelto de 4 pines. |
| DS18B20 | **3.3 V** | **Pull-up externo de 4.7 kΩ entre DATA y 3.3 V.** |

### Reglas de oro

1. **GND común** entre la fuente externa y el ESP32. Sin esto, las lecturas del ADC salen erráticas.
2. **No conectes los 5 V externos al pin VIN del ESP32 mientras esté conectado por USB.**
3. Fuente regulada de 5 V y al menos 1 a 2 A.
4. Si tienes condensadores, pon uno de 100 a 470 µF y otro de 100 nF en la línea de 5 V.
5. Mide la tensión real de la línea de 5 V y ponla en `GAS_VCC` (`sensors.c`).
6. Verifica con multímetro que ningún pin de entrada del ESP32 supere ~3.3 V (los analógicos, idealmente menos de 2.5 V).
7. En protoboards largas, los rieles de alimentación a veces están **partidos por la mitad**.

## 3.3 Divisores de voltaje

Se usan en turbidez, pH y MQ135 (analógicos) y, si hace falta, en el flujo (digital).

**Analógicos (÷2).** Con dos resistencias de 4.7 kΩ (o 10 kΩ si las tienes):

```
Salida del módulo ─[4.7k]─┬─ GPIO
                          └─[4.7k]── GND
```

En el código, `divider = 0.5f`. Si cambias la razón del divisor, cambia ese valor en `sensors.c`.

| Combinación | Razón (`divider`) | 5 V pasa a |
|---|---|---|
| 4.7k + 4.7k (recomendada) | 0.5 | 2.5 V |
| 4.7k + 2×1k en serie | 0.3 | 1.5 V |
| 2×4.7k en serie + 4.7k | 0.333 | 1.67 V |

**Flujo (digital, solo si hace falta).** Con resistencias de 1 kΩ:

```
Señal ─[1k]─┬─ GPIO27
            └─[2×1k en serie = 2k]── GND      (≈ 3.3 V)
```

El condensador de 100 nF entre el GPIO y GND mejora la lectura pero es opcional: el firmware promedia 32 muestras.

## 3.4 Conexión del DS18B20 y del DHT11

```
3.3 V ──┬── VDD (DS18B20)
        └─[4.7k]─┬── DQ ── GPIO17
GND ───────────── GND
```

DS18B20 en encapsulado TO-92, con la cara plana hacia ti y las patas hacia abajo: **GND, DQ, VDD**. Si se calienta, está al revés: desconéctalo.

El módulo DHT11 de 3 pines (KY-015) ya trae el pull-up. **El orden de pines varía según el fabricante**, así que lee la serigrafía (`S`, `+`/`VCC`, `-`/`GND`).

# 4. Configuración antes de compilar

## 4.1 Gateway: `s3/main/secrets.h`

Este archivo contiene credenciales. **No debe subirse al repositorio.**

```c
#pragma once
#define WIFI_SSID "nombre_de_tu_red_2.4GHz"
#define WIFI_PASS "tu_contraseña"
#define MQTT_URI  "mqtt://192.168.x.x:1883"
```

- La red debe ser de **2.4 GHz**.
- `MQTT_URI` apunta a la IP del equipo que corre Mosquitto. Compruébala con `ip -4 addr show | grep 192.168`. Si el router le asigna otra IP, el gateway no conectará: **reserva la IP en el router**.
- Si ya hiciste commit con la contraseña, cámbiala: queda en el historial de git.

Recomendado:

```
# .gitignore
firmware/s3/main/secrets.h
```

```bash
git rm --cached firmware/s3/main/secrets.h     # si ya estaba versionado
```

Deja una plantilla `secrets.example.h` con valores falsos para el resto del equipo.

## 4.2 Gateway: `s3/main/gw_config.h`

```c
#define MQTT_ORG "hackathon"
#define MQTT_REGION "gdl"
#define MQTT_ZONE "planta_sur"
#define GW_DEVICE_ID "esp32s3_gw_01"
#define NODE_TIMEOUT_MS 7000      // un nodo sin tramas por este tiempo pasa a offline
#define GW_REPORT_MS 5000         // el gateway reporta su salud cada 5 s
```

`MQTT_ORG` debe coincidir con la variable `MQTT_ORG` del backend (`compose.yml`).

## 4.3 Gateway: `s3/main/board.h`

```c
#define BTN_PIN 0     // botón que cambia de página en la OLED (en muchas placas S3 es BOOT)
```

Ajústalo al pin real de tu placa.

## 4.4 Nodo: `wroom/main/config.h`

```c
#define ESPNOW_CHANNEL 5
#define S3_MAC_ADDR { 0x48, 0xCA, 0x43, 0x59, 0xA1, 0x44 }
#define NODE_ID 8              // esp32_node_08
#define REPORT_MS 2000         // trama completa cada 2 s
```

- **`S3_MAC_ADDR`** es la MAC del gateway. Al arrancar el S3 imprime `wifi:mode : sta (xx:xx:...)`. Ese valor va aquí.
- **`ESPNOW_CHANNEL`** debe ser el canal WiFi de tu router (el gateway lo imprime al conectar: `channel 5`). Si cambia, el nodo prueba otros canales por sí solo, pero tarda unos segundos en reencontrarse.
- **`NODE_ID`** debe ser único por nodo. Define el identificador MQTT `esp32_node_NN`.
- El gateway admite hasta 8 nodos (`MAX_NODES`).

## 4.5 Calibración en `sensors.c`

```c
#define PH_CAL_A_V 3.04f   // V en Po con buffer pH 4.00
#define PH_CAL_A_PH 4.00f
#define PH_CAL_B_V 2.50f   // V en Po con buffer pH 7.00
#define PH_CAL_B_PH 7.00f
#define PH_CAL_TEMP 25.f   // °C de los buffers al calibrar

#define GAS_VCC 5.0f       // tensión real medida en la línea de 5 V
#define GAS_RL_OHM 10000.f // resistencia de carga del módulo MQ135
#define GAS_R0_OHM 76630.f // resistencia en aire limpio (calibrar)
```

Los demás parámetros se pasan en `sensors_init()`: `tsw20_init(..., 0.5f, 4.1f)` (divisor y voltaje en agua limpia), `tds_init(..., 1.0f)` (factor `k`) y `yfs201_init(..., 450.f)` (pulsos por litro).

# 5. Compilar y flashear

## 5.1 Preparar el entorno

En cada terminal nueva:

```bash
. ~/esp/esp-idf/export.sh
```

## 5.2 Identificar los puertos

Conecta una placa a la vez y mira cuál aparece:

```bash
ls /dev/ttyUSB* /dev/ttyACM*
```

Normalmente el WROOM-32 aparece como `/dev/ttyUSB0` y el S3 como `/dev/ttyACM0`, pero confírmalo desconectando una placa.

## 5.3 Flashear el nodo (ESP32 WROOM)

```bash
cd firmware/wroom
idf.py set-target esp32          # solo la primera vez
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
```

## 5.4 Flashear el gateway (ESP32-S3)

```bash
cd firmware/s3
idf.py set-target esp32s3        # solo la primera vez
idf.py build
idf.py -p /dev/ttyACM0 flash monitor
```

Si el S3 no entra en modo de descarga, mantén pulsado **BOOT**, pulsa y suelta **RESET**, y suelta BOOT.

## 5.5 Notas

- Para salir del monitor: **Ctrl + ]**.
- Cada placa tiene su propio monitor. Los logs de `ds18b20` y `dht11` salen del **WROOM**; los de `net`, `link` y `telemetry`, del **S3**.
- Después de mover o renombrar componentes: `idf.py fullclean && idf.py build`. Si `fullclean` se niega, borra la carpeta `build/` manualmente.
- `sdkconfig` pertenece a cada proyecto. Si ves comportamientos raros de configuración, regenéralo con `idf.py set-target`.

## 5.6 Verificar que todo funciona

**Gateway (S3).** Debe mostrar, en este orden: `IP asignada`, `MQTT conectado` y `esp32_node_08 en línea`. El `heap libre` impreso cada 5 s debe mantenerse estable (~260 KB); si baja de forma continua hay una fuga.

**Nodo (WROOM).** Debe mostrar `iniciado en GPIO17` (ds18b20) y `iniciado en GPIO25` (dht11), y luego `temperatura: xx.xx C` cada segundo.

**Broker.** Desde el equipo que corre Mosquitto:

```bash
podman exec -it cetinvictus_mosquitto_1 mosquitto_sub -h localhost -t 'hackathon/#' -v
```

Debes ver mensajes `.../esp32_node_08/telemetry` cada ~2 s.

# 6. Interfaz de la pantalla OLED (gateway)

El botón del gateway cambia de página y la pantalla se refresca cada segundo.

- **Página 1 (estado):** ID del gateway, SSID, IP, canal y RSSI, estado de MQTT, nodos en línea y memoria libre.
- **Página 2 (nodos):** una línea por nodo con ID, `OK`/`OFF`, RSSI y segundos desde la última trama.

# 7. Datos y métricas

## 7.1 Tabla de métricas (`components/proto/include/metrics.h`)

| ID | Nombre JSON | Grupo | Decimales |
|---|---|---|---|
| 1 | `ph` | metrics | 2 |
| 2 | `turbidity_ntu` | metrics | 2 |
| 3 | `chlorine_mg_l` | metrics | 2 (sin sensor) |
| 4 | `flow_lpm` | metrics | 2 |
| 5 | `object_detected` | metrics | 0 |
| 6 | `water_temp_c` | metrics | 1 |
| 7 | `conductivity_tds` | metrics | 0 |
| 8 | `flow_total_l` | metrics | 3 |
| 9 | `air_temp_c` | metrics | 1 |
| 10 | `air_humidity_pct` | metrics | 0 |
| 11 | `gas_ppm_co2eq` | metrics | 0 |
| 20 | `ph_electrode_mv` | sensors_health | 1 |
| 21 | `ph_status` | sensors_health | estado |
| 22 | `turbidity_lens_cleanliness_pct` | sensors_health | 1 |
| 23 | `turbidity_status` | sensors_health | estado |
| 24 | `days_since_last_calibration` | sensors_health | 0 |
| 25 | `internal_temp_c` | sensors_health | 1 |
| 26 | `turbidity_voltage_mv` | sensors_health | 0 |
| 27 | `tds_voltage_mv` | sensors_health | 0 |
| 28 | `tds_status` | sensors_health | estado |
| 29 | `air_sensor_status` | sensors_health | estado |
| 30 | `gas_voltage_mv` | sensors_health | 0 |
| 31 | `gas_status` | sensors_health | estado |
| 40 | `battery_v` | diagnostics | 2 (simulado) |
| 41 | `free_heap_bytes` | diagnostics | 0 |
| 42 | `uptime_s` | diagnostics | 0 |
| 43 | `rssi_dbm` | diagnostics | 0 |
| 60 | `led` | metrics | 0 |

Los **estados** (`OK`, `WARNING`, `FAULT`) se envían como texto. `battery_v` es simulado y `chlorine_mg_l` no tiene sensor.

## 7.2 Formato JSON publicado

```json
{
  "ts": 1794621519,
  "via": "esp32s3_gw_01",
  "metrics": { "ph": 7.04, "turbidity_ntu": 1.2, "water_temp_c": 24.5 },
  "sensors_health": { "ph_electrode_mv": 2503.1, "ph_status": "OK" },
  "diagnostics": { "free_heap_bytes": 233020, "uptime_s": 820, "rssi_dbm": -27 }
}
```

Un campo con valor inválido (`NAN`) **no aparece** en el JSON: así el panel distingue "sin dato" de "cero".

## 7.3 Qué significa cada estado

| Estado | Significado |
|---|---|
| `OK` | Lectura válida y compensada. |
| `WARNING` | Lectura disponible pero dudosa: sin temperatura para compensar, fuera del rango fiable, calentamiento del MQ135 (3 min) o lente sucia. |
| `FAULT` | Sin lectura: sensor desconectado, en corto o fuera de rango eléctrico. |

Si falla el DS18B20, TDS y pH usan 25 °C y pasan a `WARNING`. Si falla el DHT11, el MQ135 hace lo mismo.

## 7.4 Protocolo ESP-NOW

- Encabezado de 5 bytes: `magic 0xA5`, versión, `node_id`, secuencia, número de entradas.
- Cada entrada: 5 bytes (ID de métrica + `float`). Caben hasta 49 por trama (límite de 250 bytes).
- Los comandos del gateway al nodo usan otro `magic` (`0xA6`), así que nunca se confunden con telemetría.

# 8. MQTT

## 8.1 Topics

Prefijo: `<MQTT_ORG>/<MQTT_REGION>/<MQTT_ZONE>/<dispositivo>/`, por ejemplo `hackathon/gdl/planta_sur/esp32_node_08/`.

| Topic (sufijo) | Dirección | Contenido |
|---|---|---|
| `telemetry` | gateway → broker | JSON de la sección 7.2 (retenido). |
| `status` | gateway → broker | `online` / `offline` (retenido; `offline` también es el Last Will). |
| `cmd/led` | backend → gateway | `1`/`0` o `on`/`off`. |
| `cmd/maintenance` | backend → gateway | `ph`, `turb`, `tds` o `gas`. |

## 8.2 Encender y apagar el LED de un nodo

El camino es: **web → backend → broker → gateway (MQTT) → nodo (ESP-NOW)**. Se manda el **estado absoluto** (no un "toggle") y la confirmación es la telemetría siguiente con `"led": 1`.

```bash
mosquitto_pub -h localhost -t hackathon/gdl/planta_sur/esp32_node_08/cmd/led -m 1
mosquitto_pub -h localhost -t hackathon/gdl/planta_sur/esp32_node_08/cmd/led -m 0
```

- **No uses retain** en los comandos: se reaplicarían en cada reconexión.
- Si el nodo está desconectado, el gateway descarta el comando y lo registra.
- El nodo solo obedece a la MAC del gateway y a su propio `NODE_ID`.

## 8.3 Registrar un mantenimiento

El WROOM no tiene reloj; el gateway guarda la fecha en NVS y calcula los días.

```bash
mosquitto_pub -h localhost -t hackathon/gdl/planta_sur/esp32_node_08/cmd/maintenance -m ph
```

Sin hora (SNTP aún no sincroniza) el comando se rechaza y el campo de días no aparece.

# 9. Panel web y backend

## 9.1 Variables de entorno (`.env`)

Crea un archivo `.env` junto a `compose.yml`:

```bash
DB_PASSWORD=una_clave_larga_y_unica        # obligatoria
JWT_SECRET=otra_clave_larga_y_aleatoria    # obligatoria
# Opcionales (valores por defecto):
# DB_USER=cetin
# DB_NAME=cetinvictus
# MQTT_ORG=hackathon
# COOKIE_SECURE=false                       # ponlo en true si usas HTTPS
```

Genera un secreto aleatorio con `openssl rand -hex 32`. **No subas `.env` al repositorio.**

## 9.2 Levantar los contenedores

Con **Podman**:

```bash
podman compose up -d --build
podman ps
```

Con **Docker**:

```bash
docker compose up -d --build
docker ps
```

Se levantan cuatro servicios: `mosquitto` (1883), `timescaledb` (5432, solo en 127.0.0.1), `backend` (3000, interno) y `frontend` (8080).

Comandos útiles (cambia `podman` por `docker` si corresponde):

```bash
podman compose logs -f backend          # ver logs del backend
podman logs -f cetinvictus_mosquitto_1  # ver conexiones al broker
podman compose restart mosquitto
podman compose down                     # detener (conserva los datos)
podman compose down -v                  # detener y BORRAR los datos
```

Tras cambiar código del frontend o del backend, reconstruye la imagen:

```bash
podman compose build frontend && podman compose up -d frontend
```

Luego recarga el navegador con **Ctrl + Shift + R**.

## 9.3 Acceder

Abre **http://localhost:8080** (mejor que `0.0.0.0:8080`, que da advertencias del navegador). Desde otro equipo de la red usa la IP del servidor.

## 9.4 Configuración del broker (`broker/mosquitto.conf`)

```
listener 1883 0.0.0.0
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
log_dest stdout
connection_messages true
log_type all
```

`allow_anonymous true` es cómodo para desarrollo. Para producción, activa usuario y contraseña y restringe con ACL los topics `cmd/#` a la cuenta del backend.

## 9.5 Firewall (Fedora)

`firewalld` bloquea el puerto 1883 desde la red aunque Podman lo publique. Sin esto el gateway no puede conectar:

```bash
sudo firewall-cmd --add-port=1883/tcp --permanent
sudo firewall-cmd --add-port=8080/tcp --permanent    # si otros equipos acceden al panel
sudo firewall-cmd --reload
```

## 9.6 Crear usuarios desde el backend (scripts)

El backend incluye scripts en `backend/scripts/` (`seed.ts` para datos y usuarios iniciales, `migrate-sqlite.ts` para migrar desde SQLite). La base de datos solo escucha en `127.0.0.1:5432`, así que los scripts se ejecutan **desde el equipo anfitrión**, con la base de datos arriba.

> **Verifica antes de usarlo.** Este manual se redactó sin ver el contenido de `seed.ts` ni los `scripts` de `backend/package.json`. Revisa el nombre exacto del script, qué usuarios crea y de dónde lee el usuario y la contraseña, y ajusta los comandos de abajo.

Forma habitual de ejecutarlo:

```bash
cd backend
npm ci
export DATABASE_URL="postgres://cetin:TU_DB_PASSWORD@127.0.0.1:5432/cetinvictus"
npx tsx scripts/seed.ts          # o el script definido en package.json: npm run seed
```

Para crear un usuario propio, edita en `seed.ts` el nombre, el rol y la contraseña, o añade un script nuevo que los reciba por variables de entorno. La contraseña debe guardarse **con hash** (por ejemplo bcrypt o argon2, según lo que use `routes/auth.ts`), nunca en texto plano.

Roles del panel:

| Rol | Puede |
|---|---|
| `admin` | Ver todo, gestionar usuarios, marcar o eliminar reportes, ver el panel de diagnóstico y controlar el LED. |
| `cliente` | Ver métricas y levantar reportes de servicio. |

Después de crear el primer administrador, el resto de usuarios se gestiona desde **Gestión de usuarios** en el panel.

## 9.7 Uso del panel

- **Selector de nodo y rango:** 1 h, 6 h, 24 h, 7 d o 30 d.
- **Tarjetas de sensores:** lectura actual y estado.
- **Gráficas:** nivel de agua, cumplimiento (% del tiempo en rango), tendencia de pH, turbidez y temperatura, estado de métricas (pastel), lectura vs. límite máximo, histograma y tabla de últimas lecturas.
- **Reporte PDF:** el botón descarga todo el área de gráficas.
- **Reportes de servicio:** los clientes levantan reportes y el administrador los marca como revisados o los elimina.
- **Panel de diagnóstico (admin):** telemetría de salud y registro de eventos.
- **Ajuste de sensores (admin):** interruptor del LED del nodo. Muestra "pendiente" hasta que la telemetría confirme el cambio.

El PDF usa `html2pdf` desde un CDN: sin internet, el botón no funciona.

# 10. Calibración de sensores

Todos los valores de catálogo son aproximados. **Calibra cada sensor.**

## 10.1 pH (PH-4502C)

1. Desconecta el electrodo y pon en corto el centro y la malla del BNC. Ajusta el trimmer hasta leer **2.50 V** en `Po` (antes del divisor).
2. Enjuaga el electrodo con agua destilada, sin frotar.
3. Sumérgelo en buffer **pH 7**, espera 1 a 2 minutos y anota `ph_electrode_mv` (÷1000) en `PH_CAL_B_V`.
4. Repite con buffer **pH 4** (o pH 10 para agua alcalina) en `PH_CAL_A_*`.
5. Anota la temperatura de los buffers en `PH_CAL_TEMP`.
6. Verifica con un tercer buffer: error menor a ±0.2 pH.

Recalibra cada 1 a 4 semanas. Mantén el electrodo húmedo (solución de almacenamiento). No detecta un electrodo desconectado: con el BNC al aire puede leer cualquier valor. No lo uses en el mismo recipiente que la sonda TDS.

## 10.2 Turbidez (TSW-20)

Mide `turbidity_voltage_mv` en agua limpia, divídelo entre 1000 y ponlo como último argumento de `tsw20_init` (`clear_v`). La curva a NTU es genérica; para valores confiables usa al menos dos patrones conocidos. El indicador de limpieza de lente es una heurística (máximo reciente con decaimiento lento).

## 10.3 Conductividad (TDS)

1. Sumerge la sonda a 25 °C en una solución patrón (por ejemplo 342 ppm / 707 µS/cm).
2. Anota la lectura con `k = 1.0`.
3. Calcula `k = ppm_real / ppm_medido` y ponlo en `tds_init`.

Rango fiable: 0 a 1000 ppm. Agua destilada: ~0 a 10 ppm. Una sonda en el aire también lee ~0.

## 10.4 Flujo (YF-S201)

Pasa exactamente 1 o 2 litros por el sensor, calcula `pulses_per_l = pulsos / litros` y ponlo en `yfs201_init` (nominal: 450). Rango útil: 1 a 30 L/min. El acumulado `flow_total_l` se reinicia con cada reinicio del nodo.

## 10.5 Gas (MQ135)

1. Sensor nuevo: enciéndelo 24 h seguidas antes de calibrar.
2. Con el sistema encendido al menos 20 minutos en un lugar **muy ventilado**, lee en el monitor el log `R0 estimado ... = N ohm`.
3. Cuando se estabilice, copia ese número en `GAS_R0_OHM`.
4. Pon `LOG_CALIBRATION` en 0 en `mq135.c` y recompila.
5. Verifica: en aire ventilado debe dar ~400 a 500 ppm.

Tras cada arranque, el ppm se oculta durante 3 minutos (calentamiento). Revisa el valor de `RL` de tu módulo (código SMD `102` = 1 kΩ, `103` = 10 kΩ) y ajusta `GAS_RL_OHM`. **`gas_ppm_co2eq` es un índice de tendencia, no una medida de CO2 real, y no sirve como detector de seguridad.**

## 10.6 Temperatura del agua (DS18B20) y aire (DHT11)

No requieren calibración. DS18B20: ±0.5 °C. DHT11: ±2 °C y ±5 % HR, rango 0 a 50 °C y 20 a 90 % HR (fuera de eso el estado pasa a `WARNING`).

# 11. Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| El gateway no conecta a MQTT | Firewall (§9.5), IP del servidor distinta a la de `MQTT_URI`, o broker caído. Revisa `podman logs cetinvictus_mosquitto_1`. |
| `Failed to resolve component 'esp_now'` | `esp_now` no es un componente en ESP-IDF 5.1: va dentro de `esp_wifi`. Quítalo de `REQUIRES`. |
| `include FreeRTOS.h must appear before task.h` | Incluye `freertos/FreeRTOS.h` antes de `freertos/task.h`. |
| Errores en cascada tipo `storage class specified for parameter` | Mira el **primer** error del log: el resto es ruido. |
| `Cannot find source file: ... y.c` | Texto suelto en el `SRCS` del `CMakeLists.txt`. |
| El gateway se queda sin memoria (`getaddrinfo() returns 203`, `wifi:m f null`) | Fuga de memoria: asegúrate de liberar el árbol cJSON (`cJSON_Delete`) y de crear la interfaz STA **una sola vez**. |
| `ds18b20: sin respuesta` | Falta el pull-up de 4.7 kΩ, mala alimentación, pin equivocado o riel de protoboard partido. Conéctalo directo al ESP32 para aislar. |
| `ds18b20: CRC inválido` | Ruido o pull-up débil. |
| `dht11: timeout` con la línea en alto | La línea de datos está bien. Falla el chip o su alimentación: prueba a 5 V con DATA por divisor (1k + 2k), otro GPIO u otro sensor. |
| `dht11: checksum inválido` | Ruido o pull-up débil. |
| `tds/ph/gas_status = WARNING` | Falta la temperatura (DS18B20 o DHT11 sin respuesta), o la lectura está fuera de rango. |
| pH cercano a 0 con ~3600 mV | Fuera de calibración, electrodo desconectado o divisor mal puesto. |
| Turbidez inestable | Revisa GND común, la alimentación de 5 V y el divisor. |
| El PDF falla con `drawImage ... width or height of 0` | Hay un `<canvas>` oculto de tamaño 0 dentro de `#area-reporte`. Elimínalo o muévelo fuera del área del reporte. |
| El PDF falla con `Unsupported image type` | Un `<select>` de Bootstrap con flecha SVG de fondo. Añade `data-html2canvas-ignore="true"` al `<select>` del reporte. |
| `Uncaught Error: No existe #...` | El HTML no tiene el elemento que busca el script, o el contenedor sirve un `dashboard.html` viejo. Reconstruye la imagen. |
| Advertencia de "conexión insegura" al descargar el PDF | Es un aviso del navegador por usar HTTP. Abre `http://localhost:8080` o sirve el panel con HTTPS. |
| El monitor serie no muestra los logs nuevos | Estás en el puerto de la otra placa, o no recompilaste y flasheaste. |

Para ver solo el primer error de una compilación:

```bash
idf.py build 2>&1 | grep -m1 -B3 -A8 "error"
```

# 12. Cómo agregar un nuevo sensor

El flujo es siempre el mismo y no requiere tocar el gateway, el backend de ingestión ni el protocolo:

```
driver (ESP-IDF) → metrics.h → sensors.c → SENSOR_TABLE → sensors_init()
```

## Paso 1: crear el driver como componente

Estructura en `firmware/components/<sensor>/`:

```
<sensor>/
├── CMakeLists.txt
├── include/<sensor>.h
└── <sensor>.c
```

Usa **ESP-IDF** (`driver/gpio.h`, `esp_adc`, `driver/pulse_cnt.h`...), no registros directos: es seguro y portable entre ESP32 y ESP32-S3.

```cmake
# CMakeLists.txt
idf_component_register(SRCS "<sensor>.c"
                       INCLUDE_DIRS "include"
                       REQUIRES adc_input            # solo si es analógico
                       PRIV_REQUIRES esp_timer)
```

Buenas prácticas del proyecto:

- El estado vive en un `struct` (`sensor_t`), no en variables globales.
- API mínima: `xxx_init(&s, pin, ...)`, `xxx_update(&s)` y `xxx_get(&s)`.
- El driver **no conoce** MQTT, tramas ni la tabla de métricas.
- Las lecturas inválidas devuelven `NAN`.
- Los pines se pasan por parámetro y se definen solo en `board.h`.
- Si el header público usa tipos de FreeRTOS, el `REQUIRES` debe incluir `freertos`.
- Para analógicos, usa `adc_input` (ADC1 compartido, con calibración) y un pin de ADC1.
- Incluye siempre `freertos/FreeRTOS.h` antes de `freertos/task.h`.

## Paso 2: agregar las métricas en `metrics.h`

Edita la macro `METRIC_TABLE` en `components/proto/include/metrics.h` con un **ID libre** (1 a 255, sin repetir):

```c
//  ID  enum               nombre JSON          grupo         tipo         decimales
  X(12, M_MI_SENSOR,      "mi_sensor",         GRP_METRICS,  KIND_NUM,    1) \
  X(32, M_MI_SENSOR_ST,   "mi_sensor_status",  GRP_HEALTH,   KIND_STATUS, 0) \
```

- Grupos: `GRP_METRICS` (medida principal), `GRP_HEALTH` (salud del sensor) y `GRP_DIAG` (diagnóstico del equipo).
- Tipos: `KIND_NUM` (número) y `KIND_STATUS` (texto `OK`/`WARNING`/`FAULT`).
- Los IDs libres actualmente: 12 a 19, 32 a 39, 44 a 59.

Con esto el gateway ya sabe convertir la métrica a JSON: `telemetry.c` usa la tabla.

## Paso 3: conectarlo en `sensors.c`

1. **Importa el driver** y declara la instancia:

```c
#include "mi_sensor.h"
static mi_sensor_t mi_sensor;
```

2. **Escribe las funciones de lectura** (una por métrica). La que mide va primero y las demás leen el resultado guardado:

```c
static float read_mi_sensor(void)    { mi_sensor_update(&mi_sensor); return mi_sensor_get(&mi_sensor).valor; }
static float read_mi_sensor_st(void) { return (float)from_mi_sensor(mi_sensor_get(&mi_sensor).status); }
```

3. **Traduce el estado** con una función `switch` sin `default` (así el compilador avisa si falta un caso):

```c
static status_t from_mi_sensor(mi_status_t s) {
  switch(s) {
    case MI_OK:      return ST_OK;
    case MI_WARNING: return ST_WARNING;
    case MI_FAULT:   return ST_FAULT;
  }
  return ST_FAULT;
}
```

4. **Agrégalo a `SENSOR_TABLE`**:

```c
{ .id = M_MI_SENSOR,    .read = read_mi_sensor,    .sample_ms = 1000 },
{ .id = M_MI_SENSOR_ST, .read = read_mi_sensor_st, .sample_ms = 1000, .deadband = 0.5f },
```

   - `sample_ms`: cada cuánto se muestrea.
   - `deadband`: si el valor cambia más que esto, se manda una **trama urgente** sin esperar los 2 s. Úsalo en estados y en señales digitales.

5. **Inicialízalo en `sensors_init()`**:

```c
ESP_ERROR_CHECK(mi_sensor_init(&mi_sensor, MI_PIN));
```

Si el sensor necesita la temperatura del agua o del aire, usa `water_temp.last` o `dht11_get(&air)` y colócalo **después** en la tabla.

## Paso 4: pin y compilación

1. Define el pin en `wroom/main/board.h`.
2. Agrega el componente a `wroom/main/CMakeLists.txt`:

```cmake
REQUIRES proto fc51 ds18b20 tsw20 tds yfs201 ph4502c dht11 mq135 mi_sensor
```

3. Compila y flashea el nodo (§5.3).

## Paso 5: comprobar

- En el monitor del WROOM: `iniciado en GPIO...`.
- En el broker: el campo nuevo aparece en `metrics` o `sensors_health`.
- **Panel web:** para que aparezca en tarjetas, límites y alertas, hay que dar de alta la métrica en el catálogo del backend (`backend/src/domain/catalog.ts` y la tabla de límites). Revisa estos archivos según cómo esté definido tu catálogo.

Límites prácticos: 49 métricas por trama (hoy se usan unas 23) y la tabla del gateway admite 8 nodos.

# 13. Seguridad y buenas prácticas

- No subas `secrets.h` ni `.env` al repositorio. Si se filtró una contraseña, cámbiala.
- Activa usuario y contraseña en Mosquitto y restringe `cmd/#` con ACL.
- Usa HTTPS para el panel (proxy como Caddy o nginx con certificado) y `COOKIE_SECURE=true`.
- Cambia las contraseñas de los usuarios iniciales.
- No uses el MQ135 como detector de seguridad.
- El pH, el MQ135 y el TDS son aproximados sin calibración.
- Los comandos MQTT deben publicarse **sin retain**.

# 14. Limitaciones conocidas

- El nodo depende de un solo DS18B20 con `Skip ROM`. Varios sensores en el mismo bus requieren búsqueda de ROM.
- `days_since_last_calibration` depende de que alguien registre el mantenimiento y de que SNTP sincronice (necesita salida a `pool.ntp.org` o un servidor local).
- `battery_v` es simulado y `chlorine_mg_l` no tiene sensor.
- La lectura del DHT11 detiene el loop ~30 ms cada 2 s.
- El acumulado de flujo se reinicia con cada reinicio del nodo.
- El pH no detecta un electrodo desconectado.
- Los comandos ESP-NOW no tienen reintentos: confirma con la telemetría.

# Apéndice A: referencia rápida de comandos

```bash
# Entorno ESP-IDF
. ~/esp/esp-idf/export.sh

# Nodo
cd firmware/wroom && idf.py set-target esp32   && idf.py build && idf.py -p /dev/ttyUSB0 flash monitor
# Gateway
cd firmware/s3    && idf.py set-target esp32s3 && idf.py build && idf.py -p /dev/ttyACM0 flash monitor

# Web
podman compose up -d --build
podman compose logs -f backend
podman exec -it cetinvictus_mosquitto_1 mosquitto_sub -h localhost -t 'hackathon/#' -v

# Comandos al nodo
mosquitto_pub -h localhost -t hackathon/gdl/planta_sur/esp32_node_08/cmd/led -m 1
mosquitto_pub -h localhost -t hackathon/gdl/planta_sur/esp32_node_08/cmd/maintenance -m ph
```

# Apéndice B: hojas de datos de referencia

| Módulo | Rango / dato clave |
|---|---|
| DS18B20 | -55 a 125 °C, ±0.5 °C, conversión de 750 ms a 12 bits. |
| DHT11 | 0 a 50 °C (±2 °C), 20 a 90 % HR (±5 %), 1 lectura cada ≥1.5 s. |
| YF-S201 | 1 a 30 L/min, 450 pulsos/L (±10 %), caudal = Hz / 7.5. |
| TDS Gravity | 0 a 1000 ppm, salida 0 a 2.3 V, ±10 %. |
| TSW-20 | Salida analógica que baja al aumentar la turbidez. |
| PH-4502C | Salida `Po` ~2.5 V a pH 7, ~59 mV por unidad de pH. |
| MQ135 | Calentamiento de 24 h la primera vez, 3 min por arranque. |
| FC-51 | Salida digital en bajo al detectar un obstáculo. |
