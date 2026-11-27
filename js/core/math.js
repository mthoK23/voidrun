export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const distanceSq = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};
export const distance = (ax, ay, bx, by) => Math.sqrt(distanceSq(ax, ay, bx, by));
export const normalize = (x, y) => {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length, length } : { x: 0, y: 0, length: 0 };
};
export const randomRange = (min, max) => min + Math.random() * (max - min);
export const randomInt = (min, max) => Math.floor(randomRange(min, max + 1));
export const pick = (items) => items[Math.floor(Math.random() * items.length)];

export function circleIntersectsRect(x, y, radius, rect) {
  const closestX = clamp(x, rect.x, rect.x + rect.w);
  const closestY = clamp(y, rect.y, rect.y + rect.h);
  return distanceSq(x, y, closestX, closestY) < radius * radius;
}

export function resolveCircleRect(entity, rect) {
  const closestX = clamp(entity.x, rect.x, rect.x + rect.w);
  const closestY = clamp(entity.y, rect.y, rect.y + rect.h);
  let dx = entity.x - closestX;
  let dy = entity.y - closestY;
  const minDistance = entity.radius;
  const distSq = dx * dx + dy * dy;
  if (distSq >= minDistance * minDistance) return false;

  if (distSq > 0.00001) {
    const dist = Math.sqrt(distSq);
    const push = minDistance - dist + 0.05;
    entity.x += (dx / dist) * push;
    entity.y += (dy / dist) * push;
  } else {
    // The circle centre is inside the rectangle. Eject through the nearest face.
    const faces = [
      { d: Math.abs(entity.x - rect.x), x: rect.x - minDistance - 0.05, y: entity.y },
      { d: Math.abs(rect.x + rect.w - entity.x), x: rect.x + rect.w + minDistance + 0.05, y: entity.y },
      { d: Math.abs(entity.y - rect.y), x: entity.x, y: rect.y - minDistance - 0.05 },
      { d: Math.abs(rect.y + rect.h - entity.y), x: entity.x, y: rect.y + rect.h + minDistance + 0.05 },
    ];
    faces.sort((a, b) => a.d - b.d);
    entity.x = faces[0].x;
    entity.y = faces[0].y;
  }
  return true;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
