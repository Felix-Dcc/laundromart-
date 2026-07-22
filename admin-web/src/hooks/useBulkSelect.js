import { useState, useMemo, useCallback } from 'react';

/**
 * Row-selection state for bulk actions on a table.
 *
 *   const sel = useBulkSelect(rows.map(r => r.id));
 *   sel.has(id) / sel.toggle(id) / sel.toggleAll() / sel.clear()
 *   sel.ids  → array of selected ids   sel.count / sel.allSelected
 *
 * `ids` is the current full set of selectable ids; selections auto-prune to it
 * when the list changes (e.g. after a reload), so stale ids never linger.
 */
export function useBulkSelect(ids) {
  const [selected, setSelected] = useState(() => new Set());

  // Keep selection within the current id set.
  const valid = useMemo(() => {
    const idSet = new Set(ids);
    const next = new Set();
    for (const id of selected) if (idSet.has(id)) next.add(id);
    return next;
  }, [ids, selected]);

  const has = useCallback((id) => valid.has(id), [valid]);
  const toggle = useCallback((id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  }), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const all = ids.length > 0 && ids.every((id) => prev.has(id));
      return all ? new Set() : new Set(ids);
    });
  }, [ids]);

  return {
    has, toggle, toggleAll, clear,
    ids: [...valid],
    count: valid.size,
    allSelected: ids.length > 0 && ids.every((id) => valid.has(id)),
    someSelected: valid.size > 0 && valid.size < ids.length,
  };
}
