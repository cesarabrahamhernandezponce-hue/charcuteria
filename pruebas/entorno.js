/* Carga la app en un navegador simulado (jsdom) para usarla como el vendedor:
   tocar botones, escribir cantidades, contestar los confirm(). */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const RAIZ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8')
  .replace('<script src="app.js"></script>', '');
const APP = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const KEY = 'mostrador.v1';

/* La app deja timers vivos (el reloj de la cabecera): hay que cerrar cada ventana al final */
const abiertas = [];
const cerrarTodo = () => abiertas.splice(0).forEach((w) => w.close());

/* datos: estado guardado con el que arranca la app (como si ya se hubiera usado) */
function abrirApp(datos) {
  const dom = new JSDOM(HTML, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  abiertas.push(w);

  // jsdom no trae showModal/close ni dialog del form method="dialog"
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.HTMLFormElement.prototype.requestSubmit = function () {
    const ev = new w.Event('submit', { cancelable: true, bubbles: true });
    if (this.dispatchEvent(ev) && this.method === 'dialog') this.closest('dialog').close();
  };

  /* Respuestas para confirm() y prompt(), en orden. Si no hay, se contesta "sí". */
  const respuestas = [];
  const preguntas = [];
  w.confirm = (msg) => { preguntas.push(msg); return respuestas.length ? respuestas.shift() : true; };
  w.prompt = (msg) => { preguntas.push(msg); return respuestas.length ? respuestas.shift() : ''; };

  if (datos) w.localStorage.setItem(KEY, JSON.stringify(datos));
  /* Como <script> de verdad: sus let/const (S, quedaReal…) quedan visibles para las pruebas */
  const ctx = dom.getInternalVMContext();
  const correr = (codigo) => new vm.Script(codigo).runInContext(ctx);
  correr(APP);

  const $ = (sel) => w.document.querySelector(sel);
  const app = {
    w, $, preguntas, correr,
    contestar: (...r) => respuestas.push(...r),
    get S() { return correr('S'); },
    guardado: () => JSON.parse(w.localStorage.getItem(KEY)),
    toast: () => $('#toast').textContent,
    tocar(sel) {
      const el = typeof sel === 'string' ? $(sel) : sel;
      if (!el) throw new Error('No existe: ' + sel);
      el.click();
    },
    escribir(sel, valor) {
      const el = $(sel);
      el.value = String(valor);
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
    },
    enviar(formSel) { $(formSel).requestSubmit(); },

    /* Botón de una fila del inventario, buscando el producto por nombre */
    filaInv(nombre) {
      return [...w.document.querySelectorAll('#listaInventario li')]
        .find((li) => li.querySelector('.iv-nom').textContent === nombre);
    },
    tarjeta(nombre) {
      return [...w.document.querySelectorAll('#gridVenta .card-prod')]
        .find((b) => b.querySelector('.nom').textContent === nombre);
    },

    /* Simula que el teléfono se va a otra app (WhatsApp) y vuelve */
    salirYVolver() {
      Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
      w.document.dispatchEvent(new w.Event('visibilitychange'));
    },

    /* --- atajos de uso normal --- */
    abrirTurno() { app.tocar('#btnAbrirTurno'); },
    nuevoProducto({ nombre, precio, tipo = 'peso', unidad = 'lb', entro }) {
      app.tocar('#btnNuevoProducto');
      app.escribir('#prodNombre', nombre);
      app.tocar(`#prodTipo [data-tipo="${tipo}"]`);
      if (tipo === 'peso') app.tocar(`#prodUnidad [data-unidad="${unidad}"]`);
      app.escribir('#prodPrecio', precio);
      if (entro != null) app.escribir('#prodEntrada', entro);
      app.enviar('#formProducto');
    },
    vender(nombre, cantidad) {
      app.tocar(app.tarjeta(nombre));
      app.escribir('#ventaCantidad', cantidad);
      app.tocar('#btnAgregarCobrar');
    },
    producto: (nombre) => app.S.productos.find((p) => p.nombre === nombre),
    queda: (nombre) => correr(`quedaReal(${JSON.stringify(app.producto(nombre).id)})`),
  };
  return app;
}

module.exports = { abrirApp, cerrarTodo };
