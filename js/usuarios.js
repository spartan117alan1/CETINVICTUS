document.addEventListener('DOMContentLoaded', () => {
    const rol = sessionStorage.getItem('userRole');
    if (rol !== 'admin') {
        alert("Acceso denegado.");
        window.location.href = 'login.html';
    }
    cargarUsuarios();
});

let editandoId = null;

// 1. CARGAR USUARIOS DESDE SQLITE
async function cargarUsuarios() {
    try {
        const respuesta = await fetch('http://localhost:3000/api/usuarios');
        const usuarios = await respuesta.json();
        
        const tbody = document.getElementById('tabla-usuarios');
        tbody.innerHTML = '';

        usuarios.forEach(user => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-correo', (user.correo || '').toLowerCase());
            
            const badgeRol = user.rol === 'admin' ? '<span class="badge bg-danger">Admin</span>' : '<span class="badge bg-primary">Cliente</span>';
            
            tr.innerHTML = `
                <td class="fw-bold text-muted">#${user.id}</td>
                <td>${user.nombre || ''} ${user.apellido || ''}</td>
                <td>${user.correo}</td>
                <td>${user.telefono || 'N/A'}</td>
                <td>${badgeRol}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-secondary me-1" onclick='prepararEdicion(${JSON.stringify(user)})'>✏️ Editar</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarUsuario(${user.id}, '${user.correo}')">🗑️ Borrar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar usuarios:", error);
    }
}

// 2. BUSCADOR POR CORREO
function filtrarUsuarios() {
    const filtro = document.getElementById('inputBuscador').value.toLowerCase();
    const filas = document.querySelectorAll('#tabla-usuarios tr');

    filas.forEach(fila => {
        const correo = fila.getAttribute('data-correo');
        if (correo && correo.includes(filtro)) {
            fila.style.display = '';
        } else {
            fila.style.display = 'none';
        }
    });
}

// 3. ELIMINAR USUARIO (BLINDADO POR ID RAÍZ Y AUTO-ELIMINACIÓN)
async function eliminarUsuario(id, correoUsuario) {
    // 1. Obtener datos de la sesión actual
    const idSesionStr = sessionStorage.getItem('userId');
    const usuarioLogueadoId = idSesionStr ? parseInt(idSesionStr, 10) : null;
    const correoLogueado = sessionStorage.getItem('userEmail');
    
    // 2. Asegurar que el ID a borrar sea número
    const idObjetivo = parseInt(id, 10);

    // ==========================================
    // DEBUG: Ver qué está comparando (Abre F12 en tu navegador)
    console.log(`Intentando borrar ID: ${idObjetivo} (${correoUsuario})`);
    console.log(`Sesión Actual -> ID: ${usuarioLogueadoId} | Correo: ${correoLogueado}`);
    // ==========================================

    // REGLA A: Los IDs 1 y 2 son intocables
    if (idObjetivo === 1 || idObjetivo === 2) {
        alert(`⚠️ ¡Acción denegada! El usuario #${idObjetivo} (${correoUsuario}) es una cuenta raíz protegida.`);
        return;
    }

    // REGLA B: Bloqueo por ID (Si el ID de sesión coincide con el que queremos borrar)
    if (usuarioLogueadoId !== null && idObjetivo === usuarioLogueadoId) {
        alert(`⚠️ ¡Acción denegada por ID! No puedes eliminar tu propia cuenta mientras estás operando el sistema.`);
        return;
    }

    // REGLA C: Bloqueo por Correo (Si el correo coincide)
    if (correoLogueado && correoUsuario === correoLogueado) {
        alert(`⚠️ ¡Acción denegada por Correo! No puedes eliminar tu propia cuenta.`);
        return;
    }

    // Si pasa todas las validaciones, procedemos a borrar
    if (!confirm(`¿Estás seguro de eliminar al usuario #${idObjetivo} (${correoUsuario})?`)) return;

    try {
        const res = await fetch(`http://localhost:3000/api/usuarios/${idObjetivo}`, { method: 'DELETE' });
        if (res.ok) {
            alert("Usuario eliminado correctamente de la base de datos.");
            cargarUsuarios();
        } else {
            alert("No se pudo eliminar el usuario.");
        }
    } catch (e) {
        console.error("Error al borrar:", e);
        alert("Error de conexión con el servidor.");
    }
}

// 4. FUNCIONES DE FORMULARIO REINTEGRADAS

// Ocultar/Mostrar campos específicos según el Rol
window.toggleCamposCliente = function() {
    const rol = document.getElementById('rolUsuario').value;
    const divCliente = document.getElementById('camposCliente');
    
    if (rol === 'admin') {
        divCliente.style.display = 'none';
        // Quitar required para que deje guardar al Admin
        const estadoInput = document.getElementById('estadoUsuario');
        const coloniaInput = document.getElementById('coloniaUsuario');
        if(estadoInput) estadoInput.removeAttribute('required');
        if(coloniaInput) coloniaInput.removeAttribute('required');
    } else {
        divCliente.style.display = 'block';
        const estadoInput = document.getElementById('estadoUsuario');
        const coloniaInput = document.getElementById('coloniaUsuario');
        if(estadoInput) estadoInput.setAttribute('required', 'true');
        if(coloniaInput) coloniaInput.setAttribute('required', 'true');
    }
};

// Evaluador de Fortaleza de Contraseña
window.evaluarPassword = function() {
    const pass = document.getElementById('passUsuario').value;
    const bar = document.getElementById('passStrengthBar');
    const txt = document.getElementById('passStrengthText');
    
    if (!pass) {
        if(bar) bar.style.width = '0%';
        if(txt) {
            txt.innerText = 'Demasiado corta';
            txt.className = 'text-danger mt-1 d-block';
        }
        return;
    }

    let fortaleza = 0;
    if (pass.length > 5) fortaleza += 25; 
    if (pass.match(/[A-Z]/)) fortaleza += 25; 
    if (pass.match(/[0-9]/)) fortaleza += 25; 
    if (pass.match(/[^a-zA-Z\d]/)) fortaleza += 25; 

    if(bar) bar.style.width = fortaleza + '%';

    if (fortaleza <= 25) {
        if(bar) bar.className = 'progress-bar bg-danger';
        if(txt) {
            txt.className = 'text-danger mt-1 d-block';
            txt.innerText = 'Débil: Agrega mayúsculas, números o símbolos.';
        }
    } else if (fortaleza <= 75) {
        if(bar) bar.className = 'progress-bar bg-warning';
        if(txt) {
            txt.className = 'text-warning text-dark mt-1 d-block';
            txt.innerText = 'Media: Vas por buen camino.';
        }
    } else {
        if(bar) bar.className = 'progress-bar bg-success';
        if(txt) {
            txt.className = 'text-success mt-1 d-block';
            txt.innerText = '¡Fuerte y Segura!';
        }
    }
};

// 5. PREPARAR MODAL PARA EDITAR
window.prepararEdicion = function(user) {
    editandoId = user.id; 

    document.getElementById('rolUsuario').value = user.rol;
    
    // Llamar a la función para ocultar/mostrar campos
    toggleCamposCliente();
    
    document.getElementById('nombreUsuario').value = user.nombre || '';
    document.getElementById('apellidoUsuario').value = user.apellido || '';
    document.getElementById('edadUsuario').value = user.edad || '';
    document.getElementById('telefonoUsuario').value = user.telefono || '';
    document.getElementById('correoUsuario').value = user.correo || '';
    
    // Al editar, dejamos la contraseña vacía a menos que decidan cambiarla
    document.getElementById('passUsuario').value = ''; 
    evaluarPassword(); // Limpiar el indicador visual
    
    if (user.rol === 'cliente') {
        if(user.compania) document.getElementById('companiaUsuario').value = user.compania;
        if(user.estado) document.getElementById('estadoUsuario').value = user.estado;
        if(user.colonia) document.getElementById('coloniaUsuario').value = user.colonia;
    }

    const modalEl = document.getElementById('modalNuevoUsuario');
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
};

// 6. GUARDAR (CREAR O ACTUALIZAR)
document.getElementById('formUsuario').addEventListener('submit', async function(e) {
    e.preventDefault();

    // Verificación de fortaleza mínima (solo obligatoria al crear, al editar puede estar vacía si no cambian la contraseña)
    const pass = document.getElementById('passUsuario').value;
    if (editandoId === null && pass.length < 6) {
        alert("La contraseña debe ser al menos de Nivel Medio para asegurar el sistema.");
        return;
    }

    const datosUsuario = {
        rol: document.getElementById('rolUsuario').value,
        nombre: document.getElementById('nombreUsuario').value,
        apellido: document.getElementById('apellidoUsuario').value,
        edad: parseInt(document.getElementById('edadUsuario').value) || null,
        telefono: document.getElementById('telefonoUsuario').value,
        correo: document.getElementById('correoUsuario').value,
        password: pass, 
        compania: document.getElementById('rolUsuario').value === 'admin' ? null : document.getElementById('companiaUsuario').value,
        estado: document.getElementById('rolUsuario').value === 'admin' ? null : document.getElementById('estadoUsuario').value,
        colonia: document.getElementById('rolUsuario').value === 'admin' ? null : document.getElementById('coloniaUsuario').value
    };

    // Si editamos y no pusieron contraseña, eliminamos ese campo del objeto para que el backend no lo sobreescriba con vacío (requiere ajuste en backend)
    if (editandoId !== null && !pass) {
        delete datosUsuario.password;
    }

    try {
        let url = 'http://localhost:3000/api/usuarios';
        let method = 'POST';

        if (editandoId !== null) {
            url = `http://localhost:3000/api/usuarios/${editandoId}`;
            method = 'PUT';
        }

        const respuesta = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosUsuario)
        });

        const resultado = await respuesta.json();
        if (!respuesta.ok) {
            alert(`Error: ${resultado.error}`);
            return;
        }

        alert(editandoId !== null ? "¡Usuario actualizado con éxito!" : "¡Usuario registrado con éxito!");
        
        editandoId = null;
        const modalEl = document.getElementById('modalNuevoUsuario');
        const modalObj = bootstrap.Modal.getInstance(modalEl);
        if (modalObj) modalObj.hide();
        
        this.reset();
        evaluarPassword(); // Limpiar el indicador visual tras guardar
        cargarUsuarios();

    } catch (error) {
        console.error(error);
        alert("Error de conexión con el servidor.");
    }
});

// Limpiar el estado si cierran el modal sin guardar
const modalElement = document.getElementById('modalNuevoUsuario');
if (modalElement) {
    modalElement.addEventListener('hidden.bs.modal', function () {
        editandoId = null;
        document.getElementById('formUsuario').reset();
        evaluarPassword(); // Limpiar el indicador visual al cancelar
        toggleCamposCliente(); // Restaurar campos por defecto
    });
}