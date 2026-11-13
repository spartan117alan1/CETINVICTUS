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
    // Tabla para el historial de sensores (Actualizada para la estructura MQTT real)
    db.run(`CREATE TABLE IF NOT EXISTS lecturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT,
        region TEXT,
        zona TEXT,
        ts INTEGER,
        ph REAL,
        turbidity_ntu REAL,
        chlorine_mg_l REAL,
        flow_lps REAL,
        water_temp_c REAL,
        turbidity_status TEXT,
        battery_v REAL
    )`);

    // Tabla para los reportes / tickets de servicio
    db.run(`CREATE TABLE IF NOT EXISTS reportes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT,
        usuario TEXT,
        sensor TEXT,
        descripcion TEXT,
        estado TEXT
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
// Conexión al broker local (Mosquitto debe estar corriendo en tu PC)
const mqttClient = mqtt.connect('mqtt://localhost:1883'); 

// Suscripción usando comodines (+). 
// Captura todo lo que empiece por 'cetinvictus' y termine en 'telemetry'
// Ejemplo: cetinvictus/gdl/planta_sur/esp32_node_08/telemetry
const TEMA_MQTT = 'hackathon/+/+/+/telemetry';

mqttClient.on('connect', () => {
    console.log('🔌 Conectado al Broker MQTT Local');
    mqttClient.subscribe(TEMA_MQTT);
});

mqttClient.on('message', (topic, message) => {
    try {
        console.log("RAW MQTT:", topic, message.toString());
        const rawData = JSON.parse(message.toString());
        
        // Si llega un arreglo (como en tu ejemplo), lo procesamos elemento por elemento; si es objeto, lo metemos en un arreglo
        const listaDispositivos = Array.isArray(rawData) ? rawData : [rawData];

        listaDispositivos.forEach(item => {
            // Extraer región, zona e ID desde el JSON nuevo o desde el tópico MQTT como respaldo
            const parts = topic.split('/');
            const region = item.region || parts[1] || 'gdl';
            const zona = item.zone || parts[2] || 'planta_general';
            const device_id = item.id || parts[3] || 'unknown';

            // Detectar si los datos vienen anidados en "telemetry" o en la raíz
            const telemetria = item.telemetry ? item.telemetry : item;
            const metrics = telemetria.metrics || {};
            const diagnostics = telemetria.diagnostics || {};
            const sensors_health = telemetria.sensors_health || {};

            const ph = metrics.ph !== undefined ? metrics.ph : null;
            const turbidity_ntu = metrics.turbidity_ntu !== undefined ? metrics.turbidity_ntu : null;
            const chlorine_mg_l = metrics.chlorine_mg_l !== undefined ? metrics.chlorine_mg_l : null;
            const flow_lps = metrics.flow_lps !== undefined ? metrics.flow_lps : null;
            const water_temp_c = metrics.water_temp_c !== undefined ? metrics.water_temp_c : null;
            const battery_v = diagnostics.battery_v !== undefined ? diagnostics.battery_v : null;
            const ts = telemetria.ts || Math.floor(Date.now() / 1000);

            // Solo guardamos en SQLite si es un nodo con sensores de agua (ignora el gateway que solo manda "led")
            if (ph !== null || turbidity_ntu !== null) {
                console.log(`💧 Guardando lectura de: ${device_id} (pH: ${ph}, Turbidez: ${turbidity_ntu})`);
                
                const stmt = db.prepare(`
                    INSERT INTO lecturas 
                    (device_id, region, zona, ts, ph, turbidity_ntu, chlorine_mg_l, flow_lps, water_temp_c, turbidity_status, battery_v) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                stmt.run(
                    device_id, 
                    region, 
                    zona, 
                    ts, 
                    ph, 
                    turbidity_ntu, 
                    chlorine_mg_l, 
                    flow_lps, 
                    water_temp_c,
                    sensors_health.turbidity_status || 'Optimal', 
                    battery_v
                );
                stmt.finalize();
            }

            // Estructurar paquete unificado para el Frontend
            const dataParaFrontend = {
                key: item.key || `${region}/${zona}/${device_id}`,
                region: region,
                zone: zona,
                id: device_id,
                online: item.online !== undefined ? item.online : true,
                telemetry: {
                    ts: ts,
                    via: telemetria.via || device_id,
                    metrics: metrics,
                    sensors_health: sensors_health,
                    diagnostics: diagnostics
                },
                receivedAt: item.receivedAt || Date.now()
            };

            // Retransmitir al Dashboard vía SSE
            emitirEvento(dataParaFrontend);
        });

    } catch (error) {
        console.error('Error procesando mensaje MQTT o guardando en BD:', error);
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

// ==========================================
// ENDPOINTS PARA LECTURAS Y SIMULADOR
// ==========================================

// Obtener el historial de los últimos 30 registros (aprox. últimos 30 mins si envían cada min)
/*app.get('/api/lecturas/historial', (req, res) => {
     Obtenemos los últimos 30, pero los ordenamos de forma ascendente para la gráfica
    const sql = `SELECT * FROM (SELECT * FROM lecturas ORDER BY id DESC LIMIT 30) ORDER BY id ASC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Endpoint para simular al ESP32 (El frontend le enviará datos aquí)
app.post('/api/lecturas/simular', (req, res) => {
    const payload = req.body;
    const device_id = 'simulador_nodo_1';
    const region = 'gdl';
    const zona = 'planta_prueba';

    const stmt = db.prepare(`
        INSERT INTO lecturas 
        (device_id, region, zona, ts, ph, turbidity_ntu, chlorine_mg_l, flow_lps, turbidity_status, battery_v) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
        device_id, region, zona, 
        payload.ts, payload.metrics.ph, payload.metrics.turbidity_ntu, 
        payload.metrics.chlorine_mg_l, payload.metrics.flow_lps, 
        payload.sensors_health.turbidity_status, payload.diagnostics.battery_v, 
        function(err) {
            if(err) return res.status(500).json({error: err.message});
            
            // Retransmitir al Dashboard vía SSE
            const dataParaFrontend = { ...payload, device_id, region, zona };
            emitirEvento(dataParaFrontend); 
            
            res.json({ success: true, id: this.lastID });
    });
}); */

// ==========================================
// ENDPOINTS PARA REPORTES / TICKETS
// ==========================================

// Obtener todos los reportes
app.get('/api/reportes', (req, res) => {
    db.all("SELECT * FROM reportes ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Crear un nuevo reporte
app.post('/api/reportes', (req, res) => {
    const { fecha, usuario, sensor, descripcion } = req.body;
    const estado = 'Pendiente';

    const sql = `INSERT INTO reportes (fecha, usuario, sensor, descripcion, estado) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [fecha, usuario, sensor, descripcion, estado], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: 'Reporte creado exitosamente', id: this.lastID });
    });
});

// Cambiar estado a 'Revisado'
app.put('/api/reportes/:id', (req, res) => {
    const { id } = req.params;
    const sql = `UPDATE reportes SET estado = 'Revisado' WHERE id = ?`;
    db.run(sql, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: 'Reporte atendido con éxito' });
    });
});

// Eliminar reporte
app.delete('/api/reportes/:id', (req, res) => {
    const { id } = req.params;
    const sql = `DELETE FROM reportes WHERE id = ?`;
    db.run(sql, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ mensaje: 'Reporte eliminado' });
    });
});