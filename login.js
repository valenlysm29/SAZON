// ████████████████████████████████████████████████████████████████████
// login.js — Acceso al Sistema
// ████████████████████████████████████████████████████████████████████

import {
  supabase,
  login,
  registrar,
  getMiPerfil,
  toast,
  handleSupabaseError
} from './supabase.js';

let currentTab = 'login';

document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('tab-login')?.addEventListener('click', () => { currentTab = 'login'; });
  document.getElementById('tab-registro')?.addEventListener('click', () => { currentTab = 'registro'; });

  // ── LOGIN ─────────────────────────────────────────────────────────
  document.getElementById('btn-login')?.addEventListener('click', async () => {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      toast('Completa todos los campos.', 'error');
      return;
    }

    const btn = document.getElementById('btn-login');
    btn.textContent = 'Ingresando…';
    btn.disabled = true;

    try {
      await login(email, password);
      toast('¡Bienvenido de vuelta!', 'success');
      await procesarRedireccionUsuario();
    } catch (e) {
      toast(e.message || 'Error al iniciar sesión', 'error');
      btn.textContent = '✦ Ingresar al Sistema';
      btn.disabled = false;
    }
  });

  // ── REGISTRO ──────────────────────────────────────────────────────
  document.getElementById('btn-registro')?.addEventListener('click', async () => {
    const nombre   = document.getElementById('reg-nombre').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const rol      = document.getElementById('reg-rol').value;

    // Limpiar errores previos
    ['reg-nombre', 'reg-email', 'reg-password', 'reg-confirm'].forEach(id => {
      document.getElementById(id)?.classList.remove('invalid');
      const err = document.getElementById(id + '-err');
      if (err) { err.textContent = ''; err.classList.remove('visible'); }
    });

    let ok = true;

    const setErr = (campo, msg) => {
      document.getElementById(campo)?.classList.add('invalid');
      const err = document.getElementById(campo + '-err');
      if (err) { err.textContent = msg; err.classList.add('visible'); }
      ok = false;
    };

    if (!nombre || nombre.length < 3)    setErr('reg-nombre',   'Ingresa tu nombre completo (mín. 3 caracteres).');
    if (!email)                           setErr('reg-email',    'Ingresa un correo electrónico válido.');
    if (!password || password.length < 6) setErr('reg-password', 'La contraseña debe tener al menos 6 caracteres.');
    if (!confirm)                         setErr('reg-confirm',  'Confirma tu contraseña.');
    else if (password !== confirm)        setErr('reg-confirm',  'Las contraseñas no coinciden.');

    if (!ok) return;

    const btn = document.getElementById('btn-registro');
    btn.textContent = 'Creando cuenta…';
    btn.disabled = true;

    try {
      await registrar(email, password, nombre, rol);
      toast('✓ Personal registrado. Iniciando sesión...', 'success');
      await login(email, password);
      await procesarRedireccionUsuario();
    } catch (e) {
      toast(e.message || 'Error al registrar usuario', 'error');
      btn.textContent = 'Registrar Personal';
      btn.disabled = false;
    }
  });

  // ── ENTER ─────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (document.activeElement.tagName === 'SELECT') return;
      if (currentTab === 'login') {
        document.getElementById('btn-login')?.click();
      } else {
        document.getElementById('btn-registro')?.click();
      }
    }
  });
});

// ── REDIRECCIÓN POR ROL ───────────────────────────────────────────
async function procesarRedireccionUsuario() {
  setTimeout(async () => {
    try {
      const perfil = await getMiPerfil();
      if (!perfil) { window.location.href = 'index.html'; return; }

      switch (perfil.role || perfil.rol) {
        case 'administrador': window.location.href = 'index.html';        break;
        case 'mozo':          window.location.href = 'pedidos.html';      break;
        case 'cocina':        window.location.href = 'cocina.html';       break;
        case 'caja':          window.location.href = 'facturacion.html';  break;
        default:              window.location.href = 'index.html';
      }
    } catch (err) {
      console.error('Error en redirección:', err);
      window.location.href = 'index.html';
    }
  }, 1000);
}