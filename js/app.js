/* =========================================
   LÓGICA PRINCIPAL - CETINVICTUS
========================================= */

// --- LÓGICA DE LOGIN ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        if (email === 'admin@cetinvictus.com' && password === 'admin123') {
            sessionStorage.setItem('userRole', 'admin');
            window.location.href = 'dashboard.html';
        } else if (email === 'cliente@cetinvictus.com' && password === 'cliente123') {
            sessionStorage.setItem('userRole', 'cliente');
            window.location.href = 'dashboard.html';
        } else {
            document.getElementById('login-error').classList.remove('d-none');
        }
    });
}

// --- FUNCIÓN GLOBAL PARA SALIR ---
window.cerrarSesion = function() {
    sessionStorage.removeItem('userRole');
    window.location.href = 'login.html';
};

// --- LÓGICA DEL DASHBOARD ---
const dashboardContainer = document.getElementById('estado-general');
if (dashboardContainer) {
    
    // 1. Validar sesión y aplicar roles
    const currentUserRole = sessionStorage.getItem('userRole');
    if (!currentUserRole) window.location.href = 'login.html';

    if (currentUserRole !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        const badge = document.getElementById('user-role-badge');
        if(badge) badge.innerText = 'Rol: Cliente';
    } else {
        const badge = document.getElementById('user-role-badge');
        if(badge) badge.innerText = 'Rol: Admin';
    }

    // 2. Inicializar Gráficas (Chart.js)
    
    // Gráfica de Línea (Tendencia)
    const ctxLinea = document.getElementById('graficaSensores');
    let chartLinea = null;
    if (ctxLinea) {
        chartLinea = new Chart(ctxLinea.getContext('2d'), {
            type: 'line',
            data: { 
                labels: [], 
                datasets: [
                    { label: 'pH', data: [], borderColor: '#0d6efd', tension: 0.3, yAxisID: 'y' },
                    { label: 'Turbidez (NTU)', data: [], borderColor: '#198754', tension: 0.3, yAxisID: 'y1' },
                    { label: 'Cloro (mg/L)', data: [], borderColor: '#ffc107', tension: 0.3, yAxisID: 'y1' }
                ] 
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', min: 0, max: 14, title: { display: true, text: 'Nivel pH'} },
                    y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'NTU / mg/L'} }
                }
            }
        });
    }

    // Gráfica Doughnut (Pastel - Índice de Calidad)
    const ctxPastel = document.getElementById('graficaCalidad');
    let chartPastel = null;
    if (ctxPastel) {
        chartPastel = new Chart(ctxPastel.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Calidad Óptima (%)', 'Desviación (%)'],
                datasets: [{
                    data: [100, 0],
                    backgroundColor: ['#005C53', '#dc3545'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%' }
        });
    }

    // 3. Función para procesar el JSON del sensor
    window.procesarDatosIoT = function(payload) {
        // Formatear timestamp a hora local
        const date = new Date(payload.ts * 1000);
        const hora = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        // A. Actualizar Tarjetas KPI (Usando las variables de tu JSON)
        if(document.getElementById('val-ph')) document.getElementById('val-ph').innerText = payload.metrics.ph;
        if(document.getElementById('val-turbidez')) document.getElementById('val-turbidez').innerText = payload.metrics.turbidity_ntu;
        if(document.getElementById('val-cloro')) document.getElementById('val-cloro').innerText = payload.metrics.chlorine_mg_l;
        if(document.getElementById('val-flujo')) document.getElementById('val-flujo').innerText = payload.metrics.flow_lps;

        // Validar niveles de Cloro (Alerta si es menor a 0.2 o mayor a 1.5)
        const cardCloro = document.getElementById('card-cloro');
        if (cardCloro) {
            if (payload.metrics.chlorine_mg_l < 0.2 || payload.metrics.chlorine_mg_l > 1.5) {
                cardCloro.className = 'card kpi-card bg-alert text-center p-3';
            } else {
                cardCloro.className = 'card kpi-card bg-optimal text-center p-3';
            }
        }

        // B. Actualizar Gráfica de Línea
        if (chartLinea) {
            chartLinea.data.labels.push(hora);
            chartLinea.data.datasets[0].data.push(payload.metrics.ph);           // Azul
            chartLinea.data.datasets[1].data.push(payload.metrics.turbidity_ntu); // Verde
            chartLinea.data.datasets[2].data.push(payload.metrics.chlorine_mg_l); // Amarillo
            
            if(chartLinea.data.labels.length > 10) {
                chartLinea.data.labels.shift();
                chartLinea.data.datasets.forEach(dataset => dataset.data.shift());
            }
            chartLinea.update();
        }

        // C. Actualizar Gráfica Circular (Índice de calidad basado en pH y Turbidez)
        if (chartPastel) {
            // Un pH de 7.2 es ideal. Si se aleja, baja la pureza.
            let desviacionPh = Math.abs(7.2 - payload.metrics.ph) * 10;
            let penalizacionTurbidez = payload.metrics.turbidity_ntu * 5;
            
            let indicePureza = 100 - (desviacionPh + penalizacionTurbidez); 
            if (indicePureza < 0) indicePureza = 0;
            if (indicePureza > 100) indicePureza = 100;
            
            chartPastel.data.datasets[0].data = [indicePureza.toFixed(1), (100 - indicePureza).toFixed(1)];
            
            if (indicePureza < 75) {
                chartPastel.data.datasets[0].backgroundColor = ['#dc3545', '#f8d7da']; // Rojo
                document.getElementById('estado-general').className = 'badge bg-danger fs-6';
                document.getElementById('estado-general').innerText = 'Alerta en Red';
            } else {
                chartPastel.data.datasets[0].backgroundColor = ['#005C53', '#e9ecef']; // Verde oscuro
                document.getElementById('estado-general').className = 'badge bg-success fs-6';
                document.getElementById('estado-general').innerText = 'Red Estable';
            }
            chartPastel.update();
        }

        // D. Alertas Inteligentes basadas en Sensors Health (Solo para Admin)
        if (currentUserRole === 'admin') {
            if (payload.sensors_health.turbidity_status === "WARNING_DIRTY") {
                console.warn(`MANTENIMIENTO REQUERIDO: El lente de turbidez está al ${payload.sensors_health.turbidity_lens_cleanliness_pct}% de limpieza.`);
            }
        }
    };
    // ==========================================
    // SIMULACIÓN DE DATOS (Para pruebas sin hardware)
    // ==========================================
    /*setInterval(() => {
        const payloadPrueba = {
            "ts": Math.floor(Date.now() / 1000),
            "metrics": {
                "ph": +(7.21 + (Math.random() * 0.2 - 0.1)).toFixed(2), // Fluctúa un poco el pH
                "turbidity_ntu": +(1.45 + (Math.random() * 0.5)).toFixed(2),
                "chlorine_mg_l": +(0.82 + (Math.random() * 0.3 - 0.15)).toFixed(2),
                "flow_lps": + (12.5 + (Math.random() * 2 - 1)).toFixed(2)
            },
            "sensors_health": {
                "ph_electrode_mv": 12.4, 
                "ph_status": "OK",
                "turbidity_lens_cleanliness_pct": 88.5,
                "turbidity_status": "WARNING_DIRTY",
                "days_since_last_calibration": 45,
                "internal_temp_c": 26.4
            },
            "diagnostics": {
                "battery_v": 3.85,
                "rssi_dbm": -72,
                "free_heap_bytes": 142000
            }
        };
        window.procesarDatosIoT(payloadPrueba);
    }, 3000); */

    // ==========================================
    // CONEXIÓN REAL AL BACKEND VÍA SSE
    // ==========================================
    const sseURL = 'http://localhost:3000/api/stream'; // Cambia localhost por la IP de tu server escolar si es necesario
    const eventSource = new EventSource(sseURL);

    eventSource.onmessage = function(event) {
        // Cada vez que el backend emita (cuando llegue un MQTT), esta función se dispara
        const payloadReal = JSON.parse(event.data);
        console.log("Dato recibido por SSE:", payloadReal);
        
        // Llamamos a la función que ya construimos y que actualiza todo el HTML
        window.procesarDatosIoT(payloadReal);
    };

    eventSource.onerror = function(err) {
        console.error("Error en conexión SSE. Reintentando...", err);
        // EventSource intentará reconectarse automáticamente
    };
}

// --- FUNCIÓN PARA GENERAR PDF ---
window.generarReportePDF = function() {
    const elemento = document.getElementById('area-reporte');
    if (!elemento) {
        alert("El área del reporte no fue encontrada en el HTML.");
        return;
    }
    
    const opciones = {
        margin:       10,
        filename:     'Reporte_Calidad_Agua_CETINVICTUS.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    html2pdf().set(opciones).from(elemento).save();
};