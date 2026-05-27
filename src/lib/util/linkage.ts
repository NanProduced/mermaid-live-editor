import { writable } from 'svelte/store';
import type { NodeMapping } from './mermaidParser';
import { parseFlowchartNodes } from './mermaidParser';

export interface ContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

export interface LinkageState {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  cursorNodeId: string | null;
  nodeMappings: NodeMapping[];
  diagramType: string | null;
  contextMenu: ContextMenuState | null;
}

const initial: LinkageState = {
  hoveredNodeId: null,
  selectedNodeId: null,
  cursorNodeId: null,
  nodeMappings: [],
  diagramType: null,
  contextMenu: null
};

export const linkageStore = writable<LinkageState>(initial);

export function setHoveredNode(nodeId: string | null): void {
  linkageStore.update((s) => ({ ...s, hoveredNodeId: nodeId }));
}

export function setSelectedNode(nodeId: string | null): void {
  linkageStore.update((s) => ({ ...s, selectedNodeId: nodeId, contextMenu: null }));
}

export function setCursorNode(nodeId: string | null): void {
  linkageStore.update((s) => ({ ...s, cursorNodeId: nodeId }));
}

export function openContextMenu(nodeId: string, x: number, y: number): void {
  linkageStore.update((s) => ({ ...s, contextMenu: { nodeId, x, y } }));
}

export function closeContextMenu(): void {
  linkageStore.update((s) => ({ ...s, contextMenu: null }));
}

export function updateNodeMappings(code: string, diagramType: string | null): void {
  const isFlowchart =
    diagramType === 'flowchart' ||
    diagramType === 'flowchart-v2' ||
    diagramType === 'flowchart-elk' ||
    diagramType === 'graph';

  const nodeMappings = isFlowchart ? parseFlowchartNodes(code) : [];
  linkageStore.update((s) => ({ ...s, nodeMappings, diagramType }));
}

export function getNodeMapping(nodeId: string): NodeMapping | undefined {
  let result: NodeMapping | undefined;
  linkageStore.subscribe((s) => {
    result = s.nodeMappings.find((m) => m.nodeId === nodeId);
  })();
  return result;
}
