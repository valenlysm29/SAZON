// ████████████████████████████████████████████████████████████████████
// pedidos.js — Módulo Toma de Pedidos
// ████████████████████████████████████████████████████████████████████

// ✅ Importaciones ESTÁTICAS
import {
  logout,
  requireAuth,
  ocultarMenuPorRol,
  getPlatos,
  getPedidos,
  crearPedido,
  cancelarPedido,
  toast,
  fmtMoney,
  handleSupabaseError,
} from './supabase.js';

let currentItems = [];

// ── INIT ÚNICO ────────────────────────────────────────────────────
(async () => {
  const perfil = await requireAuth(['mozo', 'administrador']);
  if (!perfil) return;

  const navNombre = document.getElementById('nav-usuario-nombre');
  if (navNombre) navNombre.textContent = perfil.nombre;
  ocultarMenuPorRol(perfil.rol);

  // Prellenar mozo con nombre del perfil de forma automática
  const mozoEl = document.getElementById('pedido-mozo');
  if (mozoEl) {
    mozoEl.value = perfil.nombre;
    // Si es rol mozo, bloqueamos el input para evitar suplantaciones
    if (perfil.rol === 'mozo') mozoEl.disabled = true;
  }

  // ✅ Logout con importación estática, llamada directa
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await logout();
  });

  document.getElementById('pedido-prioridad')?.addEventListener('change', handlePriorityChange);
  document.getElementById('btn-add-plato')?.addEventListener('click', addPlato);
  document.getElementById('btn-enviar-pedido')?.addEventListener('click', savePedido);

  // Marcar link activo en la barra de navegación
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === 'pedidos.html') a.classList.add('active');
  });

  await populatePlatoSelect();
  renderItems();
  await renderPedidosList();
})();

// ── POBLAR SELECT ─────────────────────────────────────────────────
async function populatePlatoSelect() {
  const sel = document.getElementById('plato-select');
  if (!sel) return;
  try {
    const platos = await getPlatos(true);
    sel.innerHTML = '<option value="">— Seleccionar plato activo —</option>' +
      platos.map(p =>
        `<option value="${p.id}"
          data-precio="${p.precio}"
          data-nombre="${p.nombre}"
          data-alergenos='${JSON.stringify(p.alergenos || [])}'>
          ${p.nombre} (${fmtMoney(p.precio)})
        </option>`
      ).join('');
  } catch (e) { handleSupabaseError(e, 'populatePlatoSelect'); }
}

// ── AGREGAR PLATO AL CARRITO TEMPORAL ─────────────────────────────
function addPlato() {
  const sel = document.getElementById('plato-select');
  if (!sel?.value) { toast('Selecciona un plato.', 'error'); return; }
  const opt = sel.selectedOptions[0];
  
  // Si el plato ya existe en la lista temporal, sumamos cantidad en vez de duplicar fila
  const existente = currentItems.find(it => it.plato_id === sel.value);
  if (existente) {
    existente.cantidad += 1;
  } else {
    currentItems.push({
      plato_id:        sel.value,
      plato_nombre:    opt.dataset.nombre,
      precio_unitario: parseFloat(opt.dataset.precio),
      plato_alergenos: JSON.parse(opt.dataset.alergenos || '[]'),
      cantidad:        1,
      observacion:     '',
    });
  }
  
  sel.value = '';
  renderItems();
}

// ── RENDER ITEMS SELECCIONADOS ────────────────────────────────────
function renderItems() {
  const wrap = document.getElementById('items-wrap');
  if (!wrap) return;
  if (!currentItems.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1rem">Sin platos agregados</p>';
    updateTotal(); return;
  }
  wrap.innerHTML = currentItems.map((it, i) => {
    const sub = it.precio_unitario * it.cantidad;
    return `
      <div class="pedido-item animate-in" style="background:rgba(255,255,255,0.01); padding:0.75rem; border-radius:4px; margin-bottom:0.75rem; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
        <div class="pedido-item-info" style="flex:1; padding-right:1rem;">
          <div class="pedido-item-nombre" style="font-size:0.88rem; color:var(--cream); font-weight:600;">${it.plato_nombre}</div>
          <div class="pedido-item-precio" style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.4rem;">${fmtMoney(it.precio_unitario)} c/u</div>
          <div class="pedido-item-qty" style="display:flex; align-items:center; gap:0.4rem;">
            <button class="btn btn-outline btn-sm" style="padding:0.1rem 0.4rem;" onclick="changeQty(${i},-1)">−</button>
            <span class="qty-value" style="font-size:0.85rem; color:var(--cream); min-width:20px; text-align:center;">${it.cantidad}</span>
            <button class="btn btn-outline btn-sm" style="padding:0.1rem 0.4rem;" onclick="changeQty(${i},1)">+</button>
          </div>
          <input type="text" class="form-control" style="margin-top:0.5rem; padding:0.2rem 0.4rem !important; font-size:0.78rem;"
            placeholder="Obs: sin cebolla, término medio..."
            value="${it.observacion}"
            oninput="setObs(${i},this.value)">
        </div>
        <div class="pedido-item-total" style="text-align:right;">
          <div class="pedido-item-subtotal" style="font-size:0.85rem; color:var(--gold-pale); font-weight:500;">${fmtMoney(sub)}</div>
          <button class="btn btn-outline btn-sm" style="margin-top:0.5rem; color:var(--text-muted); padding:0.1rem 0.4rem;" onclick="removeItem(${i})">✕</button>
        </div>
      </div>`;
  }).join('');
  updateTotal();
}

function updateTotal() {
  const total = currentItems.reduce((acc, it) => acc + it.precio_unitario * it.cantidad, 0);
  const el = document.getElementById('pedido-total');
  if (el) el.textContent = fmtMoney(total);
}

window.changeQty  = (i, d) => { currentItems[i].cantidad = Math.max(1, currentItems[i].cantidad + d); renderItems(); };
window.setObs     = (i, v) => { currentItems[i].observacion = v; };
window.removeItem = (i)    => { currentItems.splice(i, 1); renderItems(); };

// ── MANEJO VISUAL DE PRIORIDAD ────────────────────────────────────
function handlePriorityChange() {
  const val   = document.getElementById('pedido-prioridad')?.value;
  const jWrap = document.getElementById('justificacion-wrap');
  if (jWrap) jWrap.style.display = val === 'urgente' ? 'block' : 'none';
}

// ── VALIDACIÓN DE ENTRADAS ────────────────────────────────────────
function validatePedido() {
  let ok = true;

  const setErr = (campo, msg, show) => {
    document.getElementById(campo)?.classList.toggle('invalid', show);
    const e = document.getElementById(campo + '-err');
    if (e) { e.textContent = show ? msg : ''; e.classList.toggle('visible', show); }
  };

  const mesaVal = parseInt(document.getElementById('pedido-mesa')?.value);
  if (!mesaVal || mesaVal < 1 || mesaVal > 50) { setErr('pedido-mesa', 'Mesa entre 1 y 50.', true); ok = false; }
  else setErr('pedido-mesa', '', false);

  const mozoVal = document.getElementById('pedido-mozo')?.value.trim() || '';
  if (mozoVal.length < 3) { setErr('pedido-mozo', 'Nombre del mozo mín 3 caracteres.', true); ok = false; }
  else setErr('pedido-mozo', '', false);

  const prio = document.getElementById('pedido-prioridad')?.value;
  const just = document.getElementById('pedido-justificacion')?.value.trim() || '';
  if (prio === 'urgente' && just.length < 10) {
    setErr('pedido-justificacion', 'Justificación mín 10 caracteres.', true); ok = false;
  } else setErr('pedido-justificacion', '', false);

  if (!currentItems.length) { toast('Agrega al menos un plato.', 'error'); ok = false; }
  return ok;
}

// ── GUARDAR PEDIDO EN BASE DE DATOS ───────────────────────────────
async function savePedido() {
  if (!validatePedido()) return;
  const btn = document.getElementById('btn-enviar-pedido');
  btn.textContent = 'Enviando comandas…'; btn.disabled = true;
  try {
    const pedido = await crearPedido(
      {
        mesa:           parseInt(document.getElementById('pedido-mesa').value),
        mozo_nombre:    document.getElementById('pedido-mozo').value.trim(),
        prioridad:      document.getElementById('pedido-prioridad').value,
        justificacion:  document.getElementById('pedido-justificacion')?.value.trim() || null,
      },
      currentItems
    );
    toast(`✓ Pedido ${pedido.codigo} enviado a cocina correctamente.`, 'success');
    
    // Limpieza completa del estado tras guardar con éxito
    currentItems = [];
    document.getElementById('pedido-mesa').value = '';
    document.getElementById('pedido-prioridad').value = 'normal';
    const just = document.getElementById('pedido-justificacion');
    if (just) just.value = '';
    document.getElementById('justificacion-wrap').style.display = 'none';
    
    renderItems();
    await renderPedidosList();
  } catch (e) {
    handleSupabaseError(e, 'savePedido');
  } finally {
    btn.textContent = '✦ Enviar a Cocina'; btn.disabled = false;
  }
}

// ── CANCELAR COMANDA (Global para onclick) ────────────────────────
window.cancelarPedido = async (id) => {
  if (!confirm('¿Está seguro de que desea cancelar este pedido?')) return;
  try {
    await cancelarPedido(id);
    toast('Pedido cancelado correctamente.', 'info');
    await renderPedidosList();
  } catch (e) { handleSupabaseError(e, 'cancelarPedido'); }
};

// ── RENDER LISTADO DE PEDIDOS ACTIVO (COLUMNA DERECHA) ─────────────
async function renderPedidosList() {
  const wrap = document.getElementById('pedidos-list');
  if (!wrap) return;
  wrap.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:1rem">Sincronizando comandas…</p>`;
  try {
    const pedidos = await getPedidos();
    
    // Filtrar los que ya están cerrados/pagados o cancelados si tu getPedidos no lo hace por defecto
    const pedidosActivos = pedidos.filter(p => p.estado !== 'pagado' && p.estado !== 'cancelado');

    if (!pedidosActivos.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No hay pedidos registrados</div></div>`;
      return;
    }
    
    wrap.innerHTML = pedidosActivos.map(p => {
      // Definición de badges premium basadas en tu CSS base
      let badgeClass = 'badge-gray';
      if (p.prioridad === 'alta') badgeClass = 'badge-orange';
      if (p.prioridad === 'urgente') badgeClass = 'badge-urgent';

      // Sincronización exacta con los estilos de estado
      let estadoClass = 'estado-pendiente';
      if (p.estado === 'en preparacion') estadoClass = 'estado-en-preparacion';
      if (p.estado === 'listo para servir') estadoClass = 'estado-listo';
      if (p.estado === 'entregado') estadoClass = 'estado-entregado';

      return `
        <div class="glass-card-dark animate-in" style="margin-bottom:1rem; border-left: 3px solid ${p.prioridad === 'urgente' ? 'var(--urgent, #d32f2f)' : p.prioridad === 'alta' ? 'var(--orange, #f57c00)' : 'var(--border)'}; padding: 1.25rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <div>
              <span class="badge badge-gold">${p.codigo}</span>
              <span style="margin-left:0.5rem;font-weight:600;color:var(--cream)">Mesa ${p.mesa}</span>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem;">Mozo: ${p.mozo_nombre} · ${new Date(p.fecha_hora).toLocaleTimeString('es-PE', {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
            <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">
              <span class="badge ${badgeClass}">${p.prioridad.toUpperCase()}</span>
              <span class="estado-pill ${estadoClass}">${p.estado}</span>
            </div>
          </div>
          
          <div style="background:rgba(0,0,0,0.15); padding:0.5rem; border-radius:4px; margin: 0.75rem 0;">
            ${(p.pedido_detalle || []).map(it => `
              <div style="display:flex; justify-content:space-between; font-size:0.82rem; margin-bottom:0.25rem; color:var(--cream-dim)">
                <span>${it.cantidad}× ${it.plato_nombre}</span>
                <span style="font-size:0.72rem; color:var(--gold-pale); font-weight:500;">${fmtMoney(it.precio_unitario * it.cantidad)}</span>
              </div>
              ${it.observacion ? `<div style="font-size:0.75rem; color:var(--gold); font-style:italic; padding-left:0.5rem; margin-bottom:0.4rem;">💬 ${it.observacion}</div>` : ''}
            `).join('')}
          </div>
          
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.5rem;border-top:1px solid var(--border)">
            <div style="font-family:'Playfair Display',serif; font-size:1.05rem; color:var(--gold-pale)">Total: ${fmtMoney(p.total)}</div>
            
            ${(p.estado === 'pendiente' || p.estado === 'enviado') ? `
              <button class="btn btn-outline btn-sm" style="color:var(--urgent,#d32f2f); border-color:rgba(211,47,47,0.3);" onclick="cancelarPedido('${p.id}')">Cancelar comanda</button>
            ` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (e) { handleSupabaseError(e, 'renderPedidosList'); }
}