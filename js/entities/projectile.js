export class Projectile {
  constructor(team) {
    this.team = team;
    this.active = false;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.radius = 4;
    this.damage = 1;
    this.life = 0;
    this.maxLife = 1;
    this.color = '#ffffff';
    this.owner = null;
  }

  activate({ x, y, angle, speed, damage, radius = 4, life = 1.5, color = '#ffffff', owner = null }) {
    this.active = true;
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.radius = radius;
    this.life = this.maxLife = life;
    this.color = color;
    this.owner = owner;
  }

  update(dt, level) {
    if (!this.active) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx * dt, this.vy * dt) / 12));
    const sx = this.vx * dt / steps;
    const sy = this.vy * dt / steps;
    for (let i = 0; i < steps; i += 1) {
      this.x += sx; this.y += sy;
      if (level.isBlocked(this.x, this.y, this.radius)) {
        this.active = false;
        return false;
      }
    }
    this.life -= dt;
    if (this.life <= 0) {
      this.active = false;
      return false;
    }
    return true;
  }

  draw(ctx) {
    if (!this.active) return;
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color;
    ctx.globalAlpha = .86;
    ctx.lineWidth = this.radius * 1.4;
    ctx.beginPath();
    ctx.moveTo(this.x - this.vx * .014, this.y - this.vy * .014);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  deactivate() {
    this.active = false;
    this.owner = null;
    this.life = 0;
  }
}
