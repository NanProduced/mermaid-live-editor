export interface NodeDefinition {
  nodeId: string;
  line: number;
  startCol: number;
  endCol: number;
  label: string;
  shapeType: string;
  lineText: string;
}

export interface ParsedSource {
  nodes: Map<string, NodeDefinition>;
  lineToNodeId: Map<number, string>;
  diagramType: string;
}

const DIAGRAM_TYPE_RE = /^\s*(flowchart|graph|flowchart-elk)\s+([A-Za-z]+)/;

// Node shape patterns in order of specificity (more specific first)
const SHAPE_PATTERNS: [RegExp, string][] = [
  [/\b([A-Za-z_]\w*)\s*\(\(\s*([^)]*?)\s*\)\)/, 'double-circle'],
  [/\b([A-Za-z_]\w*)\s*\(\[\s*([^\]]*?)\s*\]\)/, 'stadium'],
  [/\b([A-Za-z_]\w*)\s*\[\[\s*([^\]]*?)\s*\]\]/, 'subroutine'],
  [/\b([A-Za-z_]\w*)\s*\[\(\s*([^)]*?)\s*\)\]/, 'cylinder'],
  [/\b([A-Za-z_]\w*)\s*\{\{\s*([^}]*?)\s*\}\}/, 'hexagon'],
  [/\b([A-Za-z_]\w*)\s*>\s*\[([^\]]*?)\]/, 'asymmetric'],
  [/\b([A-Za-z_]\w*)\s*\(\s*([^)]*?)\s*\)/, 'rounded'],
  [/\b([A-Za-z_]\w*)\s*\{\s*([^}]*?)\s*\}/, 'diamond'],
  [/\b([A-Za-z_]\w*)\s*\[\s*([^\]]*?)\s*\]/, 'rect']
];

const KEYWORDS = new Set([
  'flowchart', 'graph', 'subgraph', 'end', 'classDef', 'style', 'click',
  'direction', 'linkStyle', 'class', 'TD', 'LR', 'RL', 'BT', 'TB',
  'flowchart-elk'
]);

export function parseSource(code: string): ParsedSource {
  const nodes = new Map<string, NodeDefinition>();
  const lineToNodeId = new Map<number, string>();
  const lines = code.split('\n');
  let diagramType = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect diagram type from first meaningful line
    if (diagramType === '') {
      const m = line.match(DIAGRAM_TYPE_RE);
      if (m) {
        diagramType = m[1] === 'graph' ? 'flowchart' : m[1];
        continue;
      }
    }

    // Skip structural lines
    if (/^\s*(subgraph\s|end\s*$|classDef\s|direction\s|linkStyle\s)/.test(line)) {
      continue;
    }

    // Find all node definitions on this line
    findNodeDefinitionsOnLine(line, lineNum, nodes, lineToNodeId);

    // Find edge node references (for lineToNodeId mapping on pure-edge lines)
    if (!lineToNodeId.has(lineNum)) {
      findEdgeNodeRefs(line, lineNum, lineToNodeId);
    }
  }

  return {
    nodes,
    lineToNodeId,
    diagramType
  };
}

function findNodeDefinitionsOnLine(
  line: string,
  lineNum: number,
  nodes: Map<string, NodeDefinition>,
  lineToNodeId: Map<number, string>
) {
  for (const [regex, shapeType] of SHAPE_PATTERNS) {
    let match: RegExpExecArray | null;
    const re = new RegExp(regex.source, 'g');

    while ((match = re.exec(line)) !== null) {
      const nodeId = match[1];

      // Skip keywords
      if (KEYWORDS.has(nodeId)) continue;

      // Skip style/click directives
      if (/^\s*(style|click)\s/.test(line) && !/-->|---|==>/.test(line)) continue;

      // Only add if we haven't seen this node ID yet (first definition wins)
      if (!nodes.has(nodeId)) {
        const label = match[2] ?? '';
        const startCol = match.index + line.substring(match.index).indexOf(nodeId);
        nodes.set(nodeId, {
          nodeId,
          line: lineNum,
          startCol,
          endCol: startCol + nodeId.length,
          label,
          shapeType,
          lineText: line
        });

        if (!lineToNodeId.has(lineNum)) {
          lineToNodeId.set(lineNum, nodeId);
        }
      }
    }
  }
}

function findEdgeNodeRefs(
  line: string,
  lineNum: number,
  lineToNodeId: Map<number, string>
) {
  // Only process lines that contain edge operators
  if (!/-->|---|\-\.\.|-\.->|==>|=>|--/.test(line)) return;

  // Skip style/click lines
  if (/^\s*(style|click)\s/.test(line)) return;

  // Find all standalone word tokens that could be node IDs
  const tokens = line.match(/\b([A-Za-z_]\w*)\b/g) || [];
  for (const token of tokens) {
    if (!KEYWORDS.has(token)) {
      lineToNodeId.set(lineNum, token);
      return; // Map to the first non-keyword token on the line
    }
  }
}
