/* =========================================
   LÓGICA PRINCIPAL - CETINVICTUS
========================================= */

// 1. GESTIÓN DE SESIÓN Y LOGIN
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const correo = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const respuesta = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ correo, password })
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                document.getElementById('login-error').innerText = resultado.error;
                document.getElementById('login-error').classList.remove('d-none');
                return;
            }

            // Si existe, devolvemos el rol y su nombre para la sesión
            sessionStorage.setItem('userRole', resultado.rol);
            sessionStorage.setItem('userName', resultado.nombre);
            sessionStorage.setItem('userId', resultado.id); 
            sessionStorage.setItem('userEmail', correo); // <--- AÑADE ESTA LÍNEA AQUÍ
            window.location.href = 'dashboard.html';

        } catch (error) {
            console.error("Error en login:", error);
            alert("No se pudo conectar con el servidor backend.");
        }
    });
}

window.cerrarSesion = function() {
    sessionStorage.removeItem('userRole');
    window.location.href = 'login.html';
};

// 2. LÓGICA PRINCIPAL DEL DASHBOARD
if (document.getElementById('estado-general')) {
    
    // Validar Sesión y Aplicar Permisos Visuales
    const nombreUsuario = sessionStorage.getItem('userName') || 'Usuario';
    const currentUserRole = sessionStorage.getItem('userRole');
    if (!currentUserRole) window.location.href = 'login.html';

    // 1. PINTAR NOMBRE Y ROL CORRECTAMENTE EN EL NAV (Usando user-info-badge)
    const badge = document.getElementById('user-info-badge');
    if (badge) {
        const rolTexto = currentUserRole === 'admin' ? 'Administrador' : 'Cliente';
        badge.innerHTML = `👤 ${nombreUsuario} | Rol: <span class="text-warning">${rolTexto}</span>`;
    }

    // 2. APLICAR PERMISOS (Sin sobrescribir el badge del nav)
    if (currentUserRole === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.client-only').forEach(el => el.style.display = 'none');
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.client-only').forEach(el => el.style.display = 'inline-block');
    }

    // Inicializar Gráficas
    const ctxLinea = document.getElementById('graficaSensores');
    let chartLinea = ctxLinea ? new Chart(ctxLinea.getContext('2d'), {
        type: 'line',
        data: { 
            labels: [], datasets: [
                { label: 'pH', data: [], borderColor: '#0d6efd', backgroundColor: 'rgba(13, 110, 253, 0.1)', fill: true, tension: 0.3, yAxisID: 'y' },
                { label: 'Turbidez', data: [], borderColor: '#198754', tension: 0.3, yAxisID: 'y1' },
                { label: 'Cloro', data: [], borderColor: '#ffc107', tension: 0.3, yAxisID: 'y1' }
            ] 
        },
        options: { responsive: true, maintainAspectRatio: false, scales: {
            y: { position: 'left', min: 0, max: 14, title: {display: true, text: 'pH'} },
            y1: { position: 'right', grid: { drawOnChartArea: false } }
        }}
    }) : null;

    const ctxPastel = document.getElementById('graficaCalidad');
    let chartPastel = ctxPastel ? new Chart(ctxPastel.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Puro (%)', 'Impurezas (%)'], datasets: [{ data: [100, 0], backgroundColor: ['#005C53', '#dc3545'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
    }) : null;

    // NUEVA: Gráfica de Barras
    const ctxBarras = document.getElementById('graficaBarras');
    let chartBarras = ctxBarras ? new Chart(ctxBarras.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['pH', 'Turbidez', 'Cloro', 'Flujo (L/s)'],
            datasets: [{
                label: 'Niveles Actuales',
                data: [0, 0, 0, 0],
                backgroundColor: ['#0d6efd', '#198754', '#ffc107', '#0dcaf0'],
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: {display: false} } }
    }) : null;

    // Procesamiento de JSON (Sensor Data o Historial)
window.procesarDatosIoT = function(payload) {
    // 1. Normalizar datos (Soporta tanto filas planas de SQLite como el objeto SSE con .telemetry)
    const isSSE = payload.telemetry !== undefined;
    const metrics = isSSE ? (payload.telemetry.metrics || {}) : payload;
    const diagnostics = isSSE ? (payload.telemetry.diagnostics || {}) : payload;
    const health = isSSE ? (payload.telemetry.sensors_health || {}) : payload;
    const ts = isSSE ? payload.telemetry.ts : payload.ts;

    // Ignorar paquetes que no traigan métricas de agua (ej. paquetes de estado del gateway esp32s3_gw_01)
    if (metrics.ph === undefined && metrics.turbidity_ntu === undefined) return;
    if (metrics.ph === null && metrics.turbidity_ntu === null) return;

    const ph = Number(metrics.ph ?? 0);
    const turbidez = Number(metrics.turbidity_ntu ?? 0);
    const cloro = Number(metrics.chlorine_mg_l ?? 0);
    const flujo = Number(metrics.flow_lps ?? 0);
    const hora = ts ? new Date(ts * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();

    // 2. Actualizar Tarjetas KPI
    if(document.getElementById('val-ph')) document.getElementById('val-ph').innerText = ph.toFixed(2);
    if(document.getElementById('val-turbidez')) document.getElementById('val-turbidez').innerText = turbidez.toFixed(2);
    if(document.getElementById('val-cloro')) document.getElementById('val-cloro').innerText = cloro.toFixed(2);
    if(document.getElementById('val-flujo')) document.getElementById('val-flujo').innerText = flujo.toFixed(2);

    // 3. Actualizar Diagnóstico Técnico (Panel Admin)
    if(document.getElementById('diag-bateria') && diagnostics.battery_v !== undefined && diagnostics.battery_v !== null) {
        document.getElementById('diag-bateria').innerText = `${diagnostics.battery_v} V`;
    }
    if(document.getElementById('diag-rssi') && diagnostics.rssi_dbm !== undefined) {
        document.getElementById('diag-rssi').innerText = `${diagnostics.rssi_dbm} dBm`;
    }
    if(document.getElementById('diag-temp-int') && metrics.water_temp_c !== undefined) {
        document.getElementById('diag-temp-int').innerText = `${metrics.water_temp_c} °C`;
    }
    if(document.getElementById('diag-calibracion') && health.days_since_last_calibration !== undefined) {
        document.getElementById('diag-calibracion').innerText = `${health.days_since_last_calibration} días`;
    }
    if(document.getElementById('diag-lente-bar') && health.turbidity_lens_cleanliness_pct !== undefined) {
        const pct = health.turbidity_lens_cleanliness_pct;
        document.getElementById('diag-lente-bar').style.width = `${pct}%`;
        document.getElementById('diag-lente-text').innerText = `Limpieza: ${pct}%`;
    }

    // 4. Actualizar Gráfica de Líneas
    if (typeof chartLinea !== 'undefined' && chartLinea) {
        chartLinea.data.labels.push(hora);
        chartLinea.data.datasets[0].data.push(ph);           
        chartLinea.data.datasets[1].data.push(turbidez); 
        chartLinea.data.datasets[2].data.push(cloro); 
        
        if(chartLinea.data.labels.length > 30) {
            chartLinea.data.labels.shift();
            chartLinea.data.datasets.forEach(dataset => dataset.data.shift());
        }
        chartLinea.update();
    }

    // 5. Actualizar Gráfica de Barras
    if (typeof chartBarras !== 'undefined' && chartBarras) {
        chartBarras.data.datasets[0].data = [ph, turbidez, cloro, flujo];
        chartBarras.update();
    }

    // 6. Actualizar Gráfica de Pastel (Índice de calidad simple)
    if (typeof chartPastel !== 'undefined' && chartPastel) {
        const impurezas = Math.min(100, Math.round(turbidez * 10));
        chartPastel.data.datasets[0].data = [100 - impurezas, impurezas];
        chartPastel.update();
    }

    // 7. Insertar fila en la Tabla de Historial
    const tablaLecturas = document.getElementById('tabla-lecturas-sensores');
    if (tablaLecturas) {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${hora}</td>
            <td class="fw-bold">${ph.toFixed(2)}</td>
            <td>${turbidez.toFixed(2)}</td>
            <td>${cloro.toFixed(2)}</td>
            <td>${flujo.toFixed(2)}</td>
        `;
        tablaLecturas.insertBefore(fila, tablaLecturas.firstChild);
        if (tablaLecturas.children.length > 30) {
            tablaLecturas.removeChild(tablaLecturas.lastChild);
        }
    }

    // 8. Alertas Automáticas si los parámetros salen de rango
    if (ph < 6.5 || ph > 8.5) window.registrarAlerta(hora, 'pH Fuera de Rango', `Nivel detectado: ${ph}`);
    if (turbidez > 5.0) window.registrarAlerta(hora, 'Alta Turbidez', `Nivel detectado: ${turbidez} NTU`);
};

    // Funciones de Alertas Automáticas
    window.registrarAlerta = function(hora, tipo, mensaje) {
        const tabla = document.getElementById('tabla-alertas');
        if (!tabla) return;
        const ultimaFila = tabla.firstElementChild;
        if (ultimaFila && ultimaFila.innerText.includes(mensaje)) return;
        const fila = document.createElement('tr');
        fila.innerHTML = `<td><small>${hora}</small></td><td><span class="text-danger fw-bold">${tipo}</span></td><td><small>${mensaje}</small></td>`;
        tabla.insertBefore(fila, tabla.firstChild);
    };
    window.limpiarAlertas = function() {
        if(document.getElementById('tabla-alertas')) document.getElementById('tabla-alertas').innerHTML = '';
    };

    // =====================================
    // 1. CARGAR HISTORIAL AL INICIAR
    // =====================================
    fetch('http://localhost:3000/api/lecturas/historial')
        .then(res => res.json())
        .then(data => {
            data.forEach(lectura => window.procesarDatosIoT(lectura));
        }).catch(err => console.error("No se pudo cargar historial:", err));

    // =====================================
    // 2. CONEXIÓN REAL AL BACKEND VÍA SSE
    // =====================================
    const sseURL = 'http://localhost:3000/api/stream'; 
    const eventSource = new EventSource(sseURL);

    eventSource.onmessage = function(event) {
        const payloadReal = JSON.parse(event.data);
        console.log("📡 Dato real recibido por SSE:", payloadReal);
        window.procesarDatosIoT(payloadReal);
    };
    eventSource.onerror = function(err) {
        console.error("🔴 Esperando conexión con el servidor Node.js...");
    };

    // =====================================
    // 3. SIMULADOR (ENVÍA A NODE EN LUGAR DE PINTAR DIRECTO)
    // =====================================
    // Cuando conecten el ESP32 real, simplemente borra o comenta desde setInterval hasta su cierre.
    setInterval(async () => {
        const payloadPrueba = {
            "ts": Math.floor(Date.now() / 1000),
            "metrics": {
                "ph": +(7.21 + (Math.random() * 0.2 - 0.1)).toFixed(2),
                "turbidity_ntu": +(1.45 + (Math.random() * 0.5)).toFixed(2),
                "chlorine_mg_l": +(0.82 + (Math.random() * 0.3 - 0.15)).toFixed(2),
                "flow_lps": + (12.5 + (Math.random() * 2 - 1)).toFixed(2)
            },
            "sensors_health": {
                "ph_electrode_mv": 12.4, 
                "ph_status": "OK",
                "turbidity_lens_cleanliness_pct": +(89 - Math.random() * 2).toFixed(1), 
                "turbidity_status": "WARNING_DIRTY",
                "days_since_last_calibration": 45,
                "internal_temp_c": 26.4
            },
            "diagnostics": { "battery_v": 3.85, "rssi_dbm": -72, "free_heap_bytes": 142000 }
        };
        
        try {
            await fetch('http://localhost:3000/api/lecturas/simular', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadPrueba)
            });
        } catch (e) {
            console.error("Error enviando datos simulados al backend:", e);
        }
    }, 5000);
}

// 3. GENERADOR DE PDF (Salto de página limpio para la tabla)
window.generarReportePDF = function() {
    const elemento = document.getElementById('area-reporte');
    
    // Identificar los contenedores
    const tablaContainer = elemento.querySelector('.table-responsive');
    const colTabla = tablaContainer.closest('.col-md-7');
    const colBarras = elemento.querySelector('#graficaBarras').closest('.col-md-5');
    const rowContenedor = colTabla.parentElement; // El div class="row g-4" que los envuelve

    // 1. Quitar el scroll de la tabla temporalmente
    if (tablaContainer) {
        tablaContainer.style.maxHeight = 'none';
        tablaContainer.style.overflow = 'visible';
    }

    // 2. Modificar el layout solo para el PDF (Evita el descuadre de Flexbox)
    rowContenedor.classList.remove('row', 'g-4'); // Rompemos el flexbox
    colBarras.className = 'w-100 mb-5'; // La gráfica de barras ocupará el ancho completo en la Pag 1
    colTabla.className = 'w-100 html2pdf__page-break'; // Forzamos a la tabla a saltar a la Pag 2

    const opciones = { 
        margin: 10, 
        filename: 'Reporte_Agua_CETINVICTUS.pdf', 
        image: { type: 'jpeg', quality: 0.98 }, 
        html2canvas: { scale: 2 }, 
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'] } 
    };

    html2pdf().set(opciones).from(elemento).save().then(() => {
        // 3. Restaurar el diseño web original de Bootstrap al terminar
        if (tablaContainer) {
            tablaContainer.style.maxHeight = '280px';
            tablaContainer.style.overflowY = 'auto';
        }
        rowContenedor.classList.add('row', 'g-4');
        colBarras.className = 'col-md-5';
        colTabla.className = 'col-md-7';
    });
};

// ==========================================
// 4. SISTEMA DE TICKETS / REPORTES (CONECTADO A SQLITE)
// ==========================================

window.renderizarReportes = async function() {
    const tbody = document.getElementById('tabla-reportes-usuarios');
    if (!tbody) return;
    
    try {
        const respuesta = await fetch('http://localhost:3000/api/reportes');
        const reportes = await respuesta.json();
        
        tbody.innerHTML = '';
        const rolActual = sessionStorage.getItem('userRole');
        const correoActual = sessionStorage.getItem('userEmail');
        
        reportes.forEach(rep => {
            // Los clientes solo ven sus propios reportes, el admin ve todos
            if (rolActual !== 'admin' && rep.usuario !== correoActual) return;

            const tr = document.createElement('tr');
            let btnAccion = '';
            
            if (rolActual === 'admin') {
                if (rep.estado === 'Pendiente') {
                    btnAccion = `<button class="btn btn-sm btn-success me-1 mb-1" onclick="marcarReporteRevisado(${rep.id})">✔ Atender</button>`;
                } else {
                    btnAccion = `<span class="badge bg-light text-success border border-success me-1 mb-1">Resuelto</span>`;
                }
                btnAccion += `<button class="btn btn-sm btn-outline-danger mb-1" onclick="eliminarReporte(${rep.id})">🗑️</button>`;
            }
            
            const celdaAdmin = rolActual === 'admin' ? `<td class="text-center">${btnAccion}</td>` : '';

            tr.innerHTML = `
                <td><small class="text-muted">${rep.fecha}</small></td>
                <td><span class="text-primary fw-bold small">${rep.usuario}</span></td>
                <td><span class="badge bg-secondary">${rep.sensor}</span></td>
                <td><small>${rep.descripcion}</small></td>
                <td><span class="badge ${rep.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-success'}">${rep.estado}</span></td>
                ${celdaAdmin}
            `;
            tbody.appendChild(tr); 
        });
    } catch (error) {
        console.error("Error al cargar reportes desde el backend:", error);
    }
};

// Enviar nuevo reporte a SQLite
const formReporte = document.getElementById('formNuevoReporte');
if (formReporte) {
    formReporte.addEventListener('submit', async function(e) {
        e.preventDefault(); 
        const date = new Date();
        const correoLogueado = sessionStorage.getItem('userEmail') || 'cliente@cetinvictus.com';
        
        const nuevoReporte = {
            fecha: `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`,
            usuario: correoLogueado,
            sensor: document.getElementById('reporteSensor').value,
            descripcion: document.getElementById('reporteDesc').value
        };
        
        try {
            const res = await fetch('http://localhost:3000/api/reportes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nuevoReporte)
            });

            if(res.ok) {
                const modalEl = document.getElementById('modalReporte');
                const modalObj = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                modalObj.hide();
                formReporte.reset();
                window.renderizarReportes();
            } else {
                alert("No se pudo guardar el reporte.");
            }
        } catch (err) {
            console.error(err);
        }
    });
}

// Marcar como Revisado en SQLite
window.marcarReporteRevisado = async function(id) {
    try {
        await fetch(`http://localhost:3000/api/reportes/${id}`, { method: 'PUT' });
        window.renderizarReportes();
    } catch (e) {
        console.error(e);
    }
};

// Eliminar reporte de SQLite
window.eliminarReporte = async function(id) {
    if (!confirm("¿Estás seguro de que deseas borrar este reporte de servicio de la base de datos?")) return;
    
    try {
        await fetch(`http://localhost:3000/api/reportes/${id}`, { method: 'DELETE' });
        window.renderizarReportes();
    } catch (e) {
        console.error(e);
    }
};

// Cargar la tabla al iniciar
if(document.getElementById('tabla-reportes-usuarios')) {
    window.renderizarReportes();
}