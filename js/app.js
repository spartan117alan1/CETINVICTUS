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
    const currentUserRole = sessionStorage.getItem('userRole');
    if (!currentUserRole) window.location.href = 'login.html';

    const badge = document.getElementById('user-role-badge');
    
    // LÓGICA DE PERMISOS (Muestra u oculta los paneles)
    if (currentUserRole === 'admin') {
        if(badge) badge.innerText = 'Rol: Administrador';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block'); // Muestra panel diagnóstico
        document.querySelectorAll('.client-only').forEach(el => el.style.display = 'none'); // Oculta botón levantar reporte
    } else {
        if(badge) badge.innerText = 'Rol: Cliente';
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none'); // Oculta panel diagnóstico
        document.querySelectorAll('.client-only').forEach(el => el.style.display = 'inline-block'); // Muestra botón levantar reporte
    }

    // Inicializar Gráficas
    const ctxLinea = document.getElementById('graficaSensores');
    let chartLinea = ctxLinea ? new Chart(ctxLinea.getContext('2d'), {
        type: 'line',
        data: { 
            labels: [], datasets: [
                { label: 'pH', data: [], borderColor: '#0d6efd', tension: 0.3, yAxisID: 'y' },
                { label: 'Turbidez', data: [], borderColor: '#198754', tension: 0.3, yAxisID: 'y1' },
                { label: 'Cloro', data: [], borderColor: '#ffc107', tension: 0.3, yAxisID: 'y1' }
            ] 
        },
        options: { responsive: true, maintainAspectRatio: false, scales: {
            y: { position: 'left', min: 0, max: 14 },
            y1: { position: 'right', grid: { drawOnChartArea: false } }
        }}
    }) : null;

    const ctxPastel = document.getElementById('graficaCalidad');
    let chartPastel = ctxPastel ? new Chart(ctxPastel.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Puro (%)', 'Impurezas (%)'], datasets: [{ data: [100, 0], backgroundColor: ['#005C53', '#dc3545'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
    }) : null;

    // Procesamiento de JSON (Sensor Data)
    window.procesarDatosIoT = function(payload) {
        const date = new Date(payload.ts * 1000);
        const hora = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;

        // KPIs
        if(document.getElementById('val-ph')) document.getElementById('val-ph').innerText = payload.metrics.ph;
        if(document.getElementById('val-turbidez')) document.getElementById('val-turbidez').innerText = payload.metrics.turbidity_ntu;
        if(document.getElementById('val-cloro')) document.getElementById('val-cloro').innerText = payload.metrics.chlorine_mg_l;
        if(document.getElementById('val-flujo')) document.getElementById('val-flujo').innerText = payload.metrics.flow_lps;

        // Gráficas
        if (chartLinea) {
            chartLinea.data.labels.push(hora);
            chartLinea.data.datasets[0].data.push(payload.metrics.ph);           
            chartLinea.data.datasets[1].data.push(payload.metrics.turbidity_ntu); 
            chartLinea.data.datasets[2].data.push(payload.metrics.chlorine_mg_l); 
            if(chartLinea.data.labels.length > 10) {
                chartLinea.data.labels.shift();
                chartLinea.data.datasets.forEach(d => d.data.shift());
            }
            chartLinea.update();
        }

        if (chartPastel) {
            let pureza = 100 - (Math.abs(7.2 - payload.metrics.ph) * 10 + payload.metrics.turbidity_ntu * 5);
            pureza = Math.max(0, Math.min(100, pureza));
            chartPastel.data.datasets[0].data = [pureza.toFixed(1), (100 - pureza).toFixed(1)];
            chartPastel.data.datasets[0].backgroundColor = pureza < 75 ? ['#dc3545', '#f8d7da'] : ['#005C53', '#e9ecef'];
            chartPastel.update();
        }

        // Panel de Diagnóstico (Solo Admin)
        if (currentUserRole === 'admin') {
            if(document.getElementById('diag-bateria')) {
                document.getElementById('diag-bateria').innerText = `${payload.diagnostics.battery_v} V`;
            }
            if(document.getElementById('diag-rssi')) document.getElementById('diag-rssi').innerText = `${payload.diagnostics.rssi_dbm} dBm`;
            if(document.getElementById('diag-temp-int')) document.getElementById('diag-temp-int').innerText = `${payload.sensors_health.internal_temp_c} °C`;
            if(document.getElementById('diag-calibracion')) document.getElementById('diag-calibracion').innerText = payload.sensors_health.days_since_last_calibration;
            
            if(document.getElementById('diag-lente-bar')) {
                const pct = payload.sensors_health.turbidity_lens_cleanliness_pct;
                document.getElementById('diag-lente-bar').style.width = `${pct}%`;
                document.getElementById('diag-lente-text').innerText = `Limpieza: ${pct}%`;
                if (pct < 90) registrarAlerta(hora, 'Mantenimiento', `Lente sucio (${pct}%).`);
            }
        }
    };

    // Funciones de la Tabla de Alertas Automáticas (Admin)
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

    /** SIMULADOR: Activo para que pruebes el diseño YA. 
    // Cuando conectes el backend, borra este setInterval y usa el SSE. */
    setInterval(() => {
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
                "turbidity_lens_cleanliness_pct": +(89 - Math.random() * 2).toFixed(1), // Baja aleatoriamente para disparar alerta
                "turbidity_status": "WARNING_DIRTY",
                "days_since_last_calibration": 45,
                "internal_temp_c": 26.4
            },
            "diagnostics": { "battery_v": 3.85, "rssi_dbm": -72, "free_heap_bytes": 142000 }
        };
        window.procesarDatosIoT(payloadPrueba);
    }, 3000);

    /* ============Expandir============
    // CONEXIÓN REAL AL BACKEND VÍA SSE
    // ==========================================
    // NOTA: Si pruebas en otra PC o celular, cambia 'localhost' por la IP de tu computadora (ej. 192.168.1.50)
    const sseURL = 'http://localhost:3000/api/stream'; 
    const eventSource = new EventSource(sseURL);

    eventSource.onmessage = function(event) {
        // Cada vez que Node.js envía un evento, lo convertimos de texto a JSON
        const payloadReal = JSON.parse(event.data);
        console.log("📡 Dato real recibido por SSE:", payloadReal);
        
        // Enviamos el dato real a tu función (la cual actualizará las tarjetas, gráficas y diagnósticos)
        window.procesarDatosIoT(payloadReal);
    };

    eventSource.onerror = function(err) {
        console.error("🔴 Esperando conexión con el servidor Node.js...");
        // No te preocupes por los errores aquí, EventSource es inteligente y se reconectará solo cuando levantes el backend.
    };
     */
}

// 3. GENERADOR DE PDF
window.generarReportePDF = function() {
    const elemento = document.getElementById('area-reporte');
    const opciones = { margin: 10, filename: 'Reporte_Agua_CETINVICTUS.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } };
    html2pdf().set(opciones).from(elemento).save();
};

// 4. SISTEMA DE TICKETS / REPORTES
if (!localStorage.getItem('db_reportes')) {
    localStorage.setItem('db_reportes', JSON.stringify([
        { fecha: '10:00:00', usuario: 'cliente@cetinvictus.com', sensor: 'Sensor de pH', descripcion: 'Marca valores negativos.', estado: 'Pendiente' }
    ]));
}

window.renderizarReportes = function() {
    const tbody = document.getElementById('tabla-reportes-usuarios');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const reportes = JSON.parse(localStorage.getItem('db_reportes')) || [];
    const rolActual = sessionStorage.getItem('userRole');
    
    reportes.forEach((rep, index) => {
        if (rolActual !== 'admin' && rep.usuario !== 'cliente@cetinvictus.com') return;

        const tr = document.createElement('tr');
        let btnAccion = '';
        if (rolActual === 'admin') {
            if (rep.estado === 'Pendiente') {
                btnAccion = `<button class="btn btn-sm btn-success" onclick="marcarReporteRevisado(${index})">✔ Atender</button>`;
            } else {
                btnAccion = `<span class="badge bg-light text-success border border-success">Resuelto</span>`;
            }
        }
        // Usar display table-cell para la columna si es admin
        const celdaAdmin = rolActual === 'admin' ? `<td class="text-center">${btnAccion}</td>` : '';

        tr.innerHTML = `
            <td><small class="text-muted">${rep.fecha}</small></td>
            <td><span class="text-primary fw-bold small">${rep.usuario}</span></td>
            <td><span class="badge bg-secondary">${rep.sensor}</span></td>
            <td><small>${rep.descripcion}</small></td>
            <td><span class="badge ${rep.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-success'}">${rep.estado}</span></td>
            ${celdaAdmin}
        `;
        tbody.prepend(tr); 
    });
};

const formReporte = document.getElementById('formNuevoReporte');
if (formReporte) {
    formReporte.addEventListener('submit', function(e) {
        e.preventDefault(); 
        const date = new Date();
        const nuevoReporte = {
            fecha: `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`,
            usuario: 'cliente@cetinvictus.com', 
            sensor: document.getElementById('reporteSensor').value,
            descripcion: document.getElementById('reporteDesc').value,
            estado: 'Pendiente'
        };
        const reportes = JSON.parse(localStorage.getItem('db_reportes'));
        reportes.push(nuevoReporte);
        localStorage.setItem('db_reportes', JSON.stringify(reportes));

        const modalEl = document.getElementById('modalReporte');
        const modalObj = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalObj.hide();
        formReporte.reset();
        window.renderizarReportes();
    });
}

window.marcarReporteRevisado = function(index) {
    const reportes = JSON.parse(localStorage.getItem('db_reportes'));
    reportes[index].estado = 'Revisado';
    localStorage.setItem('db_reportes', JSON.stringify(reportes));
    window.renderizarReportes();
};

if(document.getElementById('tabla-reportes-usuarios')) window.renderizarReportes();