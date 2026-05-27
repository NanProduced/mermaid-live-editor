import type { ParsedSource } from './mermaidSourceParser';
import { derived, writable } from 'svelte/store';

interface CoordinationState {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  cursorLine: number | null;
  parsedSource: ParsedSource | null;
  contextMenu: {
    visible: boolean;
    nodeId: string | null;
    x: number;
    y: number;
  };
}

export const coordinationStore = writable<CoordinationState>({
  hoveredNodeId: null,
  selectedNodeId: null,
  cursorLine: null,
  parsedSource: null,
  contextMenu: { visible: false, nodeId: null, x: 0, y: 0 }
});

export const cursorNodeId = derived(coordinationStore, ($c) => {
  if (!$c.cursorLine || !$c.parsedSource) return null;
  return $c.parsedSource.lineToNodeId.get($c.cursorLine) ?? null;
});
