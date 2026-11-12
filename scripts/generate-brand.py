"""Render Tempo's original dotted-note vector. Tool dependency: CairoSVG."""
from pathlib import Path
import cairosvg

root = Path(__file__).resolve().parents[1] / 'assets/images'
mark = '<ellipse cx="450" cy="668" rx="102" ry="75" transform="rotate(-16 450 668)"/><path d="M514 650V284Q514 250 545 264L638 318Q732 374 691 460Q680 481 659 470Q640 461 651 438Q676 388 578 350V650Z"/><circle cx="707" cy="662" r="29"/>'
background = '<defs><linearGradient id="p" x2="1" y2="1"><stop stop-color="#9B65FC"/><stop offset="1" stop-color="#5B21B6"/></linearGradient></defs><path fill="url(#p)" d="M0 0h1024v1024H0z"/>'
for name, bg, fill in [('tempo-icon',background,'#FFFFFF'),('tempo-adaptive-foreground','','#FFFFFF'),('tempo-monochrome','','#FFFFFF'),('tempo-splash','','#A78BFA')]:
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{bg}<g fill="{fill}">{mark}</g></svg>'
    (root / f'{name}.svg').write_text(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=str(root / f'{name}.png'))
