const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { minimapRegion } = require('../dist-electron/vision/screen-vision.js');
const {
  buildChampionTemplate,
  detectJunglerInMinimap,
  findEnemyRingCandidates,
  shouldAnnounceRadarSighting,
  zoneName,
} = require('../dist-electron/vision/jungle-radar-detector.js');

function makeIcon(width, height, kind) {
  const buf = Buffer.alloc(width * height * 4, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;
      let r = 20;
      let g = 20;
      let b = 20;
      if (kind === 'lee') {
        // Banda diagonal dourada no topo + azul embaixo
        if (nx + ny < 0.95) { r = 235; g = 180; b = 60; }
        else { r = 45; g = 100; b = 210; }
      } else if (kind === 'lux') {
        // Claro em cima, escudo rosa/roxo embaixo
        if (ny < 0.5) { r = 240; g = 240; b = 220; }
        else { r = 180; g = 75; b = 190; }
      } else {
        // Xadrez verde/marrom
        const band = Math.floor(nx * 4) % 2 === 0;
        r = band ? 50 : 120;
        g = band ? 190 : 80;
        b = 60;
      }
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = 255;
    }
  }
  return buf;
}

function drawMinimapChampion(buf, mapW, mapH, cx, cy, r, kind) {
  const iconSize = 64;
  const icon = makeIcon(iconSize, iconSize, kind);
  for (let y = Math.max(0, Math.floor(cy - r - 2)); y <= Math.min(mapH - 1, Math.ceil(cy + r + 2)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 2)); x <= Math.min(mapW - 1, Math.ceil(cx + r + 2)); x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const i = (y * mapW + x) * 4;
      if (dist <= r * 0.8) {
        const ix = Math.max(0, Math.min(iconSize - 1, Math.round(((x - cx) / (r * 0.8) * 0.5 + 0.5) * (iconSize - 1))));
        const iy = Math.max(0, Math.min(iconSize - 1, Math.round(((y - cy) / (r * 0.8) * 0.5 + 0.5) * (iconSize - 1))));
        const si = (iy * iconSize + ix) * 4;
        buf[i] = icon[si];
        buf[i + 1] = icon[si + 1];
        buf[i + 2] = icon[si + 2];
        buf[i + 3] = 255;
      } else if (dist > r * 0.8 && dist <= r + 1.2) {
        // Anel vermelho inimigo
        buf[i] = 40;
        buf[i + 1] = 35;
        buf[i + 2] = 225;
        buf[i + 3] = 255;
      }
    }
  }
}

describe('Radar Visual do Jungler Inimigo (jungle-radar)', () => {
  it('adapta minimapRegion para FlipMiniMap=0/1, várias resoluções, ultrawide e escalas', () => {
    const r1080 = minimapRegion({ width: 1920, height: 1080, scale: 1, flipped: false }, 1280, 720);
    assert.equal(r1080.x + r1080.width, 1280);
    assert.equal(r1080.y + r1080.height, 720);

    const flipped = minimapRegion({ width: 2560, height: 1440, scale: 2, flipped: true }, 1280, 720);
    assert.equal(flipped.x, 0);
    assert.ok(flipped.width > r1080.width, 'MinimapScale=2 deve gerar região maior');

    const uw = minimapRegion({ width: 3440, height: 1440, scale: 1, flipped: false }, 1280, 536);
    assert.equal(uw.x + uw.width, 1280);
    assert.equal(uw.y + uw.height, 536);
  });

  it('detecta o Jungler entre 3 inimigos no minimapa em várias escalas (200x200, 320x320, 480x480)', () => {
    const templates = [
      buildChampionTemplate(makeIcon(64, 64, 'lee'), 64, 64, 'LeeSin', true, 16, 'bgra'),
      buildChampionTemplate(makeIcon(64, 64, 'lux'), 64, 64, 'Lux', false, 16, 'bgra'),
      buildChampionTemplate(makeIcon(64, 64, 'other'), 64, 64, 'Jhin', false, 16, 'bgra'),
    ];

    for (const size of [200, 320, 480]) {
      const box = { left: 20, top: 20, size };
      const W = size + 40;
      const H = size + 40;
      const bgra = Buffer.alloc(W * H * 4, 24);
      const r = Math.max(6, Math.round(size * 0.047));

      // Coloca Lux no Mid, Jhin no Bot e Lee Sin (Jungler) no Rio do Dragão (u=0.66, v=0.70)
      drawMinimapChampion(bgra, W, H, Math.round(box.left + size * 0.50), Math.round(box.top + size * 0.50), r, 'lux');
      drawMinimapChampion(bgra, W, H, Math.round(box.left + size * 0.88), Math.round(box.top + size * 0.88), r, 'other');
      drawMinimapChampion(bgra, W, H, Math.round(box.left + size * 0.66), Math.round(box.top + size * 0.70), r, 'lee');

      const candidates = findEnemyRingCandidates(bgra, W, H, box, 'bgra');
      assert.ok(candidates.length >= 3, `Esperava ≥3 candidatos em ${size}px, achou ${candidates.length}`);

      const hit = detectJunglerInMinimap(bgra, W, H, box, templates, 'ORDER', 425, 'bgra');
      assert.ok(hit, `Deveria detectar o Jungler em ${size}px`);
      assert.ok(Math.abs(hit.u - 0.66) < 0.04, `u=${hit.u} distante de 0.66`);
      assert.ok(Math.abs(hit.v - 0.70) < 0.04, `v=${hit.v} distante de 0.70`);
      assert.equal(hit.zone, 'Rio do Dragão');
    }
  });

  it('classifica corretamente regiões da selva e rios para os dois times', () => {
    assert.equal(zoneName(0.10, 0.25, 'ORDER'), 'Topo');
    assert.equal(zoneName(0.88, 0.85, 'ORDER'), 'Bot');
    assert.equal(zoneName(0.50, 0.50, 'ORDER'), 'Meio');
    assert.equal(zoneName(0.34, 0.30, 'ORDER'), 'Rio do Barão / Larvas');
    assert.equal(zoneName(0.66, 0.70, 'CHAOS'), 'Rio do Dragão');
    // Blue do ORDER (u=0.25, v=0.47): para ORDER é Sua selva azul; para CHAOS é Selva azul inimiga
    assert.equal(zoneName(0.25, 0.47, 'ORDER'), 'Sua selva azul');
    assert.equal(zoneName(0.25, 0.47, 'CHAOS'), 'Selva azul inimiga');
  });

  it('detecta inimigo perto da borda/base do minimapa (sem cortar anéis na margem)', () => {
    const templates = [
      buildChampionTemplate(makeIcon(64, 64, 'lee'), 64, 64, 'LeeSin', true, 16, 'bgra'),
      buildChampionTemplate(makeIcon(64, 64, 'lux'), 64, 64, 'Lux', false, 16, 'bgra'),
    ];
    const size = 260;
    const box = { left: 48, top: 48, size };
    const W = 340;
    const H = 340;
    const bgra = Buffer.alloc(W * H * 4, 24);
    const r = Math.max(6, Math.round(size * 0.047));

    drawMinimapChampion(bgra, W, H, Math.round(box.left + size * 0.04), Math.round(box.top + size * 0.96), r, 'lee');
    const hit = detectJunglerInMinimap(bgra, W, H, box, templates, 'CHAOS', 680, 'bgra');
    assert.ok(hit, 'Deveria detectar o jungler mesmo colado na borda da base inimiga');
    assert.equal(hit.zone, 'Base inimiga');
  });

  it('respeita cooldown de avisos e reavisa ao mudar de rota ou ficar sumido >= 15s', () => {
    const pt = (zone, gameTime) => ({ u: 0.5, v: 0.5, zone, gameTime, confidence: 0.7 });

    // Primeiro avistamento sempre avisa
    assert.equal(shouldAnnounceRadarSighting(null, pt('Rio do Dragão', 100), null), true);

    // Continua visível na mesma região -> não repete
    const prevAlert = { zone: 'Rio do Dragão', gameTime: 100 };
    assert.equal(shouldAnnounceRadarSighting(prevAlert, pt('Rio do Dragão', 108), pt('Rio do Dragão', 106)), false);
    assert.equal(shouldAnnounceRadarSighting(prevAlert, pt('Rio do Dragão', 120), pt('Rio do Dragão', 118)), false);

    // Mudou de região antes de 12 s -> segura; depois de 12 s -> avisa
    assert.equal(shouldAnnounceRadarSighting(prevAlert, pt('Meio', 110), pt('Rio do Dragão', 108)), false);
    assert.equal(shouldAnnounceRadarSighting(prevAlert, pt('Meio', 114), pt('Meio', 112)), true);

    // Ficou sumido >= 15 s e reapareceu -> avisa mesmo na mesma região
    assert.equal(shouldAnnounceRadarSighting(prevAlert, pt('Rio do Dragão', 120), pt('Rio do Dragão', 102)), true);

    // Relógio voltou atrás ("Resetar partida" no Modo de treino) -> avisa
    assert.equal(shouldAnnounceRadarSighting(prevAlert, pt('Topo', 20), pt('Rio do Dragão', 100)), true);
  });
});
