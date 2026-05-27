<script lang="ts">
  import type { EditorProps } from '$/types';
  import { env } from '$/util/env';
  import { linkageStore, setCursorNode } from '$/util/linkage';
  import { stateStore, urlsStore } from '$/util/state';
  import { logMermaidChartClick } from '$/util/stats';
  import { AIPromptViewZoneManager } from '$lib/util/AIPromptViewZoneManager';
  import { initEditor } from '$lib/util/monacoExtra';
  import { errorDebug } from '$lib/util/util';
  import { mode } from 'mode-watcher';
  import * as monaco from 'monaco-editor';
  import monacoEditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
  import monacoJsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
  import { onMount } from 'svelte';
  import AIPromptPopup from './AIPromptPopup.svelte';

  const { onUpdate }: EditorProps = $props();

  let divElement: HTMLDivElement | undefined = $state();
  let aiPromptPopupElement: HTMLDivElement | undefined = $state();
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  let editorOptions = {
    minimap: {
      enabled: false
    },
    overviewRulerLanes: 0,
    glyphMargin: true,
    lineNumbersMinChars: 4
  } satisfies monaco.editor.IStandaloneEditorConstructionOptions;
  let currentText = '';
  let showPopup = $state(false);
  let popupPosition = $state({ top: 0, lineNumber: 0 });
  let decorationsCollection: monaco.editor.IEditorDecorationsCollection | undefined;
  let linkageDecorationsCollection: monaco.editor.IEditorDecorationsCollection | undefined;
  let input = $state('');
  let lastMouseLine = 0;
  const aiPromptManager = new AIPromptViewZoneManager();

  const jsonModel = monaco.editor.createModel(
    '',
    'json',
    monaco.Uri.parse('internal://config.json')
  );
  const mermaidModel = monaco.editor.createModel(
    '',
    'mermaid',
    monaco.Uri.parse('internal://mermaid.mmd')
  );

  const renderAIPromptGutterGlyphIcon = () => {
    decorationsCollection?.clear();
    if (!editor || showPopup) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      return;
    }

    if (lastMouseLine > 0 && model.id === mermaidModel.id) {
      decorationsCollection?.set([
        {
          range: new monaco.Range(lastMouseLine, 1, lastMouseLine, 1),
          options: {
            glyphMarginClassName: 'suggestion-icon'
          }
        }
      ]);
    }
  };

  const closePopup = () => {
    showPopup = false;
    input = '';
    aiPromptManager.hide();
    renderAIPromptGutterGlyphIcon();
  };

  const toggleAIPopup = (lineNumber: number) => {
    if (!divElement || !aiPromptPopupElement) return;
    popupPosition = {
      top: 0,
      lineNumber
    };
    showPopup = !showPopup;
    if (showPopup) {
      aiPromptManager.show(popupPosition.lineNumber, aiPromptPopupElement, 100);
      editor?.setSelection(new monaco.Range(0, 0, 0, 0));
    } else {
      aiPromptManager.hide();
    }
    renderAIPromptGutterGlyphIcon();
  };

  const updateLinkageDecorations = (hoveredNodeId: string | null, selectedNodeId: string | null, nodeMappings: typeof $linkageStore.nodeMappings) => {
    if (!linkageDecorationsCollection || !editor) return;
    if (editor.getModel()?.id !== mermaidModel.id) {
      linkageDecorationsCollection.clear();
      return;
    }

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    if (hoveredNodeId) {
      const mapping = nodeMappings.find((m) => m.nodeId === hoveredNodeId);
      if (mapping) {
        decorations.push({
          range: new monaco.Range(mapping.lineNumber, 1, mapping.lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'linkage-hover-highlight'
          }
        });
      }
    }

    if (selectedNodeId && selectedNodeId !== hoveredNodeId) {
      const mapping = nodeMappings.find((m) => m.nodeId === selectedNodeId);
      if (mapping) {
        decorations.push({
          range: new monaco.Range(mapping.lineNumber, 1, mapping.lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'linkage-select-highlight'
          }
        });
      }
    }

    linkageDecorationsCollection.set(decorations);
  };

  const jumpToNode = (nodeId: string, nodeMappings: typeof $linkageStore.nodeMappings) => {
    if (!editor) return;
    const mapping = nodeMappings.find((m) => m.nodeId === nodeId);
    if (!mapping) return;
    editor.revealLineInCenter(mapping.lineNumber);
    editor.setPosition({ lineNumber: mapping.lineNumber, column: mapping.startColumn });
    editor.focus();
  };

  onMount(() => {
    self.MonacoEnvironment = {
      getWorker(_, label) {
        if (label === 'json') {
          return new monacoJsonWorker();
        }
        return new monacoEditorWorker();
      }
    };

    if (!divElement) {
      throw new Error('divEl is undefined');
    }

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: true,
      schemas: [
        {
          fileMatch: ['config.json'],
          uri: `${env.docsUrl}/schemas/config.schema.json`
        }
      ]
    });

    initEditor(monaco);
    errorDebug();
    editor = monaco.editor.create(divElement, editorOptions);
    aiPromptManager.setEditor(editor);
    decorationsCollection = editor.createDecorationsCollection([]);
    linkageDecorationsCollection = editor.createDecorationsCollection([]);

    editor.onMouseDown((e) => {
      const isGutter = e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;
      if (isGutter && e.target.position?.lineNumber === lastMouseLine && lastMouseLine > 0) {
        e.event.preventDefault();
        e.event.stopPropagation();
        toggleAIPopup(e.target.position.lineNumber);
      }
    });

    editor.onDidChangeModelContent(({ isFlush }) => {
      const newText = editor?.getValue();
      if (!newText || currentText === newText || isFlush) {
        return;
      }
      currentText = newText;
      onUpdate(currentText);
    });

    editor.onDidChangeCursorPosition((e) => {
      if (!editor || editor.getModel()?.id !== mermaidModel.id) {
        setCursorNode(null);
        return;
      }
      const lineNumber = e.position.lineNumber;
      const mapping = $linkageStore.nodeMappings.find((m) => m.lineNumber === lineNumber);
      setCursorNode(mapping ? mapping.nodeId : null);
    });

    const unsubscribeState = stateStore.subscribe(({ errorMarkers, editorMode, code, mermaid }) => {
      if (!editor) {
        return;
      }

      const model = editorMode === 'code' ? mermaidModel : jsonModel;

      if (editor.getModel()?.id !== model.id) {
        editor.setModel(model);
        renderAIPromptGutterGlyphIcon();
      }

      // Clear decorations if not in 'code' mode, or if the model changes
      if (editorMode !== 'code' || editor.getModel()?.id !== mermaidModel.id) {
        decorationsCollection?.clear();
        linkageDecorationsCollection?.clear();
      }

      // Update editor text if it's different
      const newText = editorMode === 'code' ? code : mermaid;
      if (newText !== currentText) {
        editor.setScrollTop(0);
        editor.setValue(newText);
        currentText = newText;
        renderAIPromptGutterGlyphIcon();
      }

      // Display/clear errors
      monaco.editor.setModelMarkers(model, 'mermaid', errorMarkers);
    });

    let prevSelectedNodeId: string | null = null;
    const unsubscribeLinkage = linkageStore.subscribe((ls) => {
      updateLinkageDecorations(ls.hoveredNodeId, ls.selectedNodeId, ls.nodeMappings);
      if (ls.selectedNodeId && ls.selectedNodeId !== prevSelectedNodeId) {
        jumpToNode(ls.selectedNodeId, ls.nodeMappings);
      }
      prevSelectedNodeId = ls.selectedNodeId;
    });

    editor.onMouseMove((e) => {
      if (!editor) return;
      if (showPopup) return;
      if (editor.getModel()?.id !== mermaidModel.id) return;

      lastMouseLine = e.target.position?.lineNumber ?? 0;
      renderAIPromptGutterGlyphIcon();
    });

    editor.onMouseLeave(() => {
      lastMouseLine = 0;
      renderAIPromptGutterGlyphIcon();
    });

    const unsubscribeMode = mode.subscribe((mode) => {
      if (editor) {
        monaco.editor.setTheme(`mermaid${mode === 'dark' ? '-dark' : ''}`);
        divElement?.classList.toggle('mermaid-dark', mode === 'dark');
      }
    });
    const resizeObserver = new ResizeObserver((entries) => {
      editor?.layout({
        height: entries[0].contentRect.height,
        width: entries[0].contentRect.width
      });
    });

    if (divElement.parentElement) {
      resizeObserver.observe(divElement);
    }

    renderAIPromptGutterGlyphIcon();

    return () => {
      unsubscribeState();
      unsubscribeLinkage();
      unsubscribeMode();
      resizeObserver.disconnect();
      jsonModel.dispose();
      mermaidModel.dispose();
      aiPromptManager.destroy();
      editor?.dispose();
    };
  });
</script>

<div class="relative h-full grow overflow-hidden">
  <div bind:this={divElement} id="editor" class="h-full w-full"></div>
  <div bind:this={aiPromptPopupElement}>
    <AIPromptPopup
      show={showPopup}
      bind:input
      onHeightChange={(height) => aiPromptManager.updateHeight(height)}
      onClose={closePopup}
      onTryFree={() => {
        logMermaidChartClick('vibeDiagramming');
        window.open(
          $urlsStore.mermaidChart({ medium: 'vibe_diagramming' }).save,
          '_blank',
          'noopener'
        );
        closePopup();
      }} />
  </div>
</div>

<style>
  :global(.suggestion-icon) {
    background-color: #e8eaf9;
    width: 20px !important;
    height: 20px !important;
    margin-left: 4px;
    background-image: url('/icons/use-chat.svg');
    background-size: 16px 16px;
    background-repeat: no-repeat;
    background-position: center;
    border-radius: 4px;
    cursor: pointer;
  }

  :global(#editor.mermaid-dark .suggestion-icon) {
    background-color: #2e4d6b;
    background-image: url('/icons/use-chat-dark.svg');
  }

  :global(.linkage-hover-highlight) {
    background-color: rgba(59, 130, 246, 0.12) !important;
  }

  :global(#editor.mermaid-dark .linkage-hover-highlight) {
    background-color: rgba(59, 130, 246, 0.2) !important;
  }

  :global(.linkage-select-highlight) {
    background-color: rgba(59, 130, 246, 0.2) !important;
    border-left: 3px solid rgb(59, 130, 246) !important;
  }

  :global(#editor.mermaid-dark .linkage-select-highlight) {
    background-color: rgba(59, 130, 246, 0.3) !important;
  }
</style>
