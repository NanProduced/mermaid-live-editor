/**
 * Parses Mermaid flowchart/graph code to extract node definitions with precise
 * source positions, and provides targeted update operations (rename, recolor,
 * delete) that only modify the specific node without affecting other content.
 */

export type NodeShape =
  | 'rect'
  | 'round'
  | 'diamond'
  | 'hexagon'
  | 'circle'
  | 'subroutine'
  | 'cylinder'
  | 'asymmetric'
  | 'parallelogram'
  | 'parallelogram_alt'
  | 'stadium'
  | 'double_circle';

export interface NodeInfo {
  id: string;
  label: string;
  shape: NodeShape;
  /** 1-based line number */
  line: number;
  /** 0-based column where the node ID starts */
  column: number;
  /** 0-based column where the label text starts (after opening delimiter) */
  labelStartCol: number;
  /** 0-based column where the label text ends (at closing delimiter) */
  labelEndCol: number;
  /** Full text of the definition, e.g. "A[Christmas]" */
  rawDefinition: string;
}

interface DelimiterInfo {
  shape: NodeShape;
  open: string;
  close: string;
}

/**
 * Delimiter patterns ordered longest-first so multi-character delimiters
 * (e.g. `[[`, `((`) are tried before single-character ones.
 */
const DELIMITERS: DelimiterInfo[] = [
  { shape: 'double_circle', open: '(((', close: ')))' },
  { shape: 'subroutine', open: '[[', close: ']]' },
  { shape: 'cylinder', open: '[(', close: ')]' },
  { shape: 'stadium', open: '([', close: '])' },
  { shape: 'parallelogram', open: '[/', close: '/]' },
  { shape: 'parallelogram_alt', open: '[\\', close: '\\]' },
  { shape: 'hexagon', open: '{{', close: '}}' },
  { shape: 'circle', open: '((', close: '))' },
  { shape: 'rect', open: '[', close: ']' },
  { shape: 'round', open: '(', close: ')' },
  { shape: 'diamond', open: '{', close: '}' },
  { shape: 'asymmetric', open: '>', close: ']' }
];

const DIRECTIVE_RE = /^\s*(flowchart|graph|subgraph|end|classDef|class |style|click|link|direction|interpolate|accent|%%)/i;
const COMMENT_RE = /^\s*%%/;
const NODE_ID_RE = /^[A-Za-z_]\w*/;

function findDelimiter(afterId: string): DelimiterInfo | undefined {
  return DELIMITERS.find((d) => afterId.startsWith(d.open));
}

/**
 * Extract all node definitions from Mermaid flowchart/graph code.
 * Only the first occurrence of each node ID (with a shape delimiter) is returned.
 */
export function parseNodes(code: string): NodeInfo[] {
  const nodes: NodeInfo[] = [];
  const lines = code.split('\n');
  const seenIds = new Set<string>();

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Skip directives and comments
    if (DIRECTIVE_RE.test(line) || COMMENT_RE.test(line)) {
      continue;
    }

    let pos = 0;
    while (pos < line.length) {
      // Skip non-identifier characters
      const remaining = line.slice(pos);
      const idMatch = remaining.match(NODE_ID_RE);
      if (!idMatch || idMatch.index === undefined) {
        pos++;
        continue;
      }

      const idStart = pos + idMatch.index;
      const id = idMatch[0];
      const afterIdPos = idStart + id.length;

      // Must not be preceded by an alphanumeric char (to avoid matching substrings)
      if (idStart > 0 && /[A-Za-z0-9_]/.test(line[idStart - 1])) {
        pos = afterIdPos;
        continue;
      }

      // Check what follows the ID
      const afterId = line.slice(afterIdPos);
      const delim = findDelimiter(afterId);

      if (!delim) {
        pos = afterIdPos;
        continue;
      }

      // Find closing delimiter
      const openEnd = afterIdPos + delim.open.length;
      const closeIdx = line.indexOf(delim.close, openEnd);
      if (closeIdx === -1) {
        pos = afterIdPos;
        continue;
      }

      const label = line.slice(openEnd, closeIdx);
      const rawEnd = closeIdx + delim.close.length;

      if (!seenIds.has(id)) {
        seenIds.add(id);
        nodes.push({
          id,
          label,
          shape: delim.shape,
          line: lineIdx + 1,
          column: idStart,
          labelStartCol: openEnd,
          labelEndCol: closeIdx,
          rawDefinition: line.slice(idStart, rawEnd)
        });
      }

      pos = rawEnd;
    }
  }

  return nodes;
}

/**
 * Find the line range for a node (definition line + any continuation lines).
 * Returns 1-based line numbers.
 */
export function findNodeLineRange(
  code: string,
  nodeId: string
): { startLine: number; endLine: number } | undefined {
  const nodes = parseNodes(code);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;
  return { startLine: node.line, endLine: node.line };
}

/**
 * Rename a node's label precisely, only modifying the specific node definition.
 */
export function renameNode(code: string, nodeId: string, newLabel: string): string {
  const nodes = parseNodes(code);
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return code;

  const lines = code.split('\n');
  const line = lines[node.line - 1];
  const newLine =
    line.slice(0, node.labelStartCol) + newLabel + line.slice(node.labelEndCol);
  lines[node.line - 1] = newLine;
  return lines.join('\n');
}

/**
 * Change a node's color by adding/updating a style directive.
 * Only adds or replaces the style line for the specific node ID.
 */
export function changeNodeColor(
  code: string,
  nodeId: string,
  fillColor: string,
  strokeColor?: string,
  textColor?: string
): string {
  const lines = code.split('\n');

  // Remove existing style line for this specific node (exact match on node ID)
  const styleLineRe = new RegExp(`^\\s*style\\s+${escapeRegex(nodeId)}\\s`);
  const filtered = lines.filter((l) => !styleLineRe.test(l));

  // Build new style line
  const styleParts: string[] = [`fill:${fillColor}`];
  if (strokeColor) styleParts.push(`stroke:${strokeColor}`);
  if (textColor) styleParts.push(`color:${textColor}`);
  filtered.push(`style ${nodeId} ${styleParts.join(',')}`);

  return filtered.join('\n');
}

/**
 * Delete a node from the code: removes its definition line and any edges
 * that reference it. Also removes associated style lines.
 */
export function deleteNode(code: string, nodeId: string): string {
  const lines = code.split('\n');
  const result: string[] = [];
  const esc = escapeRegex(nodeId);
  // Node ID possibly followed by a shape delimiter+label, e.g. D[Laptop] or D{think}
  const nodeWithDelim = `${esc}(?:\\s*[\\[\\(\\{>][^\\n]*)?`;
  // Arrow pattern covering all standard Mermaid edge types
  const arrow = '(?:--?>|---|-\\.->|==>|-\\.-)';
  // Optional edge label  -->|text|  or  --> text
  const optLabel = `(?:\\s*\\|[^|]*\\|)?`;

  // Source: node (with optional delim) at line start, followed by arrow
  const sourceRe = new RegExp(`^\\s*${nodeWithDelim}\\s*${arrow}`);
  // Target: arrow, optional label, then node (with optional delim) at line end
  const targetRe = new RegExp(`${arrow}${optLabel}\\s*${nodeWithDelim}\\s*$`);
  // Chain: arrow, optional label, node, then another arrow
  const chainRe = new RegExp(`${arrow}${optLabel}\\s*${esc}\\s*${arrow}`);

  const styleRe = new RegExp(`^\\s*style\\s+${esc}\\s`);
  const classRe = new RegExp(`^\\s*class\\s+${esc}\\s`);
  // Pure definition: line starts with nodeId + delimiter (no arrow before it)
  const pureDefRe = new RegExp(`^\\s*${esc}\\s*[\\[\\(\\{>]`);

  for (const line of lines) {
    if (styleRe.test(line) || classRe.test(line)) continue;
    if (pureDefRe.test(line)) continue;
    if (sourceRe.test(line) || targetRe.test(line)) continue;

    if (chainRe.test(line)) {
      // Reconnect: remove the node from the chain keeping one arrow
      const cleaned = line.replace(
        new RegExp(
          `(\\s*${arrow}${optLabel}\\s*)${esc}(?:\\s*[\\[\\(\\{>][^\\n]*?)?(\\s*${arrow})`,
          'g'
        ),
        (_match, before, after) => (after.trim() ? ' --> ' : '')
      );
      if (cleaned.trim()) result.push(cleaned);
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Given an SVG element ID from a rendered Mermaid diagram and a list of known
 * node IDs from the source code, find which node ID corresponds to the SVG element.
 */
export function matchSvgToNodeId(svgElementId: string, knownNodeIds: string[]): string | null {
  // Try longest node IDs first to avoid partial matches (e.g., "AB" before "A")
  const sorted = [...knownNodeIds].sort((a, b) => b.length - a.length);
  for (const nodeId of sorted) {
    const re = new RegExp(`(?:^|[-_])${escapeRegex(nodeId)}(?:[-_]|$)`);
    if (re.test(svgElementId)) {
      return nodeId;
    }
  }
  return null;
}
