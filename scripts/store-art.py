# Artes da Microsoft Store (1920x1080): título + subtítulo + print real do app.
# Uso: python scripts/store-art.py <pasta com os prints de shots.sh> release/store-listing
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SHOTS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
FONTS = Path('C:/Windows/Fonts')
HEAD = ImageFont.truetype(str(FONTS / 'BarlowCondensed-ExtraBold.ttf'), 84)
SUB = ImageFont.truetype(str(FONTS / 'BarlowCondensed-Medium.ttf'), 38)
TAG = ImageFont.truetype(str(FONTS / 'BarlowCondensed-Bold.ttf'), 28)
W, H = 1920, 1080
ACCENT = (255, 106, 61)

FRAMES = [
    ('players', 'RAIO-X DOS 10 JOGADORES', 'Elo, rota, campeões, duo e até quem é provável smurf, antes do primeiro abate.', 'PARTIDA AO VIVO'),
    ('champselect', 'A BUILD CERTA PARA O SEU CONFRONTO', 'Runas, feitiços e itens de Mestre+ do BR, EUW e KR, aplicados no cliente em 1 clique.', 'SELEÇÃO DE CAMPEÕES'),
    ('live', 'A PARTIDA INTEIRA NUMA TELA', 'Placar, ouro, objetivos e timers ao vivo, com sugestões da IA durante o jogo.', 'AO VIVO'),
    ('postgame', 'UM COACH DEPOIS DE CADA JOGO', 'Você comparado à sua própria média: o que mandou bem e o que dá para melhorar.', 'FIM DE JOGO'),
    ('tierlist', 'TIER LIST MESTRE+ DE VERDADE', 'Calculada de partidas reais de alto elo, atualizada a cada patch.', 'TIER LIST'),
    ('builds', 'BUILDS E RUNAS DE ALTO ELO', 'Todo campeão, toda rota, com taxa de vitória e itens situacionais.', 'BUILDS'),
    ('history', 'SEU HISTÓRICO, SEM ENROLAÇÃO', 'Partidas, campeões, rotas e evolução de PDL de qualquer jogador.', 'HISTÓRICO'),
    ('home', 'TUDO PRONTO AO ABRIR O LOL', 'Aceite automático da fila, modo invisível no chat e o seu momento no jogo.', 'INÍCIO'),
]


def background() -> Image.Image:
    bg = Image.new('RGB', (W, H), (11, 13, 18))
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((-300, -500, 1100, 500), fill=(90, 32, 18))
    d.ellipse((1100, 500, 2400, 1500), fill=(28, 34, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    return Image.blend(bg, glow, 0.85)


def rounded(im: Image.Image, radius: int) -> Image.Image:
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *im.size), radius, fill=255)
    out = im.convert('RGBA')
    out.putalpha(mask)
    return out


def place_shot(canvas: Image.Image, shot: Image.Image, box_w: int, top: int) -> None:
    shot = shot.convert('RGB')
    scale = box_w / shot.width
    shot = shot.resize((box_w, round(shot.height * scale)), Image.LANCZOS)
    max_h = H - top - 40
    if shot.height > max_h:
        shot = shot.crop((0, 0, shot.width, max_h))
    x = (W - shot.width) // 2
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x - 6, top + 18, x + shot.width + 6, top + shot.height + 30), 22, fill=(0, 0, 0, 200))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas.alpha_composite(shadow)
    border = Image.new('RGBA', (shot.width + 4, shot.height + 4), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle((0, 0, *border.size), 20, outline=(255, 106, 61, 150), width=2)
    canvas.alpha_composite(rounded(shot, 18), (x, top))
    canvas.alpha_composite(border, (x - 2, top - 2))


def centered(draw: ImageDraw.ImageDraw, y: int, text: str, font, fill) -> None:
    w = draw.textlength(text, font=font)
    draw.text(((W - w) / 2, y), text, font=font, fill=fill)


def frame(name: str, title: str, sub: str, tag: str, index: int) -> None:
    canvas = background().convert('RGBA')
    d = ImageDraw.Draw(canvas)
    tw = d.textlength(tag, font=TAG) + 36
    d.rounded_rectangle(((W - tw) / 2, 44, (W + tw) / 2, 86), 21, fill=(52, 26, 20), outline=ACCENT, width=2)
    centered(d, 48, tag, TAG, ACCENT)
    centered(d, 96, title, HEAD, (245, 247, 250))
    centered(d, 196, sub, SUB, (170, 178, 194))
    place_shot(canvas, Image.open(SHOTS / f'{name}.png'), 1440, 268)
    canvas.convert('RGB').save(OUT / f'{index:02d}-{name}.png', optimize=True)


def phones(index: int) -> None:
    canvas = background().convert('RGBA')
    d = ImageDraw.Draw(canvas)
    tag = 'APP ANDROID'
    tw = d.textlength(tag, font=TAG) + 36
    d.rounded_rectangle(((W - tw) / 2, 44, (W + tw) / 2, 86), 21, fill=(52, 26, 20), outline=ACCENT, width=2)
    centered(d, 48, tag, TAG, ACCENT)
    centered(d, 96, 'ACOMPANHE PELO CELULAR', HEAD, (245, 247, 250))
    centered(d, 196, 'Vincule o celular e veja a partida, a seleção e o seu perfil de qualquer lugar.', SUB, (170, 178, 194))
    shots = [Image.open(SHOTS / f'{n}.png').convert('RGB') for n in ('phone-home', 'phone-live')]
    target_h = 760
    widths = [round(s.width * target_h / s.height) for s in shots]
    gap = 90
    x = (W - sum(widths) - gap) // 2
    for shot, w in zip(shots, widths):
        im = shot.resize((w, target_h), Image.LANCZOS)
        shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((x - 10, 290, x + w + 10, 290 + target_h + 26), 40, fill=(0, 0, 0, 210))
        canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(26)))
        bezel = Image.new('RGBA', (w + 20, target_h + 20), (0, 0, 0, 0))
        ImageDraw.Draw(bezel).rounded_rectangle((0, 0, *bezel.size), 40, fill=(30, 33, 42, 255), outline=(255, 106, 61, 140), width=2)
        canvas.alpha_composite(bezel, (x - 10, 278))
        canvas.alpha_composite(rounded(im, 30), (x, 288))
        x += w + gap
    canvas.convert('RGB').save(OUT / f'{index:02d}-celular.png', optimize=True)


for i, (name, title, sub, tag) in enumerate(FRAMES, start=1):
    frame(name, title, sub, tag, i)
phones(len(FRAMES) + 1)
print('ok', len(list(OUT.glob('*.png'))))
