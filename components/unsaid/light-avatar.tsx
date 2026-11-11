/**
 * Anonymous "avatar": a small glowing light, the same amber as the thoughts on the map.
 */

import React from 'react';

export default function LightAvatar({ size = 32, className = '' }: { size?: number; className?: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={`grid place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="rounded-full bg-[rgb(255,214,170)]" style={{ width: size * 0.3, height: size * 0.3 }} />
    </span>
  );
}
