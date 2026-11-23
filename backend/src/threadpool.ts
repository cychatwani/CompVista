import { availableParallelism } from 'node:os';

// Password hashing (scrypt) runs on libuv's thread pool. Creating an organization hashes up to
// 20,000 temporary passwords, so use more threads than the default 4. Must load before anything
// touches the pool, which is why main.ts imports this first.
process.env.UV_THREADPOOL_SIZE ??= String(Math.min(16, Math.max(4, availableParallelism())));
