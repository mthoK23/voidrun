import { InputManager } from './core/input.js';
import { clamp, randomRange, pick } from './core/math.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { ObjectPool } from './core/object-pool.js';
import { DamageSystem } from './systems/damage-system.js';
import { Level } from './systems/level.js';
import { WeaponSystem } from './systems/weapon-system.js';
import { UpgradeSystem } from './systems/upgrades.js';

const $ = (selector) => document.querySelector(selector);

export class GameManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.input = new InputManager(canvas);
    this.damageSystem = new DamageSystem();
    this.level = new Level();
    this.weaponSystem = new WeaponSystem(this);
    this.upgradeSystem = new UpgradeSystem();
    this.player = new Player(this);
    this.enemyPool = new ObjectPool(() => new Enemy(this), 56);
    this.activeEnemies = [];
    this.pendingTickets = [];
    this.phase = 'loadout';
    this.countdownRemaining = 0;
    this.countdownAction = null;
    this.wave = 0;
    this.waveTotal = 0;
    this.remainingToKill = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.lastFrame = 0;
    this.viewport = { width: 0, height: 0, dpr: 1 };
    this.camera = { x: 0, y: 0 };
    this.upgradeOptions = [];
    this.upgradeFallbackTimer = 0;
    this.pauseFrom = 'playing';
    this.toastTimer = 0;
    this.hudUpdateTimer = 0;
    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame((time) => this.frame(time));
  }

  bindUI() {
    document.querySelectorAll('[data-weapon]').forEach((button) => {
      button.addEventListener('click', () => this.startRun(button.dataset.weapon));
    });
    $('#resume-button').addEventListener('click', () => this.resume());
    $('#pause-restart-button').addEventListener('click', () => this.returnToLoadout());
    $('#restart-button').addEventListener('click', () => this.returnToLoadout());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.viewport.width = Math.max(1, rect.width);
    this.viewport.height = Math.max(1, rect.height);
    this.viewport.dpr = dpr;
    this.canvas.width = Math.round(this.viewport.width * dpr);
    this.canvas.height = Math.round(this.viewport.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  startRun(weaponId) {
    this.resetRunState();
    if (!this.weaponSystem.equip(weaponId)) return;
    this.player.weapon = this.weaponSystem.currentWeapon;
    this.showScreen(null);
    $('#hud').classList.remove('is-hidden');
    this.updateHUD(true);
    this.showToast(`${this.weaponSystem.weaponName.toUpperCase()} EQUIPPED`);
    this.beginCountdown(() => this.startWave());
  }

  resetRunState() {
    this.releaseAllEnemies();
    this.weaponSystem.clearProjectiles();
    this.weaponSystem.releaseWeapon();
    this.player.reset(this.level.width / 2, this.level.height / 2);
    this.player.weapon = null;
    this.wave = 0;
    this.waveTotal = 0;
    this.remainingToKill = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.pendingTickets.length = 0;
    this.level.hazards.length = 0;
    this.level.spawnPoints.length = 0;
    this.upgradeSystem.reset();
    this.toastTimer = 0;
    this.phase = 'loadout';
    $('#hud').classList.add('is-hidden');
    this.showScreen('loadout-screen');
    $('#objective-value').textContent = 'Choose your loadout';
    $('#objective-detail').textContent = 'WASD move · Mouse aim · Left click fire · P pause';
  }

  returnToLoadout() { this.resetRunState(); }

  beginCountdown(action) {
    this.phase = 'countdown';
    this.countdownRemaining = 3;
    this.countdownAction = action;
    this.showScreen('countdown-screen');
    $('#countdown-number').textContent = '3';
    $('#countdown-label').textContent = this.wave === 0 ? 'PREPARE FOR CONTACT' : `SECTOR ${String(this.wave + 1).padStart(2, '0')} INBOUND`;
  }

  startWave() {
    this.wave += 1;
    this.level.repositionSpawnPoints(this.player, this.wave);
    this.level.generateHazards(this.wave, this.player);
    this.waveTotal = Math.min(8 + this.wave * 3, 35);
    this.remainingToKill = this.waveTotal;
    this.pendingTickets.length = 0;
    const types = this.wave < 2 ? ['rusher'] : this.wave < 4 ? ['rusher', 'rusher', 'shooter'] : ['rusher', 'shooter', 'brute'];
    for (let i = 0; i < this.waveTotal; i += 1) {
      const type = pick(types);
      this.pendingTickets.push({ type, dueAt: this.elapsed + .35 + i * .5, retries: 0 });
    }
    this.phase = 'playing';
    this.showScreen(null);
    $('#objective-value').textContent = 'Eliminate all hostiles';
    $('#objective-detail').textContent = 'Contact attacks recycle attackers. Keep moving.';
    this.showToast(`SECTOR ${String(this.wave).padStart(2, '0')} — BREACH DETECTED`);
    this.updateHUD(true);
  }

  updateSpawnQueue() {
    let spawned = 0;
    while (this.pendingTickets.length && this.pendingTickets[0].dueAt <= this.elapsed && spawned < 3) {
      const ticket = this.pendingTickets.shift();
      const enemy = this.enemyPool.acquire();
      if (!enemy) {
        ticket.dueAt = this.elapsed + .25;
        this.pendingTickets.unshift(ticket);
        break;
      }
      const anchor = this.level.spawnPoints[(this.waveTotal - this.remainingToKill + this.activeEnemies.length + spawned) % this.level.spawnPoints.length];
      const spawn = this.level.findSpawnPoint(anchor, ticket.type === 'brute' ? 28 : 22);
      enemy.activate({
        ...spawn,
        type: ticket.type,
        wave: this.wave,
        onKilled: (deadEnemy, source, now) => this.onEnemyKilled(deadEnemy, source, now),
        onContact: (contactEnemy, damage, angle) => this.onEnemyContact(contactEnemy, damage, angle),
      });
      this.activeEnemies.push(enemy);
      spawned += 1;
    }
  }

  onEnemyKilled(enemy) {
    const index = this.activeEnemies.indexOf(enemy);
    if (index !== -1) this.activeEnemies.splice(index, 1);
    this.enemyPool.release(enemy);
    this.remainingToKill = Math.max(0, this.remainingToKill - 1);
    this.kills += 1;
    if (this.remainingToKill === 0 && this.activeEnemies.length === 0 && this.pendingTickets.length === 0) this.completeWave();
  }

  onEnemyContact(enemy, damage, angle) {
    if (!enemy.active) return;
    const recycledType = enemy.type;
    this.damageSystem.apply(this.player, damage, this.elapsed, `${recycledType} contact`, { invulnerability: .78 });
    if (this.phase === 'gameover' || !this.player.alive) return; // Death cleanup already returned every live enemy to its pool.
    this.player.vx += Math.cos(angle) * 190;
    this.player.vy += Math.sin(angle) * 190;
    const index = this.activeEnemies.indexOf(enemy);
    if (index !== -1) this.activeEnemies.splice(index, 1);
    this.enemyPool.release(enemy); // Recycle to the tail of the pool after its attack lands.
    // The ticket returns later; a contact hit costs health and time, but cannot silently clear a wave.
    if (this.remainingToKill > 0) {
      this.pendingTickets.push({ type: recycledType, dueAt: this.elapsed + 1.35, retries: 0 });
      this.pendingTickets.sort((a, b) => a.dueAt - b.dueAt);
    }
    this.showToast('CONTACT HIT — HOSTILE RECYCLED');
  }

  completeWave() {
    if (this.phase !== 'playing') return;
    this.phase = 'upgrade';
    this.upgradeOptions = this.upgradeSystem.offer();
    this.upgradeFallbackTimer = 9;
    $('#objective-value').textContent = 'Sector cleared';
    $('#objective-detail').textContent = 'Select an augmentation to continue.';
    this.renderUpgradeOptions();
    this.showScreen('upgrade-screen');
    this.showToast(`SECTOR ${String(this.wave).padStart(2, '0')} CLEARED`);
    this.updateHUD(true);
  }

  renderUpgradeOptions() {
    const host = $('#upgrade-options');
    host.replaceChildren();
    for (const option of this.upgradeOptions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'upgrade-option';
      const symbol = document.createElement('span'); symbol.className = 'upgrade-symbol'; symbol.textContent = option.symbol;
      const title = document.createElement('strong'); title.textContent = option.name;
      const description = document.createElement('small'); description.textContent = option.description;
      button.append(symbol, title, description);
      button.addEventListener('click', () => this.selectUpgrade(option));
      host.append(button);
    }
  }

  selectUpgrade(option) {
    if (this.phase !== 'upgrade') return;
    this.upgradeSystem.apply(option, this.player, this.damageSystem);
    this.showToast(`AUGMENTED: ${option.name.toUpperCase()}`);
    this.beginCountdown(() => this.startWave());
  }

  onPlayerDeath() {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.weaponSystem.clearProjectiles();
    this.releaseAllEnemies();
    this.pendingTickets.length = 0;
    $('#gameover-summary').textContent = `You reached sector ${String(this.wave).padStart(2, '0')} and eliminated ${this.kills} hostiles.`;
    this.showScreen('gameover-screen');
    this.updateHUD(true);
  }

  releaseAllEnemies() {
    for (const enemy of [...this.activeEnemies]) this.enemyPool.release(enemy);
    this.activeEnemies.length = 0;
  }

  pause() {
    if (this.phase !== 'playing') return;
    this.pauseFrom = this.phase;
    this.phase = 'paused';
    this.showScreen('pause-screen');
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.pauseFrom;
    this.showScreen(null);
  }

  showScreen(id) {
    for (const screen of document.querySelectorAll('.screen')) {
      screen.classList.toggle('screen-visible', screen.id === id);
      screen.classList.toggle('screen-hidden', screen.id !== id);
    }
  }

  showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    this.toastTimer = 2;
  }

  updateHUD(force = false) {
    const hud = $('#hud');
    if (hud.classList.contains('is-hidden')) return;
    const hp = clamp(this.player.health / Math.max(1, this.player.maxHealth), 0, 1);
    $('#wave-value').textContent = String(this.wave).padStart(2, '0');
    $('#wave-status').textContent = this.phase === 'playing' ? `${this.remainingToKill} HOSTILES LEFT` : this.phase === 'upgrade' ? 'SECTOR CLEARED' : 'BREACH WINDOW';
    $('#wave-progress').style.width = `${this.waveTotal ? ((this.waveTotal - this.remainingToKill) / this.waveTotal) * 100 : 0}%`;
    $('#health-value').textContent = `${Math.ceil(this.player.health)} / ${this.player.maxHealth}`;
    $('#health-fill').style.width = `${hp * 100}%`;
    $('#health-fill').classList.toggle('low', hp < .32);
    $('#armor-value').textContent = String(this.player.armor);
    $('#kill-value').textContent = String(this.kills);
    $('#weapon-value').textContent = this.weaponSystem.weaponName;
    $('#weapon-detail').textContent = this.weaponSystem.weaponDetail;
  }

  separateEnemies() {
    const enemies = this.activeEnemies;
    for (let i = 0; i < enemies.length; i += 1) {
      const a = enemies[i];
      if (!a.active) continue;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const b = enemies[j];
        if (!b.active) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.radius + b.radius + 2;
        if (d >= min) continue;
        if (d < .001) { dx = 1; dy = 0; d = 1; }
        const push = (min - d) * .5;
        const nx = dx / d; const ny = dy / d;
        this.level.moveEntity(a, -nx * push, -ny * push);
        this.level.moveEntity(b, nx * push, ny * push);
      }
    }
  }

  frame(timestamp) {
    if (!this.lastFrame) this.lastFrame = timestamp;
    const dt = Math.min(.033, Math.max(0, (timestamp - this.lastFrame) / 1000));
    this.lastFrame = timestamp;
    this.elapsed += dt;
    this.update(dt);
    this.render();
    this.input.endFrame();
    requestAnimationFrame((time) => this.frame(time));
  }

  update(dt) {
    if (this.input.consumePressed('p') || this.input.consumePressed('escape')) {
      if (this.phase === 'playing') this.pause();
      else if (this.phase === 'paused') this.resume();
    }

    if (this.phase === 'countdown') {
      this.countdownRemaining -= dt;
      const shown = Math.max(1, Math.ceil(this.countdownRemaining));
      $('#countdown-number').textContent = this.countdownRemaining <= 0 ? 'GO' : String(shown);
      if (this.countdownRemaining <= 0) {
        const action = this.countdownAction;
        this.countdownAction = null;
        action?.();
      }
    } else if (this.phase === 'playing') {
      const camera = this.getCamera();
      const worldMouseX = this.input.mouseX + camera.x;
      const worldMouseY = this.input.mouseY + camera.y;
      this.player.update(dt, this.input, this.level, worldMouseX, worldMouseY);
      this.updateSpawnQueue();
      for (const enemy of [...this.activeEnemies]) enemy.update(dt, this.player, this.level, this.weaponSystem, this.elapsed);
      this.separateEnemies();
      this.weaponSystem.update(dt, this.player, this.activeEnemies, this.level, this.elapsed, this.input.mouseDown, worldMouseX, worldMouseY);
      this.level.updateHazards(this.player, this.damageSystem, this.elapsed);
      if (this.remainingToKill === 0 && this.activeEnemies.length === 0 && this.pendingTickets.length === 0) this.completeWave();
    } else if (this.phase === 'upgrade') {
      this.upgradeFallbackTimer -= dt;
      if (this.upgradeFallbackTimer <= 0) this.selectUpgrade(this.upgradeOptions[0]);
    }

    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer <= 0) $('#toast').classList.remove('visible');
    this.hudUpdateTimer -= dt;
    if (this.hudUpdateTimer <= 0) {
      this.hudUpdateTimer = .12;
      this.updateHUD();
    }
  }

  getCamera() {
    const x = clamp(this.player.x - this.viewport.width / 2, 0, Math.max(0, this.level.width - this.viewport.width));
    const y = clamp(this.player.y - this.viewport.height / 2, 0, Math.max(0, this.level.height - this.viewport.height));
    this.camera.x = x; this.camera.y = y;
    return this.camera;
  }

  render() {
    const { width, height, dpr } = this.viewport;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#090e15';
    ctx.fillRect(0, 0, width, height);
    const camera = this.getCamera();
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    this.level.draw(ctx, this.elapsed);
    for (const enemy of this.activeEnemies) enemy.draw(ctx, this.elapsed);
    this.weaponSystem.draw(ctx);
    this.player.draw(ctx, this.elapsed);
    ctx.restore();

    if (this.phase === 'playing') this.drawCrosshair(ctx);
    if (this.phase === 'loadout') this.drawBackdropGrid(ctx);
  }

  drawCrosshair(ctx) {
    const x = this.input.mouseX;
    const y = this.input.mouseY;
    ctx.save();
    ctx.strokeStyle = 'rgba(117,246,223,.78)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 14); ctx.stroke();
    ctx.restore();
  }

  drawBackdropGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(79,232,207,.04)'; ctx.lineWidth = 1;
    const gap = 50;
    for (let x = 0; x < this.viewport.width; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.viewport.height); ctx.stroke(); }
    for (let y = 0; y < this.viewport.height; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.viewport.width, y); ctx.stroke(); }
    ctx.restore();
  }
}
