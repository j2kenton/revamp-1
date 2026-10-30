import { parseEventBlock } from '@/lib/sse/parseEventBlock';

describe('parseEventBlock', () => {
  it('reads the event type and data payload', () => {
    const result = parseEventBlock('event: content_delta\ndata: {"a":1}');

    expect(result).toEqual({
      eventType: 'content_delta',
      dataPayload: '{"a":1}',
    });
  });

  it('defaults the event type to "message" when no event field is present', () => {
    const result = parseEventBlock('data: {"a":1}');

    expect(result.eventType).toBe('message');
  });

  it('returns an empty payload when the block has no data field', () => {
    const result = parseEventBlock('event: ping');

    expect(result).toEqual({ eventType: 'ping', dataPayload: '' });
  });

  it('joins multiple data lines with newlines per the SSE spec', () => {
    const result = parseEventBlock('data: line one\ndata: line two');

    expect(result.dataPayload).toBe('line one\nline two');
  });

  it('ignores comment/heartbeat lines', () => {
    const result = parseEventBlock(': keep-alive\nevent: tick\ndata: {}');

    expect(result).toEqual({ eventType: 'tick', dataPayload: '{}' });
  });

  it('ignores blank lines within the block', () => {
    const result = parseEventBlock('event: tick\n\n   \ndata: {}');

    expect(result).toEqual({ eventType: 'tick', dataPayload: '{}' });
  });

  it('trims surrounding whitespace from field values', () => {
    const result = parseEventBlock('event:   spaced   \ndata:   {"a":1}   ');

    expect(result).toEqual({ eventType: 'spaced', dataPayload: '{"a":1}' });
  });

  it('ignores unrecognized fields such as id and retry', () => {
    const result = parseEventBlock(
      'id: 42\nretry: 3000\nevent: tick\ndata: {}',
    );

    expect(result).toEqual({ eventType: 'tick', dataPayload: '{}' });
  });

  it('returns defaults for an empty block', () => {
    const result = parseEventBlock('');

    expect(result).toEqual({ eventType: 'message', dataPayload: '' });
  });
});
