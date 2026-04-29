<script lang="ts">
  import type { DocState } from '$/types';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { activateDoc, closeDoc, createNewDoc, renameDoc, workspaceStore } from '$/util/state';
  import { onMount } from 'svelte';
  import CloseIcon from '~icons/material-symbols/close-rounded';
  import AddIcon from '~icons/material-symbols/add-rounded';

  let editingDocId: string | null = $state(null);
  let editInputValue = $state('');
  let editInputElement: HTMLInputElement | undefined = $state();
  let tabContainer: HTMLDivElement | undefined = $state();

  const startRename = (doc: DocState) => {
    editingDocId = doc.id;
    editInputValue = doc.name;
  };

  const submitRename = () => {
    if (editingDocId && editInputValue.trim()) {
      renameDoc(editingDocId, editInputValue.trim());
    }
    editingDocId = null;
  };

  const cancelRename = () => {
    editingDocId = null;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      submitRename();
    } else if (e.key === 'Escape') {
      cancelRename();
    }
  };

  const handleTabClick = (docId: string, e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-close-button]')) {
      return;
    }
    activateDoc(docId);
  };

  const handleCloseClick = (docId: string, e: Event) => {
    e.stopPropagation();
    closeDoc(docId);
  };

  $effect(() => {
    if (editingDocId && editInputElement) {
      editInputElement.focus();
      editInputElement.select();
    }
  });

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        createNewDoc();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        const workspace = $workspaceStore;
        if (workspace && Object.keys(workspace.docs).length > 1) {
          closeDoc(workspace.activeDocId);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        const workspace = $workspaceStore;
        if (workspace && Object.keys(workspace.docs).length > 1) {
          const docIds = Object.keys(workspace.docs);
          const currentIndex = docIds.indexOf(workspace.activeDocId);
          const nextIndex = e.shiftKey
            ? (currentIndex - 1 + docIds.length) % docIds.length
            : (currentIndex + 1) % docIds.length;
          activateDoc(docIds[nextIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div
  class="tab-bar flex items-center gap-1 overflow-x-auto border-b border-muted bg-muted/50 px-2 py-1">
  {#if $workspaceStore}
    {#each Object.values($workspaceStore.docs) as doc (doc.id)}
      <div
        class={[
          'tab-item group relative flex max-w-48 min-w-24 items-center gap-2 rounded-t-lg px-3 py-1.5 text-sm transition-colors',
          doc.id === $workspaceStore.activeDocId
            ? 'bg-background text-foreground shadow-sm'
            : 'cursor-pointer text-muted-foreground hover:bg-muted/80'
        ]}
        role="tab"
        aria-selected={doc.id === $workspaceStore.activeDocId}
        tabindex="0"
        onclick={(e) => handleTabClick(doc.id, e)}
        onkeypress={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            activateDoc(doc.id);
          }
        }}>
        {#if editingDocId === doc.id}
          <Input
            bind:this={editInputElement}
            bind:value={editInputValue}
            class="h-6 min-w-0 flex-1 px-1 py-0 text-sm"
            onkeydown={handleKeyDown}
            onblur={submitRename} />
        {:else}
          <span
            role="button"
            tabindex="0"
            class="min-w-0 flex-1 truncate"
            ondblclick={() => startRename(doc)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startRename(doc);
              }
            }}
            title={`${doc.name} (Double-click to rename)`}>
            {doc.name}
          </span>
        {/if}

        {#if Object.keys($workspaceStore.docs).length > 1}
          <Button
            data-close-button
            variant="ghost"
            size="icon"
            class="ml-1 h-5 w-5 rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
            title={`Close ${doc.name} (Ctrl+W)`}
            onclick={(e) => handleCloseClick(doc.id, e)}>
            <CloseIcon class="h-3 w-3" />
          </Button>
        {/if}
      </div>
    {/each}
  {/if}

  <Button
    variant="ghost"
    size="icon"
    class="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
    title="New Tab (Ctrl+T)"
    onclick={() => createNewDoc()}>
    <AddIcon class="h-4 w-4" />
  </Button>
</div>
