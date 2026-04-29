import type {
  DocState,
  ErrorHash,
  MarkerData,
  State,
  ValidatedDocState,
  ValidatedState,
  WorkspaceState
} from '$/types';
import { debounce, get as lodashGet } from 'lodash-es';
import type { MermaidConfig } from 'mermaid';
import { derived, get, writable, type Readable } from 'svelte/store';
import { v4 as uuidV4 } from 'uuid';
import { env } from './env';
import {
  extractErrorLineText,
  findMostRelevantLineNumber,
  replaceLineNumberInErrorMessage
} from './errorHandling';
import { defaultMermaidConfig, parse } from './mermaid';
import { localStorage, persist } from './persist';
import { deserializeState, pakoSerde, serializeState, serializeWorkspace } from './serde';
import { errorDebug, formatJSON, getUTMSource, MCBaseURL } from './util';

const generateDocId = (): string => `doc_${uuidV4()}`;

export const defaultState: State = {
  code: `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[fa:fa-car Car]
  `,
  grid: true,
  mermaid: formatJSON({
    theme: 'default'
  }),
  panZoom: true,
  rough: false,
  updateDiagram: true
};

export const createDefaultDocState = (name = 'Untitled'): DocState => ({
  ...defaultState,
  id: generateDocId(),
  name
});

const urlParseFailedState = `flowchart TD
    A[Loading URL failed. We can try to figure out why.] -->|Decode JSON| B(Please check the console to see the JSON and error details.)
    B --> C{Is the JSON correct?}
    C -->|Yes| D(Please Click here to Raise an issue in github.<br/>Including the broken link in the issue <br/> will speed up the fix.)
    C -->|No| E{Did someone <br/>send you this link?}
    E -->|Yes| F[Ask them to send <br/>you the complete link]
    E -->|No| G{Did you copy <br/> the complete URL?}
    G --> |Yes| D
    G --> |"No :("| H(Try using the Timeline tab in History <br/>from same browser you used to create the diagram.)
    click D href "https://github.com/mermaid-js/mermaid-live-editor/issues/new?assignees=&labels=bug&template=bug_report.md&title=Broken%20link" "Raise issue"`;

const createInitialWorkspaceState = (): WorkspaceState => {
  const defaultDoc = createDefaultDocState('Diagram 1');
  return {
    docs: { [defaultDoc.id]: defaultDoc },
    activeDocId: defaultDoc.id
  };
};

interface WorkspaceInputState {
  docs: Record<string, DocState>;
  activeDocId: string;
}

const isValidWorkspaceState = (data: unknown): data is WorkspaceInputState => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.activeDocId === 'string' &&
    (obj.docs !== null && obj.docs !== undefined)
  );
};

const isValidDocState = (data: unknown): data is DocState => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.code === 'string' && typeof obj.mermaid === 'string';
};

const convertMapToRecord = (map: Map<string, DocState>): Record<string, DocState> => {
  const record: Record<string, DocState> = {};
  for (const [key, value] of map.entries()) {
    record[key] = value;
  }
  return record;
};

const migrateWorkspaceData = (data: unknown): WorkspaceInputState => {
  if (!data) {
    return createInitialWorkspaceState();
  }

  if (isValidWorkspaceState(data)) {
    if (data.docs instanceof Map) {
      return {
        ...data,
        docs: convertMapToRecord(data.docs)
      };
    }
    if (typeof data.docs === 'object' && data.docs !== null) {
      return data;
    }
  }

  if (isValidDocState(data)) {
    const docWithId: DocState = {
      ...data,
      id: data.id || generateDocId(),
      name: (data as DocState).name || 'Diagram 1'
    };
    return {
      docs: { [docWithId.id]: docWithId },
      activeDocId: docWithId.id
    };
  }

  return createInitialWorkspaceState();
};

const createMigratedLocalStorage = () => {
  const baseStorage = localStorage();
  return {
    getValue(key: string): WorkspaceInputState | null {
      const rawValue = baseStorage.getValue(key as string);
      if (rawValue === null) {
        return null;
      }
      return migrateWorkspaceData(rawValue);
    },
    setValue(key: string, value: WorkspaceInputState): void {
      baseStorage.setValue(key as string, value);
    },
    deleteValue(key: string): void {
      baseStorage.deleteValue(key as string);
    }
  };
};

export const workspaceInputStore = persist(
  writable<WorkspaceInputState>(createInitialWorkspaceState()),
  createMigratedLocalStorage(),
  'workspaceStore'
);

let lastDiagramType = '';

const processState = async (state: State) => {
  const processed: ValidatedState = {
    ...state,
    editorMode: state.editorMode ?? 'code',
    error: undefined,
    errorMarkers: [],
    serialized: ''
  };
  try {
    processed.serialized = serializeState(state);
    const { diagramType } = await parse(state.code);
    processed.diagramType = diagramType;
    if (lastDiagramType === 'zenuml' && diagramType !== lastDiagramType) {
      setTimeout(() => window.location.reload(), 500);
    }
    lastDiagramType = diagramType;
    JSON.parse(state.mermaid);
  } catch (error) {
    processed.error = error as Error;
    errorDebug();
    console.error(error);
    if (error && typeof error === 'object' && 'hash' in error) {
      try {
        let errorString = processed.error.toString();
        const errorLineText = extractErrorLineText(errorString);
        const realLineNumber = findMostRelevantLineNumber(errorLineText, state.code);

        let first_line: number, last_line: number, first_column: number, last_column: number;
        try {
          ({ first_line, last_line, first_column, last_column } = (error.hash as ErrorHash).loc);
        } catch {
          const lineNo = findMostRelevantLineNumber(errorString, state.code);
          first_line = lineNo;
          last_line = lineNo + 1;
          first_column = 0;
          last_column = 0;
        }

        if (realLineNumber !== -1) {
          errorString = replaceLineNumberInErrorMessage(errorString, realLineNumber);
        }

        processed.error = new Error(errorString);
        const marker: MarkerData = {
          endColumn: last_column + (first_column === last_column ? 0 : 5),
          endLineNumber: last_line + (realLineNumber - first_line),
          message: errorString || 'Syntax error',
          severity: 8,
          startColumn: first_column,
          startLineNumber: realLineNumber
        };
        processed.errorMarkers = [marker];
      } catch (error) {
        console.error('Error without line helper', error);
      }
    }
  }
  return processed;
};

const processDocState = async (doc: DocState): Promise<ValidatedDocState> => {
  const validated = await processState(doc);
  return {
    ...validated,
    id: doc.id,
    name: doc.name
  };
};

interface ValidatedWorkspaceState {
  docs: Record<string, ValidatedDocState>;
  activeDocId: string;
  activeDoc: ValidatedDocState;
}

const createDefaultValidatedWorkspaceState = (): ValidatedWorkspaceState => {
  const defaultDoc = createDefaultDocState('Diagram 1');
  const defaultValidatedDoc: ValidatedDocState = {
    ...defaultDoc,
    editorMode: 'code',
    errorMarkers: [],
    serialized: serializeState(defaultDoc)
  };
  return {
    docs: { [defaultDoc.id]: defaultValidatedDoc },
    activeDocId: defaultDoc.id,
    activeDoc: defaultValidatedDoc
  };
};

export const workspaceStore: Readable<ValidatedWorkspaceState> = derived(
  [workspaceInputStore],
  async ([workspace], set) => {
    if (!workspace || !workspace.docs || !workspace.activeDocId) {
      set(createDefaultValidatedWorkspaceState());
      return;
    }

    const validatedDocs: Record<string, ValidatedDocState> = {};
    let activeDoc: ValidatedDocState | undefined;

    for (const [id, doc] of Object.entries(workspace.docs)) {
      if (!doc) continue;
      const validated = await processDocState(doc);
      validatedDocs[id] = validated;
      if (id === workspace.activeDocId) {
        activeDoc = validated;
      }
    }

    const docIds = Object.keys(validatedDocs);
    if (!activeDoc && docIds.length > 0) {
      activeDoc = validatedDocs[docIds[0]];
    }

    if (activeDoc) {
      set({
        docs: validatedDocs,
        activeDocId: activeDoc.id,
        activeDoc
      });
    } else {
      set(createDefaultValidatedWorkspaceState());
    }
  },
  createDefaultValidatedWorkspaceState()
);

export const getActiveDoc = (): DocState => {
  const workspace = get(workspaceInputStore);
  const activeDoc = workspace.docs[workspace.activeDocId];
  if (activeDoc) {
    return activeDoc;
  }
  const docIds = Object.keys(workspace.docs);
  if (docIds.length > 0) {
    return workspace.docs[docIds[0]];
  }
  return createDefaultDocState();
};

export const inputStateStore = (() => {
  const { subscribe } = derived([workspaceInputStore], ([workspace]) => {
    if (!workspace || !workspace.docs || !workspace.activeDocId) {
      return createDefaultDocState();
    }
    const activeDoc = workspace.docs[workspace.activeDocId];
    return activeDoc || createDefaultDocState();
  });

  return {
    subscribe,
    set: (state: DocState) => {
      workspaceInputStore.update((workspace) => {
        return {
          ...workspace,
          docs: { ...workspace.docs, [state.id]: state },
          activeDocId: state.id
        };
      });
    },
    update: (updater: (state: DocState) => DocState) => {
      workspaceInputStore.update((workspace) => {
        const activeDoc = workspace.docs[workspace.activeDocId];
        if (!activeDoc) return workspace;
        const updated = updater(activeDoc);
        return {
          ...workspace,
          docs: { ...workspace.docs, [updated.id]: updated }
        };
      });
    }
  };
})();

export const currentState: ValidatedState = (() => {
  const defaultWorkspace = createDefaultValidatedWorkspaceState();
  return defaultWorkspace.activeDoc;
})();

export const stateStore: Readable<ValidatedState> = derived(
  [workspaceStore],
  ([workspace]) => {
    if (!workspace || !workspace.activeDoc) {
      return createDefaultValidatedWorkspaceState().activeDoc;
    }
    return workspace.activeDoc;
  },
  createDefaultValidatedWorkspaceState().activeDoc
);

const createDefaultUrls = () => {
  const defaultSerialized = serializeState(defaultState);
  const { krokiRendererUrl, rendererUrl } = env;
  const png = rendererUrl ? `${rendererUrl}/img/${defaultSerialized}?type=png` : '';
  return {
    kroki: krokiRendererUrl ? `${krokiRendererUrl}/mermaid/svg/${pakoSerde.serialize(defaultState.code)}` : '',
    mdCode: png
      ? `[![](${png})](${window.location.protocol}//${window.location.host}${window.location.pathname}#${defaultSerialized})`
      : '',
    mermaidChart: ({
      medium,
      campaign
    }: {
      medium:
        | 'ai_edit'
        | 'ai_repair'
        | 'main_menu'
        | 'save_diagram'
        | 'share'
        | 'vibe_diagramming'
        | 'visual_edit'
        | 'voice_edit';
      campaign?: string;
    }) => {
      const utmSource = getUTMSource();
      const params = new URLSearchParams({
        utm_source: utmSource,
        utm_medium: medium,
        ...(campaign ? { utm_campaign: campaign } : {})
      }).toString();
      return {
        save: `${MCBaseURL}/app/plugin/save?state=${defaultSerialized}&${params}`,
        playground: `${MCBaseURL}/play?${params}#${defaultSerialized}`,
        plugins: `${MCBaseURL}/plugins?${params}`,
        home: `${MCBaseURL}/?${params}`
      };
    },
    new: `${window.location.protocol}//${window.location.host}${window.location.pathname}#${defaultSerialized}`,
    png,
    svg: rendererUrl ? `${rendererUrl}/svg/${defaultSerialized}` : '',
    view: `/view#${defaultSerialized}`
  };
};

export const urlsStore = derived(
  [workspaceStore],
  ([workspace]) => {
    if (!workspace || !workspace.activeDoc) {
      return createDefaultUrls();
    }
    const { code, serialized } = workspace.activeDoc;
    const { krokiRendererUrl, rendererUrl } = env;
    const png = rendererUrl ? `${rendererUrl}/img/${serialized}?type=png` : '';
    return {
      kroki: krokiRendererUrl ? `${krokiRendererUrl}/mermaid/svg/${pakoSerde.serialize(code)}` : '',
      mdCode: png
        ? `[![](${png})](${window.location.protocol}//${window.location.host}${window.location.pathname}#${serialized})`
        : '',
      mermaidChart: ({
        medium,
        campaign
      }: {
        medium:
          | 'ai_edit'
          | 'ai_repair'
          | 'main_menu'
          | 'save_diagram'
          | 'share'
          | 'vibe_diagramming'
          | 'visual_edit'
          | 'voice_edit';
        campaign?: string;
      }) => {
        const utmSource = getUTMSource();
        const params = new URLSearchParams({
          utm_source: utmSource,
          utm_medium: medium,
          ...(campaign ? { utm_campaign: campaign } : {})
        }).toString();
        return {
          save: `${MCBaseURL}/app/plugin/save?state=${serialized}&${params}`,
          playground: `${MCBaseURL}/play?${params}#${serialized}`,
          plugins: `${MCBaseURL}/plugins?${params}`,
          home: `${MCBaseURL}/?${params}`
        };
      },
      new: `${window.location.protocol}//${window.location.host}${window.location.pathname}#${serializeState(defaultState)}`,
      png,
      svg: rendererUrl ? `${rendererUrl}/svg/${serialized}` : '',
      view: `/view#${serialized}`
    };
  },
  createDefaultUrls()
);

function getUnsafePaths(object: object, unsafeKeys: string[], path: string[] = []) {
  const unsafePaths = new Array<string[]>();
  for (const key of unsafeKeys) {
    if (Object.hasOwn(object, key)) {
      unsafePaths.push([...path, key]);
      continue;
    }
  }
  Object.keys(object).forEach((key) => {
    const value = object[key as keyof typeof object] as unknown;
    const currentPath = [...path, key];
    if (key.startsWith('__')) {
      unsafePaths.push(currentPath);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      unsafePaths.push(...getUnsafePaths(value as object, unsafeKeys, currentPath));
    } else if (
      typeof value === 'string' &&
      (value.includes('<') || value.includes('>') || value.includes('url(data:'))
    ) {
      unsafePaths.push(currentPath);
    }
  });
  return unsafePaths;
}

export const sanitizeConfig = (config: string | MermaidConfig) => {
  const mermaidConfig: MermaidConfig =
    typeof config === 'string' ? (JSON.parse(config) as MermaidConfig) : config;

  const secureKeys = defaultMermaidConfig.secure ?? [];
  const unsafePaths = getUnsafePaths(mermaidConfig, secureKeys).filter((path) => {
    return lodashGet(mermaidConfig, path) !== lodashGet(defaultMermaidConfig, path);
  });

  if (
    unsafePaths.length > 0 &&
    confirm(
      `Removing ${unsafePaths
        .map((unsafePath) => {
          return `${JSON.stringify(unsafePath.join('.'))}: ${JSON.stringify(lodashGet(mermaidConfig, unsafePath))}`;
        })
        .join(
          ',\n'
        )} from the config for safety.\nClick Cancel if you trust the source of this Diagram.`
    )
  ) {
    for (const unsafePath of unsafePaths) {
      const pathToObject = [...unsafePath];
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- We know this exists since it was found in `getUnsafePaths`
      const lastKey = pathToObject.pop()!;
      const lastObject =
        pathToObject.length === 0 ? mermaidConfig : lodashGet(mermaidConfig, pathToObject);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Copied from mermaid code
      delete lastObject[lastKey];
    }
  }
  return formatJSON(mermaidConfig);
};

export const loadState = (data: string): void => {
  let state: State;
  console.log(`Loading '${data}'`);
  try {
    const deserialized = deserializeState(data);
    if (!deserialized || typeof deserialized !== 'object' || Array.isArray(deserialized)) {
      throw new Error(`Invalid state type: ${typeof deserialized}`);
    }
    state = deserialized as State;
    state.mermaid = sanitizeConfig(state.mermaid || defaultState.mermaid);
  } catch (error) {
    state = getActiveDoc();
    if (data) {
      console.error('Init error', error);
      state.code = urlParseFailedState;
      state.mermaid = defaultState.mermaid;
    }
  }
  updateCodeStore(state);
};

export const loadDoc = (doc: DocState, activate = true): void => {
  workspaceInputStore.update((workspace) => {
    return {
      ...workspace,
      docs: { ...workspace.docs, [doc.id]: doc },
      activeDocId: activate ? doc.id : workspace.activeDocId
    };
  });
};

let renderCount = 0;

export const updateCodeStore = (newState: Partial<State>): void => {
  workspaceInputStore.update((workspace) => {
    const activeDoc = workspace.docs[workspace.activeDocId];
    if (!activeDoc) return workspace;
    renderCount++;
    const updatedDoc = { ...activeDoc, ...newState, renderCount };
    return {
      ...workspace,
      docs: { ...workspace.docs, [activeDoc.id]: updatedDoc }
    };
  });
};

export const updateCode = (
  code: string,
  {
    updateDiagram = false,
    resetPanZoom = false
  }: { updateDiagram?: boolean; resetPanZoom?: boolean } = {}
): void => {
  errorDebug();

  workspaceInputStore.update((workspace) => {
    const activeDoc = workspace.docs[workspace.activeDocId];
    if (!activeDoc) return workspace;
    const updatedDoc = { ...activeDoc };
    if (resetPanZoom) {
      updatedDoc.pan = undefined;
      updatedDoc.zoom = undefined;
    }
    updatedDoc.code = code;
    updatedDoc.updateDiagram = updateDiagram;
    return {
      ...workspace,
      docs: { ...workspace.docs, [activeDoc.id]: updatedDoc }
    };
  });
};

export const updateConfig = (config: string): void => {
  updateCodeStore({ mermaid: config });
};

export const toggleDarkTheme = (dark: boolean): void => {
  workspaceInputStore.update((workspace) => {
    const activeDoc = workspace.docs[workspace.activeDocId];
    if (!activeDoc) return workspace;
    const config = JSON.parse(activeDoc.mermaid) as MermaidConfig;
    if (!config.theme || ['dark', 'default'].includes(config.theme)) {
      config.theme = dark ? 'dark' : 'default';
    }
    const updatedDoc = { ...activeDoc, mermaid: formatJSON(config) };
    return {
      ...workspace,
      docs: { ...workspace.docs, [activeDoc.id]: updatedDoc }
    };
  });
};

export const initURLSubscription = (): void => {
  const updateHash = debounce((hash) => {
    history.replaceState(undefined, '', `#${hash}`);
  }, 250);

  workspaceStore.subscribe((workspace) => {
    const docIds = Object.keys(workspace.docs);
    if (docIds.length === 1) {
      updateHash(workspace.activeDoc.serialized);
    } else {
      const docsArray = Object.values(workspace.docs);
      const serialized = serializeWorkspace({
        docs: docsArray,
        activeDocId: workspace.activeDocId
      });
      updateHash(`docs=${serialized}`);
    }
  });
};

export const getStateString = (): string => {
  return JSON.stringify(getActiveDoc());
};

export const verifyState = (): void => {
  workspaceInputStore.update((workspace) => {
    const newDocs: Record<string, DocState> = {};
    for (const [id, doc] of Object.entries(workspace.docs)) {
      if (!doc.panZoom) {
        newDocs[id] = { ...doc, panZoom: true };
      } else {
        newDocs[id] = doc;
      }
    }
    return {
      ...workspace,
      docs: newDocs
    };
  });
};

export const createNewDoc = (name?: string): string => {
  const workspace = get(workspaceInputStore);
  const docCount = Object.keys(workspace.docs).length;
  const doc = createDefaultDocState(name || `Diagram ${docCount + 1}`);
  workspaceInputStore.update((currentWorkspace) => {
    return {
      ...currentWorkspace,
      docs: { ...currentWorkspace.docs, [doc.id]: doc },
      activeDocId: doc.id
    };
  });
  return doc.id;
};

export const closeDoc = (docId: string): void => {
  workspaceInputStore.update((workspace) => {
    const docIds = Object.keys(workspace.docs);
    if (docIds.length <= 1) {
      return workspace;
    }
    const newDocs: Record<string, DocState> = {};
    for (const [id, doc] of Object.entries(workspace.docs)) {
      if (id !== docId) {
        newDocs[id] = doc;
      }
    }
    let newActiveDocId = workspace.activeDocId;
    if (workspace.activeDocId === docId) {
      const newDocIds = Object.keys(newDocs);
      newActiveDocId = newDocIds[0] || '';
    }
    return {
      ...workspace,
      docs: newDocs,
      activeDocId: newActiveDocId
    };
  });
};

export const activateDoc = (docId: string): void => {
  workspaceInputStore.update((workspace) => {
    if (!Object.prototype.hasOwnProperty.call(workspace.docs, docId)) return workspace;
    return {
      ...workspace,
      activeDocId: docId
    };
  });
};

export const renameDoc = (docId: string, name: string): void => {
  workspaceInputStore.update((workspace) => {
    const doc = workspace.docs[docId];
    if (!doc) return workspace;
    return {
      ...workspace,
      docs: { ...workspace.docs, [docId]: { ...doc, name } }
    };
  });
};

export const getAllDocs = (): DocState[] => {
  return Object.values(get(workspaceInputStore).docs);
};

export const loadWorkspaceFromDocs = (
  docs: DocState[],
  activeDocId?: string
): void => {
  if (docs.length === 0) {
    createNewDoc();
    return;
  }
  const docsMap: Record<string, DocState> = {};
  for (const doc of docs) {
    docsMap[doc.id] = doc;
  }
  const docIds = Object.keys(docsMap);
  const activeId =
    activeDocId && Object.prototype.hasOwnProperty.call(docsMap, activeDocId) ? activeDocId : docIds[0];
  workspaceInputStore.set({
    docs: docsMap,
    activeDocId: activeId
  });
};

export const exportWorkspaceAsMarkdown = (): string => {
  const docs = getAllDocs();
  let markdown = '';

  for (const doc of docs) {
    markdown += `# ${doc.name}\n\n`;
    markdown += '```mermaid\n';
    markdown += doc.code;
    markdown += '\n```\n\n';
    if (doc.mermaid && doc.mermaid !== defaultState.mermaid) {
      markdown += '## Config\n\n';
      markdown += '```json\n';
      markdown += doc.mermaid;
      markdown += '\n```\n\n';
    }
    markdown += '---\n\n';
  }

  return markdown.trim();
};

export interface ParsedMermaidBlock {
  name: string;
  code: string;
  config?: string;
}

export const parseMarkdownForMermaidBlocks = (markdown: string): ParsedMermaidBlock[] => {
  const blocks: ParsedMermaidBlock[] = [];
  const lines = markdown.split('\n');
  let inMermaidBlock = false;
  let inJsonBlock = false;
  let currentCode = '';
  let currentConfig = '';
  let currentName = '';
  let blockCounter = 1;
  let lastHeading = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const headingMatch = line.match(/^#+\s+(.+)$/);
    if (headingMatch) {
      if (inMermaidBlock) {
        blocks.push({
          name: currentName || `Diagram ${blockCounter++}`,
          code: currentCode.trim(),
          config: currentConfig || undefined
        });
        inMermaidBlock = false;
        currentCode = '';
        currentConfig = '';
      }
      lastHeading = headingMatch[1].trim();
      continue;
    }

    if (line.trim().startsWith('```mermaid')) {
      if (inMermaidBlock) {
        blocks.push({
          name: currentName || `Diagram ${blockCounter++}`,
          code: currentCode.trim(),
          config: currentConfig || undefined
        });
        currentCode = '';
        currentConfig = '';
      }
      inMermaidBlock = true;
      inJsonBlock = false;
      currentName = lastHeading || `Diagram ${blockCounter}`;
      continue;
    }

    if (line.trim().startsWith('```json') && inMermaidBlock) {
      inJsonBlock = true;
      continue;
    }

    if (line.trim() === '```') {
      if (inJsonBlock) {
        inJsonBlock = false;
        continue;
      }
      if (inMermaidBlock) {
        blocks.push({
          name: currentName || `Diagram ${blockCounter++}`,
          code: currentCode.trim(),
          config: currentConfig || undefined
        });
        inMermaidBlock = false;
        currentCode = '';
        currentConfig = '';
        lastHeading = '';
      }
      continue;
    }

    if (inMermaidBlock && !inJsonBlock) {
      currentCode += line + '\n';
    } else if (inJsonBlock) {
      currentConfig += line + '\n';
    }
  }

  if (inMermaidBlock && currentCode.trim()) {
    blocks.push({
      name: currentName || `Diagram ${blockCounter}`,
      code: currentCode.trim(),
      config: currentConfig || undefined
    });
  }

  return blocks;
};

export const importWorkspaceFromMarkdown = (markdown: string, replaceExisting = false): DocState[] => {
  const blocks = parseMarkdownForMermaidBlocks(markdown);

  if (blocks.length === 0) {
    return [];
  }

  const docs: DocState[] = [];
  for (const block of blocks) {
    const doc: DocState = {
      ...defaultState,
      id: generateDocId(),
      name: block.name,
      code: block.code,
      mermaid: block.config || defaultState.mermaid
    };
    docs.push(doc);
  }

  if (replaceExisting) {
    loadWorkspaceFromDocs(docs);
  } else {
    for (const doc of docs) {
      loadDoc(doc, false);
    }
  }

  return docs;
};
