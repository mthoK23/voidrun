import { clamp, normalize } from '../core/math.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.radius = 16;
    this.x = 1200;
    this.y = 850;
    this.vx = 0;
    this.vy = 0;
    this.maxSpeed = 315;
    this.acceleration = 1550;
    this.friction = 9.5;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.invulnerableUntil = 0;
    this.iFrameDuration = 0.78;
    this.damageMultiplier = 1;
    this.fireRateMultiplier = 1;
    this.moveMultiplier = 1;
    this.spreadMultiplier = 1;
    this.facing = 0;
    this.flashUntil = 0;
    this.alive = true;
    this.weapon = null;
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.health = this.maxHealth = 100;
    this.armor = 0;
    this.invulnerableUntil = 0;
    this.damageMultiplier = 1;
    this.fireRateMultiplier = 1;
    this.moveMultiplier = 1;
    this.spreadMultiplier = 1;
    this.alive = true;
    this.flashUntil = 0;
  }

  update(dt, input, level, worldMouseX, worldMouseY) {
    if (!this.alive) return;
    const axis = input.axis();
    const direction = normalize(axis.x, axis.y);
    if (direction.length > 0) {
      // Normalizing the input gives every one of the eight directions equal acceleration.
      // Damping lateral velocity while steering removes the "diagonal skating" feel.
      const along = this.vx * direction.x + this.vy * direction.y;
      const lateralX = this.vx - along * direction.x;
      const lateralY = this.vy - along * direction.y;
      const lateralDamping = Math.exp(-7.5 * dt);
      this.vx = along * direction.x + lateralX * lateralDamping;
      this.vy = along * direction.y + lateralY * lateralDamping;
      this.vx += direction.x * this.acceleration * this.moveMultiplier * dt;
      this.vy += direction.y * this.acceleration * this.moveMultiplier * dt;
    } else {
      const drag = Math.exp(-this.friction * dt);
      this.vx *= drag;
      this.vy *= drag;
    }

    const speed = Math.hypot(this.vx, this.vy);
    const maxSpeed = this.maxSpeed * this.moveMultiplier;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.vx *= scale; this.vy *= scale;
    }

    const movement = level.moveEntity(this, this.vx * dt, this.vy * dt);
    // Remove only the blocked velocity component; a diagonal input can still slide along the wall.
    if (movement.blockedX || this.x <= this.radius + 18 || this.x >= level.width - this.radius - 18) this.vx = 0;
    if (movement.blockedY || this.y <= this.radius + 18 || this.y >= level.height - this.radius - 18) this.vy = 0;
    this.facing = Math.atan2(worldMouseY - this.y, worldMouseX - this.x);
  }

  onDamage(_amount, _source, now) {
    this.flashUntil = now + 0.16;
  }

  onDeath() {
    this.alive = false;
    this.vx = 0; this.vy = 0;
    this.game.onPlayerDeath();
  }

  draw(ctx, now) {
    if (!this.alive) return;
    const flicker = now < this.invulnerableUntil && Math.floor(now * 18) % 2 === 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facing);
    ctx.globalAlpha = flicker ? .42 : 1;
    ctx.fillStyle = 'rgba(79,232,207,.15)';
    ctx.beginPath(); ctx.arc(0, 0, this.radius + 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = now < this.flashUntil ? '#ffffff' : '#4fe8cf';
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10252b';
    ctx.beginPath(); ctx.arc(0, 0, this.radius * .52, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#aaffec';
    ctx.fillRect(5, -4, 22, 8);
    ctx.fillStyle = '#d7fff8';
    ctx.fillRect(20, -2, 8, 4);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(79,232,207,.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
