# Velocidad de cambio con los parámetros de Pulpos (semilla de init.sql):
# Th = 60 × Ct y Tkm = Cb + Cl × Pc; el cruce con la recta de cada superficie es Vc = Th / (Tkm × F).
# Uso: python velocidad_cambio.py  (requiere matplotlib; escribe velocidad_cambio.png y .svg aquí)
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CB, CL, PC, CT = 2.00, 0.100, 6.96, 0.50
TH = 60 * CT
TKM = CB + CL * PC
# (nombre, F, color, desplazamiento de la etiqueta en puntos, alineación)
SUPERFICIES = [
    ('Asfalto', 1.00, '#2a78d6', (8, -30), 'left'),
    ('Empedrado', 2.00, '#eb6834', (10, -66), 'left'),
    ('Tierra', 2.50, '#1baf7a', (-8, 8), 'right'),
]
TINTA, TINTA_2, REJILLA = '#0b0b0b', '#52514e', '#e4e3df'
V_MAX, Y_MAX = 30, 100

coma = lambda x, d=2: f'{x:.{d}f}'.replace('.', ',')

plt.rcParams.update({'font.family': 'Arial', 'font.size': 10, 'text.color': TINTA,
                     'axes.labelcolor': TINTA_2, 'xtick.color': TINTA_2, 'ytick.color': TINTA_2})
fig, ax = plt.subplots(figsize=(7, 4.4), dpi=300)

ax.axhline(TH, color=TINTA, lw=2, ls=(0, (6, 3)), label=f'Por tiempo: Th = {coma(TH)} Bs/h')
for nombre, f, color, desplazamiento, alineacion in SUPERFICIES:
    pendiente = TKM * f
    v_fin = min(V_MAX, Y_MAX / pendiente)
    ax.plot([0, v_fin], [0, pendiente * v_fin], color=color, lw=2,
            label=f'Por distancia en {nombre.lower()}: {coma(pendiente)} Bs/km')
    vc = TH / pendiente
    ax.plot(vc, TH, 'o', ms=8, color=color, mec='white', mew=2, zorder=3)
    ax.annotate(f'{nombre}\nVc = {coma(vc, 1)} km/h', (vc, TH), xytext=desplazamiento,
                textcoords='offset points', ha=alineacion, fontsize=9, color=TINTA,
                arrowprops=dict(arrowstyle='-', color=TINTA_2, lw=0.8, shrinkA=2, shrinkB=6))

ax.text(V_MAX - 0.3, TH + 2, 'modo S: bajo Vc se cobra el tiempo,\nsobre Vc la distancia',
        ha='right', va='bottom', fontsize=8.5, color=TINTA_2)
ax.set(xlim=(0, V_MAX), ylim=(0, Y_MAX), xlabel='Velocidad del vehículo (km/h)', ylabel='Importe por hora (Bs/h)')
ax.grid(color=REJILLA, lw=0.8)
ax.set_axisbelow(True)
for lado in ('top', 'right'):
    ax.spines[lado].set_visible(False)
for lado in ('left', 'bottom'):
    ax.spines[lado].set_color(TINTA_2)
ax.legend(loc='upper left', frameon=False, fontsize=8.5)
fig.tight_layout()

salida = Path(__file__).with_suffix('')
fig.savefig(salida.with_suffix('.png'), facecolor='white')
fig.savefig(salida.with_suffix('.svg'), facecolor='white')
