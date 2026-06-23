// ████████████████████████████████████████████████████████████████████
// SUPABASE.JS - ARCHIVO MAESTRO COMPLETO
// ████████████████████████████████████████████████████████████████████

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://jehzewomaiteullhbclo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplaHpld29tYWl0ZXVsbGhiY2xvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NzczMjgsImV4cCI6MjA5NzA1MzMyOH0.b0VpV6ErX1fs5RIZ2HICD7d-itLI-wpEjUScmRHgqIo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── AUTH ────────────────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function registrar(email, password, nombre, rol) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nombre, rol },
      emailRedirectTo: 'https://valenlysm29.github.io/SAZON/login.html'
    },
  });
  if (error) throw error;
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// ── SEGURIDAD Y PERFILES ────────────────────────────────────────────
export async function getMiPerfil() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase.from('usuarios_perfil').select('*').eq('user_id', session.user.id).single();
  return error ? null : data;
}

export async function requireAuth(rolesPermitidos = []) {
  const { data: { session } } = await supabase.auth.getSession();
  
  // 1. Si no hay sesión, ir al login
  if (!session) { window.location.href = 'login.html'; return null; }
  
  const perfil = await getMiPerfil();
  
  // 2. Si no hay perfil, cerrar sesión e ir al login
  if (!perfil) { await supabase.auth.signOut(); window.location.href = 'login.html'; return null; }
  
  // 3. Si el rol no está permitido, redirigir a SU página de trabajo (NO al login)
  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(perfil.rol)) {
    console.log("Acceso denegado para:", perfil.rol); // Para ver el error en consola F12
    const RUTA_POR_ROL = { 
        administrador: 'index.html', 
        mozo: 'pedidos.html', 
        cocina: 'cocina.html', 
        caja: 'facturacion.html' 
    };
    
    // Si el rol existe, redirige; si no, manda al login para evitar bucles
    const destino = RUTA_POR_ROL[perfil.rol] || 'login.html';
    if (window.location.pathname !== '/' + destino) {
        window.location.href = destino;
    }
    return null;
  }
  
  return perfil;
}

// ── PLATOS ────────────────────────────────────────────────────────
export async function getPlatos(soloActivos = false) {
  let q = supabase.from('platos').select('*').order('codigo', { ascending: true });
  if (soloActivos) q = q.eq('estado', 'activo');
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function crearPlato(plato) {
  const perfil = await getMiPerfil();
  const { data, error } = await supabase.from('platos').insert({ ...plato, creado_por: perfil?.user_id }).select().single();
  if (error) throw error;
  return data;
}

export async function actualizarPlato(id, cambios) {
  const { data, error } = await supabase.from('platos').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function eliminarPlato(id) {
  const { count } = await supabase.from('pedido_detalle').select('*', { count: 'exact', head: true }).eq('plato_id', id);
  if (count > 0) throw new Error('El plato tiene pedidos asociados.');
  const { error } = await supabase.from('platos').delete().eq('id', id);
  if (error) throw error;
}

export async function getSiguienteCodigoPlato() {
  const { data } = await supabase.from('platos').select('codigo').order('fecha_creacion', { ascending: false }).limit(1);
  if (!data || !data.length) return 'PL001';
  const ultimo = parseInt((data[0].codigo || '').replace('PL', '')) || 0;
  return 'PL' + String(ultimo + 1).padStart(3, '0');
}

// ── PEDIDOS Y FACTURAS ──────────────────────────────────────────────
export async function getPedidos(filtros = {}) {
  let q = supabase.from('pedidos').select('*, pedido_detalle(*)').order('fecha_hora', { ascending: false });
  if (filtros.estado) q = q.eq('estado', filtros.estado);
  if (filtros.mesa) q = q.eq('mesa', filtros.mesa);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function crearPedido(pedidoData, items) {
  const { data: { session } } = await supabase.auth.getSession();
  const perfil = await getMiPerfil();
  const { data: last } = await supabase.from('pedidos').select('codigo').order('fecha_hora', { ascending: false }).limit(1);
  const ultimo = last?.length ? parseInt((last[0].codigo || '').replace('PED', '')) || 0 : 0;
  const codigo = 'PED' + String(ultimo + 1).padStart(3, '0');
  const total = items.reduce((acc, it) => acc + it.precio_unitario * it.cantidad, 0);
  
  const { data: pedido, error: pedidoErr } = await supabase.from('pedidos').insert({
    codigo, mozo_id: session.user.id, mozo_nombre: perfil?.nombre || 'Sin nombre',
    mesa: pedidoData.mesa, prioridad: pedidoData.prioridad, estado: 'enviado', total,
  }).select().single();
  if (pedidoErr) throw pedidoErr;

  const detalles = items.map(it => ({ pedido_id: pedido.id, plato_id: it.plato_id, plato_nombre: it.plato_nombre, cantidad: it.cantidad, precio_unitario: it.precio_unitario, estado: 'pendiente' }));
  const { error: detErr } = await supabase.from('pedido_detalle').insert(detalles);
  if (detErr) throw detErr;
  return pedido;
}

export async function actualizarEstadoPedido(pedidoId, nuevoEstado) {
  const { error } = await supabase.from('pedidos').update({ estado: nuevoEstado }).eq('id', pedidoId);
  if (error) throw error;
}

export async function actualizarEstadoDetalle(detalleId, nuevoEstado) {
  const { error } = await supabase.from('pedido_detalle').update({ estado: nuevoEstado }).eq('id', detalleId);
  if (error) throw error;
}

export async function getFacturas() {
  const { data, error } = await supabase.from('facturas').select('*').order('fecha_pago', { ascending: false });
  if (error) throw error;
  return data;
}

export async function crearFactura(facturaData) {
  const { data: last } = await supabase.from('facturas').select('codigo').order('fecha_pago', { ascending: false }).limit(1);
  const ultimo = last?.length ? parseInt((last[0].codigo || '').replace('FAC', '')) || 0 : 0;
  const codigo = 'FAC' + String(ultimo + 1).padStart(3, '0');
  const { data, error } = await supabase.from('facturas').insert({ ...facturaData, codigo }).select().single();
  if (error) throw error;
  return data;
}
export async function getMesaYaPagada(mesa) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id')
    .eq('mesa', mesa)
    .eq('estado', 'pagado')
    .limit(1);
  
  if (error) throw error;
  return data && data.length > 0;
}

// ── UTILIDADES ────────────────────────────────────────────────────
export function toast(msg, type = 'info', duration = 3000) {
  const icons = { success: '✓', error: '✕', info: '◆' };
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || '◆'}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, duration);
}

export function openModal(id) { document.getElementById(id)?.classList.add('open'); }
export function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
export function fmtMoney(n) { return 'S/ ' + Number(n).toFixed(2); }
export function handleSupabaseError(error, contexto = '') {
  console.error(`[Sazón Error] ${contexto}:`, error);
  toast(error.message || 'Error inesperado.', 'error', 5000);
}
export function ocultarMenuPorRol(rol) {
  const permitidos = {
    administrador: ['nav-dashboard','nav-platos','nav-pedidos','nav-cocina','nav-facturacion'],
    mozo: ['nav-pedidos'],
    cocina: ['nav-cocina'],
    caja: ['nav-facturacion']
  }[rol] || [];
  ['nav-dashboard','nav-platos','nav-pedidos','nav-cocina','nav-facturacion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = permitidos.includes(id) ? '' : 'none';
  });
}


export async function cancelarPedido(pedidoId) {
  const { error } = await supabase
    .from('pedidos')
    .update({ estado: 'cancelado' })
    .eq('id', pedidoId);
  if (error) throw error;
}

export function suscribirPedidos(callback) {
  const channel = supabase
    .channel('pedidos-realtime')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'pedidos' }, 
      callback
    )
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'pedido_detalle' }, 
      callback
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
