// ████████████████████████████████████████████████████████████████████
// platos.js — Módulo Gestión de Platos
// ████████████████████████████████████████████████████████████████████

// ✅ Importaciones ESTÁTICAS — nunca dinámicas dentro de funciones
import {
  supabase,
  logout,
  requireAuth,
  ocultarMenuPorRol,
  crearPlato,
  actualizarPlato,
  eliminarPlato,
  getSiguienteCodigoPlato,
  toast,
  openModal,
  closeModal,
  fmtMoney,
  handleSupabaseError,
} from './supabase.js';

const ALERGENOS_LIST = ['Gluten','Lácteos','Huevo','Mariscos','Frutos secos','Soja'];
let editId = null;

// ── INIT ÚNICO ────────────────────────────────────────────────────
(async () => {
  const perfil = await requireAuth(['administrador','mozo']);
  if (!perfil) return;

  // Mostrar nombre y ocultar menú según rol
  const navNombre = document.getElementById('nav-usuario-nombre');
  if (navNombre) navNombre.textContent = perfil.nombre;
  ocultarMenuPorRol(perfil.rol);

  // Botón logout — importación estática, llamada directa
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await logout();
  });

  // Marcar link activo en la barra de navegación
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === 'platos.html') a.classList.add('active');
  });

  bindEvents();
  await renderPlatos();
})();

// ── EVENTOS ───────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById('btn-nuevo-plato')?.addEventListener('click', () => openForm(null));
  document.getElementById('btn-save-plato')?.addEventListener('click', savePlato);
  
  document.querySelectorAll('[data-close-modal]').forEach(btn =>
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal))
  );

  // Escuchadores correctos según el tipo de control del filtro
  document.getElementById('filter-nombre')?.addEventListener('input', renderPlatos);
  document.getElementById('filter-cat')?.addEventListener('change', renderPlatos);
  document.getElementById('filter-estado')?.addEventListener('change', renderPlatos);
}

// ── ALÉRGENOS ─────────────────────────────────────────────────────
function buildAlergenosForm(selected = []) {
  const wrap = document.getElementById('alergenos-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  const crearCheckbox = (valor, checked) => {
    const lb = document.createElement('label');
    lb.style.cssText = 'display:inline-flex; align-items:center; gap:0.4rem; font-size:0.82rem; color:var(--cream-dim); cursor:pointer; text-transform:none; margin-right: 0.75rem;';
    lb.innerHTML = `<input type="checkbox" value="${valor}" ${checked ? 'checked' : ''} style="accent-color:var(--gold);"> ${valor}`;
    wrap.appendChild(lb);
  };

  // Evaluar si viene vacío para marcar "Ninguno" de forma automática
  const esNinguno = selected.length === 0 || selected.includes('Ninguno');

  crearCheckbox('Ninguno', esNinguno);
  ALERGENOS_LIST.forEach(a => crearCheckbox(a, selected.includes(a)));
  crearCheckbox('Otro', selected.some(x => !ALERGENOS_LIST.includes(x) && x !== 'Ninguno' && x !== '') && !esNinguno);

  const otroWrap = document.createElement('div');
  otroWrap.id = 'otro-wrap';
  const tieneOtro = selected.some(x => !ALERGENOS_LIST.includes(x) && x !== 'Ninguno');
  otroWrap.style.cssText = `display:${tieneOtro && !esNinguno ? 'block' : 'none'}; margin-top:0.5rem; width: 100%;`;
  
  const otroCustom = selected.filter(x => !ALERGENOS_LIST.includes(x) && x !== 'Ninguno' && x !== 'Otro').join(', ');
  otroWrap.innerHTML = `<input type="text" class="form-control" id="alergeno-otro-input" placeholder="Especifique el alérgeno" value="${otroCustom}">`;
  wrap.appendChild(otroWrap);

  wrap.querySelectorAll('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', handleAlergenoChange)
  );
  
  if (esNinguno) disableOtherAlergenos(true);
}

function handleAlergenoChange(e) {
  if (e.target.value === 'Ninguno') {
    disableOtherAlergenos(e.target.checked);
  } else {
    const ningunoCb = document.querySelector('#alergenos-wrap input[value="Ninguno"]');
    if (ningunoCb) ningunoCb.checked = false;
    const otroChecked = !!document.querySelector('#alergenos-wrap input[value="Otro"]:checked');
    const otroWrap = document.getElementById('otro-wrap');
    if (otroWrap) otroWrap.style.display = otroChecked ? 'block' : 'none';
  }
}

function disableOtherAlergenos(disable) {
  document.querySelectorAll('#alergenos-wrap input[type=checkbox]').forEach(cb => {
    if (cb.value !== 'Ninguno') { cb.disabled = disable; cb.checked = false; }
  });
  const otroWrap = document.getElementById('otro-wrap');
  if (otroWrap) otroWrap.style.display = 'none';
}

function getSelectedAlergenos() {
  const checked = [...document.querySelectorAll('#alergenos-wrap input[type=checkbox]:checked')].map(c => c.value);
  
  // Si está marcado "Ninguno" o no hay nada seleccionado, enviamos un array vacío a Supabase
  if (checked.includes('Ninguno') || checked.length === 0) {
    return [];
  }
  
  let resultado = checked.filter(x => x !== 'Otro');
  if (checked.includes('Otro')) {
    const customVal = document.getElementById('alergeno-otro-input')?.value.trim();
    if (customVal) {
      const personalizados = customVal.split(',').map(s => s.trim()).filter(Boolean);
      resultado = [...resultado, ...personalizados];
    }
  }
  return resultado;
}

// ── VALIDACIÓN ────────────────────────────────────────────────────
const rules = {
  codigo:      v => /^PL\d{3,}$/.test(v) && !v.includes(' '),
  nombre:      v => v.length >= 3 && v.length <= 60 && !/^\d+$/.test(v),
  descripcion: v => v.length >= 10 && v.length <= 250,
  categoria:   v => v !== '',
  precio:      v => parseFloat(v) > 0 && !isNaN(parseFloat(v)),
  tiempo_prep: v => { const n = parseInt(v); return !isNaN(n) && n >= 1 && n <= 120; },
  estado:      v => ['activo','inactivo'].includes(v),
};
const errMsgs = {
  codigo:      'Código requerido (ej: PL001), sin espacios.',
  nombre:      'Nombre de 3 a 60 chars, no solo números.',
  descripcion: 'Descripción de 10 a 250 caracteres.',
  categoria:   'Selecciona una categoría.',
  precio:      'Precio mayor a 0.',
  tiempo_prep: 'Tiempo entre 1 y 120 minutos.',
  estado:      'Selecciona un estado.',
};

function validateForm() {
  let ok = true;
  Object.keys(rules).forEach(id => {
    const el = document.getElementById('plato-' + id);
    if (!el) return;
    const valid = rules[id](el.value.trim());
    el.classList.toggle('invalid', !valid);
    const errEl = document.getElementById('plato-' + id + '-err');
    if (errEl) { errEl.textContent = valid ? '' : errMsgs[id]; errEl.classList.toggle('visible', !valid); }
    if (!valid) ok = false;
  });
  
  const otroChecked = !!document.querySelector('#alergenos-wrap input[value="Otro"]:checked');
  if (otroChecked) {
    const otroInput = document.getElementById('alergeno-otro-input');
    if (!otroInput?.value.trim()) { 
      otroInput?.classList.add('invalid'); 
      toast('Especifica el alérgeno personalizado.', 'error'); 
      ok = false; 
    }
  }
  return ok;
}

// ── ABRIR FORMULARIO ──────────────────────────────────────────────
async function openForm(plato = null) {
  editId = plato ? plato.id : null;
  const title = document.getElementById('modal-plato-title');
  if (title) title.textContent = plato ? 'Editar Menú' : 'Nuevo Plato';

  ['codigo','nombre','descripcion','categoria','precio','tiempo_prep','estado','ingredientes'].forEach(f => {
    const el = document.getElementById('plato-' + f);
    if (el) { 
      el.value = plato ? (plato[f] ?? '') : ''; 
      el.classList.remove('invalid'); 
      // El código maestro de inventario no debe editarse nunca si el registro existe
      if (f === 'codigo') el.disabled = plato !== null;
    }
    const errEl = document.getElementById('plato-' + f + '-err');
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
  });

  if (!plato) {
    const codigo = await getSiguienteCodigoPlato();
    const codigoEl = document.getElementById('plato-codigo');
    if (codigoEl) {
      codigoEl.value = codigo;
      codigoEl.disabled = true; // Bloqueado por seguridad para conservar el correlativo exacto
    }
    document.getElementById('plato-estado').value = 'activo';
  }

  buildAlergenosForm(plato?.alergenos || []);
  openModal('modal-plato');
}

// ── GUARDAR ───────────────────────────────────────────────────────
async function savePlato() {
  if (!validateForm()) return;
  const btn = document.getElementById('btn-save-plato');
  btn.textContent = 'Guardando…'; btn.disabled = true;

  const data = {
    codigo:       document.getElementById('plato-codigo').value.trim().toUpperCase(),
    nombre:       document.getElementById('plato-nombre').value.trim(),
    descripcion:  document.getElementById('plato-descripcion').value.trim(),
    categoria:    document.getElementById('plato-categoria').value,
    precio:       parseFloat(document.getElementById('plato-precio').value),
    tiempo_prep:  parseInt(document.getElementById('plato-tiempo_prep').value),
    estado:       document.getElementById('plato-estado').value,
    ingredientes: document.getElementById('plato-ingredientes')?.value.trim() || null,
    alergenos:    getSelectedAlergenos(),
  };

  try {
    if (editId) {
      await actualizarPlato(editId, data);
      toast(`✓ Plato "${data.nombre}" actualizado con éxito.`, 'success');
    } else {
      await crearPlato(data);
      toast(`✓ Nuevo plato "${data.nombre}" incorporado al menú.`, 'success');
    }
    closeModal('modal-plato');
    await renderPlatos();
  } catch (e) {
    handleSupabaseError(e, 'savePlato');
  } finally {
    btn.textContent = 'Guardar Plato'; btn.disabled = false;
  }
}

// ── EDITAR / ELIMINAR (globales para onclick en HTML) ─────────────
window.editPlato = async (id) => {
  try {
    const { data, error } = await supabase.from('platos').select('*').eq('id', id).single();
    if (error) throw error;
    await openForm(data);
  } catch (e) { handleSupabaseError(e, 'editPlato'); }
};

window.deletePlato = async (id) => {
  try {
    // Primero obtenemos el nombre para un mensaje de confirmación más descriptivo
    const { data } = await supabase.from('platos').select('nombre').eq('id', id).single();
    const nombrePlato = data ? data.nombre : 'este plato';
    
    if (!confirm(`¿Estás completamente seguro de eliminar "${nombrePlato}" del catálogo? Esto puede afectar estadísticas históricas.`)) return;
    
    await eliminarPlato(id);
    toast('Plato removido de la carta de forma permanente.', 'info');
    await renderPlatos();
  } catch (e) { handleSupabaseError(e, 'deletePlato'); }
};

// ── RENDER TABLA ──────────────────────────────────────────────────
async function renderPlatos() {
  const tbody = document.getElementById('platos-tbody');
  if (!tbody) return;

  try {
    let q = supabase.from('platos').select('*').order('codigo', { ascending: true });
    const fCat = document.getElementById('filter-cat')?.value || '';
    const fEst = document.getElementById('filter-estado')?.value || '';
    if (fCat) q = q.eq('categoria', fCat);
    if (fEst) q = q.eq('estado', fEst);

    const { data: platos, error } = await q;
    if (error) throw error;

    const busq = (document.getElementById('filter-nombre')?.value || '').toLowerCase().trim();
    const filtered = busq
      ? platos.filter(p => p.nombre.toLowerCase().includes(busq) || p.codigo.toLowerCase().includes(busq))
      : platos;

    const countEl = document.getElementById('platos-count');
    if (countEl) countEl.textContent = `Mostrando ${filtered.length} de ${platos.length} platos`;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:3rem; text-align:center;"><div class="empty-state-icon" style="font-size:2rem; margin-bottom:0.5rem;">🍽</div><div class="empty-state-text" style="color:var(--text-muted)">Ningún plato coincide con los filtros aplicados.</div></div></td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      // Formatear los tags de alérgenos de manera elegante
      const tagsAlergenos = (p.alergenos || []).length > 0
        ? p.alergenos.map(a => `<span class="badge badge-orange" style="font-size:0.65rem; padding:0.1rem 0.3rem; margin:0.1rem; display:inline-block;">${a}</span>`).join('')
        : '<span style="color:var(--text-muted); font-size:0.8rem;">Ninguno</span>';

      // Sincronizar el estado con los selectores del CSS global de la app
      // Si usas 'activo' -> 'estado-entregado' (verde) / 'inactivo' -> 'estado-pendiente' (gris/rojo)
      const claseEstado = p.estado === 'activo' ? 'estado-entregado' : 'estado-pendiente';

      return `
        <tr class="animate-in">
          <td><strong style="color:var(--gold-pale); font-size:0.9rem;">${p.codigo}</strong></td>
          <td>
            <div style="font-weight:600; color:var(--cream); font-size:0.9rem;">${p.nombre}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${p.descripcion || ''}">
              ${p.descripcion || ''}
            </div>
          </td>
          <td><span class="badge badge-gold" style="font-size:0.72rem;">${p.categoria}</span></td>
          <td style="font-weight:600; color:var(--cream);">${fmtMoney(p.precio)}</td>
          <td style="font-size:0.85rem; color:var(--cream-dim);">⏱ ${p.tiempo_prep} min</td>
          <td><div style="display:flex; flex-wrap:wrap; max-width:180px;">${tagsAlergenos}</div></td>
          <td>
            <span class="estado-pill ${claseEstado}" style="font-size:0.7rem; padding:0.15rem 0.4rem; text-transform:uppercase;">
              ${p.estado}
            </span>
          </td>
          <td>
            <div style="display:flex; gap:0.4rem;">
              <button class="btn btn-outline btn-sm" style="padding:0.2rem 0.5rem;" onclick="editPlato('${p.id}')">✏️ Editar</button>
              <button class="btn btn-outline btn-sm" style="padding:0.2rem 0.5rem; color:var(--urgent); border-color:rgba(211,47,47,0.2);" onclick="deletePlato('${p.id}')">✕</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (e) {
    handleSupabaseError(e, 'renderPlatos');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem;"><div class="alert alert-danger">Error al actualizar el listado de platos de cocina.</div></td></tr>`;
  }
}