export interface NodeMapping {
  nodeId: string;
  lineNumber: number;
  startColumn: number;
  endColumn: number;
  label: string;
  labelStart: number;
  labelEnd: number;
}

const FLOWCHART_NODE_RE =
  /(?:^|[\s;])(\w+)(\[{1,2}[\["]?|\({1,2}[\[(]?|\>{1}|{{)(.+?)([\]"\]>}]{1,3}|\){1,2})/;

const COMMENT_RE = /^\s*%%/;
const DIRECTION_RE = /^\s*(flowchart|graph)\s+(TD|TB|BT|RL|LR|DT)\s*$/i;
const SUBGRAPH_RE = /^\s*subgraph\s/i;
const END_RE = /^\s*end\s*$/i;
const KEYWORD_RE =
  /^\s*(classDef|class|style|click|linkStyle|accTitle|accDescr|direction|participant|actor)\s/i;

export function parseFlowchartNodes(code: string): NodeMapping[] {
  const lines = code.split('\n');
  const mappings: NodeMapping[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      COMMENT_RE.test(line) ||
      DIRECTION_RE.test(line) ||
      SUBGRAPH_RE.test(line) ||
      END_RE.test(line) ||
      KEYWORD_RE.test(line)
    ) {
      continue;
    }

    const segments = splitLineSegments(line);
    for (const seg of segments) {
      const match = FLOWCHART_NODE_RE.exec(seg.text);
      if (!match) continue;
      const nodeId = match[1];
      if (seen.has(nodeId)) continue;

      const label = match[3];
      const bracketOpen = match[2];
      const fullMatch = match[0];
      const matchStartInSeg = seg.text.indexOf(fullMatch) + (fullMatch.length - fullMatch.trimStart().length);
      const nodeStartInLine = seg.offset + seg.text.indexOf(nodeId, matchStartInSeg);
      const labelStartInLine = seg.offset + seg.text.indexOf(bracketOpen, nodeStartInLine) + bracketOpen.length;
      const labelEndInLine = labelStartInLine + label.length;

      seen.add(nodeId);
      mappings.push({
        nodeId,
        lineNumber: i + 1,
        startColumn: nodeStartInLine + 1,
        endColumn: labelEndInLine + match[4].length + 1,
        label,
        labelStart: labelStartInLine + 1,
        labelEnd: labelEndInLine + 1
      });
    }
  }
  return mappings;
}

interface LineSegment {
  text: string;
  offset: number;
}

function splitLineSegments(line: string): LineSegment[] {
  const arrowRe = /\s*--+>?\|[^|]*\|\s*|\s*-+\.+-+>?\s*|\s*==+>?\s*|\s*--+>?\s*|\s*-+\.-+>?\s*/g;
  const segments: LineSegment[] = [];
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = arrowRe.exec(line)) !== null) {
    if (m.index > lastEnd) {
      segments.push({ text: line.slice(lastEnd, m.index), offset: lastEnd });
    }
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < line.length) {
    segments.push({ text: line.slice(lastEnd), offset: lastEnd });
  }
  if (segments.length === 0) {
    segments.push({ text: line, offset: 0 });
  }
  return segments;
}

export function extractNodeIdFromSvgElement(element: Element): string | null {
  const g = element.closest('g.node');
  if (!g) return null;
  const id = g.getAttribute('id') ?? '';
  const match = /-(?:flowchart|graph)-(.+?)-\d+$/.exec(id);
  if (match) return match[1];
  const simpleMatch = /^(?:flowchart|graph)-(.+?)-\d+$/.exec(id);
  if (simpleMatch) return simpleMatch[1];
  const dataId = g.getAttribute('data-id');
  if (dataId) return dataId;
  return null;
}

export function findNodeSvgElement(container: HTMLElement, nodeId: string): Element | null {
  const nodes = container.querySelectorAll('g.node[id]');
  const suffix = `-flowchart-${nodeId}-`;
  const altSuffix = `-graph-${nodeId}-`;
  for (const node of nodes) {
    const id = node.getAttribute('id') ?? '';
    if (id.includes(suffix) || id.includes(altSuffix)) return node;
  }
  const byPrefix = container.querySelector(
    `g.node[id^="flowchart-${CSS.escape(nodeId)}-"]`
  );
  if (byPrefix) return byPrefix;
  const byData = container.querySelector(`g.node[data-id="${CSS.escape(nodeId)}"]`);
  if (byData) return byData;
  return null;
}

export function getEdgeLinesForNode(code: string, nodeId: string): number[] {
  const lines = code.split('\n');
  const edgeLines: number[] = [];
  const nodeIdRe = new RegExp(`(?:^|[\\s;(])${escapeRegExp(nodeId)}(?=[\\s;)\\[({<>|\\-=.]|$)`);
  const arrowRe = /--+>?|==+>?|-+\.+-+>?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (COMMENT_RE.test(line) || DIRECTION_RE.test(line) || SUBGRAPH_RE.test(line) || END_RE.test(line) || KEYWORD_RE.test(line)) {
      continue;
    }
    if (nodeIdRe.test(line) && arrowRe.test(line)) {
      edgeLines.push(i + 1);
    }
  }
  return edgeLines;
}

export function getStyleLinesForNode(code: string, nodeId: string): number[] {
  const lines = code.split('\n');
  const styleLines: number[] = [];
  const styleRe = new RegExp(`^\\s*style\\s+${escapeRegExp(nodeId)}\\s`, 'i');
  for (let i = 0; i < lines.length; i++) {
    if (styleRe.test(lines[i])) {
      styleLines.push(i + 1);
    }
  }
  return styleLines;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
