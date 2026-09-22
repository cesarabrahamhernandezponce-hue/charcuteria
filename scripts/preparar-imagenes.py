#!/usr/bin/env python3
"""Convierte las fotos del negocio (fotos/) en los recursos que usa la app (assets/).

Las fotos son del logo impreso y de los murales que pintaron en la pared: fondo blanco
de pared. Aquí se recortan, se les quita ese fondo (queda transparente, así sirven igual
en tema claro y oscuro) y se guardan en PNG chiquito para que la app cargue offline.
"""
from PIL import Image, ImageChops

FOTOS = 'fotos/'
OUT = 'assets/'

NEGRO = (23, 21, 15)
CREMA = (243, 239, 231)


def nivelar(im, borde=6, destino=250):
    """Empareja la luz de la foto del mural.

    Son fotos de una pared con luz despareja: se mide el gris de la pared en el marco de
    la imagen y se estira cada canal para que esa pared quede casi blanca. De paso corrige
    el tono (las fotos salen grisáceas) sin tocar los colores de la pintura.
    """
    im = im.convert('RGB')
    w, h = im.size
    marco = []
    px = im.load()
    for x in range(0, w, 2):
        marco += [px[x, y] for y in range(borde)] + [px[x, h - 1 - y] for y in range(borde)]
    for y in range(0, h, 2):
        marco += [px[x, y] for x in range(borde)] + [px[w - 1 - x, y] for x in range(borde)]

    pared = []
    for canal in range(3):
        vals = sorted(p[canal] for p in marco)
        pared.append(max(1, vals[len(vals) // 2]))     # mediana del marco = color de la pared

    bandas = []
    for canal, base in zip(im.split(), pared):
        f = destino / base
        bandas.append(canal.point(lambda v, f=f: min(255, round(v * f))))
    return Image.merge('RGB', bandas)


def plano(im, color):
    """Silueta de un solo color, usando la oscuridad de la foto como alfa (logo).

    Sale en gris+alfa (LA): la marca es de un solo tono, así el png pesa unos pocos KB.
    """
    gris = im.convert('L')
    # la foto del logo trae un halo gris del papel y del jpg: se recorta y se endurece
    alfa = gris.point(lambda v: max(0, min(255, round((255 - v - 26) * 1.3))))
    tono = round(0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2])
    return Image.merge('LA', (Image.new('L', im.size, tono), alfa))


def ancho(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def guardar(im, nombre):
    # Los murales son fotos (jpg); la marca y los íconos van en png con transparencia.
    if nombre.endswith('.jpg'):
        im.save(OUT + nombre, quality=80, optimize=True, progressive=True)
    else:
        im.save(OUT + nombre, optimize=True)
    kb = round(__import__('os').path.getsize(OUT + nombre) / 1024)
    print(f'{nombre:24s} {im.size[0]}x{im.size[1]}  {kb} KB')


# ---------- marca: la salamandra con la M ----------
logo = Image.open(FOTOS + 'IMG-20260821-WA0008.jpg').crop((64, 616, 598, 979))
guardar(ancho(plano(logo, NEGRO), 420), 'logo.png')
guardar(ancho(plano(logo, CREMA), 420), 'logo-crema.png')

# ---------- íconos de la app: marca clara sobre el negro de la marca ----------
marca = plano(logo, CREMA)
for tam, pad, nombre in ((192, 0.14, 'icon-192.png'),
                         (512, 0.14, 'icon-512.png'),
                         (512, 0.26, 'icon-maskable.png')):
    fondo = Image.new('RGBA', (tam, tam), NEGRO + (255,))
    util = round(tam * (1 - pad * 2))
    m = ancho(marca.convert("RGBA"), util)
    if m.height > util:
        m = m.resize((round(m.width * util / m.height), util), Image.LANCZOS)
    fondo.alpha_composite(m, ((tam - m.width) // 2, (tam - m.height) // 2))
    guardar(fondo, nombre)

# ---------- murales del pintor ----------
# Se quedan como lo que son: cuadros pintados en la pared, enmarcados dentro de la app.
murales = [
    ('IMG-20260821-WA0103.jpg', (45, 55, 470, 660), 440, 'cerdo.jpg'),
    ('IMG-20260821-WA0104.jpg', (300, 25, 910, 555), 560, 'bodegon-1.jpg'),
    ('IMG-20260821-WA0105.jpg', (265, 35, 810, 550), 560, 'bodegon-2.jpg'),
]
for archivo, caja, w, nombre in murales:
    im = Image.open(FOTOS + archivo).crop(caja)
    guardar(ancho(nivelar(im), w), nombre)
