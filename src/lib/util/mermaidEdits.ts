import type { NodeMapping } from './mermaidParser';
import { getEdgeLinesForNode, getStyleLinesForNode } from './mermaidParser';

export function renameNodeLabel(code: string, mapping: NodeMapping, newLabel: string): string {
  const lines = code.split('\n');
  const lineIdx = mapping.lineNumber - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return code;

  const line = lines[lineIdx];
  const labelStart = mapping.labelStart - 1;
  const labelEnd = mapping.labelEnd - 1;

  lines[lineIdx] = line.slice(0, labelStart) + newLabel + line.slice(labelEnd);
  return lines.join('\n');
}

export function changeNodeColor(
  code: string,
  nodeId: string,
  fillColor: string
): string {
  const existingStyleLines = getStyleLinesForNode(code, nodeId);
  const styleStatement = `    style ${nodeId} fill:${fillColor},color:#fff,stroke:${fillColor}`;

  const lines = code.split('\n');

  if (existingStyleLines.length > 0) {
    const lineIdx = existingStyleLines[0] - 1;
    lines[lineIdx] = styleStatement;
  } else {
    lines.push(styleStatement);
  }

  return lines.join('\n');
}

export function deleteNode(code: string, nodeId: string, mappings: NodeMapping[]): string {
  const edgeLines = new Set(getEdgeLinesForNode(code, nodeId));
  const styleLines = new Set(getStyleLinesForNode(code, nodeId));
  const defMapping = mappings.find((m) => m.nodeId === nodeId);
  const defLine = defMapping ? defMapping.lineNumber : -1;

  const linesToRemove = new Set<number>();

  if (defLine > 0) linesToRemove.add(defLine);
  for (const l of edgeLines) linesToRemove.add(l);
  for (const l of styleLines) linesToRemove.add(l);

  const lines = code.split('\n');
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (linesToRemove.has(i + 1)) continue;
    result.push(lines[i]);
  }

  return result.join('\n');
}
