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
  return lines
    .filter(
      (line) =>
        !isNodeDefinitionLine(line, nodeId) &&
        !isNodeOnlyEdgeLine(line, nodeId) &&
        !isNodeStyleLine(line, nodeId) &&
        !isNodeClickLine(line, nodeId)
    )
    .join('\n');
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
