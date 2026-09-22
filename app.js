/* Mostrador — control de caja e inventario por turno.
   Todo vive en localStorage: la app funciona 100% sin internet. */

const KEY = 'mostrador.v1';
const NEGOCIO = 'JM';

/* ---------------- estado ---------------- */
/* sobrante: lo que quedó al cerrar el último turno, esperando a que se abra el siguiente */
const vacio = () => ({ productos: [], turno: null, historial: [], pedido: [], sobrante: [] });

/* Antes cada venta era un solo producto. Ahora una venta puede llevar varias líneas
   (10 huevos + 3.2 lb de jamón). Esto convierte lo viejo al formato nuevo. */
function migrar(d) {
  /* Ojo: esta función corre ANTES de que existan S y los helpers de abajo
     (prodPorId, unidadDe). Todo lo que necesite debe resolverlo con `d` mismo. */
  const prods = Array.isArray(d.productos) ? d.productos : [];
  const unidadVieja = (pid) => {
    const p = prods.find((x) => x.id === pid);
    return p ? (p.tipo === 'peso' ? p.unidad : 'u') : 'u';
  };
  if (d.turno && Array.isArray(d.turno.ventas)) {
    d.turno.ventas = d.turno.ventas.map((v) =>
      v.lineas ? v : {
        id: v.id,
        hora: v.hora,
        total: v.importe,
        lineas: [{
          productoId: v.productoId, nombre: v.nombre, cantidad: v.cantidad,
          unidad: v.unidad || unidadVieja(v.productoId),
          importe: v.importe,
        }],
      }
    );
  }
  if (d.turno && !Array.isArray(d.turno.mermas)) d.turno.mermas = [];
  if (!Array.isArray(d.pedido)) d.pedido = [];
  if (!Array.isArray(d.sobrante)) d.sobrante = [];
  return d;
}

function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return vacio();
    return migrar(Object.assign(vacio(), JSON.parse(raw)));
  } catch (e) {
    console.warn('No se pudo leer el almacenamiento:', e);
    /* No sobrescribir en silencio: se aparta una copia cruda para poder recuperarla. */
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(KEY + '.roto', raw);
    } catch {}
    setTimeout(() => toast('Ojo: los datos guardados no se pudieron leer. Quedó una copia aparte.'), 300);
    return vacio();
  }
}

let S = cargar();

function guardar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    toast('¡Ojo! No se pudo guardar');
  }
}

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- utilidades ---------------- */
const $ = (sel) => document.querySelector(sel);

const dinero = (n) =>
  '$' + (Math.round(n * 100) / 100).toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function num(txt) {
  const n = parseFloat(String(txt).replace(',', '.').trim());
  return isFinite(n) ? n : 0;
}

/* Cantidades: sin decimales inútiles (1.5 lb, 3 u, 0.25 kg) */
const fmtQ = (n) => String(Math.round(n * 1000) / 1000);
const cantU = (n, u) => fmtQ(n) + ' ' + u;
function cant(n, prod) {
  return cantU(n, unidadDe(prod));
}
const unidadDe = (p) => (p.tipo === 'peso' ? p.unidad : 'u');
const precioLabel = (p) => dinero(p.precio) + (p.tipo === 'peso' ? ' / ' + p.unidad : ' c/u');

function hora(ts) {
  return new Date(ts).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
}
function fecha(ts) {
  return new Date(ts).toLocaleDateString('es-CU', { day: '2-digit', month: 'short' });
}
function diaSemana(ts) {
  return new Date(ts).toLocaleDateString('es-CU', { weekday: 'long', day: 'numeric' });
}
const mismoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/* Los turnos son de varios días, así que una hora suelta no dice nada:
   "lun 8:00 a.m. – mié 6:00 p.m." se entiende, "8:00 a.m. – 6:00 p.m." no. */
function rango(inicio, fin) {
  return mismoDia(inicio, fin)
    ? `${fecha(inicio)} ${hora(inicio)} – ${hora(fin)}`
    : `${fecha(inicio)} ${hora(inicio)} – ${fecha(fin)} ${hora(fin)}`;
}
/* Día del turno en el que estamos: día 1, día 2, día 3... */
function diaDelTurno(inicio, ahora) {
  const a = new Date(inicio); a.setHours(0, 0, 0, 0);
  const b = new Date(ahora); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000) + 1;
}

let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.hidden = true), 2200);
}

/* ---------------- cálculos ---------------- */
const prodPorId = (pid) => S.productos.find((p) => p.id === pid);
/* Al volver de otra app (WhatsApp), releer() reemplaza S entero: un modal abierto se queda
   apuntando al producto viejo, que ya no está en S. Antes de guardar hay que buscar el de ahora. */
const vigente = (p) => (p ? prodPorId(p.id) : null);

function entradaDe(pid) {
  if (!S.turno) return 0;
  return S.turno.entradas.filter((e) => e.productoId === pid).reduce((a, e) => a + e.cantidad, 0);
}
const lineasDe = (ventas, pid) => ventas.flatMap((v) => v.lineas).filter((l) => l.productoId === pid);

function vendidoDe(pid) {
  if (!S.turno) return 0;
  return lineasDe(S.turno.ventas, pid).reduce((a, l) => a + l.cantidad, 0);
}
function dineroDe(pid) {
  if (!S.turno) return 0;
  return lineasDe(S.turno.ventas, pid).reduce((a, l) => a + l.importe, 0);
}
/* Merma: lo que se perdió sin venderse (el lomo que se descongela y suelta peso, un recorte,
   algo que se dañó). No toca el dinero de la caja, solo baja la existencia.
   Puede ser negativa cuando al pesar aparece MÁS de lo que decía la app. */
function mermaDe(pid) {
  if (!S.turno) return 0;
  return S.turno.mermas.filter((m) => m.productoId === pid).reduce((a, m) => a + m.cantidad, 0);
}
const mermaTotal = () =>
  S.turno ? S.productos.reduce((a, p) => a + Math.max(0, mermaDe(p.id)) * p.precio, 0) : 0;

/* Lo que ya está apuntado en el pedido del cliente todavía no se vendió,
   pero tampoco está disponible: se descuenta para no vender dos veces lo mismo. */
const enPedidoDe = (pid) => S.pedido.filter((l) => l.productoId === pid).reduce((a, l) => a + l.cantidad, 0);

/* Lo que un producto ya tiene apuntado en el turno. Las cantidades se guardan sin unidad
   (10 = 10 de la unidad del producto): con movimientos, cambiarle la unidad o borrarlo
   descuadra el inventario y el cierre. */
function movimientosDe(pid) {
  const t = S.turno;
  return {
    entradas: t ? t.entradas.filter((e) => e.productoId === pid).length : 0,
    ventas: t ? lineasDe(t.ventas, pid).length : 0,
    mermas: t ? t.mermas.filter((m) => m.productoId === pid).length : 0,
    pedido: S.pedido.filter((l) => l.productoId === pid).length,
    sobrante: S.sobrante.filter((x) => x.productoId === pid).length,
  };
}
const unidadFija = (pid) => Object.values(movimientosDe(pid)).some((n) => n > 0);

const quedaDe = (pid) => quedaReal(pid) - enPedidoDe(pid);
const quedaReal = (pid) => entradaDe(pid) - vendidoDe(pid) - mermaDe(pid);
const totalCaja = () => (S.turno ? S.turno.ventas.reduce((a, v) => a + v.total, 0) : 0);
const totalPedido = () => S.pedido.reduce((a, l) => a + l.importe, 0);

/* ---------------- render ---------------- */
let totalPrevio = 0;

function render() {
  renderCaja();
  renderVenta();
  renderInventario();
  renderCierre();
}

function renderCaja() {
  const t = totalCaja();
  const el = $('#cajaMonto');
  el.textContent = dinero(t);
  if (t !== totalPrevio) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    totalPrevio = t;
  }
  const n = S.turno ? S.turno.ventas.length : 0;
  $('#cajaVentas').textContent = n === 1 ? '1 venta' : n + ' ventas';
  if (S.turno) {
    const d = diaDelTurno(S.turno.inicio, Date.now());
    $('#cajaTurno').textContent = d > 1
      ? `día ${d} · desde ${fecha(S.turno.inicio)}`
      : 'turno abierto ' + hora(S.turno.inicio);
  } else {
    $('#cajaTurno').textContent = 'sin turno';
  }
}

function renderVenta() {
  const hay = !!S.turno;
  $('#sinTurno').hidden = hay;
  $('#turnoActivo').hidden = !hay;
  const nSob = S.sobrante.filter((x) => prodPorId(x.productoId)).length;
  $('#sinTurnoSobrante').hidden = hay || !nSob;
  if (!hay) {
    $('#sinTurnoSobrante').textContent =
      `Quedó mercancía del turno anterior (${nSob} ${nSob === 1 ? 'producto' : 'productos'}). ` +
      'Se carga sola al abrir; la ves en Inventario.';
    return;
  }

  const grid = $('#gridVenta');
  grid.innerHTML = '';
  $('#vacioVenta').hidden = S.productos.length > 0;

  for (const p of S.productos) {
    const q = quedaDe(p.id);
    const b = document.createElement('button');
    b.className = 'card-prod' + (q <= 0 ? ' agotado' : '');
    b.innerHTML =
      `<span class="nom"></span><span class="pre">${precioLabel(p)}</span>` +
      `<span class="qda">${q <= 0 ? 'sin existencia' : 'quedan ' + cant(q, p)}</span>`;
    b.querySelector('.nom').textContent = p.nombre;
    b.onclick = () => abrirVenta(p);
    grid.appendChild(b);
  }

  /* --- aviso de pesar lo que quedó del turno anterior ---
     Sale solo cuando el turno arrancó con mercancía ya puesta y todavía no se anotó
     ninguna merma: es el caso del sobrante que pasó tres días sin nadie. */
  const conExistencia = S.productos.some((p) => quedaReal(p.id) > 0);
  $('#avisoPesar').hidden = !(
    S.turno.entradas.length > 0 &&
    S.turno.mermas.length === 0 &&
    !S.turno.avisoPesado &&
    conExistencia
  );

  /* --- pedido que se está armando --- */
  const panel = $('#pedidoPanel');
  panel.hidden = S.pedido.length === 0;
  const lp = $('#listaPedido');
  lp.innerHTML = '';
  for (const [i, l] of S.pedido.entries()) {
    const li = document.createElement('li');
    li.innerHTML =
      `<div class="tk-info"><div class="tk-nom"></div>` +
      `<div class="tk-det">${cantU(l.cantidad, l.unidad)}</div></div>` +
      `<span class="tk-imp">${dinero(l.importe)}</span>` +
      `<button class="tk-del" title="Quitar del pedido">&times;</button>`;
    li.querySelector('.tk-nom').textContent = l.nombre;
    li.querySelector('.tk-del').onclick = () => quitarLinea(i);
    lp.appendChild(li);
  }
  $('#btnCobrar').textContent = `Cobrar ${dinero(totalPedido())}`;

  /* --- ventas ya cobradas --- */
  const lista = $('#listaVentas');
  lista.innerHTML = '';
  const ventas = [...S.turno.ventas].reverse();
  $('#vacioVentas').hidden = ventas.length > 0;
  $('#ticketCount').textContent = ventas.length ? dinero(totalCaja()) : '';

  /* En un turno de tres días conviene ver dónde termina un día y empieza el otro,
     con lo que se hizo en cada uno. */
  const porDia = new Map();
  for (const v of S.turno.ventas) {
    const k = new Date(v.hora).toDateString();
    porDia.set(k, (porDia.get(k) || 0) + v.total);
  }
  const variosDias = porDia.size > 1;
  let diaActual = null;
  let primeraVenta = null;

  for (const v of ventas) {
    const k = new Date(v.hora).toDateString();
    if (variosDias && k !== diaActual) {
      diaActual = k;
      const sep = document.createElement('li');
      sep.className = 'tk-dia';
      sep.innerHTML = `<span></span><b>${dinero(porDia.get(k))}</b>`;
      sep.querySelector('span').textContent = diaSemana(v.hora);
      lista.appendChild(sep);
    }
    const li = document.createElement('li');
    if (!primeraVenta) primeraVenta = li;
    const resumen = v.lineas.map((l) => cantU(l.cantidad, l.unidad) + ' ' + l.nombre).join(' · ');
    const titulo = v.lineas.length === 1 ? v.lineas[0].nombre : `${v.lineas.length} productos`;
    const detalle = v.lineas.length === 1
      ? `${cantU(v.lineas[0].cantidad, v.lineas[0].unidad)} · ${hora(v.hora)}`
      : `${resumen} · ${hora(v.hora)}`;
    li.innerHTML =
      `<div class="tk-info"><div class="tk-nom"></div><div class="tk-det"></div></div>` +
      `<span class="tk-imp">${dinero(v.total)}</span>` +
      `<button class="tk-del" title="Borrar esta venta">&times;</button>`;
    li.querySelector('.tk-nom').textContent = titulo;
    li.querySelector('.tk-det').textContent = detalle;
    li.querySelector('.tk-del').onclick = () => borrarVenta(v.id);
    lista.appendChild(li);
  }
  if (primeraVenta && ultimaVenta) {
    primeraVenta.classList.add('nuevo');
    ultimaVenta = false;
  }
}

let ultimaVenta = false;

function renderInventario() {
  const ul = $('#listaInventario');
  ul.innerHTML = '';
  $('#vacioInv').hidden = S.productos.length > 0;

  for (const p of S.productos) {
    const ent = entradaDe(p.id);
    const q = quedaDe(p.id);
    const mer = mermaDe(p.id);
    const mv = movimientosDe(p.id);
    const nMovs = mv.entradas + mv.mermas;
    const sob = S.sobrante.filter((x) => x.productoId === p.id).reduce((a, x) => a + x.cantidad, 0);
    const detalleMerma = mer > 0 ? ` · merma ${cant(mer, p)}`
      : mer < 0 ? ` · sobró ${cant(-mer, p)}` : '';
    const li = document.createElement('li');
    li.innerHTML =
      `<div class="iv-main"><div class="iv-nom"></div>` +
      `<div class="iv-sub">${precioLabel(p)}${S.turno ? ' · entró ' + cant(ent, p) : ''}` +
      (!S.turno && sob ? ` · quedó ${cant(sob, p)}` : '') +
      `<span class="sub-merma">${detalleMerma}</span></div>` +
      (nMovs ? `<button class="btn-link iv-movs" data-movs>Entradas y mermas (${nMovs})</button>` : '') +
      `</div>` +
      (S.turno
        ? `<div class="iv-num"><b class="${q < 0 ? 'negativo' : ''}">${cant(q, p)}</b><small>quedan</small></div>`
        : '') +
      `<div class="iv-acc">` +
      (S.turno ? `<button class="btn" data-ent>+ Entrada</button>` : '') +
      (S.turno ? `<button class="btn" data-merma>Merma</button>` : '') +
      `<button class="btn" data-edit>Editar</button></div>`;
    li.querySelector('.iv-nom').textContent = p.nombre;
    const bEnt = li.querySelector('[data-ent]');
    if (bEnt) bEnt.onclick = () => abrirEntrada(p);
    const bMer = li.querySelector('[data-merma]');
    if (bMer) bMer.onclick = () => abrirMerma(p);
    const bMovs = li.querySelector('[data-movs]');
    if (bMovs) bMovs.onclick = () => abrirMovs(p);
    li.querySelector('[data-edit]').onclick = () => abrirProducto(p);
    ul.appendChild(li);
  }
}

function renderCierre() {
  const hay = !!S.turno;
  $('#cierreBody').hidden = !hay;
  $('#vacioCierre').hidden = hay;

  if (hay) {
    $('#cierreTotal').textContent = dinero(totalCaja());
    const n = S.turno.ventas.length;
    const pend = S.pedido.length
      ? ` · ojo: hay un pedido sin cobrar por ${dinero(totalPedido())}`
      : '';
    $('#cierreInfo').textContent =
      `${n} ${n === 1 ? 'venta' : 'ventas'} · ${rango(S.turno.inicio, Date.now())}${pend}`;

    const perdido = mermaTotal();
    const lineaMerma = $('#cierreMerma');
    lineaMerma.hidden = perdido <= 0;
    if (perdido > 0) lineaMerma.textContent = `Merma del turno: ${dinero(perdido)} en mercancía`;

    const tb = $('#tablaCierre').querySelector('tbody');
    tb.innerHTML = '';
    for (const p of S.productos) {
      const ent = entradaDe(p.id);
      const ven = vendidoDe(p.id);
      const mer = mermaDe(p.id);
      const q = quedaReal(p.id);
      const plata = dineroDe(p.id);
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td></td><td data-label="Entró">${cant(ent, p)}</td><td data-label="Vendido">${cant(ven, p)}</td>` +
        `<td data-label="Merma" class="${mer > 0 ? 'negativo' : mer < 0 ? 'positivo' : ''}">` +
        `${mer > 0 ? cant(mer, p) : mer < 0 ? '+' + cant(-mer, p) : '—'}</td>` +
        `<td data-label="Queda" class="${q < 0 ? 'negativo' : ''}">${cant(q, p)}</td>` +
        `<td data-label="Dinero">${dinero(plata)}</td>`;
      tr.querySelector('td').textContent = p.nombre;
      tb.appendChild(tr);
    }
  }

  const nT = S.historial.length;
  const ultimo = nT ? ' · último cierre ' + fecha(S.historial[nT - 1].fin) : '';
  $('#datosResumen').textContent =
    `${nT} ${nT === 1 ? 'turno guardado' : 'turnos guardados'} · ` +
    `${S.productos.length} ${S.productos.length === 1 ? 'producto' : 'productos'}${ultimo}`;

  const wrap = $('#historialWrap');
  wrap.hidden = S.historial.length === 0;
  const ul = $('#listaHistorial');
  ul.innerHTML = '';
  for (const h of [...S.historial].reverse().slice(0, 15)) {
    const li = document.createElement('li');
    li.innerHTML =
      `<span>${fecha(h.inicio)}<small>${rango(h.inicio, h.fin)} · ${h.ventas} ${h.ventas === 1 ? 'venta' : 'ventas'}</small></span>` +
      `<b>${dinero(h.total)}</b>`;
    ul.appendChild(li);
  }
}

/* ---------------- turno ---------------- */
/* El turno empieza cuando alguien lo abre, no cuando el anterior cerró: en el 3x3 pasan
   días entre uno y otro. Lo que quedó del anterior entra aquí, con la hora de apertura. */
$('#btnAbrirTurno').onclick = () => {
  const ahora = Date.now();
  S.turno = { id: id(), inicio: ahora, entradas: [], ventas: [], mermas: [] };
  const pendiente = S.sobrante.filter((x) => prodPorId(x.productoId));
  for (const x of pendiente) {
    S.turno.entradas.push({ id: id(), productoId: x.productoId, cantidad: x.cantidad, hora: ahora, origen: 'sobrante' });
  }
  S.sobrante = [];
  guardar();
  render();
  toast(pendiente.length ? 'Turno abierto con lo que quedó del anterior' : 'Turno abierto');
};

$('#btnCerrarTurno').onclick = () => {
  if (!S.turno) return;
  if (S.pedido.length) {
    toast('Cobra o vacía el pedido pendiente antes de cerrar');
    return;
  }
  const total = totalCaja();
  if (!confirm(`¿Cerrar el turno con ${dinero(total)} en caja?\n\nSe guarda en el historial y empiezas de cero.`)) return;

  S.historial.push({
    id: S.turno.id,
    inicio: S.turno.inicio,
    fin: Date.now(),
    total,
    ventas: S.turno.ventas.length,
    detalle: S.productos.map((p) => ({
      nombre: p.nombre,
      unidad: unidadDe(p),
      entro: entradaDe(p.id),
      vendido: vendidoDe(p.id),
      merma: mermaDe(p.id),
      queda: quedaReal(p.id),
      dinero: dineroDe(p.id),
    })),
    mermasDetalle: S.turno.mermas.map((m) => ({
      nombre: (prodPorId(m.productoId) || {}).nombre || '—',
      cantidad: m.cantidad,
      motivo: m.motivo,
      hora: m.hora,
    })),
    ventasDetalle: S.turno.ventas.map((v) => ({
      hora: v.hora,
      total: v.total,
      lineas: v.lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, unidad: l.unidad, importe: l.importe })),
    })),
  });

  const sobrante = S.productos
    .map((p) => ({ p, q: quedaReal(p.id) }))
    .filter((x) => x.q > 0);

  S.turno = null;
  S.sobrante = [];
  guardar();

  if (sobrante.length && confirm('¿Pasar lo que quedó al próximo turno?\n\nSe carga cuando se abra el turno siguiente.')) {
    S.sobrante = sobrante.map((x) => ({ productoId: x.p.id, cantidad: x.q }));
    toast('Turno cerrado · lo que quedó pasa al próximo');
  } else {
    toast('Turno cerrado');
  }
  totalPrevio = 0;
  guardar();
  render();
};

$('#btnCopiar').onclick = async () => {
  const L = [];
  L.push(NEGOCIO + ' · TURNO ' + rango(S.turno.inicio, Date.now()));
  const nv = S.turno.ventas.length;
  L.push('Caja: ' + dinero(totalCaja()) + '  ·  ' + nv + (nv === 1 ? ' venta' : ' ventas'));
  L.push('');
  for (const p of S.productos) {
    const mer = mermaDe(p.id);
    L.push(
      `${p.nombre}: entró ${cant(entradaDe(p.id), p)} | vendido ${cant(vendidoDe(p.id), p)}` +
      (mer ? ` | ${mer > 0 ? 'merma' : 'sobró'} ${cant(Math.abs(mer), p)}` : '') +
      ` | queda ${cant(quedaReal(p.id), p)}`
    );
  }
  const perdido = mermaTotal();
  if (perdido > 0) L.push('', 'Merma del turno: ' + dinero(perdido) + ' en mercancía');
  const txt = L.join('\n');
  try {
    await navigator.clipboard.writeText(txt);
    toast('Resumen copiado');
  } catch {
    prompt('Copia el resumen:', txt);
  }
};

/* ---------------- aviso de pesar ---------------- */
$('#btnIrInventario').onclick = () => document.querySelector('.tab[data-view="inventario"]').click();
$('#btnYaPese').onclick = () => {
  S.turno.avisoPesado = true;
  guardar();
  render();
  toast('Listo, a vender');
};

/* ---------------- modal: venta ---------------- */
const dlgVenta = $('#dlgVenta');
let vProd = null;
let vUnidad = 'u'; // unidad en la que se está escribiendo

/* cuánto vale 1 de la unidad escrita, en la unidad base del producto */
function factor(u) {
  return { g: 0.001, kg: 1, oz: 1 / 16, lb: 1, u: 1 }[u] || 1;
}
function alterna(u) {
  return { kg: 'g', g: 'kg', lb: 'oz', oz: 'lb' }[u] || null;
}
const QUICK = {
  kg: [0.25, 0.5, 1], g: [100, 250, 500], lb: [0.5, 1, 2], oz: [4, 8, 16], u: [1, 2, 3, 6],
};

function abrirVenta(p) {
  vProd = p;
  vUnidad = unidadDe(p);
  $('#ventaTitulo').textContent = p.nombre;
  const yaEnPedido = enPedidoDe(p.id);
  $('#ventaSub').textContent =
    precioLabel(p) + ' · quedan ' + cant(quedaDe(p.id), p) +
    (yaEnPedido ? ` · ya lleva ${cant(yaEnPedido, p)}` : '');
  $('#ventaCantidad').value = '';
  pintarUnidadVenta();
  calcVenta();
  dlgVenta.showModal();
  setTimeout(() => $('#ventaCantidad').focus(), 50);
}

function pintarUnidadVenta() {
  const alt = alterna(vUnidad);
  const chip = $('#ventaToggleUnidad');
  chip.hidden = !alt;
  chip.textContent = vUnidad;
  $('#ventaLabelCant').textContent = vProd.tipo === 'peso' ? 'Cuánto lleva' : 'Cuántas unidades';

  const q = $('#ventaQuick');
  q.innerHTML = '';
  for (const v of QUICK[vUnidad] || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = v + ' ' + vUnidad;
    b.onclick = () => {
      $('#ventaCantidad').value = String(v);
      calcVenta();
    };
    q.appendChild(b);
  }
}

$('#ventaToggleUnidad').onclick = () => {
  const alt = alterna(vUnidad);
  if (!alt) return;
  const actual = num($('#ventaCantidad').value);
  vUnidad = alt;
  if (actual) {
    const base = actual * factor(alterna(vUnidad));
    const nueva = base / factor(vUnidad);
    $('#ventaCantidad').value = String(Math.round(nueva * 1000) / 1000);
  }
  pintarUnidadVenta();
  calcVenta();
};

function cantidadBaseVenta() {
  return num($('#ventaCantidad').value) * factor(vUnidad);
}

function calcVenta() {
  const base = cantidadBaseVenta();
  const imp = Math.round(base * vProd.precio * 100) / 100;
  $('#ventaImporte').textContent = dinero(imp);
  $('#btnAgregarCobrar').textContent = `Cobrar ${dinero(totalPedido() + imp)}`;
  const q = quedaDe(vProd.id);
  const av = $('#ventaAviso');
  if (base > q) {
    av.hidden = false;
    av.textContent = `Solo quedan ${cant(q, vProd)} según el inventario.`;
  } else {
    av.hidden = true;
  }
}
$('#ventaCantidad').addEventListener('input', calcVenta);

/* Mete la cantidad escrita en el pedido del cliente. Devuelve false si no hay nada que meter. */
function agregarLinea(silencioso) {
  vProd = vigente(vProd);
  if (!vProd) {
    toast('Ese producto ya no existe');
    dlgVenta.close();
    return false;
  }
  const base = cantidadBaseVenta();
  if (base <= 0) {
    if (!silencioso) toast('Escribe una cantidad');
    return false;
  }
  const importe = Math.round(base * vProd.precio * 100) / 100;
  const igual = S.pedido.find((l) => l.productoId === vProd.id);
  if (igual) {
    // mismo producto dos veces en el mismo pedido: se suma en una sola línea
    // (redondeo a 6 decimales para que 0.1+0.2 no deje basura de coma flotante)
    igual.cantidad = Math.round((igual.cantidad + base) * 1e6) / 1e6;
    igual.importe = Math.round(igual.cantidad * vProd.precio * 100) / 100;
  } else {
    S.pedido.push({
      productoId: vProd.id,
      nombre: vProd.nombre,
      unidad: unidadDe(vProd),
      precio: vProd.precio,
      cantidad: base,
      importe,
    });
  }
  guardar();
  render();
  return true;
}

function cobrar() {
  if (!S.pedido.length) {
    toast('El pedido está vacío');
    return;
  }
  const total = Math.round(S.pedido.reduce((a, l) => a + l.importe, 0) * 100) / 100;
  S.turno.ventas.push({ id: id(), hora: Date.now(), total, lineas: S.pedido });
  S.pedido = [];
  ultimaVenta = true;
  guardar();
  render();
  toast('Cobrado ' + dinero(total));
}

$('#formVenta').addEventListener('submit', (e) => {
  if (!agregarLinea()) {
    e.preventDefault();
    return;
  }
  toast('Agregado al pedido');
});

$('#btnAgregarCobrar').onclick = () => {
  // si escribió una cantidad la suma; si dejó el campo vacío, cobra lo que ya hay
  const habia = S.pedido.length > 0;
  const agrego = agregarLinea(habia);
  if (!agrego && !habia) return;
  cobrar();
  dlgVenta.close();
};

$('#btnCobrar').onclick = cobrar;

$('#btnVaciarPedido').onclick = () => {
  if (!S.pedido.length) return;
  if (!confirm('¿Vaciar el pedido del cliente?')) return;
  S.pedido = [];
  guardar();
  render();
  toast('Pedido vaciado');
};

function quitarLinea(i) {
  S.pedido.splice(i, 1);
  guardar();
  render();
}

function borrarVenta(vid) {
  const v = S.turno.ventas.find((x) => x.id === vid);
  if (!v) return;
  const qué = v.lineas.length === 1 ? v.lineas[0].nombre : `${v.lineas.length} productos`;
  if (!confirm(`¿Borrar la venta de ${qué} por ${dinero(v.total)}?`)) return;
  S.turno.ventas = S.turno.ventas.filter((x) => x.id !== vid);
  guardar();
  render();
  toast('Venta borrada');
}

/* ---------------- modal: producto ---------------- */
const dlgProd = $('#dlgProducto');
let pEdit = null;
let pTipo = 'peso';
let pUnidad = 'lb';
let pUnidadFija = false; // el producto ya tiene movimientos: no se le cambia la unidad

function pintarProdLabels() {
  $('#prodUnidadWrap').hidden = pTipo !== 'peso';
  const u = pTipo === 'peso' ? pUnidad : 'u';
  $('#prodPrecioLabel').textContent =
    pTipo === 'peso' ? `Precio por ${pUnidad === 'lb' ? 'libra' : 'kilo'}` : 'Precio por unidad';
  $('#prodEntradaLabel').textContent = `Entró en el turno (${u})`;
  for (const b of $('#prodTipo').children) b.classList.toggle('is-on', b.dataset.tipo === pTipo);
  for (const b of $('#prodUnidad').children) b.classList.toggle('is-on', b.dataset.unidad === pUnidad);
  for (const b of [...$('#prodTipo').children, ...$('#prodUnidad').children]) b.disabled = pUnidadFija;
  $('#prodUnidadNota').hidden = !pUnidadFija;
}

for (const b of $('#prodTipo').children) {
  b.onclick = () => { if (!pUnidadFija) { pTipo = b.dataset.tipo; pintarProdLabels(); } };
}
for (const b of $('#prodUnidad').children) {
  b.onclick = () => { if (!pUnidadFija) { pUnidad = b.dataset.unidad; pintarProdLabels(); } };
}

function abrirProducto(p) {
  pEdit = p || null;
  pTipo = p ? p.tipo : 'peso';
  pUnidad = p && p.unidad ? p.unidad : 'lb';
  pUnidadFija = !!p && unidadFija(p.id);
  $('#prodTitulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('#prodNombre').value = p ? p.nombre : '';
  $('#prodPrecio').value = p ? p.precio : '';
  $('#prodEntrada').value = '';
  $('#prodEntrada').parentElement.hidden = !S.turno || !!p;
  $('#btnBorrarProd').hidden = !p;
  pintarProdLabels();
  dlgProd.showModal();
}

$('#btnNuevoProducto').onclick = () => abrirProducto(null);

$('#formProducto').addEventListener('submit', (e) => {
  const nombre = $('#prodNombre').value.trim();
  const precio = num($('#prodPrecio').value);
  if (!nombre || precio <= 0) {
    e.preventDefault();
    toast('Falta el nombre o el precio');
    return;
  }
  if (pEdit) pEdit = vigente(pEdit);
  if (pEdit === undefined) {
    toast('Ese producto ya no existe');
    return;
  }
  if (pEdit) {
    // si le entraron movimientos mientras el modal estaba abierto, la unidad se queda como está
    if (unidadFija(pEdit.id)) { pTipo = pEdit.tipo; pUnidad = pEdit.unidad; }
    Object.assign(pEdit, { nombre, precio, tipo: pTipo, unidad: pTipo === 'peso' ? pUnidad : null });
    /* La línea del pedido todavía no se cobró: se le aplica el precio y nombre nuevos.
       Si no, el mismo producto tendría dos precios dentro de un pedido. */
    const lp = S.pedido.find((l) => l.productoId === pEdit.id);
    if (lp) {
      lp.nombre = nombre;
      lp.precio = precio;
      lp.unidad = unidadDe(pEdit);
      lp.importe = Math.round(lp.cantidad * precio * 100) / 100;
    }
  } else {
    const p = { id: id(), nombre, precio, tipo: pTipo, unidad: pTipo === 'peso' ? pUnidad : null };
    S.productos.push(p);
    const ent = num($('#prodEntrada').value);
    if (S.turno && ent > 0) {
      S.turno.entradas.push({ id: id(), productoId: p.id, cantidad: ent, hora: Date.now() });
    }
  }
  guardar();
  render();
  toast(pEdit ? 'Producto actualizado' : 'Producto agregado');
});

$('#btnBorrarProd').onclick = () => {
  pEdit = vigente(pEdit);
  if (!pEdit) return;
  const tieneVentas = S.turno &&
    S.turno.ventas.some((v) => v.lineas.some((l) => l.productoId === pEdit.id));
  const msg = tieneVentas
    ? `"${pEdit.nombre}" tiene ventas en este turno. Si lo borras, esas ventas siguen contando en la caja pero ya no verás su inventario. ¿Seguir?`
    : `¿Borrar "${pEdit.nombre}"?`;
  if (!confirm(msg)) return;
  S.productos = S.productos.filter((p) => p.id !== pEdit.id);
  S.sobrante = S.sobrante.filter((x) => x.productoId !== pEdit.id);
  if (S.turno) {
    S.turno.entradas = S.turno.entradas.filter((e) => e.productoId !== pEdit.id);
    S.turno.mermas = S.turno.mermas.filter((m) => m.productoId !== pEdit.id);
  }
  /* si estaba en el pedido a medio armar, esa línea ya no se puede cobrar */
  S.pedido = S.pedido.filter((l) => l.productoId !== pEdit.id);
  guardar();
  render();
  dlgProd.close();
  toast('Producto borrado');
};

/* ---------------- modal: merma ---------------- */
/* El turno es de tres días: el lomo ahumado se descongela, suelta agua y al otro día pesa
   menos de lo que dice la app. Esto cuadra la existencia sin tocar el dinero de la caja. */
const dlgMerma = $('#dlgMerma');
const MOTIVOS = ['Descongelación', 'Se secó', 'Recorte', 'Se dañó', 'Otro'];
let mProd = null;
let mModo = 'conteo';
let mMotivo = MOTIVOS[0];

function abrirMerma(p) {
  mProd = p;
  mModo = 'conteo';
  mMotivo = MOTIVOS[0];
  $('#mermaSub').textContent = `${p.nombre} · la app dice que quedan ${cant(quedaReal(p.id), p)}`;
  $('#mermaCantidad').value = '';
  pintarMerma();
  calcMerma();
  dlgMerma.showModal();
  setTimeout(() => $('#mermaCantidad').focus(), 50);
}

function pintarMerma() {
  for (const b of $('#mermaModo').children) b.classList.toggle('is-on', b.dataset.modo === mModo);
  $('#mermaLabel').textContent = mModo === 'conteo'
    ? `Lo que hay de verdad (${unidadDe(mProd)})`
    : `Lo que se perdió (${unidadDe(mProd)})`;

  const cont = $('#mermaMotivos');
  cont.innerHTML = '';
  for (const m of MOTIVOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m;
    b.className = m === mMotivo ? 'is-on' : '';
    b.onclick = () => { mMotivo = m; pintarMerma(); };
    cont.appendChild(b);
  }
}

for (const b of $('#mermaModo').children) {
  b.onclick = () => { mModo = b.dataset.modo; pintarMerma(); calcMerma(); };
}

/* Diferencia en positivo = se perdió; en negativo = apareció de más */
function diferenciaMerma() {
  const v = num($('#mermaCantidad').value);
  if (!$('#mermaCantidad').value.trim()) return null;
  return mModo === 'conteo' ? Math.round((quedaReal(mProd.id) - v) * 1000) / 1000 : v;
}

function calcMerma() {
  const d = diferenciaMerma();
  const res = $('#mermaResultado');
  const av = $('#mermaAviso');
  if (d === null || d === 0) {
    res.textContent = '—';
    res.className = '';
    av.hidden = true;
    return;
  }
  if (d > 0) {
    res.textContent = `merma de ${cant(d, mProd)}`;
    res.className = 'negativo';
    av.hidden = false;
    av.textContent = `Son ${dinero(d * mProd.precio)} de mercancía. No toca el dinero de la caja.`;
  } else {
    res.textContent = `sobran ${cant(-d, mProd)}`;
    res.className = 'positivo';
    av.hidden = false;
    av.textContent = 'Apareció más de lo que decía la app: se suma a la existencia.';
  }
}
$('#mermaCantidad').addEventListener('input', calcMerma);

$('#formMerma').addEventListener('submit', (e) => {
  const d = diferenciaMerma();
  if (d === null || d === 0) {
    e.preventDefault();
    toast(d === 0 ? 'No hay diferencia que anotar' : 'Escribe la cantidad');
    return;
  }
  S.turno.mermas.push({
    id: id(),
    productoId: mProd.id,
    cantidad: d,
    motivo: mMotivo,
    hora: Date.now(),
  });
  guardar();
  render();
  toast(d > 0 ? 'Merma anotada' : 'Ajuste anotado');
});

/* ---------------- modal: entrada ---------------- */
const dlgEnt = $('#dlgEntrada');
let eProd = null;

function abrirEntrada(p) {
  eProd = p;
  $('#entradaSub').textContent = p.nombre + ' · ahora hay ' + cant(quedaDe(p.id), p);
  $('#entradaLabel').textContent = `Cantidad que entró (${unidadDe(p)})`;
  $('#entradaCantidad').value = '';
  dlgEnt.showModal();
  setTimeout(() => $('#entradaCantidad').focus(), 50);
}

$('#formEntrada').addEventListener('submit', (e) => {
  const c = num($('#entradaCantidad').value);
  if (c <= 0) {
    e.preventDefault();
    toast('Escribe una cantidad');
    return;
  }
  S.turno.entradas.push({ id: id(), productoId: eProd.id, cantidad: c, hora: Date.now() });
  guardar();
  render();
  toast('Entrada sumada');
});

/* ---------------- modal: entradas y mermas de un producto ---------------- */
/* Una entrada mal escrita (100 en vez de 10) no se puede arreglar con una merma: le llegaría
   al jefe como mercancía perdida. Aquí se ve lo anotado en el turno y se borra lo que esté mal. */
const dlgMovs = $('#dlgMovs');
let movsProdId = null;

function abrirMovs(p) {
  movsProdId = p.id;
  pintarMovs();
  dlgMovs.showModal();
}

function pintarMovs() {
  const p = prodPorId(movsProdId);
  if (!p || !S.turno) return dlgMovs.close();
  $('#movsTitulo').textContent = p.nombre;
  $('#movsSub').textContent = `Quedan ${cant(quedaReal(p.id), p)} · toca × para borrar lo que se anotó mal`;

  const movs = [
    ...S.turno.entradas.filter((e) => e.productoId === p.id).map((e) => ({ ...e, clase: 'entrada' })),
    ...S.turno.mermas.filter((m) => m.productoId === p.id).map((m) => ({ ...m, clase: 'merma' })),
  ].sort((a, b) => a.hora - b.hora);

  const ul = $('#listaMovs');
  ul.innerHTML = '';
  for (const m of movs) {
    const titulo = m.clase === 'entrada'
      ? (m.origen === 'sobrante' ? 'Entrada · quedó del turno anterior' : 'Entrada')
      : `${m.cantidad > 0 ? 'Merma' : 'Sobró al pesar'} · ${m.motivo}`;
    const signo = m.clase === 'entrada' || m.cantidad < 0 ? '+' : '−';
    const li = document.createElement('li');
    li.innerHTML =
      `<div class="tk-info"><div class="tk-nom"></div><div class="tk-det"></div></div>` +
      `<span class="tk-imp ${signo === '+' ? 'positivo' : 'negativo'}">${signo}${cant(Math.abs(m.cantidad), p)}</span>` +
      `<button class="tk-del" title="Borrar">&times;</button>`;
    li.querySelector('.tk-nom').textContent = titulo;
    li.querySelector('.tk-det').textContent = `${fecha(m.hora)} ${hora(m.hora)}`;
    li.querySelector('.tk-del').onclick = () => borrarMov(m);
    ul.appendChild(li);
  }
  $('#vacioMovs').hidden = movs.length > 0;
}

function borrarMov(m) {
  const p = prodPorId(m.productoId);
  if (!p || !S.turno) return;
  let msg;
  if (m.clase === 'entrada') {
    const quedaria = quedaReal(p.id) - m.cantidad;
    msg = `¿Borrar la entrada de ${cant(m.cantidad, p)} de ${p.nombre}?` +
      (quedaria < 0 ? `\n\nOjo: quedarían ${cant(quedaria, p)}, porque ya se vendió más de lo que entraría.` : '');
  } else {
    msg = `¿Borrar ${m.cantidad > 0 ? 'la merma' : 'el sobrante'} de ${cant(Math.abs(m.cantidad), p)} (${m.motivo})?` +
      `\n\nLa existencia vuelve a ${cant(quedaReal(p.id) + m.cantidad, p)}.`;
  }
  if (!confirm(msg)) return;
  if (m.clase === 'entrada') S.turno.entradas = S.turno.entradas.filter((e) => e.id !== m.id);
  else S.turno.mermas = S.turno.mermas.filter((x) => x.id !== m.id);
  guardar();
  render();
  pintarMovs();
  toast(m.clase === 'entrada' ? 'Entrada borrada' : 'Merma borrada');
}

/* cerrar modales con el botón Cancelar */
for (const b of document.querySelectorAll('[data-cerrar]')) {
  b.onclick = () => b.closest('dialog').close();
}

/* ---------------- exportar y respaldar ---------------- */

/* Descarga un texto como archivo. Funciona sin internet: el archivo se arma aquí mismo. */
function descargar(nombre, texto, mime) {
  const blob = new Blob([texto], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function selloFecha(ts) {
  const d = new Date(ts);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/* Excel en español espera ; como separador y coma decimal */
const nc = (n, dec) => (Math.round(n * 10 ** dec) / 10 ** dec).toFixed(dec).replace('.', ',');
/* cantidades: hasta 3 decimales, sin ceros de relleno (9,75 en vez de 9,750) */
const nq = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const celda = (v) => {
  let t = String(v ?? '');
  if (/^[=@]/.test(t)) t = "'" + t; // que Excel no lo interprete como fórmula
  return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};

/* Un turno (cerrado o el de ahora) en el formato que usa el CSV */
function turnoPlano(t, abierto) {
  if (!abierto) return t;
  return {
    inicio: t.inicio,
    fin: Date.now(),
    total: totalCaja(),
    ventas: t.ventas.length,
    detalle: S.productos.map((p) => ({
      nombre: p.nombre,
      unidad: unidadDe(p),
      entro: entradaDe(p.id),
      vendido: vendidoDe(p.id),
      merma: mermaDe(p.id),
      queda: quedaReal(p.id),
      dinero: dineroDe(p.id),
    })),
  };
}

function construirCsv() {
  const filas = [[
    'Fecha inicio', 'Hora inicio', 'Fecha fin', 'Hora fin', 'Estado',
    'Ventas del turno', 'Total del turno',
    'Producto', 'Unidad', 'Entro', 'Vendido', 'Merma', 'Queda', 'Dinero del producto',
  ]];

  const turnos = S.historial.map((h) => turnoPlano(h, false));
  if (S.turno) turnos.push(turnoPlano(S.turno, true));

  for (const t of turnos) {
    const abierto = S.turno && t.inicio === S.turno.inicio;
    const base = [
      selloFecha(t.inicio), hora(t.inicio), selloFecha(t.fin), hora(t.fin),
      abierto ? 'en curso' : 'cerrado',
      t.ventas, nc(t.total, 2),
    ];
    const det = t.detalle || [];
    if (!det.length) {
      filas.push([...base, '', '', '', '', '', '', '']);
      continue;
    }
    for (const d of det) {
      filas.push([
        ...base, d.nombre, d.unidad,
        nq(d.entro), nq(d.vendido), nq(d.merma || 0), nq(d.queda),
        nc(d.dinero || 0, 2),
      ]);
    }
  }

  // BOM para que Excel no rompa los acentos
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
}

$('#btnCsv').onclick = () => {
  if (!S.historial.length && !S.turno) {
    toast('Todavía no hay nada que exportar');
    return;
  }
  descargar(`${NEGOCIO.toLowerCase()}-historial-${selloFecha(Date.now())}.csv`, construirCsv(), 'text/csv');
  toast('CSV descargado');
};

$('#btnJson').onclick = () => {
  const respaldo = {
    app: 'mostrador',
    negocio: NEGOCIO,
    version: 1,
    exportado: new Date().toISOString(),
    datos: S,
  };
  descargar(
    `${NEGOCIO.toLowerCase()}-respaldo-${selloFecha(Date.now())}.json`,
    JSON.stringify(respaldo, null, 2),
    'application/json'
  );
  toast('Respaldo descargado');
};

$('#btnImportar').onclick = () => $('#inputImportar').click();

$('#inputImportar').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  try {
    const crudo = JSON.parse(await file.text());
    const datos = crudo && crudo.datos ? crudo.datos : crudo;
    if (!datos || !Array.isArray(datos.productos) || !Array.isArray(datos.historial)) {
      toast('Ese archivo no es un respaldo de Mostrador');
      return;
    }
    const aviso =
      `El respaldo trae ${datos.productos.length} ${datos.productos.length === 1 ? 'producto' : 'productos'}` +
      ` y ${datos.historial.length} ${datos.historial.length === 1 ? 'turno' : 'turnos'}` +
      (datos.turno ? ', con un turno abierto' : '') +
      '.\n\nEsto REEMPLAZA lo que tienes ahora. ¿Seguir?';
    if (!confirm(aviso)) return;
    S = migrar(Object.assign(vacio(), datos));
    guardar();
    totalPrevio = totalCaja();
    render();
    toast('Respaldo restaurado');
  } catch (err) {
    console.warn(err);
    toast('No se pudo leer el archivo');
  }
});

/* Para dejar la app como nueva (p. ej. antes de enseñarla). Pide escribir BORRAR
   porque no tiene vuelta atrás: un toque suelto no puede llevarse el historial. */
$('#btnBorrarTodo').onclick = () => {
  const r = prompt(
    `Esto borra TODO: ${S.productos.length} ${S.productos.length === 1 ? 'producto' : 'productos'}` +
    `, ${S.historial.length} ${S.historial.length === 1 ? 'turno' : 'turnos'}` +
    (S.turno ? ' y el turno abierto' : '') +
    '.\n\nSi quieres conservarlo, descarga antes el respaldo (.json).\n\nEscribe BORRAR para confirmar:'
  );
  if (r === null) return;
  if (r.trim().toUpperCase() !== 'BORRAR') {
    toast('No se borró nada');
    return;
  }
  try {
    [KEY, KEY + '.roto', PASOS_KEY].forEach((k) => localStorage.removeItem(k));
  } catch {}
  S = vacio();
  totalPrevio = totalCaja();
  pasos.open = true;
  render();
  window.scrollTo(0, 0);
  toast('Listo, la app quedó en cero');
};

/* ---------------- tabs ---------------- */
for (const t of document.querySelectorAll('.tab')) {
  t.onclick = () => {
    for (const x of document.querySelectorAll('.tab')) x.classList.remove('is-active');
    for (const v of document.querySelectorAll('.view')) v.classList.remove('is-active');
    t.classList.add('is-active');
    $('#view-' + t.dataset.view).classList.add('is-active');
    window.scrollTo(0, 0);
  };
}

/* ---------------- pasos del cierre ---------------- */
/* Se recuerda si los dejó abiertos o cerrados, para no pelear con la app cada día. */
const PASOS_KEY = 'mostrador.pasos';
const pasos = $('#pasos');
try {
  pasos.open = localStorage.getItem(PASOS_KEY) !== 'cerrado';
} catch { pasos.open = true; }
pasos.addEventListener('toggle', () => {
  try { localStorage.setItem(PASOS_KEY, pasos.open ? 'abierto' : 'cerrado'); } catch {}
});

/* ---------------- medidas de las barras pegajosas ---------------- */
/* La barra de caja y las pestañas se quedan fijas arriba; el pedido va justo debajo.
   Como la altura cambia con el tamaño de letra, se mide y se guarda en CSS. */
function medirSticky() {
  const r = document.documentElement.style;
  r.setProperty('--caja-h', $('#cajaBar').offsetHeight + 'px');
  r.setProperty('--tabs-h', document.querySelector('.tabs').offsetHeight + 'px');
}
addEventListener('resize', medirSticky);
addEventListener('load', medirSticky);   // otra vez con las fuentes ya cargadas
medirSticky();

/* ---------------- mantenerse al día ---------------- */
/* El turno dura tres días y la app puede quedar abierta todo ese tiempo:
   - cada minuto se refresca la cabecera (el "día 2 · desde…" cambia solo a medianoche);
   - al volver a la pestaña (el celular que estuvo guardado) se relee todo, por si
     otro navegador del mismo equipo tocó los datos;
   - si hay dos pestañas abiertas a la vez, el evento storage mantiene a las dos iguales. */
setInterval(renderCaja, 60000);

function releer() {
  S = cargar();
  totalPrevio = totalCaja();
  render();
  if (dlgMovs.open) pintarMovs();
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) releer();
});
addEventListener('storage', (e) => {
  if (e.key === KEY) releer();
});

/* ---------------- arranque ---------------- */
totalPrevio = totalCaja();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* Sin laptop, el teléfono es el único lugar donde viven los datos:
   pedimos que el navegador no los borre cuando le falte espacio. */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
