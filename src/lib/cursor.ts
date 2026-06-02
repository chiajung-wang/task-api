/**
 * Opaque cursor encoding for keyset pagination.
 *
 * A cursor captures a row's position in the `created_at DESC, id DESC` ordering.
 * It is encoded as base64url JSON so callers treat it as an opaque token and
 * pass it back verbatim; the shape stays isolated from the repository and schema.
 */

export interface CursorPosition {
  createdAt: string;
  id: string;
}

export function encodeCursor(position: CursorPosition): string {
  const json = JSON.stringify({ createdAt: position.createdAt, id: position.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): CursorPosition {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Malformed cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).createdAt !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new Error('Malformed cursor');
  }

  const { createdAt, id } = parsed as CursorPosition;
  return { createdAt, id };
}
