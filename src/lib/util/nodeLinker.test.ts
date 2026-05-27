import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  activePreviewNode,
  contextMenuState,
  editorActiveNodeId,
  findNodeAtLine,
  hideContextMenu,
  nodeMap,
  previewHoverNodeId,
  selectedNodeId,
  showContextMenu,
  updateNodeMapFromCode
} from './nodeLinker';

const SAMPLE_CODE = `flowchart TD
    A[Start] --> B[Decision]
    B -->|Yes| C[End]
    B -->|No| D[Retry]`;

describe('nodeLinker', () => {
  beforeEach(() => {
    // Reset stores before each test
    nodeMap.set(new Map());
    editorActiveNodeId.set(null);
    previewHoverNodeId.set(null);
    selectedNodeId.set(null);
    hideContextMenu();
  });

  describe('updateNodeMapFromCode', () => {
    it('should populate nodeMap from code', () => {
      updateNodeMapFromCode(SAMPLE_CODE);
      const map = get(nodeMap);
      expect(map.size).toBe(4);
      expect(map.has('A')).toBe(true);
      expect(map.has('B')).toBe(true);
      expect(map.has('C')).toBe(true);
      expect(map.has('D')).toBe(true);
    });

    it('should clear nodeMap for empty code', () => {
      updateNodeMapFromCode(SAMPLE_CODE);
      expect(get(nodeMap).size).toBe(4);
      updateNodeMapFromCode('');
      expect(get(nodeMap).size).toBe(0);
    });
  });

  describe('findNodeAtLine', () => {
    it('should find node at given line number', () => {
      expect(findNodeAtLine(SAMPLE_CODE, 2)).toBe('A');
      expect(findNodeAtLine(SAMPLE_CODE, 3)).toBe('C');
      expect(findNodeAtLine(SAMPLE_CODE, 4)).toBe('D');
    });

    it('should return null for non-node lines', () => {
      expect(findNodeAtLine(SAMPLE_CODE, 1)).toBeNull(); // diagram type line
      expect(findNodeAtLine(SAMPLE_CODE, 99)).toBeNull(); // out of range
    });
  });

  describe('context menu state', () => {
    it('should show context menu', () => {
      showContextMenu('A', 100, 200);
      const state = get(contextMenuState);
      expect(state.visible).toBe(true);
      expect(state.nodeId).toBe('A');
      expect(state.x).toBe(100);
      expect(state.y).toBe(200);
    });

    it('should hide context menu', () => {
      showContextMenu('A', 100, 200);
      hideContextMenu();
      const state = get(contextMenuState);
      expect(state.visible).toBe(false);
      expect(state.nodeId).toBeNull();
    });
  });

  describe('editor ↔ preview linking', () => {
    it('should derive activePreviewNode from editorActiveNodeId when no selection', () => {
      updateNodeMapFromCode(SAMPLE_CODE);
      // When no preview selection, activePreviewNode follows editor
      editorActiveNodeId.set('B');
      expect(get(activePreviewNode)).toBe('B');
    });

    it('should derive activePreviewNode from selectedNodeId when present', () => {
      updateNodeMapFromCode(SAMPLE_CODE);
      // selectedNodeId takes priority over editorActiveNodeId
      editorActiveNodeId.set('A');
      selectedNodeId.set('C');
      expect(get(activePreviewNode)).toBe('C');
    });

    it('should clear activePreviewNode when both are null', () => {
      expect(get(activePreviewNode)).toBeNull();
    });
  });
});
