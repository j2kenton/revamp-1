/**
 * Global polyfills that must be available before the Jest environment loads.
 */
import { TextDecoder, TextEncoder } from 'node:util';
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';
import { BroadcastChannel } from 'node:worker_threads';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  // @ts-expect-error TextDecoder typings differ between Node and DOM libs
  globalThis.TextDecoder = TextDecoder;
}

if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream =
    ReadableStream as unknown as typeof globalThis.ReadableStream;
}

if (typeof globalThis.TransformStream === 'undefined') {
  globalThis.TransformStream =
    TransformStream as unknown as typeof globalThis.TransformStream;
}

if (typeof globalThis.WritableStream === 'undefined') {
  globalThis.WritableStream =
    WritableStream as unknown as typeof globalThis.WritableStream;
}

class MockMessagePort {
  private peer: MockMessagePort | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  setPeer(peer: MockMessagePort): void {
    this.peer = peer;
  }

  postMessage(data: unknown): void {
    setTimeout(() => {
      this.peer?.onmessage?.({ data } as MessageEvent);
    }, 0);
  }

  start(): void {}
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false;
  }
}

class MockMessageChannel {
  port1: MockMessagePort;
  port2: MockMessagePort;

  constructor() {
    this.port1 = new MockMessagePort();
    this.port2 = new MockMessagePort();
    this.port1.setPeer(this.port2);
    this.port2.setPeer(this.port1);
  }
}

if (typeof globalThis.MessageChannel === 'undefined') {
  // @ts-expect-error minimal test polyfill
  globalThis.MessageChannel = MockMessageChannel;
}

if (typeof globalThis.MessagePort === 'undefined') {
  // @ts-expect-error minimal test polyfill
  globalThis.MessagePort = MockMessagePort;
}

if (typeof globalThis.BroadcastChannel === 'undefined') {
  // @ts-expect-error worker thread BroadcastChannel differs from DOM typings
  globalThis.BroadcastChannel = BroadcastChannel;
}
