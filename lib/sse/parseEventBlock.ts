/**
 * Field-level parsing for a single Server-Sent Events block.
 *
 * Operates on one already-delimited event block (see `parseSseEvents` for the
 * buffer-chunking half): reads its `event:` and `data:` fields, ignoring
 * blank lines and `:`-prefixed comments/heartbeats.
 */

const LINE_DELIMITER = '\n';
const EVENT_FIELD_PREFIX = 'event:';
const DATA_FIELD_PREFIX = 'data:';
const COMMENT_PREFIX = ':';
const DEFAULT_EVENT_TYPE = 'message';

export interface SseEventFields {
  eventType: string;
  /** Raw (still unparsed) `data:` payload; empty when the block carries none. */
  dataPayload: string;
}

export function parseEventBlock(rawEvent: string): SseEventFields {
  const lines = rawEvent.split(LINE_DELIMITER);
  let eventType = DEFAULT_EVENT_TYPE;
  let dataPayload = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // Blank lines carry no fields; `:`-prefixed lines are comments/heartbeats.
    if (!line || line.startsWith(COMMENT_PREFIX)) {
      continue;
    }

    if (line.startsWith(EVENT_FIELD_PREFIX)) {
      eventType = line.slice(EVENT_FIELD_PREFIX.length).trim();
    } else if (line.startsWith(DATA_FIELD_PREFIX)) {
      const valuePart = line.slice(DATA_FIELD_PREFIX.length).trim();
      // Multiple `data:` lines in one event are joined with newlines per spec.
      dataPayload = dataPayload
        ? `${dataPayload}${LINE_DELIMITER}${valuePart}`
        : valuePart;
    }
  }

  return { eventType, dataPayload };
}
