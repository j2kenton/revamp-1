import { parseSseEvents } from '@/lib/sse/parseSseEvents';

describe('parseSseEvents', () => {
  it('parses a single complete event', () => {
    const buffer = 'event: content_delta\ndata: {"messageId":"m1"}\n\n';

    const { events, remainder } = parseSseEvents(buffer);

    expect(events).toEqual([
      { type: 'content_delta', data: { messageId: 'm1' } },
    ]);
    expect(remainder).toBe('');
  });

  it('parses multiple events from one buffer', () => {
    const buffer =
      'event: message_created\ndata: {"messageId":"m1"}\n\n' +
      'event: content_delta\ndata: {"accumulatedContent":"Hi"}\n\n';

    const { events } = parseSseEvents(buffer);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('message_created');
    expect(events[1].type).toBe('content_delta');
  });

  it('returns a trailing partial event as the remainder rather than parsing it', () => {
    const buffer =
      'event: content_delta\ndata: {"messageId":"m1"}\n\n' +
      'event: content_delta\ndata: {"partial';

    const { events, remainder } = parseSseEvents(buffer);

    expect(events).toHaveLength(1);
    expect(remainder).toBe('event: content_delta\ndata: {"partial');
  });

  it('parses an event split across two reads once the remainder is prepended', () => {
    const first = parseSseEvents('event: content_delta\ndata: {"mess');
    expect(first.events).toHaveLength(0);

    const second = parseSseEvents(`${first.remainder}ageId":"m1"}\n\n`);

    expect(second.events).toEqual([
      { type: 'content_delta', data: { messageId: 'm1' } },
    ]);
    expect(second.remainder).toBe('');
  });

  it('defaults the event type to "message" when no event field is present', () => {
    const { events } = parseSseEvents('data: {"value":1}\n\n');

    expect(events[0].type).toBe('message');
  });

  it('ignores comment/heartbeat lines', () => {
    const buffer = ': heartbeat\nevent: content_delta\ndata: {"messageId":"m1"}\n\n';

    const { events } = parseSseEvents(buffer);

    expect(events).toEqual([
      { type: 'content_delta', data: { messageId: 'm1' } },
    ]);
  });

  it('joins multiple data lines within one event with newlines', () => {
    const buffer = 'event: message\ndata: {"a":1,\ndata: "b":2}\n\n';

    const { events } = parseSseEvents(buffer);

    expect(events[0].data).toEqual({ a: 1, b: 2 });
  });

  it('skips events with no data payload', () => {
    const { events } = parseSseEvents('event: ping\n\n');

    expect(events).toHaveLength(0);
  });

  it('skips malformed JSON without throwing, so one bad event cannot kill the stream', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const buffer =
      'event: content_delta\ndata: {not valid json}\n\n' +
      'event: content_delta\ndata: {"messageId":"m2"}\n\n';

    const { events } = parseSseEvents(buffer);

    expect(events).toEqual([
      { type: 'content_delta', data: { messageId: 'm2' } },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('skips payloads that parse to a non-object', () => {
    const { events } = parseSseEvents('event: message\ndata: 42\n\n');

    expect(events).toHaveLength(0);
  });

  it('returns no events for an empty buffer', () => {
    const { events, remainder } = parseSseEvents('');

    expect(events).toHaveLength(0);
    expect(remainder).toBe('');
  });
});
