import { clamp, randomRange, circleIntersectsRect, resolveCircleRect, distanceSq } from '../core/math.js';

export class Level {
  constructor(width = 2400, height = 1700) {
    this.width = width;
    this.height = height;
    this.obstacles = [];
    this.hazards = [];
    this.spawnPoints = [];
    this.seedGeometry();
  }

  seedGeometry() {
    this.obstacles.length = 0;
    const center = { x: this.width / 2, y: this.height / 2 };
    const candidates = [
      [260, 250, 180, 70], [690, 190, 86, 190], [1090, 260, 210, 62], [1710, 210, 170, 76], [2020, 430, 80, 200],
      [310, 740, 80, 190], [740, 650, 210, 72], [1430, 590, 90, 190], [1780, 810, 200, 75], [550, 1200, 185, 80],
      [1030, 1110, 72, 190], [1450, 1300, 210, 72], [1970, 1200, 110, 170], [900, 1480, 170, 58],
    ];
    for (const [x, y, w, h] of candidates) {
      const rect = { x, y, w, h };
      const cx = x + w / 2;
      const cy = y + h / 2;
      if (distanceSq(cx, cy, center.x, center.y) > 250 * 250) this.obstacles.push(rect);
    }
    // A few seeded variations keep runs from feeling identical without blocking the central start zone.
    let attempts = 0;
    while (this.obstacles.length < 17 && attempts < 120) {
      attempts += 1;
      const w = randomRange(65, 150);
      const h = randomRange(55, 125);
      const x = randomRange(100, this.width - w - 100);
      const y = randomRange(100, this.height - h - 100);
      const candidate = { x, y, w, h };
      const cx = x + w / 2;
      const cy = y + h / 2;
      const tooCloseToCenter = distanceSq(cx, cy, center.x, center.y) < 310 * 310;
      const overlaps = this.obstacles.some((rect) => !(x + w + 45 < rect.x || x > rect.x + rect.w + 45 || y + h + 45 < rect.y || y > rect.y + rect.h + 45));
      if (!tooCloseToCenter && !overlaps) this.obstacles.push(candidate);
    }
  }

  isBlocked(x, y, radius = 18) {
    if (x - radius < 18 || y - radius < 18 || x + radius > this.width - 18 || y + radius > this.height - 18) return true;
    return this.obstacles.some((rect) => circleIntersectsRect(x, y, radius, rect));
  }

  moveEntity(entity, dx, dy) {
    // Substeps prevent tunnelling at high speed; axis-separated resolution makes walls slide instead of snag.
    const steps = Math.max(1, Math.min(12, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / Math.max(4, entity.radius * 0.45))));
    const sx = dx / steps;
    const sy = dy / steps;
    let blockedX = false;
    let blockedY = false;
    for (let step = 0; step < steps; step += 1) {
      const beforeX = entity.x;
      entity.x += sx;
      this.resolveEntity(entity);
      if (Math.abs(sx) > .01 && (entity.x - beforeX) * Math.sign(sx) < Math.abs(sx) * .2) blockedX = true;

      const beforeY = entity.y;
      entity.y += sy;
      this.resolveEntity(entity);
      if (Math.abs(sy) > .01 && (entity.y - beforeY) * Math.sign(sy) < Math.abs(sy) * .2) blockedY = true;
    }
    return { blockedX, blockedY, movedX: entity.x, movedY: entity.y };
  }

  resolveEntity(entity) {
    entity.x = clamp(entity.x, 18 + entity.radius, this.width - 18 - entity.radius);
    entity.y = clamp(entity.y, 18 + entity.radius, this.height - 18 - entity.radius);
    // Multiple passes handle corners where two rectangles meet.
    for (let pass = 0; pass < 3; pass += 1) {
      let changed = false;
      for (const rect of this.obstacles) changed = resolveCircleRect(entity, rect) || changed;
      if (!changed) break;
      entity.x = clamp(entity.x, 18 + entity.radius, this.width - 18 - entity.radius);
      entity.y = clamp(entity.y, 18 + entity.radius, this.height - 18 - entity.radius);
    }
  }

  repositionSpawnPoints(player, wave) {
    this.spawnPoints.length = 0;
    const angleOffset = wave * 0.19 + randomRange(-0.12, 0.12);
    const baseRadius = clamp(625 + wave * 5, 625, 790);
    for (let i = 0; i < 6; i += 1) {
      let found = null;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const angle = angleOffset + (Math.PI * 2 * i) / 6 + randomRange(-0.25, 0.25) + attempt * 0.13;
        const radius = baseRadius + randomRange(-90, 100);
        const x = clamp(player.x + Math.cos(angle) * radius, 70, this.width - 70);
        const y = clamp(player.y + Math.sin(angle) * radius, 70, this.height - 70);
        const spreadFromPlayer = distanceSq(x, y, player.x, player.y) > 365 * 365;
        const spreadFromOther = this.spawnPoints.every((point) => distanceSq(x, y, point.x, point.y) > 250 * 250);
        if (spreadFromPlayer && spreadFromOther && !this.isBlocked(x, y, 27)) {
          found = { x, y, index: i };
          break;
        }
      }
      if (!found) {
        const backupAngles = [0, Math.PI / 3, (Math.PI * 2) / 3, Math.PI, (Math.PI * 4) / 3, (Math.PI * 5) / 3];
        for (let offset = 0; offset < backupAngles.length && !found; offset += 1) {
          const angle = backupAngles[(i + offset) % backupAngles.length] + angleOffset;
          const x = clamp(player.x + Math.cos(angle) * 540, 70, this.width - 70);
          const y = clamp(player.y + Math.sin(angle) * 540, 70, this.height - 70);
          if (!this.isBlocked(x, y, 27)) found = { x, y, index: i };
        }
      }
      if (!found) found = { x: 110 + (i % 3) * 1080, y: i < 3 ? 110 : this.height - 110, index: i };
      this.spawnPoints.push(found);
    }
  }

  findSpawnPoint(anchor, radius = 24) {
    const angles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI * .75, -Math.PI * .75];
    for (let ring = 0; ring < 5; ring += 1) {
      const distance = ring * 38;
      for (const angle of angles) {
        const x = clamp(anchor.x + Math.cos(angle) * distance, 45, this.width - 45);
        const y = clamp(anchor.y + Math.sin(angle) * distance, 45, this.height - 45);
        if (!this.isBlocked(x, y, radius)) return { x, y };
      }
    }
    // Deterministic fallback avoids a soft-lock if an anchor lands in a bad pocket.
    for (let y = 70; y < this.height - 70; y += 90) {
      for (let x = 70; x < this.width - 70; x += 90) {
        if (!this.isBlocked(x, y, radius)) return { x, y };
      }
    }
    return { x: this.width / 2, y: this.height / 2 };
  }

  generateHazards(wave, player) {
    this.hazards.length = 0;
    const count = Math.min(4 + Math.floor(wave / 2), 9);
    let attempts = 0;
    while (this.hazards.length < count && attempts < 160) {
      attempts += 1;
      const x = randomRange(110, this.width - 110);
      const y = randomRange(110, this.height - 110);
      const radius = randomRange(34, 51);
      if (distanceSq(x, y, player.x, player.y) < 300 * 300 || this.isBlocked(x, y, radius + 14)) continue;
      if (this.hazards.some((hazard) => distanceSq(x, y, hazard.x, hazard.y) < 190 * 190)) continue;
      this.hazards.push({ id: `hotspot-${wave}-${this.hazards.length}`, x, y, radius, damage: 8 + Math.floor(wave * 0.55), nextHitAt: 0, pulse: randomRange(0, Math.PI * 2) });
    }
  }

  updateHazards(player, damageSystem, now) {
    for (const hazard of this.hazards) {
      const reach = hazard.radius + player.radius;
      if (now >= hazard.nextHitAt && distanceSq(player.x, player.y, hazard.x, hazard.y) < reach * reach) {
        damageSystem.apply(player, hazard.damage, now, 'environmental hotspot', { invulnerability: 0.72 });
        hazard.nextHitAt = now + 1.05;
      }
    }
  }

  draw(ctx, now = 0) {
    ctx.fillStyle = '#101a22';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.strokeStyle = 'rgba(118, 157, 169, 0.075)';
    ctx.lineWidth = 1;
    const grid = 80;
    for (let x = 0; x <= this.width; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
    }
    for (let y = 0; y <= this.height; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(79, 232, 207, 0.13)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, this.width - 40, this.height - 40);

    for (const rect of this.obstacles) {
      ctx.fillStyle = '#1b2a35';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.fillRect(rect.x + 5, rect.y + rect.h - 4, rect.w, 7);
      ctx.strokeStyle = 'rgba(122, 160, 176, .32)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x + .75, rect.y + .75, rect.w - 1.5, rect.h - 1.5);
      ctx.strokeStyle = 'rgba(79, 232, 207, .12)';
      ctx.beginPath(); ctx.moveTo(rect.x + 7, rect.y + 7); ctx.lineTo(rect.x + Math.min(rect.w - 7, 48), rect.y + 7); ctx.stroke();
    }

    for (const hazard of this.hazards) {
      const pulse = 1 + Math.sin(now * 3 + hazard.pulse) * .07;
      ctx.save();
      ctx.translate(hazard.x, hazard.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(255, 105, 97, .075)';
      ctx.beginPath(); ctx.arc(0, 0, hazard.radius + 15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 111, 103, .7)';
      ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, hazard.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 102, 98, .18)';
      ctx.beginPath(); ctx.arc(0, 0, hazard.radius * .52, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 153, 127, .8)';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const point of this.spawnPoints) {
      const pulse = 1 + Math.sin(now * 2.4 + point.index) * .06;
      ctx.save(); ctx.translate(point.x, point.y); ctx.scale(pulse, pulse);
      ctx.strokeStyle = 'rgba(255, 146, 92, .45)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}
