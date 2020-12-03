export function createSingleLock<T>(): ((fn: () => Promise<T>) => Promise<T>) {
  const queue: (() => unknown)[] = [];
  let locked = false;

  return function execute(fn: () => Promise<T>): Promise<T> {
    return acquire()
      .then(fn)
      .then((r) => {
        release();
        return r;
      }, (err) => {
        release();
        throw err;
      })
  };

  function acquire(): Promise<void> {
    if (locked) {
      return new Promise((resolve) => queue.push(resolve));
    } else {
      locked = true;
      return Promise.resolve();
    }
  }

  function release(): void {
    const next = queue.shift();
    if (next) {
      next();
    } else {
      locked = false;
    }
  }
}
