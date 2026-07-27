const EVENT_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;
const DEFAULT_MAXIMUM_EVENT_BYTES = 1_048_576;
const encoder = new TextEncoder();

function byteLength(value) {
  return encoder.encode(value).byteLength;
}

function eventData(event) {
  return event
    .split(/\r\n|\n|\r/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

export function drainSseEvents(
  input,
  { maximumEventBytes = DEFAULT_MAXIMUM_EVENT_BYTES } = {},
) {
  let remainder = String(input);
  const events = [];
  let boundary = EVENT_BOUNDARY.exec(remainder);

  while (boundary) {
    const event = remainder.slice(0, boundary.index);
    if (byteLength(event) > maximumEventBytes) {
      throw new Error("SSE event exceeds the configured size limit");
    }

    const data = eventData(event);
    if (data) events.push(data);
    remainder = remainder.slice(boundary.index + boundary[0].length);
    boundary = EVENT_BOUNDARY.exec(remainder);
  }

  if (byteLength(remainder) > maximumEventBytes) {
    throw new Error("SSE event exceeds the configured size limit");
  }

  return { events, remainder };
}
