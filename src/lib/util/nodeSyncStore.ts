/**
 * Shared Svelte stores for bidirectional sync between the code editor
 * and the preview panel. Enables:
 * - Preview hover → editor line highlight
 * - Preview click → editor cursor jump
 * - Editor cursor → preview node highlight
 * - Context menu actions → code updates
 */
import { writable } from 'svelte/store';

/** Node ID currently hovered in the preview panel (null = none) */
export const hoveredNodeId = writable<string | null>(null);

/** Node ID at the current editor cursor position (null = none) */
export const cursorNodeId = writable<string | null>(null);

/** Request to navigate the editor to a specific line/column */
export interface NavigationRequest {
  line: number; // 1-based
  column?: number; // 0-based
  nodeId?: string;
}
export const navigationRequest = writable<NavigationRequest | null>(null);

/** Request a context menu to appear for a node */
export interface ContextMenuRequest {
  nodeId: string;
  x: number;
  y: number;
}
export const contextMenuRequest = writable<ContextMenuRequest | null>(null);
