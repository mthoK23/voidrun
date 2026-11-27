/** Fixed-capacity FIFO object pool. Released objects are appended to the tail. */
export class ObjectPool {
  constructor(factory, capacity, onRelease = null) {
    this.factory = factory;
    this.capacity = Math.max(1, capacity | 0);
    this.onRelease = onRelease;
    this.available = [];
    this.all = new Set();
    this.inPool = new WeakSet();
    for (let i = 0; i < this.capacity; i += 1) {
      const item = this.factory();
      this.all.add(item);
      this.available.push(item);
      this.inPool.add(item);
    }
  }

  acquire() {
    const item = this.available.shift() || null;
    if (!item) return null;
    this.inPool.delete(item);
    return item;
  }

  release(item) {
    if (!item || !this.all.has(item) || this.inPool.has(item)) return false;
    this.onRelease?.(item);
    item.deactivate?.();
    this.available.push(item); // Tail insertion gives the pool a predictable FIFO cycle.
    this.inPool.add(item);
    return true;
  }

  releaseAll(items) {
    for (const item of [...items]) this.release(item);
  }

  get availableCount() { return this.available.length; }
  get activeCount() { return this.capacity - this.available.length; }
}
