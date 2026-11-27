# VOID//RUN — Roguelike Arena

A modular, top-down arena roguelike built with vanilla JavaScript, HTML and CSS. No bundler or external runtime libraries are required.

## Run it

ES modules are used, so serve this folder over HTTP instead of opening `index.html` directly.

```bash
cd roguelike-arena
python -m http.server 8000
```

Then open <http://localhost:8000> in a modern desktop browser.

## Controls

- **WASD** — move
- **Mouse** — aim
- **Left mouse button** — fire (hold for automatic fire)
- **P** or **Esc** — pause / resume

## Run loop

1. Choose one of three starting weapons: Pulse Rifle, Scatter Cannon or Needle SMG.
2. A three-second breach countdown starts the first wave.
3. Eliminate the full wave to unlock an augmentation.
4. Choose one of three upgrades; the next wave starts after a three-second countdown.
5. Survive for as many sectors as possible.

## Architecture

```text
index.html
css/
  styles.css
js/
  main.js                 Entry point
  game-manager.js         State machine, loop, HUD, wave queue and orchestration
  core/
    input.js              Keyboard and pointer input
    math.js               Movement and geometry helpers
    object-pool.js        Fixed-capacity FIFO object pool
  entities/
    player.js             Player movement, health and rendering
    enemy.js              Rusher, shooter and brute behaviour / front attack hitbox
    projectile.js         Shared pooled projectile entity
  systems/
    damage-system.js      Shared damage and healing path
    level.js              Arena geometry, collision, spawn points and hazards
    weapon-system.js      Weapon instances, projectile pools and firing logic
    upgrades.js           Roguelike augmentation offers and effects
```

## Systems and safeguards

- Movement input is normalized before acceleration, so diagonals do not gain speed. Lateral velocity is damped while steering, keeping momentum responsive rather than slippery.
- Player and enemy movement use substeps and circle-vs-rectangle resolution. Wall collisions slide along surfaces instead of trapping an actor inside a collider.
- Enemies, weapon instances and both friendly / hostile projectiles are pooled. Released enemies are appended to the pool's FIFO tail.
- A melee enemy has a telegraphed, directional hitbox in front of it. After a successful contact attempt it is recycled and its spawn ticket is queued again, so it cannot disappear and accidentally complete a wave.
- Ranged enemies use the same health, death and damage pipeline as melee enemies. Player bullets, enemy shots, contact hits and map hotspots all pass through `DamageSystem`.
- Enemy steering includes a wall-stuck escape sidestep, and enemy separation prevents crowds from collapsing into one point.
- Waves only clear when every ticket has been killed and no active or queued enemies remain.
- Pool exhaustion does not allocate unbounded objects; unspawned tickets remain queued and are retried.

The arena and six spawn anchors are procedural. Anchors rotate and shift each wave, while random damage hotspots are regenerated for the next sector.
