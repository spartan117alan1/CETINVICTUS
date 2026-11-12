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
const db = new sqlite3.Database('./db/cetinvictus.db', (err) => {
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
        nombre TEXT,
        apellido TEXT,
        edad INTEGER,
        telefono TEXT,
        compania TEXT,
        estado TEXT,
        colonia TEXT,
        correo TEXT UNIQUE,
        password TEXT,
        rol TEXT
    )`);
    
    // Opcional: Insertar un usuario admin por defecto si la tabla está vacía
    db.run(`INSERT OR IGNORE INTO usuarios (id, nombre, apellido, edad, telefono, compania, estado, colonia, correo, password, rol) VALUES (1, 'Admin', 'Principal', NULL, NULL, NULL, NULL, NULL, 'admin@cetinvictus.com', 'admin123', 'admin')`);
    db.run(`INSERT OR IGNORE INTO usuarios (id, nombre, apellido, edad, telefono, compania, estado, colonia, correo, password, rol) VALUES (2, 'Usuario', 'Normal', NULL, NULL, 'Compañía X', 'Estado Y', 'Colonia Z', 'cliente@cetinvictus.com', 'cliente123', 'cliente')`);
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
    console.log(`sServidor backend corriendo en el puerto ${PUERTO}`);
});


// Endpoint para guardar un nuevo usuario en SQLite
app.post('/api/usuarios', (req, res) => {
    const { rol, nombre, apellido, edad, telefono, correo, password, compania, estado, colonia } = req.body;

    // Validación básica de campos requeridos
    if (!rol || !nombre || !apellido || !correo || !password) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const sql = `INSERT INTO usuarios 
        (rol, nombre, apellido, edad, telefono, correo, password, compania, estado, colonia) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        rol, 
        nombre, 
        apellido, 
        edad || null, 
        telefono || null, 
        correo, 
        password, 
        compania || null, 
        estado || null, 
        colonia || null
    ];

    db.run(sql, params, function (err) {
        if (err) {
            // Si el correo ya existe, SQLite devolverá error por la restricción UNIQUE
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
            }
            console.error("Error al insertar usuario:", err.message);
            return res.status(500).json({ error: 'Error interno en la base de datos.' });
        }

        // Responder con éxito devolviendo el ID asignado por SQLite
        res.json({ 
            mensaje: 'Usuario guardado exitosamente', 
            id: this.lastID 
        });
    });
});

// ==========================================
// ENDPOINTS PARA GESTIÓN DE USUARIOS Y LOGIN
// ==========================================

// A. Obtener lista de usuarios para la tabla de usuarios.html
app.get('/api/usuarios', (req, res) => {
    db.all("SELECT id, rol, nombre, apellido, edad, telefono, correo, compania, estado, colonia FROM usuarios", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// B. Eliminar usuario por ID
app.delete('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM usuarios WHERE id = ?", id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: 'Usuario eliminado exitosamente', cambios: this.changes });
    });
});

// C. Actualizar usuario
app.put('/api/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { rol, nombre, apellido, edad, telefono, correo, compania, estado, colonia } = req.body;

    const sql = `UPDATE usuarios SET rol = ?, nombre = ?, apellido = ?, edad = ?, telefono = ?, correo = ?, compania = ?, estado = ?, colonia = ? WHERE id = ?`;
    const params = [rol, nombre, apellido, edad || null, telefono || null, correo, compania || null, estado || null, colonia || null, id];

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: 'Usuario actualizado exitosamente' });
    });
});

// D. Login Real (Valida contra la base de datos SQLite)
app.post('/api/login', (req, res) => {
    const { correo, password } = req.body;

    const sql = "SELECT * FROM usuarios WHERE correo = ? AND password = ?";
    db.get(sql, [correo, password], (err, row) => {
        if (err) return res.status(500).json({ error: 'Error en el servidor' });
        
        if (!row) {
            return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
        }

        // Si existe, devolvemos el rol y su nombre para la sesión
        res.json({
            mensaje: 'Login exitoso',
            id: row.id,
            rol: row.rol,
            nombre: `${row.nombre} ${row.apellido}`
        });
    });
});