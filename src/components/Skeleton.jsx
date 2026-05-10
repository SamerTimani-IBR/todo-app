// Tiny skeleton primitives. Compose them to mimic the real layout while loading.

export function SkeletonLine({ width = '100%', height = '14px', radius = '6px', className = '' }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius, display: 'inline-block' }}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ width = '100%', height = '40px', radius = '8px', className = '' }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function TodoSkeletonList({ count = 3 }) {
  return (
    <ul className="todo-list" aria-label="Loading to-dos">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="todo-item skeleton-row">
          <SkeletonBlock width="20px" height="20px" radius="4px" />
          <div className="todo-content">
            <SkeletonLine width={`${55 + ((i * 13) % 30)}%`} height="14px" />
            <SkeletonLine width={`${35 + ((i * 11) % 25)}%`} height="11px" />
          </div>
          <div className="todo-actions">
            <SkeletonBlock width="32px" height="32px" />
            <SkeletonBlock width="32px" height="32px" />
          </div>
        </li>
      ))}
    </ul>
  );
}
