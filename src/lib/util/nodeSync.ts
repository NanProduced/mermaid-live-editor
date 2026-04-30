import { standardizeDiagramType } from './mermaid';

export interface NodeMapping {
  lineNumber: number;
  nodeName: string;
  svgSelector: string;
  diagramType: string;
}

export interface ParseResult {
  success: boolean;
  mappings: NodeMapping[];
  error?: string;
  diagramType?: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSvgSelector(nodeName: string, diagramType: string): string {
  const escapedName = escapeRegExp(nodeName);
  switch (diagramType) {
    case 'flowchart':
      return `[id*="${escapedName}"]`;
    case 'classDiagram':
      return `[class*="${escapedName}"]`;
    case 'sequenceDiagram':
      return `[id*="${escapedName}"]`;
    case 'stateDiagram':
    case 'stateDiagram-v2':
      return `[id*="${escapedName}"]`;
    case 'erDiagram':
      return `[id*="${escapedName}"]`;
    default:
      return `[id*="${escapedName}"]`;
  }
}

function isValidNodeName(name: string): boolean {
  return /^[A-Za-z][\w-]*$/.test(name);
}

function extractFlowchartNodes(line: string, lineNumber: number, mappings: NodeMapping[], existingNames: Set<string>): void {
  const nodePattern = /[A-Za-z][\w-]*/g;
  const arrowPattern = /(-->|---|==>|-\.->|-\.\->)/;
  const shapePattern = /(\[.*?\]|\(.*?\)|\{.*?\}|>.*?\]|\/\/.*?\/\/\|>\(.*?\)|\[\[.*?\]\]|\(\(.*?\)\)|{\/.*?\/})/g;

  const shapeMatches: { start: number; end: number }[] = [];
  let shapeMatch;
  while ((shapeMatch = shapePattern.exec(line)) !== null) {
    shapeMatches.push({ start: shapeMatch.index, end: shapeMatch.index + shapeMatch[0].length });
  }

  const arrowMatch = arrowPattern.exec(line);
  const arrowIndex = arrowMatch ? arrowMatch.index : -1;

  let match;
  while ((match = nodePattern.exec(line)) !== null) {
    const nodeName = match[0];
    const nodeStart = match.index;
    const nodeEnd = nodeStart + nodeName.length;

    if (!isValidNodeName(nodeName)) {
      continue;
    }

    if (existingNames.has(nodeName)) {
      continue;
    }

    const inShape = shapeMatches.some((s) => nodeStart >= s.start && nodeEnd <= s.end);
    if (inShape) {
      continue;
    }

    const followedByShape = shapeMatches.some((s) => s.start > nodeEnd && s.start - nodeEnd <= 3);
    const beforeArrow = arrowIndex === -1 || nodeEnd <= arrowIndex;
    const afterArrowWithShape = arrowIndex !== -1 && nodeStart > arrowIndex && followedByShape;
    const standaloneAfterArrow = arrowIndex !== -1 && nodeStart > arrowIndex;

    if (followedByShape || beforeArrow || afterArrowWithShape || standaloneAfterArrow) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'flowchart'),
        diagramType: 'flowchart'
      });
      existingNames.add(nodeName);
    }
  }
}

function extractClassDiagramNodes(line: string, lineNumber: number, mappings: NodeMapping[], existingNames: Set<string>): void {
  const classDefinitionPattern = /^(\s*)class\s+([A-Za-z][\w-]*)/;
  const relationPattern = /([A-Za-z][\w-]*)\s*(--|--\*|--o|--\||\.\.|\.\.\*|\.\.o|\.\.\|)/g;
  const memberPattern = /^(\s*)([A-Za-z][\w-]*)\s*:/;

  let match = classDefinitionPattern.exec(line);
  if (match && !existingNames.has(match[2])) {
    mappings.push({
      lineNumber,
      nodeName: match[2],
      svgSelector: getSvgSelector(match[2], 'classDiagram'),
      diagramType: 'classDiagram'
    });
    existingNames.add(match[2]);
  }

  while ((match = relationPattern.exec(line)) !== null) {
    const nodeName = match[1];
    if (nodeName && !existingNames.has(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'classDiagram'),
        diagramType: 'classDiagram'
      });
      existingNames.add(nodeName);
    }
  }

  match = memberPattern.exec(line);
  if (match && !existingNames.has(match[2])) {
    mappings.push({
      lineNumber,
      nodeName: match[2],
      svgSelector: getSvgSelector(match[2], 'classDiagram'),
      diagramType: 'classDiagram'
    });
    existingNames.add(match[2]);
  }
}

function extractSequenceDiagramNodes(line: string, lineNumber: number, mappings: NodeMapping[], existingNames: Set<string>): void {
  const participantPattern = /^(\s*)(participant|actor)\s+([A-Za-z][\w-]*)/;
  const messagePattern = /([A-Za-z][\w-]*)\s*(-+>|->>|-->|-->>|x>|x>>|\\|o\\|)/g;

  let match = participantPattern.exec(line);
  if (match && !existingNames.has(match[3])) {
    mappings.push({
      lineNumber,
      nodeName: match[3],
      svgSelector: getSvgSelector(match[3], 'sequenceDiagram'),
      diagramType: 'sequenceDiagram'
    });
    existingNames.add(match[3]);
  }

  while ((match = messagePattern.exec(line)) !== null) {
    const nodeName = match[1];
    if (nodeName && !existingNames.has(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'sequenceDiagram'),
        diagramType: 'sequenceDiagram'
      });
      existingNames.add(nodeName);
    }
  }
}

function extractStateDiagramNodes(line: string, lineNumber: number, mappings: NodeMapping[], existingNames: Set<string>): void {
  const stateDefinitionPattern = /^(\s*)state\s+"?([A-Za-z][\w-]*)"?/;
  const transitionPattern = /([A-Za-z][\w-]*)\s*-->/g;
  const startTransitionPattern = /^(\s*)\[\*\]\s*-->\s*([A-Za-z][\w-]*)/;
  const endTransitionPattern = /^(\s*)([A-Za-z][\w-]*)\s*-->\s*\[\*\]/;

  let match = stateDefinitionPattern.exec(line);
  if (match && !existingNames.has(match[2])) {
    mappings.push({
      lineNumber,
      nodeName: match[2],
      svgSelector: getSvgSelector(match[2], 'stateDiagram'),
      diagramType: 'stateDiagram'
    });
    existingNames.add(match[2]);
  }

  while ((match = transitionPattern.exec(line)) !== null) {
    const nodeName = match[1];
    if (nodeName && !existingNames.has(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'stateDiagram'),
        diagramType: 'stateDiagram'
      });
      existingNames.add(nodeName);
    }
  }

  match = startTransitionPattern.exec(line);
  if (match && !existingNames.has(match[2])) {
    mappings.push({
      lineNumber,
      nodeName: match[2],
      svgSelector: getSvgSelector(match[2], 'stateDiagram'),
      diagramType: 'stateDiagram'
    });
    existingNames.add(match[2]);
  }

  match = endTransitionPattern.exec(line);
  if (match && !existingNames.has(match[2])) {
    mappings.push({
      lineNumber,
      nodeName: match[2],
      svgSelector: getSvgSelector(match[2], 'stateDiagram'),
      diagramType: 'stateDiagram'
    });
    existingNames.add(match[2]);
  }
}

function extractErDiagramNodes(line: string, lineNumber: number, mappings: NodeMapping[], existingNames: Set<string>): void {
  const entityRelationPattern = /^(\s*)([A-Za-z][\w-]*)\s*([}|][o|]?|--|\.\.)[o|]?[{|]?\s*([A-Za-z][\w-]*)/;
  const entityDefinitionPattern = /^(\s*)([A-Za-z][\w-]*)\s*\{/;

  let match = entityRelationPattern.exec(line);
  if (match) {
    const entity1 = match[2];
    const entity2 = match[4];

    if (entity1 && !existingNames.has(entity1)) {
      mappings.push({
        lineNumber,
        nodeName: entity1,
        svgSelector: getSvgSelector(entity1, 'erDiagram'),
        diagramType: 'erDiagram'
      });
      existingNames.add(entity1);
    }

    if (entity2 && !existingNames.has(entity2)) {
      mappings.push({
        lineNumber,
        nodeName: entity2,
        svgSelector: getSvgSelector(entity2, 'erDiagram'),
        diagramType: 'erDiagram'
      });
      existingNames.add(entity2);
    }
  }

  match = entityDefinitionPattern.exec(line);
  if (match && !existingNames.has(match[2])) {
    mappings.push({
      lineNumber,
      nodeName: match[2],
      svgSelector: getSvgSelector(match[2], 'erDiagram'),
      diagramType: 'erDiagram'
    });
    existingNames.add(match[2]);
  }
}

function extractNodesFromLine(
  line: string,
  lineNumber: number,
  diagramType: string,
  mappings: NodeMapping[],
  existingNames: Set<string>
): void {
  switch (diagramType) {
    case 'flowchart':
      extractFlowchartNodes(line, lineNumber, mappings, existingNames);
      break;
    case 'classDiagram':
      extractClassDiagramNodes(line, lineNumber, mappings, existingNames);
      break;
    case 'sequenceDiagram':
      extractSequenceDiagramNodes(line, lineNumber, mappings, existingNames);
      break;
    case 'stateDiagram':
    case 'stateDiagram-v2':
      extractStateDiagramNodes(line, lineNumber, mappings, existingNames);
      break;
    case 'erDiagram':
      extractErDiagramNodes(line, lineNumber, mappings, existingNames);
      break;
  }
}

function detectDiagramType(code: string): string | null {
  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) {
      return 'flowchart';
    }
    if (trimmed.startsWith('classDiagram')) {
      return 'classDiagram';
    }
    if (trimmed.startsWith('sequenceDiagram')) {
      return 'sequenceDiagram';
    }
    if (trimmed.startsWith('stateDiagram')) {
      return 'stateDiagram';
    }
    if (trimmed.startsWith('erDiagram')) {
      return 'erDiagram';
    }
    if (trimmed.startsWith('C4')) {
      return 'c4Diagram';
    }
    if (trimmed.startsWith('gantt')) {
      return 'gantt';
    }
    if (trimmed.startsWith('gitGraph')) {
      return 'gitGraph';
    }
    if (trimmed.startsWith('pie')) {
      return 'pie';
    }
    if (trimmed.startsWith('requirement')) {
      return 'requirementDiagram';
    }
    if (trimmed.startsWith('sankey')) {
      return 'sankey';
    }
    if (trimmed.startsWith('journey')) {
      return 'journey';
    }
  }
  return null;
}

const supportedDiagramTypes = [
  'flowchart',
  'classDiagram',
  'sequenceDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram'
];

export function parseNodes(code: string): ParseResult {
  const mappings: NodeMapping[] = [];
  const existingNames = new Set<string>();
  const detectedType = detectDiagramType(code);

  if (!detectedType) {
    return {
      success: false,
      mappings: [],
      error: '无法识别图表类型，请确保使用标准的mermaid语法'
    };
  }

  const standardizedType = standardizeDiagramType(detectedType);

  if (!supportedDiagramTypes.includes(standardizedType)) {
    return {
      success: false,
      mappings: [],
      error: `不支持的图表类型: ${standardizedType}。当前仅支持: ${supportedDiagramTypes.join(', ')}`,
      diagramType: standardizedType
    };
  }

  const lines = code.split('\n');
  const commentRegex = /^\s*%%/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (commentRegex.test(line)) {
      continue;
    }
    extractNodesFromLine(line, i + 1, standardizedType, mappings, existingNames);
  }

  return {
    success: true,
    mappings,
    diagramType: standardizedType
  };
}

export function findNodeByPosition(
  mappings: NodeMapping[],
  lineNumber: number,
  column: number,
  code: string
): NodeMapping | null {
  const lines = code.split('\n');
  if (lineNumber < 1 || lineNumber > lines.length) {
    return null;
  }

  const line = lines[lineNumber - 1];
  const wordPattern = /[A-Za-z][\w-]*/g;
  let match;

  while ((match = wordPattern.exec(line)) !== null) {
    const startColumn = match.index + 1;
    const endColumn = startColumn + match[0].length - 1;

    if (column >= startColumn && column <= endColumn) {
      const word = match[0];
      const nodeMapping = mappings.find((m) => m.nodeName === word);
      if (nodeMapping) {
        return nodeMapping;
      }
    }
  }

  return null;
}

export function findNodeBySvgId(mappings: NodeMapping[], svgId: string): NodeMapping | null {
  for (const mapping of mappings) {
    if (svgId.includes(mapping.nodeName)) {
      return mapping;
    }
    if (mapping.svgSelector.includes('*="') && svgId.includes(mapping.nodeName)) {
      return mapping;
    }
  }
  return null;
}
