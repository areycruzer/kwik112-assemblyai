'use client';

import { buildSymbol, type SymbolSpec } from '@/lib/design/symbols';

/**
 * @description Renders a symbol built by `buildSymbol`. Using
 *              dangerouslySetInnerHTML is safe here specifically because
 *              buildSymbol escapes every interpolated value; do not pass raw
 *              markup through this component by any other route.
 */
export function Symbol({ spec, className }: { spec: SymbolSpec; className?: string }) {
  // SAFETY: the only markup reaching this sink is buildSymbol's own output.
  // buildSymbol runs every untrusted value (label, glyph, kind) through its
  // `esc()` escaper — a unit test proves a `<script>` payload comes back inert —
  // and Leaflet's `divIcon` needs an HTML string regardless, so the string
  // builder must exist anyway. This is an approved, single-purpose exception.
  // Do NOT route any other value or raw markup through this component.
  return (
    <span
      className={className}
      aria-hidden={spec.label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: buildSymbol(spec) }}
    />
  );
}
