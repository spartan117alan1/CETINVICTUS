# 🌊 Proyecto Hackathon 2026 | CETINVICTUS - Clean Water For All

Dashboard IoT para monitoreo de calidad del agua en tiempo real, integración MQTT con dispositivos ESP32 y almacenamiento persistente mediante SQLite.

---

## 📋 Requisitos Previos

Para ejecutar este proyecto en tu entorno local, necesitas tener instalado:
1. **Node.js** (v16 o superior) - [Descargar aquí](https://nodejs.org/)
2. **Mosquitto MQTT Broker** - (Ver instrucciones de instalación abajo)
3. **Visual Studio Code** con la extensión **Live Server** (para servir el Frontend)

---

## 🚀 Paso 1: Instalación y Configuración del Broker MQTT (Mosquitto)

Para que el ESP32 pueda enviar datos, el servidor debe aceptar conexiones anónimas externas.

### 🪟 Windows
1. Descarga e instala Mosquitto desde [mosquitto.org/download](https://mosquitto.org/download/).
2. Abre el Bloc de notas como **Administrador** y edita el archivo `mosquitto.conf` (usualmente en `C:\Program Files\mosquitto\mosquitto.conf`).
3. Agrega estas dos líneas al final del archivo y guarda:
   ```text
   listener 1883
   allow_anonymous true
   ```
4. Abre la Terminal (CMD) y ejecuta:
   ```bash
   cd "C:\Program Files\mosquitto"
   mosquitto -c mosquitto.conf -v
   ```

### 🍎 Mac (Homebrew)
1. Abre la terminal e instala con: `brew install mosquitto`
2. Edita el archivo de configuración:
   ```bash
   nano /opt/homebrew/etc/mosquitto/mosquitto.conf
   ```
3. Añade al final:
   ```text
   listener 1883
   allow_anonymous true
   ```
4. Ejecuta el broker en modo detallado:
   ```bash
   mosquitto -c /opt/homebrew/etc/mosquitto/mosquitto.conf -v
   ```

### 🐧 Linux (Ubuntu/Debian)
1. Abre la terminal e instala: `sudo apt update && sudo apt install mosquitto mosquitto-clients`
2. Edita el archivo de configuración:
   ```bash
   sudo nano /etc/mosquitto/mosquitto.conf
   ```
3. Añade al final:
   ```text
   listener 1883
   allow_anonymous true
   ```
4. Reinicia y revisa el servicio:
   ```bash
   sudo systemctl restart mosquitto
   mosquitto -c /etc/mosquitto/mosquitto.conf -v
   ```

> **¡Importante!** Mantén la terminal de Mosquitto abierta. Aquí verás en tiempo real cuando el ESP32 se conecte (`New connection from...`).

---

## 🖥️ Paso 2: Iniciar el Servidor Backend (Node.js)

El backend se encarga de guardar los datos en SQLite y mandarlos al Dashboard.
El comando npm (Node Package Manager) viene incluido automáticamente cuando instalas Node.js.

1. Abre una **nueva terminal** y navega a la carpeta del proyecto.
2. Instala las dependencias:
   ```bash
   npm install
   ```
   *(Esto instalará `express`, `cors`, `mqtt` y `sqlite3`)*
3. Inicia el servidor:
   ```bash
   node server.js
   ```
4. Deberías ver en consola:
   * `📦 Base de datos SQLite conectada.` (Crea `cetinvictus.db` automáticamente).
   * `🔌 Conectado al Broker MQTT Local.`

---

## 🌐 Paso 3: Iniciar el Frontend (Dashboard)

1. Abre la carpeta del proyecto en **Visual Studio Code**.
2. Haz clic derecho sobre el archivo `index.html` o `login.html` y selecciona **"Open with Live Server"**.
3. El dashboard se abrirá en tu navegador (usualmente en `http://127.0.0.1:5500`).
   * *Credenciales por defecto:* `admin@cetinvictus.com` / `admin123`

---

## 📡 Paso 4: Instrucciones para Hardware (ESP32)

Para que el ESP32 logre pintar los datos en el Dashboard, debe cumplir estas 3 reglas:

1. **Estar en la misma red WiFi** que la computadora donde corre Node.js y Mosquitto.
2. **Apuntar a la IP local de la computadora**, no a `localhost`. (Ej. `192.168.1.XX`). 
   * *Windows:* usa `ipconfig` en CMD. 
   * *Mac/Linux:* usa `ifconfig` o `ip a` en la terminal.
3. **Publicar en el Tópico correcto y con formato JSON.**

### 📝 Formato MQTT Requerido

**Tópico (Topic):**
```text
hackathon/gdl/planta_sur/esp32_node_08/telemetry
```
*(Nota: El backend lee los datos separando el string por diagonales `/`)*

**Payload (JSON de ejemplo para los nodos sensores):**
```json
{
    "key": "gdl/planta_sur/esp32_node_08",
    "region": "gdl",
    "zone": "planta_sur",
    "id": "esp32_node_08",
    "online": true,
    "telemetry": {
        "ts": 1794456798,
        "via": "esp32s3_gw_01",
        "metrics": {
            "object_detected": 0,
            "ph": 7.74,
            "turbidity_ntu": 1.58,
            "water_temp_c": 23.9,
            "chlorine_mg_l": 0.86,
            "flow_lps": 11.4
        },
        "sensors_health": {},
        "diagnostics": {
            "free_heap_bytes": 235176,
            "battery_v": 3.97,
            "uptime_s": 1868,
            "rssi_dbm": -23
        }
    },
    "receivedAt": 1794456798407
}
```

¡Todo listo! En cuanto el ESP32 publique, los datos aparecerán instantáneamente en la base de datos y en las gráficas web. 🎉