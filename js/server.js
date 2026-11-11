// server.js (Backend 100% Local)
const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose(); // Librería de SQLite

const app = express();
app.use(cors());
app.use(express.json()); // Para poder recibir POST requests en el login futuro

// ==========================================
// 1. CONFIGURACIÓN DE BASE DE DATOS (SQLite)
// ==========================================
// Crea un archivo físico llamado 'cetinvictus.db' en tu carpeta
const db = new sqlite3.Database('./cetinvictus.db', (err) => {
    if (err) console.error("Error abriendo la BD:", err.message);
    else console.log("📦 Base de datos SQLite conectada.");
});

// Crear tablas si no existen
db.serialize(() => {
    // Tabla para el historial de sensores
    db.run(`CREATE TABLE IF NOT EXISTS lecturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        ts INTEGER,
        ph REAL,
        turbidity_ntu REAL,
        chlorine_mg_l REAL,
        flow_lps REAL,
        turbidity_status TEXT,
        battery_v REAL
    )`);

    // Tabla para los usuarios del dashboard
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        rol TEXT
    )`);
    
    // Opcional: Insertar un usuario admin por defecto si la tabla está vacía
    db.run(`INSERT OR IGNORE INTO usuarios (email, password, rol) VALUES ('admin@cetinvictus.com', 'admin123', 'admin')`);
});

// ==========================================
// 2. CONFIGURACIÓN SSE (Frontend <- Backend)
// ==========================================
let sseClients = [];

app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter(client => client !== res); });
});

function emitirEvento(data) {
    sseClients.forEach(client => client.write(`data: ${JSON.stringify(data)}\n\n`));
}

// ==========================================
// 3. CONEXIÓN MQTT (Hardware -> Backend)
// ==========================================
// IMPORTANTE: Al ser local, ocupas instalar un Broker como 'Mosquitto' en tu PC
// y usar tu IP local o localhost.
const mqttClient = mqtt.connect('mqtt://localhost:1883'); 
const TEMA_MQTT = 'cetinvictus/nodos/agua';

mqttClient.on('connect', () => {
    console.log('🔌 Conectado al Broker MQTT Local');
    mqttClient.subscribe(TEMA_MQTT);
});

mqttClient.on('message', (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        console.log('💧 Nuevo dato recibido de:', payload.device_id);

        // PASO A: Guardar lectura en SQLite
        const stmt = db.prepare(`INSERT INTO lecturas (device_id, ts, ph, turbidity_ntu, chlorine_mg_l, flow_lps, turbidity_status, battery_v) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        
        stmt.run(
            payload.device_id, 
            payload.ts, 
            payload.metrics.ph, 
            payload.metrics.turbidity_ntu, 
            payload.metrics.chlorine_mg_l, 
            payload.metrics.flow_lps, 
            payload.sensors_health.turbidity_status, 
            payload.diagnostics.battery_v
        );
        stmt.finalize();

        // PASO B: Retransmitir al Dashboard vía SSE
        emitirEvento(payload);
    } catch (error) {
        console.error('Error procesando mensaje:', error);
    }
});

// Iniciar servidor local
// Tu computadora escuchará en el puerto 3000
const PUERTO = 3000;
app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`🚀 Servidor backend corriendo en el puerto ${PUERTO}`);
});