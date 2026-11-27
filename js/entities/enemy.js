import { clamp, distance, normalize, randomRange } from '../core/math.js';

const ENEMY_CONFIG = {
  rusher: { radius: 17, health: 34, speed: 103, damage: 15, color: '#ff795f', range: 74, cooldown: 1.05 },
  shooter: { radius: 18, health: 44, speed: 72, damage: 13, color: '#c69cff', range: 76, cooldown: 1.18 },
  brute: { radius: 25, health: 100, speed: 58, damage: 23, color: '#ffb15e', range: 92, cooldown: 1.3 },
};

export class Enemy {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.radius = 17;
    this.type = 'rusher';
    this.health = 1; this.maxHealth = 1;
    this.speed = 100; this.damage = 10; this.armor = 0;
    this.angle = 0;
    this.attackCooldown = 0;
    this.attackState = 'ready';
    this.attackTimer = 0;
    this.attackAngle = 0;
    this.attackChecked = false;
    this.shootCooldown = 0;
    this.iFrameDuration = 0;
    this.invulnerableUntil = 0;
    this.flashUntil = 0;
    this.stuckTimer = 0;
    this.steerTimer = 0;
    this.steerSign = 1;
    this.previousX = 0; this.previousY = 0;
    this.wave = 1;
    this.onKilled = null;
    this.onContact = null;
  }

  activate({ x, y, type, wave, onKilled, onContact }) {
    const config = ENEMY_CONFIG[type] || ENEMY_CONFIG.rusher;
    this.active = true;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.type = type;
    this.wave = wave;
    this.radius = config.radius;
    this.maxHealth = this.health = Math.round(config.health + (wave - 1) * (type === 'brute' ? 13 : 5));
    this.speed = config.speed + Math.min(28, wave * 1.7);
    this.damage = config.damage + Math.floor((wave - 1) * 1.25);
    this.armor = type === 'brute' ? Math.floor(wave / 4) : 0;
    this.color = config.color;
    this.attackCooldown = randomRange(.25, .8);
    this.attackState = 'ready';
    this.attackTimer = 0;
    this.attackAngle = 0;
    this.attackChecked = false;
    this.shootCooldown = randomRange(.6, 1.4);
    this.invulnerableUntil = 0;
    this.flashUntil = 0;
    this.stuckTimer = 0;
    this.steerTimer = 0;
    this.steerSign = Math.random() < .5 ? -1 : 1;
    this.previousX = x; this.previousY = y;
    this.onKilled = onKilled;
    this.onContact = onContact;
  }

  update(dt, player, level, weaponSystem, now) {
    if (!this.active || !player.alive) return;
    this.previousX = this.x; this.previousY = this.y;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.max(0.001, Math.hypot(dx, dy));
    this.angle = Math.atan2(dy, dx);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.steerTimer = Math.max(0, this.steerTimer - dt);

    let moveX = 0;
    let moveY = 0;
    if (this.type === 'shooter') {
      if (dist > 365) { moveX = dx / dist; moveY = dy / dist; }
      else if (dist < 235) { moveX = -dx / dist; moveY = -dy / dist; }
      else {
        const strafe = this.steerSign * .48;
        moveX = (-dy / dist) * strafe;
        moveY = (dx / dist) * strafe;
      }
      if (dist < 660 && this.shootCooldown <= 0) {
        weaponSystem.fireHostile(this, player, now);
        this.shootCooldown = Math.max(.55, 1.45 - this.wave * .025) + randomRange(-.12, .18);
      }
    } else if (this.type === 'brute') {
      moveX = dx / dist; moveY = dy / dist;
    } else {
      moveX = dx / dist; moveY = dy / dist;
    }

    // If a wall blocks a direct chase, periodically sidestep rather than pushing forever into it.
    if (this.steerTimer > 0) {
      const sideX = -dy / dist * this.steerSign;
      const sideY = dx / dist * this.steerSign;
      moveX = moveX * .42 + sideX * .78;
      moveY = moveY * .42 + sideY * .78;
    }
    const move = normalize(moveX, moveY);
    const targetSpeed = this.speed * (this.attackState === 'windup' ? .28 : 1);
    const desiredVX = move.x * targetSpeed;
    const desiredVY = move.y * targetSpeed;
    this.vx += (desiredVX - this.vx) * Math.min(1, dt * 5.5);
    this.vy += (desiredVY - this.vy) * Math.min(1, dt * 5.5);

    if (this.attackState === 'ready') {
      level.moveEntity(this, this.vx * dt, this.vy * dt);
    }
    const moved = Math.hypot(this.x - this.previousX, this.y - this.previousY);
    if (moved < .6 && dist > 115 && this.attackState === 'ready') {
      this.stuckTimer += dt;
      if (this.stuckTimer > .34) {
        this.stuckTimer = 0;
        this.steerTimer = randomRange(.42, .75);
        this.steerSign *= -1;
      }
    } else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);

    const contactStart = this.radius + player.radius + 46;
    if (this.attackState === 'ready' && this.attackCooldown <= 0 && dist <= contactStart) {
      this.attackState = 'windup';
      this.attackTimer = .24;
      this.attackAngle = this.angle;
      this.attackChecked = false;
    } else if (this.attackState === 'windup') {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackState = 'active';
        this.attackTimer = .12;
      }
    } else if (this.attackState === 'active') {
      if (!this.attackChecked) {
        this.attackChecked = true;
        if (this.isPlayerInFrontHitbox(player)) this.onContact?.(this, this.damage, this.attackAngle);
      }
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && this.active) {
        this.attackState = 'ready';
        this.attackCooldown = this.type === 'brute' ? 1.55 : 1.2;
      }
    }
  }

  isPlayerInFrontHitbox(player) {
    const fx = Math.cos(this.attackAngle);
    const fy = Math.sin(this.attackAngle);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const along = dx * fx + dy * fy;
    const lateral = Math.abs(dx * -fy + dy * fx);
    const min = this.radius * .35;
    const max = this.radius + 55 + player.radius;
    const halfWidth = (this.type === 'brute' ? 33 : 25) + player.radius * .55;
    return along >= min && along <= max && lateral <= halfWidth;
  }

  onDamage(_amount, _source, now) { this.flashUntil = now + .08; }

  onDeath(source, now) {
    if (!this.active) return;
    this.onKilled?.(this, source, now);
  }

  draw(ctx, now) {
    if (!this.active) return;
    const flash = now < this.flashUntil;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(3, this.radius * .62, this.radius * 1.12, this.radius * .52, 0, 0, Math.PI * 2); ctx.fill();

    if (this.attackState === 'windup' || this.attackState === 'active') {
      ctx.fillStyle = this.attackState === 'active' ? 'rgba(255,77,97,.25)' : 'rgba(255,151,90,.13)';
      ctx.strokeStyle = this.attackState === 'active' ? 'rgba(255,83,111,.92)' : 'rgba(255,165,101,.58)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(this.radius * .45, 0); ctx.lineTo(this.radius + 66, -30); ctx.lineTo(this.radius + 66, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = flash ? '#ffffff' : this.color;
    if (this.type === 'brute') {
      ctx.beginPath(); ctx.roundRect(-this.radius, -this.radius * .78, this.radius * 2, this.radius * 1.56, 7); ctx.fill();
      ctx.fillStyle = '#633d2d'; ctx.fillRect(this.radius * .28, -5, this.radius * .64, 10);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.type === 'shooter' ? '#3d3159' : '#5a302e';
      ctx.beginPath(); ctx.arc(0, 0, this.radius * .55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.type === 'shooter' ? '#eadbff' : '#ffe0c7';
      ctx.fillRect(5, -4, this.radius + 7, 8);
    }
    ctx.restore();

    if (this.health < this.maxHealth) {
      const width = this.radius * 2.2;
      const y = this.y - this.radius - 11;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(this.x - width / 2, y, width, 3);
      ctx.fillStyle = this.type === 'brute' ? '#ffb15e' : '#ff6f69';
      ctx.fillRect(this.x - width / 2, y, width * clamp(this.health / this.maxHealth, 0, 1), 3);
    }
  }

  deactivate() {
    this.active = false;
    this.onKilled = null;
    this.onContact = null;
    this.vx = 0; this.vy = 0;
    this.attackState = 'ready';
  }
}
