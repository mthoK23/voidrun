import { pick } from '../core/math.js';

const UPGRADES = [
  { id: 'overclock', symbol: '↯', name: 'Overclocked Feed', description: 'Increase weapon fire rate by 14%. More rounds, less breathing room.', apply: (player) => { player.fireRateMultiplier *= 1.14; } },
  { id: 'heavy-rounds', symbol: '✳', name: 'Heavy Payload', description: 'Increase all outgoing damage by 16%. Hits land harder.', apply: (player) => { player.damageMultiplier *= 1.16; } },
  { id: 'kinetic-frame', symbol: '»', name: 'Kinetic Frame', description: 'Increase movement speed by 9% and improve directional response.', apply: (player) => { player.moveMultiplier *= 1.09; } },
  { id: 'reinforced', symbol: '⬡', name: 'Reinforced Core', description: 'Gain 20 maximum integrity and restore 20 integrity immediately.', apply: (player, damageSystem) => { player.maxHealth += 20; damageSystem.heal(player, 20); } },
  { id: 'plating', symbol: '◈', name: 'Reactive Plating', description: 'Gain 1 point of armor. Incoming hits are reduced by one.', apply: (player) => { player.armor += 1; } },
  { id: 'stabilizer', symbol: '⌖', name: 'Vector Stabilizer', description: 'Tighten weapon spread by 18%, improving long-range accuracy.', apply: (player) => { player.spreadMultiplier *= .82; } },
  { id: 'field-med', symbol: '+', name: 'Field Medkit', description: 'Restore 35 integrity without changing your maximum health.', apply: (player, damageSystem) => { damageSystem.heal(player, 35); } },
];

export class UpgradeSystem {
  constructor() { this.history = []; }

  offer() {
    const pool = [...UPGRADES];
    const options = [];
    while (options.length < 3 && pool.length) {
      const option = pick(pool);
      options.push(option);
      pool.splice(pool.indexOf(option), 1);
    }
    return options;
  }

  apply(option, player, damageSystem) {
    if (!option) return;
    option.apply(player, damageSystem);
    this.history.push(option.id);
  }

  reset() { this.history.length = 0; }
}
