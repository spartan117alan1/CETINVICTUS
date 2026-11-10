

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault(); 
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        
        if (email === 'admin@cetinvictus.com' && password === 'admin123') {
            sessionStorage.setItem('userRole', 'admin');
            window.location.href = 'dashboard.html';
        } 
        else if (email === 'cliente@cetinvictus.com' && password === 'cliente123') {
            sessionStorage.setItem('userRole', 'cliente');
            window.location.href = 'dashboard.html';
        } 
        else {
            document.getElementById('login-error').classList.remove('d-none');
        }
    });
}


const dashboardContainer = document.getElementById('estado-general');
if (dashboardContainer) {
    

    const currentUserRole = sessionStorage.getItem('userRole');
    
    if (!currentUserRole) {

        window.location.href = 'login.html';
    }

    if (currentUserRole !== 'admin') {
      
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.getElementById('user-role-badge').innerText = 'Rol: Cliente';
    } else {
        document.getElementById('user-role-badge').innerText = 'Rol: Admin';
    }

    const ctx = document.getElementById('graficaSensores');
    if (ctx) {
        new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: { 
                labels: ['10:00', '10:05', '10:10', '10:15'], 
                datasets: [{ label: 'Nivel pH', data: [7.1, 7.2, 7.2, 7.3], borderColor: '#0d6efd', tension: 0.3 }] 
            }
        });
    }
}


function cerrarSesion() {
    sessionStorage.removeItem('userRole'); 
    window.location.href = 'login.html';
}