<script lang="ts">
  import type { EditorProps } from '$/types';
  import { env } from '$/util/env';
  import { parseNodes } from '$/util/nodeParser';
  import {
    cursorNodeId,
    hoveredNodeId,
    navigationRequest
  } from '$/util/nodeSyncStore';
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
  let nodeLinkDecorations: monaco.editor.IEditorDecorationsCollection | undefined;
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
    nodeLinkDecorations = editor.createDecorationsCollection([]);

    // --- Node linking: cursor position → preview highlight ---
    editor.onDidChangeCursorPosition((e) => {
      if (editor?.getModel()?.id !== mermaidModel.id) {
        cursorNodeId.set(null);
        return;
      }
      const model = editor?.getModel();
      if (!model) return;
      const codeText = model.getValue();
      const nodes = parseNodes(codeText);
      const cursorLine = e.position.lineNumber;
      // Find node defined on this line
      const nodeOnLine = nodes.find((n) => n.line === cursorLine);
      cursorNodeId.set(nodeOnLine?.id ?? null);
    });

    // --- Node linking: preview hover → editor line highlight ---
    const unsubHovered = hoveredNodeId.subscribe((nodeId) => {
      if (!editor || editor.getModel()?.id !== mermaidModel.id) {
        nodeLinkDecorations?.clear();
        return;
      }
      if (!nodeId) {
        nodeLinkDecorations?.clear();
        return;
      }
      const model = editor.getModel();
      if (!model) return;
      const codeText = model.getValue();
      const nodes = parseNodes(codeText);
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        nodeLinkDecorations?.set([
          {
            range: new monaco.Range(node.line, 1, node.line, 1),
            options: {
              isWholeLine: true,
              className: 'node-linked-line',
              glyphMarginClassName: 'node-linked-glyph',
              overviewRuler: {
                color: '#e8347a',
                position: monaco.editor.OverviewRulerLane.Left
              }
            }
          }
        ]);
        // Reveal the line in the editor (without scrolling if already visible)
        editor.revealLineInCenterIfOutsideViewport(node.line);
      }
    });

    // --- Node linking: preview click → editor cursor jump ---
    const unsubNavigation = navigationRequest.subscribe((req) => {
      if (!req || !editor) return;
      if (editor.getModel()?.id !== mermaidModel.id) {
        // Switch to mermaid model first
        editor.setModel(mermaidModel);
      }
      const col = req.column !== undefined ? req.column + 1 : 1;
      editor.setPosition({ lineNumber: req.line, column: col });
      editor.revealLineInCenter(req.line);
      editor.focus();

      // Add line decoration to highlight the navigated node
      nodeLinkDecorations?.set([
        {
          range: new monaco.Range(req.line, 1, req.line, 1),
          options: {
            isWholeLine: true,
            className: 'node-linked-line',
            glyphMarginClassName: 'node-linked-glyph',
            overviewRuler: {
              color: '#e8347a',
              position: monaco.editor.OverviewRulerLane.Left
            }
          }
        }
      ]);

      // Also update cursorNodeId so the preview highlights the node
      cursorNodeId.set(req.nodeId ?? null);

      // Clear the request after handling
      navigationRequest.set(null);
    });

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
      unsubscribeMode();
      unsubHovered();
      unsubNavigation();
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

  /* Node linking: line highlight when hovering over preview node */
  :global(.node-linked-line) {
    background-color: hsl(340 100% 44% / 0.08);
  }

  :global(.node-linked-glyph) {
    background-color: hsl(340 100% 44%);
    width: 4px !important;
    margin-left: 2px;
    border-radius: 2px;
  }
</style>
