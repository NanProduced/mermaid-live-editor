import type { NodeMapping, ParseResult } from './nodeSync';
import { writable, type Writable } from 'svelte/store';

export interface NodeSyncState {
  hoveredNode: NodeMapping | null;
  selectedNode: NodeMapping | null;
  parseResult: ParseResult | null;
  error: string | null;
}

const initialState: NodeSyncState = {
  hoveredNode: null,
  selectedNode: null,
  parseResult: null,
  error: null
};

export const nodeSyncStore: Writable<NodeSyncState> = writable(initialState);

export function setHoveredNode(node: NodeMapping | null): void {
  nodeSyncStore.update((state) => ({
    ...state,
    hoveredNode: node
  }));
}

export function setSelectedNode(node: NodeMapping | null): void {
  nodeSyncStore.update((state) => ({
    ...state,
    selectedNode: node
  }));
}

export function setParseResult(result: ParseResult | null): void {
  nodeSyncStore.update((state) => ({
    ...state,
    parseResult: result,
    error: result?.error || null
  }));
}

export function clearNodeSync(): void {
  nodeSyncStore.set(initialState);
}
