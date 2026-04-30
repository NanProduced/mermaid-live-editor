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
      return `g.node.${escapedName}`;
    case 'classDiagram':
      return `g.node.${escapedName}`;
    case 'sequenceDiagram':
      return `g.actor.${escapedName}, g.participant.${escapedName}`;
    case 'stateDiagram':
    case 'stateDiagram-v2':
      return `g.state.${escapedName}`;
    case 'erDiagram':
      return `g.entity.${escapedName}`;
    default:
      return `[class*="${escapedName}"]`;
  }
}

function isValidNodeName(name: string): boolean {
  return /^[A-Za-z][\w-]*$/.test(name);
}

const reservedKeywords = new Set([
  'flowchart', 'graph', 'classDiagram', 'sequenceDiagram',
  'stateDiagram', 'stateDiagram-v2', 'erDiagram',
  'TD', 'LR', 'TB', 'BT', 'RL',
  'participant', 'actor', 'class', 'state',
  'title', 'direction',
  'String', 'int', 'float', 'boolean', 'void', 'double', 'long', 'short', 'char', 'byte',
  'string', 'date', 'datetime', 'time', 'timestamp', 'number', 'bool'
]);

function isReservedKeyword(word: string): boolean {
  return reservedKeywords.has(word);
}

function extractFlowchartNodes(line: string, lineNumber: number, mappings: NodeMapping[], existingNames: Set<string>): void {
  const nodeBeforeShapePattern = /([A-Za-z][\w-]*)\s*(\[|\(|\{|>|\/\/|\[\[|\(\(|\{\/)/g;
  const nodeBeforeArrowPattern = /([A-Za-z][\w-]*)\s*(-->|---|==>|-\.->|-\.\->)/g;
  const nodeAfterArrowPattern = /(-->|---|==>|-\.->|-\.\->)\s*([A-Za-z][\w-]*)/g;

  let match;

  while ((match = nodeBeforeShapePattern.exec(line)) !== null) {
    const nodeName = match[1];
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'flowchart'),
        diagramType: 'flowchart'
      });
      existingNames.add(nodeName);
    }
  }

  while ((match = nodeBeforeArrowPattern.exec(line)) !== null) {
    const nodeName = match[1];
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'flowchart'),
        diagramType: 'flowchart'
      });
      existingNames.add(nodeName);
    }
  }

  while ((match = nodeAfterArrowPattern.exec(line)) !== null) {
    const nodeName = match[2];
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
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
  const relationRightPattern = /(--|--\*|--o|--\||\.\.|\.\.\*|\.\.o|\.\.\|)\s*([A-Za-z][\w-]*)/g;
  const classMemberStartPattern = /^(\s*)([A-Za-z][\w-]*)\s*\{/;

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

  match = classMemberStartPattern.exec(line);
  if (match && !existingNames.has(match[2]) && !isReservedKeyword(match[2])) {
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
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'classDiagram'),
        diagramType: 'classDiagram'
      });
      existingNames.add(nodeName);
    }
  }

  while ((match = relationRightPattern.exec(line)) !== null) {
    const nodeName = match[2];
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'classDiagram'),
        diagramType: 'classDiagram'
      });
      existingNames.add(nodeName);
    }
  }
}

function extractSequenceDiagramNodes(line: string, lineNumber: number, mappings: NodeMapping[], existingNames: Set<string>): void {
  const participantPattern = /^(\s*)(participant|actor)\s+([A-Za-z][\w-]*)/;
  const messagePattern = /([A-Za-z][\w-]*)\s*(-+>|->>|-->|-->>|x>|x>>|\\|o\\|)/g;
  const messageRightPattern = /(-+>|->>|-->|-->>|x>|x>>|\\|o\\|)\s*([A-Za-z][\w-]*)/g;

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
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'sequenceDiagram'),
        diagramType: 'sequenceDiagram'
      });
      existingNames.add(nodeName);
    }
  }

  while ((match = messageRightPattern.exec(line)) !== null) {
    const nodeName = match[2];
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
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
  const transitionRightPattern = /-->\s*([A-Za-z][\w-]*)/g;
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
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
      mappings.push({
        lineNumber,
        nodeName,
        svgSelector: getSvgSelector(nodeName, 'stateDiagram'),
        diagramType: 'stateDiagram'
      });
      existingNames.add(nodeName);
    }
  }

  while ((match = transitionRightPattern.exec(line)) !== null) {
    const nodeName = match[1];
    if (nodeName && !existingNames.has(nodeName) && !isReservedKeyword(nodeName)) {
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
  const entityDefinitionPattern = /^(\s*)([A-Za-z][\w-]*)\s*\{/;

  if (line.includes('--') || line.includes('..')) {
    const wordPattern = /[A-Za-z][\w-]*/g;
    const words: { word: string; index: number }[] = [];
    let match;

    while ((match = wordPattern.exec(line)) !== null) {
      words.push({ word: match[0], index: match.index });
    }

    for (const { word } of words) {
      if (!isValidNodeName(word)) {
        continue;
      }
      if (existingNames.has(word)) {
        continue;
      }
      if (isReservedKeyword(word)) {
        continue;
      }

      mappings.push({
        lineNumber,
        nodeName: word,
        svgSelector: getSvgSelector(word, 'erDiagram'),
        diagramType: 'erDiagram'
      });
      existingNames.add(word);
    }
  }

  let match = entityDefinitionPattern.exec(line);
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

function elementHasClass(element: HTMLElement | SVGElement | null, className: string): boolean {
  if (!element) return false;
  return element.classList.contains(className);
}

function elementHasNodeNameClass(element: HTMLElement | SVGElement | null, nodeName: string): boolean {
  if (!element) return false;
  return element.classList.contains(nodeName);
}

export function findNodeBySvgId(mappings: NodeMapping[], svgId: string, element: HTMLElement | SVGElement | null = null): NodeMapping | null {
  let bestMatch: NodeMapping | null = null;
  let longestMatchLength = 0;

  for (const mapping of mappings) {
    let isMatch = false;

    if (mapping.diagramType === 'flowchart') {
      if (elementHasClass(element, 'node') && elementHasNodeNameClass(element, mapping.nodeName)) {
        isMatch = true;
      }
    } else if (mapping.diagramType === 'sequenceDiagram') {
      if ((elementHasClass(element, 'actor') || elementHasClass(element, 'participant')) && 
          elementHasNodeNameClass(element, mapping.nodeName)) {
        isMatch = true;
      }
    } else if (mapping.diagramType === 'classDiagram') {
      if (elementHasClass(element, 'node') && elementHasNodeNameClass(element, mapping.nodeName)) {
        isMatch = true;
      }
    } else if (mapping.diagramType === 'erDiagram') {
      if (elementHasClass(element, 'entity') && elementHasNodeNameClass(element, mapping.nodeName)) {
        isMatch = true;
      }
    } else if (mapping.diagramType === 'stateDiagram' || mapping.diagramType === 'stateDiagram-v2') {
      if (elementHasClass(element, 'state') && elementHasNodeNameClass(element, mapping.nodeName)) {
        isMatch = true;
      }
    } else {
      if (elementHasNodeNameClass(element, mapping.nodeName)) {
        isMatch = true;
      }
    }

    if (isMatch && mapping.nodeName.length > longestMatchLength) {
      bestMatch = mapping;
      longestMatchLength = mapping.nodeName.length;
    }
  }

  return bestMatch;
}
