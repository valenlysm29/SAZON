// ████████████████████████████████████████████████████████████████████
// cocina.js — Tablero de Cocina
// ████████████████████████████████████████████████████████████████████

import {
  supabase,
  logout,
  requireAuth,
  ocultarMenuPorRol,
  actualizarEstadoPedido,
  actualizarEstadoDetalle,
  suscribirPedidos,
  toast,
  handleSupabaseError,
} from './supabase.js';

// Estados para PEDIDOS (tabla: pedidos)
const ESTADOS_PEDIDO  = ['enviado','en preparacion','listo para servir','entregado'];

// Estados para ÍTEMS (tabla: pedido_detalle)
const ESTADOS_DETALLE = ['pendiente','en preparacion','listo para servir','entregado'];

const LABELS = {
  'enviado':             'Enviado',
  'pendiente':           'Pendiente',
  'en preparacion':      'En Preparación',
  'listo para servir':   'Listo ✓',
  'entregado':           'Entregado',
};

function nextEstadoPedido(actual) {
  const i = ESTADOS_PEDIDO.indexOf(actual);
  return ESTADOS_PEDIDO[Math.min(i + 1, ESTADOS_PEDIDO.length - 1)];
}

function nextEstadoDetalle(actual) {
  const i = ESTADOS_DETALLE.indexOf(actual);
  return ESTADOS_DETALLE[Math.min(i + 1, ESTADOS_DETALLE.length - 1)];
}

function estadoPillClass(e) {
  if (e === 'enviado')           return 'estado-pendiente';
  if (e === 'pendiente')         return 'estado-pendiente';
  if (e === 'en preparacion')    return 'estado-en-preparacion';
  if (e === 'listo para servir') return 'estado-listo';
  if (e === 'entregado')         return 'estado-entregado';
  return '';
}

// ── INIT ──────────────────────────────────────────────────────────
(async () => {
  const perfil = await requireAuth(['cocina', 'administrador']);
  if (!perfil) return;

  const navNombre = document.getElementById('nav-usuario-nombre');
  if (navNombre) navNombre.textContent = perfil.nombre;

  ocultarMenuPorRol(perfil.rol);

  const unsubscribe = () => {};

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    unsubscribe();
    await logout();
  });

  document.getElementById('btn-refresh-cocina')?.addEventListener('click', renderCocina);

  await renderCocina();

  const unsub = suscribirPedidos(async () => {
    await renderCocina();
  });
})();

// ── AVANZAR ESTADO DE UN ÍTEM ─────────────────────────────────────
window.avanzarItemEstado = async (detalleId, pedidoId) => {
  try {
    const { data: item, error } = await supabase
      .from('pedido_detalle').select('estado').eq('id', detalleId).single();
    if (error) throw error;

    const next = nextEstadoDetalle(item.estado);
    await actualizarEstadoDetalle(detalleId, next);

    // Si todos los ítems están "listo para servir" → avanzar pedido también
    const { data: todos, error: err2 } = await supabase
      .from('pedido_detalle').select('estado').eq('pedido_id', pedidoId);
    if (err2) throw err2;

    const todosListos = todos.every(it => it.estado === 'listo para servir');
    if (todosListos) await actualizarEstadoPedido(pedidoId, 'listo para servir');

    await renderCocina();
  } catch (e) { handleSupabaseError(e, 'avanzarItemEstado'); }
};

// ── AVANZAR ESTADO DE TODO EL PEDIDO ─────────────────────────────
window.avanzarPedidoEstado = async (pedidoId, estadoActual) => {
  try {
    const next = nextEstadoPedido(estadoActual);
    await actualizarEstadoPedido(pedidoId, next);

    // Sincronizar ítems (usando estados de detalle válidos)
    const nextDetalle = nextEstadoDetalle(
      next === 'en preparacion' ? 'pendiente' : next
    );
    await supabase
      .from('pedido_detalle')
      .update({ estado: next === 'en preparacion' ? 'en preparacion' : next })
      .eq('pedido_id', pedidoId)
      .neq('estado', 'entregado');

    await renderCocina();
  } catch (e) { handleSupabaseError(e, 'avanzarPedidoEstado'); }
};

// ── MARCAR ENTREGADO ──────────────────────────────────────────────
window.marcarEntregado = async (pedidoId) => {
  try {
    await actualizarEstadoPedido(pedidoId, 'entregado');
    await supabase
      .from('pedido_detalle')
      .update({ estado: 'entregado' })
      .eq('pedido_id', pedidoId);
    toast('Pedido marcado como entregado.', 'success');
    await renderCocina();
  } catch (e) { handleSupabaseError(e, 'marcarEntregado'); }
};

// ── RENDER COCINA ─────────────────────────────────────────────────
async function renderCocina() {
  const grid = document.getElementById('cocina-grid');
  if (!grid) return;

  try {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('*, pedido_detalle(*)')
      .not('estado', 'in', '(cancelado,entregado,pagado)')
      .order('fecha_hora', { ascending: true });
    if (error) throw error;

    const countEl = document.getElementById('cocina-count');
    if (countEl) countEl.textContent = `${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''} activo${pedidos.length !== 1 ? 's' : ''}`;

    if (!pedidos.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👨‍🍳</div><div class="empty-state-text">No hay pedidos en cocina. La calma es dorada.</div></div>`;
      return;
    }

    const prioVal = { urgente: 3, alta: 2, normal: 1 };
    pedidos.sort((a, b) => (prioVal[b.prioridad] || 1) - (prioVal[a.prioridad] || 1));

    grid.innerHTML = pedidos.map(p => {
      const isUrgente    = p.prioridad === 'urgente';
      const allAlergenos = [...new Set((p.pedido_detalle || []).flatMap(it => it.plato_alergenos || []))];
      return `
        <div class="cocina-card ${isUrgente ? 'urgente-card' : ''} animate-in">
          <div class="cocina-card-header">
            <div>
              <span class="badge badge-gold">${p.codigo}</span>
              <span style="margin-left:0.5rem;font-weight:700;font-size:1rem">Mesa ${p.mesa}</span>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">Mozo: ${p.mozo_nombre}</div>
              <div style="font-size:0.75rem;color:var(--text-muted)">${new Date(p.fecha_hora).toLocaleTimeString('es-PE')}</div>
            </div>
            <div style="text-align:right">
              ${isUrgente
                ? '<span class="badge badge-urgent">⚡ URGENTE</span>'
                : p.prioridad === 'alta'
                  ? '<span class="badge badge-orange">▲ Alta</span>'
                  : '<span class="badge badge-gray">Normal</span>'}
              <div style="margin-top:0.4rem">
                <span class="estado-pill ${estadoPillClass(p.estado)}">${LABELS[p.estado] || p.estado}</span>
              </div>
            </div>
          </div>

          ${allAlergenos.length ? `<div style="margin-bottom:0.75rem">${allAlergenos.map(a => `<span class="alergeno-tag">⚠ ${a}</span>`).join('')}</div>` : ''}

          <div>
            ${(p.pedido_detalle || []).map(it => `
              <div class="plato-row">
                <div style="flex:1">
                  <div style="font-size:0.88rem;color:var(--cream)">${it.cantidad}× ${it.plato_nombre}</div>
                  ${it.observacion ? `<div style="font-size:0.75rem;color:var(--gold);font-style:italic">💬 ${it.observacion}</div>` : ''}
                  ${it.plato_alergenos?.length ? `<div>${it.plato_alergenos.map(a => `<span class="alergeno-tag" style="font-size:0.68rem">⚠ ${a}</span>`).join('')}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem">
                  <span class="estado-pill ${estadoPillClass(it.estado)}" style="font-size:0.72rem">${LABELS[it.estado] || it.estado}</span>
                  ${it.estado !== 'entregado' && it.estado !== 'listo para servir'
                    ? `<button class="btn btn-outline btn-sm" onclick="avanzarItemEstado('${it.id}','${p.id}')">→ Avanzar</button>`
                    : ''}
                </div>
              </div>`).join('')}
          </div>

          <div style="margin-top:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
            ${p.estado !== 'listo para servir'
              ? `<button class="btn btn-gold btn-sm" onclick="avanzarPedidoEstado('${p.id}','${p.estado}')">↑ Avanzar pedido</button>`
              : ''}
            <button class="btn btn-success btn-sm" onclick="marcarEntregado('${p.id}')">✓ Entregado</button>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    handleSupabaseError(e, 'renderCocina');
    grid.innerHTML = `<div class="alert alert-danger" style="grid-column:1/-1">Error cargando pedidos de cocina.</div>`;
  }
}