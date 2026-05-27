import { parseSource } from './mermaidSourceParser';

export function renameNode(code: string, nodeId: string, newName: string): string {
  const lines = code.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    result.push(replaceNodeIdInLine(line, nodeId, newName));
  }

  return result.join('\n');
}

function replaceNodeIdInLine(line: string, nodeId: string, newName: string): string {
  const bracketRanges = getBracketContentRanges(line);
  let result = '';
  let lastIdx = 0;
  const re = new RegExp(escapeRegex(nodeId), 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    const start = match.index;
    const end = start + nodeId.length;

    // Skip if inside bracket content (label text)
    if (isInsideBracketContent(start, bracketRanges)) {
      continue;
    }

    // Check it's a standalone token (not part of a longer word)
    const before = start > 0 ? line[start - 1] : ' ';
    const after = end < line.length ? line[end] : ' ';
    if (/\w/.test(before) || /\w/.test(after)) {
      continue;
    }

    result += line.slice(lastIdx, start) + newName;
    lastIdx = end;
  }

  result += line.slice(lastIdx);
  return result;
}

export function renameNodeLabel(code: string, nodeId: string, newLabel: string): string {
  const parsed = parseSource(code);
  const nodeDef = parsed.nodes.get(nodeId);
  if (!nodeDef) return code;

  const lines = code.split('\n');
  const lineIdx = nodeDef.line - 1;
  const line = lines[lineIdx];

  // Find the shape pattern for this nodeId and replace its label
  const shapePatterns: [RegExp, string][] = [
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\(\\()\\s*[^)]*?(\\s*\\)\\))`, ''), 'double-circle'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\(\\[)\\s*[^\\]]*?(\\s*\\]\\))`, ''), 'stadium'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\[\\[)\\s*[^\\]]*?(\\s*\\]\\])`, ''), 'subroutine'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\[\\()\\s*[^)]*?(\\s*\\)\\])`, ''), 'cylinder'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\{\\{)\\s*[^}]*?(\\s*\\}\\})`, ''), 'hexagon'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*>\\s*\\[)\\s*[^\\]]*?(\\s*\\])`, ''), 'asymmetric'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\()\\s*[^)]*?(\\s*\\))`, ''), 'rounded'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\{)\\s*[^}]*?(\\s*\\})`, ''), 'diamond'],
    [new RegExp(`(\\b${escapeRegex(nodeId)}\\s*\\[)\\s*[^\\]]*?(\\s*\\])`, ''), 'rect']
  ];

  for (const [regex] of shapePatterns) {
    const match = regex.exec(line);
    if (match) {
      // Replace the label content between the opening and closing brackets
      const newLine = line.replace(regex, `$1${newLabel}$2`);
      lines[lineIdx] = newLine;
      return lines.join('\n');
    }
  }

  return code;
}

export function changeNodeColor(code: string, nodeId: string, color: string): string {
  const styleLineRegex = new RegExp(`^\\s*style\\s+${escapeRegex(nodeId)}\\s+fill:`);
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (styleLineRegex.test(lines[i])) {
      lines[i] = lines[i].replace(/fill:[^,;\s]+/, `fill:${color}`);
      if (!/stroke:/.test(lines[i])) {
        lines[i] = lines[i].replace(/\s*$/, `,stroke:${color}`);
      }
      return lines.join('\n');
    }
  }

  return code + `\nstyle ${nodeId} fill:${color},stroke:${color}`;
}

export function deleteNode(code: string, nodeId: string): string {
  const lines = code.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    // Remove style and click lines for this node entirely
    if (isNodeStyleLine(line, nodeId) || isNodeClickLine(line, nodeId)) {
      continue;
    }

    // Check if this line is a definition line for the node
    const parsed = parseSource(line);
    const hasThisNode = parsed.nodes.has(nodeId);
    const nodeCount = parsed.nodes.size;

    if (hasThisNode && nodeCount === 1) {
      // This line only defines the deleted node — check if it has edges
      if (isPureEdgeLine(line, nodeId)) {
        // Line is just edges involving this node, remove entirely
        continue;
      }
      // Line has the node definition but also other content (shouldn't happen for single-node def lines typically)
      // but to be safe, remove it
      continue;
    }

    if (hasThisNode && nodeCount > 1) {
      // Line has multiple node definitions — surgically remove just this node
      const editedLine = removeNodeFromMultiNodeLine(line, nodeId);
      if (editedLine) {
        result.push(editedLine);
      }
      continue;
    }

    // Line doesn't contain the node definition, but may reference it in edges
    if (isNodeOnlyEdgeLine(line, nodeId)) {
      // Edge-only line referencing this node — remove
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

function removeNodeFromMultiNodeLine(line: string, nodeId: string): string {
  // For "A[Start] --> B[Middle] --> C[End]", removing B → "A[Start] --> C[End]"
  // Strategy: split by edge operators, identify segments containing the deleted node,
  // then remove those segments and one adjacent edge operator.

  const edgeOpRegex = /(\s*(?:-->|---|\-\.\.|-\.->|==>|=>|--)\s*)/g;
  const parts = line.split(edgeOpRegex);

  // parts alternates: [nodeDef, edgeOp, nodeDef, edgeOp, nodeDef, ...]
  // Mark which node segments contain the deleted node
  const segments: { text: string; isTarget: boolean }[] = [];
  const edgeOps: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const segment = parts[i].trim();
      const parsed = parseSource(segment);
      segments.push({ text: parts[i], isTarget: parsed.nodes.has(nodeId) });
    } else {
      edgeOps.push(parts[i]);
    }
  }

  // Remove target segments and one edge operator per removed segment
  const kept: string[] = [];
  let edgeOpIdx = 0;

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].isTarget) {
      // Skip this node segment; also skip one adjacent edge operator
      // Prefer to skip the edge op before this node, unless it's the first node
      if (i === 0 && edgeOps.length > 0) {
        edgeOpIdx++; // skip the edge op after the first node
      }
      // Otherwise the edge op before will be skipped by not advancing edgeOpIdx
      continue;
    }
    kept.push(segments[i].text);
    if (edgeOpIdx < edgeOps.length) {
      kept.push(edgeOps[edgeOpIdx]);
      edgeOpIdx++;
    }
  }

  let result = kept.join('').trim();
  if (!result) return '';

  // If line starts with an edge operator (first node was removed), drop it
  result = result.replace(/^\s*(?:-->|---|\-\.\.|-\.->|==>|=>|--)\s*/, '');

  return result;
}

function isPureEdgeLine(line: string, nodeId: string): boolean {
  const trimmed = line.trim();
  const hasEdgeOp = /-->|---|\-\.\.|-\.->|==>|=>|--/.test(trimmed);
  return hasEdgeOp && isNodeOnlyEdgeLine(line, nodeId);
}

function getBracketContentRanges(line: string): [number, number][] {
  const ranges: [number, number][] = [];
  const bracketPairs: [string, string][] = [
    ['[', ']'],
    ['(', ')'],
    ['{', '}']
  ];

  for (const [open, close] of bracketPairs) {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === open) {
        if (depth === 0) start = i;
        depth++;
      } else if (line[i] === close) {
        depth--;
        if (depth === 0 && start >= 0) {
          ranges.push([start, i + 1]);
          start = -1;
        }
      }
    }
  }

  return ranges.sort((a, b) => a[0] - b[0]);
}

function isInsideBracketContent(pos: number, ranges: [number, number][]): boolean {
  for (const [start, end] of ranges) {
    if (pos > start && pos < end) return true;
  }
  return false;
}

function isNodeDefinitionLine(line: string, nodeId: string): boolean {
  const parsed = parseSource(line);
  return parsed.nodes.has(nodeId);
}

function isNodeOnlyEdgeLine(line: string, nodeId: string): boolean {
  const trimmed = line.trim();
  if (/^\s*(subgraph|end|classDef|direction|linkStyle|class)\s/.test(trimmed)) {
    return false;
  }
  const hasEdgeOp = /-->|---|\-\.\.|-\.->|==>|=>|--/.test(trimmed);
  if (!hasEdgeOp) return false;

  const refs = trimmed.match(/[A-Za-z_]\w*/g) || [];
  const nodeIds = refs.filter(
    (id) =>
      ![
        'flowchart',
        'graph',
        'TD',
        'LR',
        'RL',
        'BT',
        'TB',
        'subgraph',
        'end',
        'classDef',
        'style',
        'click',
        'direction'
      ].includes(id)
  );
  return nodeIds.includes(nodeId);
}

function isNodeStyleLine(line: string, nodeId: string): boolean {
  const re = new RegExp(`^\\s*style\\s+${escapeRegex(nodeId)}\\s`);
  return re.test(line);
}

function isNodeClickLine(line: string, nodeId: string): boolean {
  const re = new RegExp(`^\\s*click\\s+${escapeRegex(nodeId)}\\s`);
  return re.test(line);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
