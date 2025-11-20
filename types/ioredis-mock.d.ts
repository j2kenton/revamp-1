import type Redis from 'ioredis';

declare module 'ioredis-mock' {
  const RedisMock: typeof Redis;
  export default RedisMock;
}
