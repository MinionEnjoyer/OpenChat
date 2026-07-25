/**
 * Category collapse persistence (FR-SRV-004).
 *
 * Collapse state is stored locally in device storage under key
 * `ui.collapsedCategories.{serverId}` as a Set<string> of category ids.
 * The category id `__NONE__` represents channels with no category.
 */
import { storage } from '../../lib/storageInstance';

function storageKey(serverId: string): string {
  return `ui.collapsedCategories.${serverId}`;
}

export function loadCollapsed(serverId: string): Set<string> {
  const raw = storage().getJson<string[]>(storageKey(serverId));
  if (!raw || !Array.isArray(raw)) return new Set();
  return new Set(raw);
}

export function saveCollapsed(serverId: string, collapsed: Set<string>): void {
  storage().setJson(storageKey(serverId), [...collapsed]);
}

export function toggleCollapsed(
  serverId: string,
  collapsed: Set<string>,
  categoryId: string,
): Set<string> {
  const next = new Set(collapsed);
  if (next.has(categoryId)) {
    next.delete(categoryId);
  } else {
    next.add(categoryId);
  }
  saveCollapsed(serverId, next);
  return next;
}

/** Sentinel key for channels with no category assigned. */
export const NO_CATEGORY = '__NONE__';
