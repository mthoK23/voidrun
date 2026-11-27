import { ObjectPool } from '../core/object-pool.js';
import { Projectile } from '../entities/projectile.js';
import { distanceSq, randomRange } from '../core/math.js';

const WEAPON_DEFS = {
  pulse: {
    id: 'pulse', name: 'Pulse Rifle', detail: 'PRECISION BURST // 18 DMG', fireDelay: .23,
    damage: 18, speed: 790, radius: 4.2, life: 1.3, shots: 1, spread: .025, color: '#75f6df',
  },
  scatter: {
    id: 'scatter', name: 'Scatter Cannon', detail: 'SIX-PELLET SPREAD // CLOSE RANGE', fireDelay: .76,
    damage: 8, speed: 655, radius: 3.7, life: .9, shots: 6, spread: .57, color: '#ffab77',
  },
  needle: {
    id: 'needle', name: 'Needle SMG', detail: 'HIGH CYCLIC RATE // 8 DMG', fireDelay: .1,
    damage: 8, speed: 940, radius: 2.8, life: 1.12, shots: 1, spread: .075, color: '#c7aaff',
  },
};

class WeaponInstance {
  constructor() { this.definition = null; this.cooldown = 0; }
  configure(definition) { this.definition = definition; this.cooldown = 0; }
  deactivate() { this.definition = null; this.cooldown = 0; }
}

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.weaponPool = new ObjectPool(() => new WeaponInstance(), 6);
    this.friendlyPool = new ObjectPool(() => new Projectile('friendly'), 180);
    this.hostilePool = new ObjectPool(() => new Projectile('hostile'), 100);
    this.friendly = [];
    this.hostile = [];
    this.currentWeapon = null;
  }

  get choices() { return Object.values(WEAPON_DEFS); }

  equip(id) {
    const definition = WEAPON_DEFS[id];
    if (!definition) return false;
    if (this.currentWeapon) this.weaponPool.release(this.currentWeapon);
    const instance = this.weaponPool.acquire();
    if (!instance) return false;
    instance.configure(definition);
    this.currentWeapon = instance;
    return true;
  }

  releaseWeapon() {
    if (this.currentWeapon) this.weaponPool.release(this.currentWeapon);
    this.currentWeapon = null;
  }

  update(dt, player, enemies, level, now, shouldFire, targetX, targetY) {
    if (this.currentWeapon) {
      this.currentWeapon.cooldown = Math.max(0, this.currentWeapon.cooldown - dt);
      if (shouldFire && player.alive && this.currentWeapon.cooldown <= 0) {
        this.firePlayer(player, targetX, targetY, now);
      }
    }

    for (let i = this.friendly.length - 1; i >= 0; i -= 1) {
      const projectile = this.friendly[i];
      if (!projectile.update(dt, level)) {
        this.friendly.splice(i, 1); this.friendlyPool.release(projectile); continue;
      }
      let hit = false;
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        const reach = enemy.radius + projectile.radius;
        if (distanceSq(projectile.x, projectile.y, enemy.x, enemy.y) <= reach * reach) {
          this.game.damageSystem.apply(enemy, projectile.damage, now, 'player projectile');
          hit = true;
          break;
        }
      }
      if (hit) {
        this.friendly.splice(i, 1); this.friendlyPool.release(projectile);
      }
    }

    for (let i = this.hostile.length - 1; i >= 0; i -= 1) {
      const projectile = this.hostile[i];
      if (!projectile.update(dt, level)) {
        this.hostile.splice(i, 1); this.hostilePool.release(projectile); continue;
      }
      const reach = player.radius + projectile.radius;
      if (player.alive && distanceSq(projectile.x, projectile.y, player.x, player.y) <= reach * reach) {
        this.game.damageSystem.apply(player, projectile.damage, now, 'hostile projectile', { invulnerability: .78 });
        const angle = Math.atan2(player.y - projectile.y, player.x - projectile.x);
        player.vx += Math.cos(angle) * 70;
        player.vy += Math.sin(angle) * 70;
        this.hostile.splice(i, 1); this.hostilePool.release(projectile);
      }
    }
  }

  firePlayer(player, targetX, targetY, now) {
    const weapon = this.currentWeapon?.definition;
    if (!weapon) return;
    const angle = Math.atan2(targetY - player.y, targetX - player.x);
    const delay = weapon.fireDelay / Math.max(.55, player.fireRateMultiplier);
    this.currentWeapon.cooldown = delay;
    const shots = weapon.shots;
    const spread = weapon.spread * player.spreadMultiplier;
    for (let i = 0; i < shots; i += 1) {
      const projectile = this.friendlyPool.acquire();
      if (!projectile) break; // A full pool drops excess rounds safely rather than allocating without bound.
      const shotAngle = angle + (shots === 1 ? randomRange(-spread, spread) : randomRange(-spread / 2, spread / 2));
      projectile.activate({
        x: player.x + Math.cos(angle) * (player.radius + 10),
        y: player.y + Math.sin(angle) * (player.radius + 10),
        angle: shotAngle, speed: weapon.speed, damage: Math.round(weapon.damage * player.damageMultiplier),
        radius: weapon.radius, life: weapon.life, color: weapon.color, owner: player,
      });
      this.friendly.push(projectile);
    }
  }

  fireHostile(enemy, player, now) {
    const projectile = this.hostilePool.acquire();
    if (!projectile) return;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + randomRange(-.055, .055);
    projectile.activate({
      x: enemy.x + Math.cos(angle) * (enemy.radius + 7),
      y: enemy.y + Math.sin(angle) * (enemy.radius + 7),
      angle, speed: 345 + Math.min(95, enemy.wave * 4), damage: enemy.damage,
      radius: 5, life: 2.3, color: '#d3a5ff', owner: enemy,
    });
    this.hostile.push(projectile);
  }

  clearProjectiles() {
    this.friendlyPool.releaseAll(this.friendly);
    this.hostilePool.releaseAll(this.hostile);
    this.friendly.length = 0;
    this.hostile.length = 0;
  }

  draw(ctx) {
    for (const projectile of this.friendly) projectile.draw(ctx);
    for (const projectile of this.hostile) projectile.draw(ctx);
  }

  get weaponName() { return this.currentWeapon?.definition?.name || '—'; }
  get weaponDetail() { return this.currentWeapon?.definition?.detail || '—'; }
}
