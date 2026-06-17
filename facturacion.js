// ████████████████████████████████████████████████████████████████████
// facturacion.js — Módulo Facturación y Cobro
// ████████████████████████████████████████████████████████████████████

// ✅ Importaciones ESTÁTICAS CORREGIDAS (Apuntando a la raíz)
import {
  supabase,
  logout,
  requireAuth,
  ocultarMenuPorRol,
  actualizarEstadoPedido,
  getFacturas,
  crearFactura,
  getMesaYaPagada,
  toast,
  fmtMoney,
  handleSupabaseError,
} from './supabase.js';

const IGV = 0.18;
let currentMesa    = null;
let currentPedidos = [];
let descuento      = 0;

// ── INIT ÚNICO ────────────────────────────────────────────────────
(async () => {
  // 🛡️ CONTROL DE ACCESO: Solo entran el cajero ('caja') y el administrador
  const perfil = await requireAuth(['caja','administrador']);
  if (!perfil) return;

  const navNombre = document.getElementById('nav-usuario-nombre');
  if (navNombre) navNombre.textContent = perfil.nombre;
  
  // 🪄 OCULTACIÓN POR ROLES: Limpia el menú según las IDs del HTML
  ocultarMenuPorRol(perfil.rol);

  // ✅ Logout con importación estática, llamada directa
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await logout();
  });

  document.getElementById('btn-buscar-mesa')?.addEventListener('click', buscarMesa);
  document.getElementById('btn-aplicar-descuento')?.addEventListener('click', applyDescuento);
  document.getElementById('btn-procesar-pago')?.addEventListener('click', procesarPago);
  document.getElementById('metodo-pago')?.addEventListener('change', handleMetodoPago);
  document.getElementById('monto-efectivo')?.addEventListener('input', calcularVuelto);
  document.getElementById('buscar-mesa')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') buscarMesa();
  });

  renderFacturaVacia();
  await renderHistorial();
})();

// ── BUSCAR MESA ───────────────────────────────────────────────────
async function buscarMesa() {
  const mesaEl = document.getElementById('buscar-mesa');
  const mesa   = parseInt(mesaEl?.value);
  if (!mesa || mesa < 1 || mesa > 50) { toast('Número de mesa entre 1 y 50.', 'error'); return; }

  const btn = document.getElementById('btn-buscar-mesa');
  btn.textContent = 'Buscando…'; btn.disabled = true;

  try {
    const yaPagada = await getMesaYaPagada(mesa);
    if (yaPagada) {
      const wrap = document.getElementById('factura-wrap');
      if (wrap) wrap.innerHTML = `<div class="alert alert-success">✓ La cuenta de la Mesa ${mesa} ya fue pagada.</div>`;
      currentMesa = null; currentPedidos = []; descuento = 0;
      actualizarResumen(0, 0, 0);
      return;
    }

    const { data, error } = await supabase
      .from('pedidos')
      .select('*, pedido_detalle(*)')
      .eq('mesa', mesa)
      .eq('estado', 'entregado');
    if (error) throw error;

    currentMesa    = mesa;
    currentPedidos = data;
    descuento      = 0;

    document.getElementById('descuento-input').value    = '';
    document.getElementById('justificacion-desc').value = '';
    document.getElementById('monto-efectivo').value     = '';
    document.getElementById('vuelto-display').textContent = '';

    renderFactura();
  } catch (e) {
    handleSupabaseError(e, 'buscarMesa');
  } finally {
    btn.textContent = '🔍 Buscar'; btn.disabled = false;
  }
}

// ── RENDER FACTURA ────────────────────────────────────────────────
function renderFacturaVacia() {
  const wrap = document.getElementById('factura-wrap');
  if (wrap) wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">Busca una mesa para ver su cuenta</div></div>`;
  actualizarResumen(0, 0, 0);
}

function renderFactura() {
  const wrap = document.getElementById('factura-wrap');
  if (!wrap) return;

  if (!currentPedidos.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🍽</div><div class="empty-state-text">No hay pedidos entregados para la Mesa ${currentMesa}</div></div>`;
    actualizarResumen(0, 0, 0);
    return;
  }

  const subtotal = currentPedidos.reduce((acc, p) => acc + Number(p.total), 0);
  const igv      = (subtotal - descuento) * IGV;
  const total    = (subtotal - descuento) * (1 + IGV);

  wrap.innerHTML = `
    <div class="section-title" style="font-size:1.2rem;margin-bottom:1rem">Mesa ${currentMesa} — Detalle</div>
    ${currentPedidos.map(p => `
      <div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem">
          <span class="badge badge-gold">${p.codigo}</span>
          <span style="color:var(--text-muted);font-size:0.8rem">Mozo: ${p.mozo_nombre}</span>
        </div>
        ${(p.pedido_detalle||[]).map(it=>`
          <div style="display:flex;justify-content:space-between;font-size:0.87rem;padding:0.25rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span>${it.cantidad}× ${it.plato_nombre}${it.observacion?` <em style="color:var(--text-muted)">(${it.observacion})</em>`:''}</span>
            <span style="color:var(--gold-pale)">${fmtMoney(it.precio_unitario * it.cantidad)}</span>
          </div>`).join('')}
      </div>`).join('')}
    <div class="divider"></div>
    <div class="total-box">
      <div class="total-row"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>
      ${descuento > 0 ? `<div class="total-row" style="color:#4ade80"><span>Descuento</span><span>− ${fmtMoney(descuento)}</span></div>` : ''}
      <div class="total-row"><span>IGV (18%)</span><span>${fmtMoney(igv)}</span></div>
      <div class="total-row grand"><span>TOTAL</span><span>${fmtMoney(total)}</span></div>
    </div>`;

  actualizarResumen(subtotal, igv, total);
  handleMetodoPago();
}

function actualizarResumen(subtotal, igv, total) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmtMoney(val); };
  set('res-subtotal', subtotal);
  set('res-igv',      igv);
  set('res-total',    total);
}

// ── DESCUENTO ─────────────────────────────────────────────────────
function applyDescuento() {
  if (!currentPedidos.length) { toast('Primero busca una mesa.', 'error'); return; }
  const subtotal = currentPedidos.reduce((acc, p) => acc + Number(p.total), 0);
  const d = parseFloat(document.getElementById('descuento-input')?.value || 0);
  const j = document.getElementById('justificacion-desc')?.value.trim() || '';
  if (isNaN(d) || d < 0)  { toast('El descuento no puede ser negativo.', 'error'); return; }
  if (d > subtotal)         { toast('El descuento no puede superar el subtotal.', 'error'); return; }
  if (j.length < 10)        { toast('Justificación mín 10 caracteres.', 'error'); return; }
  descuento = d;
  toast(`Descuento de ${fmtMoney(d)} aplicado.`, 'success');
  renderFactura();
}

// ── MÉTODO DE PAGO ────────────────────────────────────────────────
function handleMetodoPago() {
  const metodo = document.getElementById('metodo-pago')?.value;
  const el     = document.getElementById('efectivo-wrap');
  if (el) el.style.display = metodo === 'efectivo' ? 'block' : 'none';
}

// ── VUELTO ────────────────────────────────────────────────────────
function calcularVuelto() {
  if (!currentPedidos.length) return;
  const subtotal = currentPedidos.reduce((acc, p) => acc + Number(p.total), 0);
  const total    = (subtotal - descuento) * (1 + IGV);
  const recibido = parseFloat(document.getElementById('monto-efectivo')?.value || 0);
  const el       = document.getElementById('vuelto-display');
  if (!el) return;
  if (recibido >= total) { el.textContent = `Vuelto: ${fmtMoney(recibido - total)}`;  el.style.color = '#4ade80'; }
  else                   { el.textContent = `Falta: ${fmtMoney(total - recibido)}`;    el.style.color = '#f87171'; }
}

// ── PROCESAR PAGO ─────────────────────────────────────────────────
async function procesarPago() {
  if (!currentPedidos.length) { toast('No hay pedidos para cobrar.', 'error'); return; }

  const metodo   = document.getElementById('metodo-pago')?.value;
  const subtotal = currentPedidos.reduce((acc, p) => acc + Number(p.total), 0);
  const igv      = (subtotal - descuento) * IGV;
  const total    = (subtotal - descuento) * (1 + IGV);
  let   monto_recibido = 0, vuelto = 0;

  if (metodo === 'efectivo') {
    monto_recibido = parseFloat(document.getElementById('monto-efectivo')?.value || 0);
    if (isNaN(monto_recibido) || monto_recibido < total) {
      toast('El monto recibido es insuficiente.', 'error'); return;
    }
    vuelto = monto_recibido - total;
  }

  const btn = document.getElementById('btn-procesar-pago');
  btn.textContent = 'Procesando…'; btn.disabled = true;

  try {
    // Marcar pedidos como pagados
    for (const p of currentPedidos) {
      await actualizarEstadoPedido(p.id, 'pagado');
    }
    // Crear factura en Supabase
    const factura = await crearFactura({
      mesa:               currentMesa,
      subtotal,
      descuento,
      justificacion_desc: document.getElementById('justificacion-desc')?.value.trim() || null,
      igv,
      total,
      metodo_pago:        metodo,
      monto_recibido,
      vuelto,
      estado:             'pagada',
    });

    toast(`✓ Pago procesado · ${factura.codigo} · Total: ${fmtMoney(total)}`, 'success');
    currentMesa = null; currentPedidos = []; descuento = 0;
    document.getElementById('buscar-mesa').value = '';
    renderFacturaVacia();
    await renderHistorial();
  } catch (e) {
    handleSupabaseError(e, 'procesarPago');
  } finally {
    btn.textContent = '✦ Procesar Pago'; btn.disabled = false;
  }
}

// ── HISTORIAL ─────────────────────────────────────────────────────
async function renderHistorial() {
  const wrap = document.getElementById('historial-wrap');
  if (!wrap) return;
  try {
    const facturas = await getFacturas();
    if (!facturas.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📜</div><div class="empty-state-text">Sin facturas registradas</div></div>`;
      return;
    }
    wrap.innerHTML = facturas.map(f => `
      <div class="glass-card animate-in" style="margin-bottom:0.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
          <div>
            <span class="badge badge-gold">${f.codigo}</span>
            <span style="margin-left:0.5rem;font-weight:600">Mesa ${f.mesa}</span>
            <span style="margin-left:0.5rem;color:var(--text-muted);font-size:0.82rem">${new Date(f.fecha_pago).toLocaleString('es-PE')}</span>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <span class="badge badge-gray">${f.metodo_pago}</span>
            <span class="estado-pill estado-pagado">Pagada</span>
            <span style="font-family:'Playfair Display',serif;color:var(--gold-pale);font-size:1.1rem">${fmtMoney(f.total)}</span>
          </div>
        </div>
      </div>`).join('');
  } catch (e) { handleSupabaseError(e, 'renderHistorial'); }
}