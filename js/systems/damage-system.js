/** One damage path for contact attacks, enemy shots, projectiles and map hazards. */
export class DamageSystem {
  apply(target, rawAmount, now, source = 'unknown', options = {}) {
    if (!target || !Number.isFinite(target.health) || target.health <= 0) {
      return { applied: false, damage: 0, reason: 'invalid-target' };
    }
    if (now < (target.invulnerableUntil || 0)) {
      return { applied: false, damage: 0, reason: 'invulnerable' };
    }

    const armor = Math.max(0, Number(target.armor) || 0);
    const amount = Math.max(1, Math.round(Math.max(0, rawAmount) - armor));
    target.health = Math.max(0, target.health - amount);
    const grace = options.invulnerability ?? target.iFrameDuration ?? 0;
    target.invulnerableUntil = now + Math.max(0, grace);
    target.lastDamageAt = now;
    target.onDamage?.(amount, source, now);

    if (target.health <= 0) target.onDeath?.(source, now);
    return { applied: true, damage: amount, killed: target.health <= 0 };
  }

  heal(target, amount) {
    if (!target || !Number.isFinite(target.health) || !Number.isFinite(target.maxHealth)) return 0;
    const before = target.health;
    target.health = Math.min(target.maxHealth, target.health + Math.max(0, amount));
    return target.health - before;
  }
}
