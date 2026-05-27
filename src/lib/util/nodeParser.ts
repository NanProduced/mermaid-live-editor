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
 * Check if a node ID appears with a delimiter+label on a given line.
 * Uses word-boundary check to avoid matching substrings (e.g. `A` inside `AB`).
 */
function nodeHasLabelOnLine(line: string, nodeId: string): boolean {
  const esc = escapeRegex(nodeId);
  for (const delim of DELIMITERS) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_])${esc}\\s*${escapeRegex(delim.open)}`
    );
    if (pattern.test(line)) return true;
  }
  return false;
}

/**
 * Surgically strip all label definitions for a node ID on a single line.
 * Uses the DELIMITERS table (longest-first) to find exact label boundaries,
 * then removes only the delimiter+label text, preserving everything else.
 *
 * Example: stripNodeLabelsOnLine("A[Alpha] --> AB[beta]", "A")
 *   → "A --> AB[beta]"   (AB[beta] is preserved intact)
 */
function stripNodeLabelsOnLine(line: string, nodeId: string): string {
  let result = line;
  let found = true;

  while (found) {
    found = false;
    for (const delim of DELIMITERS) {
      // Match nodeId with word-boundary before and delimiter open after
      const pattern = new RegExp(
        `(^|[^A-Za-z0-9_])${escapeRegex(nodeId)}(\\s*)${escapeRegex(delim.open)}`
      );
      const match = pattern.exec(result);
      if (!match) continue;

      const prefix = match[1];
      const nodeIdStart = match.index + prefix.length;
      const openStart = nodeIdStart + nodeId.length + match[2].length;
      const closeIdx = result.indexOf(delim.close, openStart + delim.open.length);
      if (closeIdx === -1) continue;

      // Keep everything before the delimiter and after the close delimiter
      const before = result.slice(0, nodeIdStart + nodeId.length);
      const after = result.slice(closeIdx + delim.close.length);
      result = before + after;
      found = true;
      break; // restart since string changed
    }
  }

  return result;
}

/**
 * Delete a node from the code: removes its definition line and any edges
 * that reference it. Also removes associated style lines.
 * Uses surgical label stripping to avoid corrupting sibling nodes on the same line.
 */
export function deleteNode(code: string, nodeId: string): string {
  const lines = code.split('\n');
  const result: string[] = [];
  const esc = escapeRegex(nodeId);
  const arrowSrc = '(?:--?>|---|-\\.->|==>|-\\.-)';
  const arrowRe = new RegExp(arrowSrc);
  const optLabelSrc = '(?:\\s*\\|[^|]*\\|)?';

  for (const line of lines) {
    // 1. Remove style/class lines for this node (with word boundary)
    if (new RegExp(`^\\s*style\\s+${esc}(?:\\s|$)`).test(line)) continue;
    if (new RegExp(`^\\s*class\\s+${esc}(?:\\s|$)`).test(line)) continue;

    // 2. Check if node has a label on this line BEFORE stripping
    const hadLabel = nodeHasLabelOnLine(line, nodeId);

    // 3. Strip all label definitions for this node on this line
    const stripped = stripNodeLabelsOnLine(line, nodeId);

    // 4. If no arrows in the stripped line → pure definition or bare ref
    if (!arrowRe.test(stripped)) {
      // If line is (or became) just the bare nodeId, remove it
      if (new RegExp(`(^|[^A-Za-z0-9_])${esc}\\s*$`).test(stripped)) continue;
      result.push(stripped);
      continue;
    }

    // 5. Chain pattern: arrow → nodeId → arrow → reconnect (skip nodeId)
    //    e.g. "A --> B --> C" deleting B → "A --> C"
    //    Must fire BEFORE source/target checks to avoid greedy consumption
    const chainRe = new RegExp(
      `(${arrowSrc})${optLabelSrc}\\s*${esc}\\s*(${arrowSrc})`
    );
    if (chainRe.test(stripped)) {
      const reconnected = stripped.replace(
        new RegExp(
          `(${arrowSrc})${optLabelSrc}\\s*${esc}\\s*(${arrowSrc})`,
          'g'
        ),
        '$1'
      );
      if (reconnected.trim()) result.push(reconnected);
      continue;
    }

    // 6. If node is at the START (source position) and had NO label → remove line
    //    e.g. "B --> C[End]" deleting bare B → remove
    //    But "A[Alpha] --> AB[beta]" deleting A → keep (AB defined here)
    if (new RegExp(`^\\s*${esc}(?:\\s|${arrowSrc})`).test(stripped) && !hadLabel) {
      continue;
    }

    // 7. Otherwise keep the line (target position, or source that had a label)
    result.push(stripped);
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
