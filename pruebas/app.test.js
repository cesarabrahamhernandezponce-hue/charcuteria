/* Correr:  cd pruebas && npm install && npm test */
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirApp, cerrarTodo } = require('./entorno');

test.afterEach(cerrarTodo);

/* Un turno abierto con jamón (por libra) y huevos (por unidad) */
function turnoConProductos() {
  const app = abrirApp();
  app.abrirTurno();
  app.nuevoProducto({ nombre: 'Jamón', precio: 4.5, tipo: 'peso', unidad: 'lb', entro: 10 });
  app.nuevoProducto({ nombre: 'Huevos', precio: 0.3, tipo: 'unidad', entro: 30 });
  return app;
}

test('cuentas básicas: 3.2 lb a $4.50 = $14.40 y la caja lo suma', () => {
  const app = turnoConProductos();
  app.vender('Jamón', 3.2);
  assert.equal(app.S.turno.ventas[0].total, 14.4);
  assert.equal(app.$('#cajaMonto').textContent, '$14.40');
  assert.equal(app.queda('Jamón'), 6.8);
});

test('pedido de varios productos: 10 huevos + 2 lb de jamón = $12.00 en una sola venta', () => {
  const app = turnoConProductos();
  app.tocar(app.tarjeta('Huevos'));
  app.escribir('#ventaCantidad', 10);
  app.enviar('#formVenta');                 // + Agregar y seguir
  app.tocar(app.tarjeta('Jamón'));
  app.escribir('#ventaCantidad', 2);
  app.tocar('#btnAgregarCobrar');
  assert.equal(app.S.turno.ventas.length, 1);
  assert.equal(app.S.turno.ventas[0].total, 12);
  assert.equal(app.S.pedido.length, 0);
});

/* ---------- 1. editar un producto y salir a otra app a medio camino ---------- */
test('1. editar, ir a WhatsApp y volver: el cambio de precio se guarda', () => {
  const app = turnoConProductos();
  app.tocar(app.filaInv('Jamón').querySelector('[data-edit]'));
  app.escribir('#prodPrecio', 5);
  app.salirYVolver();                        // la app relee sus datos al volver
  app.enviar('#formProducto');
  assert.equal(app.producto('Jamón').precio, 5);
  assert.equal(app.guardado().productos.find((p) => p.nombre === 'Jamón').precio, 5);
});

test('1. vender con el modal abierto mientras el precio cambió en otra pestaña: cobra el precio nuevo', () => {
  const app = turnoConProductos();
  app.tocar(app.tarjeta('Jamón'));
  const datos = app.guardado();
  datos.productos.find((p) => p.nombre === 'Jamón').precio = 5;
  app.w.localStorage.setItem('mostrador.v1', JSON.stringify(datos));
  app.salirYVolver();
  app.escribir('#ventaCantidad', 2);
  app.tocar('#btnAgregarCobrar');
  assert.equal(app.S.turno.ventas[0].total, 10);
});

/* ---------- 2. cambiar la unidad de un producto con movimientos ---------- */
test('2. no deja cambiar lb → kg si el producto ya tiene movimientos en el turno', () => {
  const app = turnoConProductos();
  app.vender('Jamón', 2);
  app.tocar(app.filaInv('Jamón').querySelector('[data-edit]'));
  assert.ok(!app.$('#prodUnidadNota').hidden, 'explica por qué no se puede');
  assert.ok(app.$('#prodUnidad [data-unidad="kg"]').disabled);
  app.tocar('#prodUnidad [data-unidad="kg"]');
  app.tocar('#prodTipo [data-tipo="unidad"]');
  app.enviar('#formProducto');
  const p = app.producto('Jamón');
  assert.equal(p.tipo, 'peso');
  assert.equal(p.unidad, 'lb');
  assert.equal(app.queda('Jamón'), 8);
});

test('2. un producto sin movimientos sí puede cambiar de unidad', () => {
  const app = abrirApp();
  app.abrirTurno();
  app.nuevoProducto({ nombre: 'Queso', precio: 6, tipo: 'peso', unidad: 'lb' });
  app.tocar(app.filaInv('Queso').querySelector('[data-edit]'));
  assert.ok(app.$('#prodUnidadNota').hidden);
  app.tocar('#prodUnidad [data-unidad="kg"]');
  app.enviar('#formProducto');
  assert.equal(app.producto('Queso').unidad, 'kg');
});

/* ---------- 3. el sobrante espera a que el compañero abra su turno ---------- */
test('3. al pasar el sobrante no se abre turno: se carga cuando el siguiente lo abre', () => {
  const app = turnoConProductos();
  app.vender('Jamón', 3);
  app.contestar(true, true);                 // ¿cerrar? sí · ¿pasar sobrante? sí
  app.tocar('#btnCerrarTurno');
  assert.equal(app.S.turno, null, 'no debe quedar un turno abierto');
  assert.equal(app.S.historial.length, 1);
  assert.ok(!app.$('#sinTurno').hidden, 'se ve la pantalla de abrir turno');
  assert.match(app.$('#sinTurnoSobrante').textContent, /2 productos/);
  assert.match(app.filaInv('Jamón').textContent, /quedó 7 lb/);

  const antes = Date.now();
  app.abrirTurno();
  assert.ok(app.S.turno.inicio >= antes, 'el turno empieza cuando se abre');
  assert.equal(app.queda('Jamón'), 7);
  assert.equal(app.queda('Huevos'), 30);
  assert.equal(app.S.sobrante.length, 0);
});

test('3. si dice que no al sobrante, el turno siguiente empieza en cero', () => {
  const app = turnoConProductos();
  app.contestar(true, false);
  app.tocar('#btnCerrarTurno');
  app.abrirTurno();
  assert.equal(app.queda('Jamón'), 0);
});

test('3. el sobrante pasa por el respaldo: el compañero restaura y al abrir tiene la mercancía', () => {
  const yo = turnoConProductos();
  yo.vender('Jamón', 3);
  yo.contestar(true, true);
  yo.tocar('#btnCerrarTurno');
  const archivo = { app: 'mostrador', version: 1, datos: yo.guardado() };

  const companero = abrirApp();
  const w = companero.w;
  const input = companero.$('#inputImportar');
  const file = new w.File([JSON.stringify(archivo)], 'respaldo.json', { type: 'application/json' });
  file.text = async () => JSON.stringify(archivo);   // jsdom no trae Blob.text()
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new w.Event('change'));
  return new Promise((ok) => setTimeout(ok, 50)).then(() => {
    assert.equal(companero.S.historial.length, 1);
    companero.abrirTurno();
    assert.equal(companero.queda('Jamón'), 7);
  });
});

test('3. no deja cambiar la unidad de un producto con sobrante pendiente', () => {
  const app = turnoConProductos();
  app.contestar(true, true);
  app.tocar('#btnCerrarTurno');
  app.tocar(app.filaInv('Jamón').querySelector('[data-edit]'));
  assert.ok(!app.$('#prodUnidadNota').hidden);
});

test('3. datos viejos con el sobrante ya abierto como turno siguen funcionando', () => {
  const app = abrirApp({
    productos: [{ id: 'p1', nombre: 'Lomo', precio: 5, tipo: 'peso', unidad: 'lb' }],
    turno: { id: 't1', inicio: 1, entradas: [{ id: 'e1', productoId: 'p1', cantidad: 4, hora: 1 }], ventas: [], mermas: [] },
    historial: [], pedido: [],
  });
  assert.equal(app.queda('Lomo'), 4);
});

/* ---------- 4. borrar una entrada o una merma mal puesta ---------- */
test('4. una entrada mal escrita (100 en vez de 10) se borra y no queda como merma', () => {
  const app = abrirApp();
  app.abrirTurno();
  app.nuevoProducto({ nombre: 'Lomo', precio: 5, entro: 100 });
  app.tocar(app.filaInv('Lomo').querySelector('[data-movs]'));
  app.tocar(app.$('#listaMovs .tk-del'));    // confirm → sí
  assert.equal(app.queda('Lomo'), 0);
  assert.equal(app.S.turno.mermas.length, 0);

  app.tocar(app.filaInv('Lomo').querySelector('[data-ent]'));
  app.escribir('#entradaCantidad', 10);
  app.enviar('#formEntrada');
  assert.equal(app.queda('Lomo'), 10);
});

test('4. una merma mal anotada se borra y la existencia vuelve', () => {
  const app = turnoConProductos();
  app.tocar(app.filaInv('Jamón').querySelector('[data-merma]'));
  app.escribir('#mermaCantidad', 9);         // pesé y quedan 9 → merma 1
  app.enviar('#formMerma');
  assert.equal(app.queda('Jamón'), 9);

  app.tocar(app.filaInv('Jamón').querySelector('[data-movs]'));
  const filas = [...app.w.document.querySelectorAll('#listaMovs li')];
  const merma = filas.find((li) => /merma/i.test(li.textContent));
  app.tocar(merma.querySelector('.tk-del'));
  assert.equal(app.queda('Jamón'), 10);
  assert.equal(app.S.turno.mermas.length, 0);
});

test('4. si dice que no, no se borra nada', () => {
  const app = turnoConProductos();
  app.tocar(app.filaInv('Jamón').querySelector('[data-movs]'));
  app.contestar(false);
  app.tocar(app.$('#listaMovs .tk-del'));
  assert.equal(app.queda('Jamón'), 10);
});

/* ---------- 5. borrar un producto que ya se vendió ---------- */
test('5. no deja borrar un producto con ventas en el turno: el cierre seguiría cuadrando', () => {
  const app = turnoConProductos();
  app.vender('Jamón', 2);
  app.tocar(app.filaInv('Jamón').querySelector('[data-edit]'));
  app.tocar('#btnBorrarProd');
  assert.ok(app.producto('Jamón'), 'el producto sigue');
  assert.match(app.preguntas.at(-1), /tiene ventas/);
  const filasCierre = app.w.document.querySelectorAll('#tablaCierre tbody tr');
  assert.equal(filasCierre.length, 2);
  // la suma por producto da el total de la caja
  const suma = app.S.productos.reduce((a, p) => a + app.correr(`dineroDe(${JSON.stringify(p.id)})`), 0);
  assert.equal(suma, app.correr('totalCaja()'));
});

test('5. tampoco con mermas; borrada la merma, ya se puede', () => {
  const app = turnoConProductos();
  app.tocar(app.filaInv('Huevos').querySelector('[data-merma]'));
  app.tocar('#mermaModo [data-modo="perdida"]');
  app.escribir('#mermaCantidad', 2);
  app.enviar('#formMerma');
  app.tocar(app.filaInv('Huevos').querySelector('[data-edit]'));
  app.tocar('#btnBorrarProd');
  assert.ok(app.producto('Huevos'));
  assert.match(app.preguntas.at(-1), /mermas/);

  app.tocar(app.filaInv('Huevos').querySelector('[data-movs]'));
  const merma = [...app.w.document.querySelectorAll('#listaMovs li')].find((li) => /merma/i.test(li.textContent));
  app.tocar(merma.querySelector('.tk-del'));
  app.tocar(app.filaInv('Huevos').querySelector('[data-edit]'));
  app.tocar('#btnBorrarProd');
  assert.equal(app.producto('Huevos'), undefined);
});

test('5. un producto recién creado por error (solo con entrada) sí se borra', () => {
  const app = turnoConProductos();
  app.nuevoProducto({ nombre: 'Jamon repetido', precio: 4.5, entro: 5 });
  app.tocar(app.filaInv('Jamon repetido').querySelector('[data-edit]'));
  app.tocar('#btnBorrarProd');
  assert.equal(app.producto('Jamon repetido'), undefined);
  assert.equal(app.S.turno.entradas.filter((e) => e.cantidad === 5).length, 0);
});
