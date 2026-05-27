<script lang="ts">
  import { TID } from '$/constants';
  import { closeContextMenu, linkageStore } from '$/util/linkage';
  import { changeNodeColor, deleteNode, renameNodeLabel } from '$/util/mermaidEdits';
  import { stateStore, updateCode } from '$/util/state';
  import { onMount } from 'svelte';

  let renameMode = $state(false);
  let colorMode = $state(false);
  let renameValue = $state('');
  let colorValue = $state('#4a90d9');
  let renameInput: HTMLInputElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();

  const ctx = $derived($linkageStore.contextMenu);
  const nodeId = $derived(ctx?.nodeId ?? '');
  const mapping = $derived($linkageStore.nodeMappings.find((m) => m.nodeId === nodeId));

  function handleClose() {
    renameMode = false;
    colorMode = false;
    renameValue = '';
    closeContextMenu();
  }

  function handleRenameStart() {
    if (!mapping) return;
    renameValue = mapping.label;
    renameMode = true;
    colorMode = false;
    requestAnimationFrame(() => {
      renameInput?.focus();
      renameInput?.select();
    });
  }

  function handleRenameSubmit() {
    if (!mapping || !renameValue.trim()) return;
    const code = $stateStore.code;
    const newCode = renameNodeLabel(code, mapping, renameValue.trim());
    updateCode(newCode, { updateDiagram: true });
    handleClose();
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      handleClose();
    }
  }

  function handleColorStart() {
    colorMode = true;
    renameMode = false;
  }

  function handleColorChange(e: Event) {
    const target = e.target as HTMLInputElement;
    colorValue = target.value;
    const code = $stateStore.code;
    const newCode = changeNodeColor(code, nodeId, colorValue);
    updateCode(newCode, { updateDiagram: true });
    handleClose();
  }

  function handleDelete() {
    const code = $stateStore.code;
    const newCode = deleteNode(code, nodeId, $linkageStore.nodeMappings);
    updateCode(newCode, { updateDiagram: true });
    handleClose();
  }

  function handleClickOutside(e: MouseEvent) {
    if (menuEl && !menuEl.contains(e.target as Node)) {
      handleClose();
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  });
</script>

{#if ctx}
  <div
    bind:this={menuEl}
    data-testid={TID.contextMenu}
    class="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    style="left: {ctx.x}px; top: {ctx.y}px;">
    {#if renameMode}
      <div class="flex gap-1 p-1">
        <input
          bind:this={renameInput}
          bind:value={renameValue}
          data-testid={TID.renameInput}
          class="h-8 flex-1 rounded-sm border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          onkeydown={handleRenameKeydown} />
        <button
          class="h-8 rounded-sm bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
          onclick={handleRenameSubmit}>OK</button>
      </div>
    {:else if colorMode}
      <div class="flex items-center gap-2 p-2">
        <label class="text-xs text-muted-foreground" for="node-color-input">Color:</label>
        <input
          id="node-color-input"
          type="color"
          value={colorValue}
          data-testid={TID.colorPicker}
          class="h-8 w-12 cursor-pointer rounded-sm border-none bg-transparent"
          onchange={handleColorChange} />
      </div>
    {:else}
      <button
        data-testid={TID.contextMenuRename}
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        onclick={handleRenameStart}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
        Rename
      </button>
      <button
        data-testid={TID.contextMenuColor}
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
        onclick={handleColorStart}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <circle cx="13.5" cy="6.5" r="2.5" />
          <circle cx="6.5" cy="13.5" r="2.5" />
          <circle cx="17.5" cy="13.5" r="2.5" />
          <circle cx="13.5" cy="20.5" r="2.5" />
        </svg>
        Change Color
      </button>
      <div class="my-1 h-px bg-border"></div>
      <button
        data-testid={TID.contextMenuDelete}
        class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        onclick={handleDelete}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
        Delete
      </button>
    {/if}
  </div>
{/if}
