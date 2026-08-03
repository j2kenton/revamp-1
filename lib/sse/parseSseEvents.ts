/**
 * Server-Sent Events stream chunking.
 *
 * Pure text-level parsing only — knows nothing about chat or message shapes.
 * Callers accumulate decoded stream chunks into a buffer, pass the whole
 * buffer here, and get back the complete events plus the trailing partial
 * event to carry into the next read. Field-level parsing of each block lives
 * in `parseEventBlock`.
 */

import { parseEventBlock } from './parseEventBlock';

const EVENT_DELIMITER = '\n\n';

export interface ParsedSseEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface SseParseResult {
  events: ParsedSseEvent[];
  /** Trailing incomplete event text, to prepend to the next chunk. */
  remainder: string;
}

/**
 * Parse every complete event in `buffer`, returning them alongside the
 * leftover partial event text. Events with no data, unparseable JSON, or a
 * non-object payload are skipped rather than throwing — a malformed event
 * should never tear down an otherwise healthy stream.
 */
export function parseSseEvents(buffer: string): SseParseResult {
  const eventBlocks = buffer.split(EVENT_DELIMITER);
  const remainder = eventBlocks.pop() || '';
  const events: ParsedSseEvent[] = [];

  for (const rawEvent of eventBlocks) {
    const trimmedEvent = rawEvent.trim();
    if (!trimmedEvent) {
      continue;
    }

    const { eventType, dataPayload } = parseEventBlock(trimmedEvent);
    if (!dataPayload) {
      continue;
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(dataPayload);
    } catch (parseError) {
      console.error('Failed to parse streaming payload', parseError);
      continue;
    }

    if (typeof parsedData !== 'object' || parsedData === null) {
      continue;
    }

    events.push({
      type: eventType,
      data: parsedData as Record<string, unknown>,
    });
  }

  return { events, remainder };
}
