import type Redis from 'ioredis';

declare module 'ioredis-mock' {
  class RedisMock extends Redis {}
  export = RedisMock;
}
