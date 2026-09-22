# JM — caja y turno de la charcutería

App del mostrador de **JM Charcutería**.

App web **100% offline**: no usa internet, no tiene servidor, no manda datos a ningún lado.
Todo se guarda en el propio navegador (`localStorage`), así que sobrevive si se va la corriente
o cierras el navegador a mitad del turno.

## Cómo abrirla

```bash
./abrir.sh          # levanta http://localhost:8080
```

Luego abre `http://localhost:8080` en el navegador (celular o PC).

**En el celular:** con la PC y el teléfono en el mismo WiFi, abre
`http://IP-DE-TU-PC:8080`. Chrome ofrece *"Agregar a pantalla de inicio"* → queda como una
app normal, con ícono, y **funciona sin conexión** desde la segunda vez que la abres.

## Cómo se usa en el turno

1. **Abrir turno** — arranca la caja en $0.00.
2. **Inventario → + Producto** — nombre, si va *por peso* (lb o kg) o *por unidad*,
   el precio y cuánto te entró. Si te entra más mercancía a media mañana: **+ Entrada**.
3. **Vender** — una venta puede llevar **varios productos** (10 huevos + 3.2 lb de jamón):
   - Tocas el producto, escribes cuánto lleva (el chip `lb`/`oz` cambia la unidad;
     los botones redondos son cantidades rápidas).
   - **+ Agregar y seguir** lo suma al *Pedido del cliente* y vuelves a la lista para el siguiente.
   - **Cobrar $X** registra todo el pedido de una vez. El botón siempre muestra el total corrido,
     así que para un solo producto es directo: cantidad → *Cobrar*.
   - El pedido queda fijo arriba mientras eliges, y lo que apuntas en él ya se descuenta de
     *quedan* para que no vendas dos veces lo mismo.
   - Si te equivocas, la `×` quita una línea del pedido, o borra una venta ya cobrada
     (el dinero baja solo).
4. **Merma** — los turnos son de tres días y hay mercancía que pierde peso sola (el lomo
   ahumado se descongela y suelta agua). En *Inventario* → **Merma**:
   - **Pesé y quedan**: pones lo que marca la pesa y la app calcula sola la diferencia. Es la vía normal.
   - **Se perdió**: pones directo lo que faltó, si ya lo sabes.
   - Eliges el motivo (descongelación, se secó, recorte, se dañó) y te dice cuánto dinero
     en mercancía representa. **La merma nunca toca la caja**: baja la existencia, no el dinero.
   - Si al pesar aparece **más** de lo que decía la app, también se anota: queda como sobrante.

5. **Cierre** — el dinero que debe haber en caja + cuánto entró, se vendió y queda de cada cosa.
   Si dejaste un pedido sin cobrar, te avisa y no deja cerrar hasta que lo cobres o lo vacíes.
   La tabla trae una columna de **merma** y el total de lo que se perdió en mercancía.
   *Copiar resumen* lo deja en texto listo para WhatsApp.
   Al **cerrar turno** te pregunta si quieres pasar el sobrante al turno siguiente. No abre
   un turno nuevo: lo que quedó espera y entra cuando alguien toca *Abrir turno*, con esa fecha.

6. **Guardar fuera de la app** (al final de *Cierre*):
   - **Historial en tabla (.csv)** — todos los turnos, un renglón por producto, listo para Excel
     (separador `;` y coma decimal, como espera el Excel en español). Incluye el turno en curso,
     marcado como `en curso`.
   - **Respaldo completo (.json)** — todo: productos, turno abierto, historial y hasta cada venta
     con su hora. Este es el que sirve para no perder nada.
   - **Restaurar respaldo** — eliges un `.json` y la app vuelve a como estaba. Avisa antes de
     reemplazar lo que tengas.

   Guarda el `.json` fuera del teléfono de vez en cuando (correo, memoria, la PC): es tu seguro.

## Turnos de tres días

El turno se abre una vez y se cierra tres días después: la app lo sabe.

- Arriba dice en qué **día del turno** vas (`día 2 · desde 14-sept`).
- La lista de ventas se separa **por día**, con lo que se hizo en cada uno.
- El cierre, el resumen y el `.csv` traen la fecha de inicio **y** la de fin, no solo la hora.

## La marca

La app usa la marca del negocio: la **salamandra que forma la J con la cola y entra en la M**, en el ícono, en la barra de arriba
y en la pantalla de inicio del celular. Los colores salen de ahí y de los murales que pintaron
en la pared: negro del logo, vino del jamón, amarillo del queso, azul del overol del cerdo.

Los murales están enmarcados dentro de la app (el cerdo carnicero recibe al abrir turno, y los
bodegones acompañan las pantallas vacías).

Las fotos originales viven en `fotos/`. Los recursos que usa la app se generan con:

```bash
python3 scripts/preparar-imagenes.py      # fotos/ -> assets/
```

Ese script recorta, empareja la luz de las fotos de la pared y arma el logo y los íconos.
Solo hay que correrlo si cambian las fotos.

## Documentación

`docs/manual.html` — el manual completo: cómo se usa en el turno y por qué el código está hecho
así (modelo de datos, reglas del negocio, decisiones de interfaz y lo que la app no hace).
Se abre con doble clic o en `http://localhost:8080/docs/manual.html`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Las tres pantallas y los diálogos |
| `app.js` | Toda la lógica: estado, cálculos, render |
| `styles.css` | Estilos (claro y oscuro, móvil y PC) |
| `sw.js` + `manifest.json` | Lo que la hace instalable y offline |
| `assets/` | Logo, íconos y murales ya listos para la app |
| `fotos/` | Las fotos originales del negocio |
| `scripts/preparar-imagenes.py` | Convierte `fotos/` en `assets/` |
| `docs/manual.html` | Manual de uso y decisiones de código |

## Ojo

Los datos viven en **ese navegador y ese dispositivo**. Si borras los datos del navegador,
se borra todo. Por eso existen *Respaldo completo (.json)* y *Copiar resumen*: úsalos.
