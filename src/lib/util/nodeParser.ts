/**
 * Parses Mermaid flowchart/graph source code to extract node definitions
 * with precise position tracking for bidirectional editor-preview linking.
 */

export type NodeShape = 'rect' | 'rounded' | 'diamond' | 'circle' | 'stadium' | 'hexagon';

export interface NodeInfo {
  /** Node identifier as written in source */
  id: string;
  /** Label text (without quotes, HTML tags preserved) */
  label: string;
  /** 1-based line number where node is defined */
  line: number;
  /** 1-based column where the label's enclosing bracket starts (e.g., `[`, `(`, `{`) */
  labelStartCol: number;
  /** 1-based column where the label's enclosing bracket ends */
  labelEndCol: number;
  /** Shape type based on bracket style */
  shape: NodeShape;
  /** Full line text for reference */
  lineText: string;
  /** Whether this is an explicit definition (has bracket) vs implicit (just ID) */
  isExplicit: boolean;
}

export interface StyleInfo {
  /** Target node identifier */
  targetId: string;
  /** 1-based line number */
  line: number;
  /** Full line text */
  lineText: string;
}

const NODE_SHAPES: Record<string, { close: string; open: string; shape: NodeShape }> = {
  '(': { close: ')', open: '(', shape: 'rounded' },
  '((': { close: '))', open: '((', shape: 'circle' },
  '([': { close: '])', open: '([', shape: 'stadium' },
  '[': { close: ']', open: '[', shape: 'rect' },
  '{': { close: '}', open: '{', shape: 'diamond' },
  '{{': { close: '}}', open: '{{', shape: 'hexagon' }
};

const ARROW_PATTERN = /(?:-->|-\.->|==>|---|-\.|-\.->|==|--)/;

/**
 * Detects whether a given source code is a flowchart or graph diagram type.
 */
export function isFlowchartDiagram(firstLine: string): boolean {
  const trimmed = firstLine.trim().toLowerCase();
  return /^(flowchart|graph)\b/.test(trimmed);
}

/**
 * Parses all node definitions from Mermaid flowchart/graph source code.
 * Returns a Map of nodeId -> NodeInfo for nodes that have explicit definitions (with brackets).
 */
export function parseNodes(code: string): Map<string, NodeInfo> {
  const lines = code.split('\n');
  const nodeMap = new Map<string, NodeInfo>();

  if (lines.length === 0) return nodeMap;
  if (!isFlowchartDiagram(lines[0])) return nodeMap;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    // Skip comments and empty lines
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('%%') || trimmedLine === '') continue;
    // Skip style/classDef declarations for node parsing (handled separately)
    if (/^\s*(style|classDef|class)\s/.test(line)) continue;
    // Skip the diagram type declaration line
    if (/^\s*(flowchart|graph)\s/i.test(line)) continue;
    // Skip subgraph/end/direction declarations
    if (/^\s*(subgraph|end|direction)\s/i.test(line)) continue;

    extractNodesFromLine(line, lineNumber, nodeMap);
  }

  return nodeMap;
}

/**
 * Extract node definitions from a single line of source code.
 * A line can contain multiple node definitions (e.g., `A[x] --> B[y]`).
 */
function extractNodesFromLine(
  line: string,
  lineNumber: number,
  nodeMap: Map<string, NodeInfo>
): void {
  let pos = 0;

  while (pos < line.length) {
    // Skip whitespace
    while (pos < line.length && /\s/.test(line[pos])) pos++;
    if (pos >= line.length) break;

    // Try to read an identifier
    const idStart = pos;
    const id = readIdentifier(line, pos);
    if (!id) {
      pos++;
      continue;
    }
    pos = idStart + id.length;

    // Skip whitespace after ID
    while (pos < line.length && /\s/.test(line[pos])) pos++;

    // Check if followed by a bracket (explicit node definition)
    const bracketInfo = matchBracketOpen(line, pos);
    if (!bracketInfo) {
      // This is just a reference, not a definition. Skip past any arrow.
      pos = skipPastArrow(line, pos);
      continue;
    }

    // We have an explicit node definition: ID[label]
    const labelStartCol = pos + 1; // 1-based, first char of label content
    const { closeIndex, label } = extractLabel(
      line,
      pos + bracketInfo.open.length,
      bracketInfo.close
    );

    if (closeIndex === -1) {
      // Malformed, skip
      pos = pos + bracketInfo.open.length;
      continue;
    }

    const labelEndCol = closeIndex + 1; // 1-based, position of closing bracket
    pos = closeIndex + bracketInfo.close.length;

    // Only store the first (definition) occurrence of a node
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        isExplicit: true,
        label,
        labelEndCol: labelEndCol + bracketInfo.close.length, // include closing bracket(s)
        labelStartCol,
        line: lineNumber,
        lineText: line,
        shape: bracketInfo.shape
      });
    }

    // Skip past any arrow
    pos = skipPastArrow(line, pos);
  }
}

/**
 * Reads a valid Mermaid identifier starting at position.
 * Returns null if no identifier found.
 */
function readIdentifier(line: string, start: number): string | null {
  // Identifiers: letters, digits, underscores, hyphens
  // Must not start with a digit or be a reserved keyword
  const idRegex = /^[A-Za-z_][\w-]*/;
  const remaining = line.slice(start);
  const match = idRegex.exec(remaining);
  if (!match) return null;

  const id = match[0];
  // Skip reserved keywords
  const reserved = new Set([
    'subgraph',
    'end',
    'direction',
    'style',
    'classDef',
    'class',
    'click',
    'linkStyle',
    'TB',
    'BT',
    'LR',
    'RL',
    'TD'
  ]);
  if (reserved.has(id)) return null;

  return id;
}

/**
 * Tries to match an opening bracket pattern at position.
 */
function matchBracketOpen(
  line: string,
  pos: number
): { open: string; close: string; shape: NodeShape } | null {
  const remaining = line.slice(pos);

  // Check 2-char brackets first (longest match)
  if (remaining.startsWith('((')) return NODE_SHAPES['(('];
  if (remaining.startsWith('([')) return NODE_SHAPES['(['];
  if (remaining.startsWith('{{')) return NODE_SHAPES['{{'];

  // Check 1-char brackets
  if (remaining.startsWith('[')) return NODE_SHAPES['['];
  if (remaining.startsWith('(')) return NODE_SHAPES['('];
  if (remaining.startsWith('{')) return NODE_SHAPES['{'];

  return null;
}

/**
 * Extracts the label content between opening and closing brackets.
 * Handles nested brackets and quoted strings.
 */
function extractLabel(
  line: string,
  start: number,
  closeBracket: string
): { closeIndex: number; label: string } {
  let depth = 1;
  let i = start;

  while (i < line.length && depth > 0) {
    // Check for closing bracket
    if (line.slice(i, i + closeBracket.length) === closeBracket) {
      depth--;
      if (depth === 0) {
        return {
          closeIndex: i,
          label: line.slice(start, i)
        };
      }
      i += closeBracket.length;
      continue;
    }

    // Check for matching opening bracket (for nesting)
    const openBracket = getMatchingOpen(closeBracket);
    if (line.slice(i, i + openBracket.length) === openBracket) {
      depth++;
      i += openBracket.length;
      continue;
    }

    i++;
  }

  return { closeIndex: -1, label: '' };
}

function getMatchingOpen(closeBracket: string): string {
  for (const [open, info] of Object.entries(NODE_SHAPES)) {
    if (info.close === closeBracket) return open;
  }
  return '';
}

/**
 * Skips past an arrow pattern if present at current position.
 * Handles arrow labels like `-->|text|`.
 */
function skipPastArrow(line: string, pos: number): number {
  // Skip whitespace
  while (pos < line.length && /\s/.test(line[pos])) pos++;

  const remaining = line.slice(pos);
  const arrowMatch = /^(-->|===>|-\.->|--|---|-\.|==)/.exec(remaining);
  if (!arrowMatch) return pos;

  pos += arrowMatch[0].length;

  // Check for arrow label: |text|
  if (pos < line.length && line[pos] === '|') {
    pos++; // skip opening |
    while (pos < line.length && line[pos] !== '|') pos++;
    if (pos < line.length) pos++; // skip closing |
  }

  return pos;
}

/**
 * Parses style declarations from Mermaid source code.
 */
export function parseStyles(code: string): Map<string, StyleInfo[]> {
  const lines = code.split('\n');
  const styleMap = new Map<string, StyleInfo[]>();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const lineNumber = lineIndex + 1;

    const styleMatch = /^\s*style\s+([A-Za-z_][\w-]*)\s+(.*)/.exec(line);
    if (!styleMatch) continue;

    const targetId = styleMatch[1];
    const existing = styleMap.get(targetId) ?? [];
    existing.push({ targetId, line: lineNumber, lineText: line });
    styleMap.set(targetId, existing);
  }

  return styleMap;
}

// ─── Source Code Modification Functions ───

/**
 * Renames a node's label in the source code using precise position tracking.
 * Only modifies the label content between the brackets; the node ID and bracket
 * characters are left untouched.
 */
export function renameNodeInCode(code: string, nodeId: string, newLabel: string): string {
  const nodes = parseNodes(code);
  const node = nodes.get(nodeId);
  if (!node) return code;

  const lines = code.split('\n');
  const lineIndex = node.line - 1;
  const line = lines[lineIndex];

  // Locate the node ID on the line, scanning from near its parsed position
  // to avoid matching the same ID elsewhere on the line.
  const searchFrom = Math.max(0, node.labelStartCol - nodeId.length - 5);
  const idPos = line.indexOf(nodeId, searchFrom);
  if (idPos === -1) return code;

  // Identify the bracket type immediately after the node ID
  const bracketInfo = matchBracketOpen(line, idPos + nodeId.length);
  if (!bracketInfo) return code;

  // Find the matching close bracket (start searching inside the label)
  const contentStart = idPos + nodeId.length + bracketInfo.open.length;
  const { closeIndex } = extractLabel(line, contentStart, bracketInfo.close);
  if (closeIndex === -1) return code;

  // Splice: everything before the label + new label + everything after close bracket
  const newLine = line.slice(0, contentStart) + newLabel + line.slice(closeIndex);
  lines[lineIndex] = newLine;

  return lines.join('\n');
}

/**
 * Changes a node's fill color by adding or updating a style declaration.
 * Uses positional tracking to only modify the relevant style line.
 */
export function changeNodeColorInCode(code: string, nodeId: string, color: string): string {
  const styles = parseStyles(code);
  const existingStyles = styles.get(nodeId);
  const lines = code.split('\n');

  if (existingStyles && existingStyles.length > 0) {
    // Update the last style declaration for this node
    const lastStyle = existingStyles[existingStyles.length - 1];
    const lineIndex = lastStyle.line - 1;
    const line = lines[lineIndex];

    // Replace fill color in existing style, or add it
    const fillMatch = /fill\s*:\s*[^,]+/.exec(line);
    if (fillMatch) {
      lines[lineIndex] =
        line.slice(0, fillMatch.index) +
        `fill:${color}` +
        line.slice(fillMatch.index + fillMatch[0].length);
    } else {
      // Add fill to existing style line
      lines[lineIndex] = line.replace(/\s*$/, '') + `,fill:${color}`;
    }
  } else {
    // Add new style declaration at the end of the code
    const trimmedCode = lines.join('\n').trimEnd();
    return trimmedCode + `\nstyle ${nodeId} fill:${color}`;
  }

  return lines.join('\n');
}

/**
 * Deletes a node and all references to it from the source code.
 * Removes:
 * - The node definition line (if it only defines this node)
 * - All edge lines that reference this node (preserving any surviving
 *   node definitions as standalone lines)
 * - Style declarations for this node
 * - Class assignments for this node
 */
export function deleteNodeInCode(code: string, nodeId: string): string {
  const lines = code.split('\n');
  const result: string[] = [];

  // Escape node ID for word-boundary regex matching
  const escapeId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idWordRegex = new RegExp(`\\b${escapeId}\\b`);

  for (const line of lines) {
    const trimmed = line.trim();

    // Always keep empty lines, comments, and the diagram-type declaration
    if (trimmed === '' || trimmed.startsWith('%%') || /^\s*(flowchart|graph)\s/i.test(line)) {
      result.push(line);
      continue;
    }

    // Remove style declarations targeting this node
    if (/^\s*style\s+/.test(line)) {
      const m = /^\s*style\s+([A-Za-z_][\w-]*)/.exec(line);
      if (m && m[1] === nodeId) continue;
      result.push(line);
      continue;
    }

    // Remove class assignments referencing this node
    if (/^\s*class\s+/.test(line)) {
      if (idWordRegex.test(line)) continue;
      result.push(line);
      continue;
    }

    // Parse node definitions on this line to check whether the target is defined here
    const nodesOnLine = (() => {
      const m = new Map<string, NodeInfo>();
      extractNodesFromLine(line, 1, m);
      return m;
    })();
    const hasTargetDefinition = nodesOnLine.has(nodeId);

    if (hasTargetDefinition && !ARROW_PATTERN.test(line)) {
      // Standalone node definition line (no edges) → remove entirely
      continue;
    }

    // If the node ID appears on an edge line, surgically remove the target
    // while preserving any other node definitions as standalone lines.
    if (idWordRegex.test(line) && ARROW_PATTERN.test(line)) {
      const surviving = extractSurvivingNodeDefinitions(line, nodeId, nodesOnLine);
      if (surviving) result.push(surviving);
      continue;
    }

    result.push(line);
  }

  // Collapse runs of 3+ blank lines into 2
  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/**
 * From an edge line that references the target node, extract any non-target
 * node definitions as standalone definitions (preserving original indentation).
 * Returns null when there are no surviving node definitions.
 *
 * Example: `    A[Start] --> B[Decision]` with target `B` → `    A[Start]`
 */
function extractSurvivingNodeDefinitions(
  line: string,
  targetNodeId: string,
  nodesOnLine: Map<string, NodeInfo>
): string | null {
  // Collect surviving (non-target) node definitions
  const survivors: { end: number; start: number }[] = [];

  for (const [id, info] of nodesOnLine) {
    if (id === targetNodeId) continue;

    // Compute 0-based positions from 1-based labelStartCol
    const bracketPos = info.labelStartCol - 1;
    const bracketInfo = matchBracketOpen(line, bracketPos);
    if (!bracketInfo) continue;

    const contentStart = bracketPos + bracketInfo.open.length;
    const { closeIndex } = extractLabel(line, contentStart, bracketInfo.close);
    if (closeIndex === -1) continue;

    // Start of "id[...": search backward from the bracket for the id
    const searchFrom = Math.max(0, bracketPos - id.length - 5);
    const idPos = line.indexOf(id, searchFrom);
    if (idPos === -1) continue;

    survivors.push({ start: idPos, end: closeIndex + bracketInfo.close.length });
  }

  if (survivors.length === 0) return null;

  // Preserve original leading whitespace
  const indent = /^\s*/.exec(line)?.[0] ?? '';
  const parts = survivors.map(({ start, end }) => line.slice(start, end));
  return indent + parts.join('\n' + indent);
}

/**
 * Finds the SVG element corresponding to a node ID in the rendered Mermaid diagram.
 * Mermaid v11 uses IDs like `flowchart-{nodeId}-{index}` on `<g>` elements.
 */
export function findSvgNodeElement(container: HTMLElement, nodeId: string): SVGElement | null {
  // Strategy 1: Match by SVG element ID pattern (Mermaid v11: `flowchart-{id}-{n}`)
  const allGroups = container.querySelectorAll<SVGGElement>('g[id]');
  for (const g of allGroups) {
    const elId = g.id;
    // Check for common Mermaid patterns
    if (
      elId === nodeId ||
      elId === `flowchart-${nodeId}` ||
      new RegExp(`^flowchart-${escapeRegex(nodeId)}-\\d+$`).test(elId) ||
      new RegExp(`^D-${escapeRegex(nodeId)}-\\d+$`).test(elId) ||
      new RegExp(`^${escapeRegex(nodeId)}-\\d+$`).test(elId)
    ) {
      // Verify this is a node group (contains a rect/path/foreignObject, not just an edge)
      if (isNodeGroup(g)) {
        return g;
      }
    }
  }

  // Strategy 2: Find by text content matching the node label
  const nodes = parseNodes(container.closest('[data-code]')?.getAttribute('data-code') ?? '');
  const nodeInfo = nodes.get(nodeId);
  if (nodeInfo) {
    const textElements = container.querySelectorAll('foreignObject span, text, tspan');
    for (const textEl of textElements) {
      const text = textEl.textContent?.trim();
      if (text && text === nodeInfo.label) {
        // Walk up to find the parent node group
        const parentGroup = textEl.closest('g[id]');
        if (parentGroup && isNodeGroup(parentGroup)) {
          return parentGroup as SVGGElement;
        }
      }
    }
  }

  return null;
}

/**
 * Determines if an SVG `<g>` element is a node group (not an edge).
 */
function isNodeGroup(g: Element): boolean {
  // Node groups typically contain rect, circle, polygon, or foreignObject
  const hasShape = g.querySelector('rect, circle, polygon, ellipse, foreignObject') !== null;
  const id = g.id || '';
  // Edge groups typically have IDs like `L-A-B-0` or contain `edge` in class
  const isEdge =
    /^L-/.test(id) || g.classList.contains('edgePath') || g.classList.contains('edge-pattern');
  return hasShape && !isEdge;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
