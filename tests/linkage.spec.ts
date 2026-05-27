import { TID } from '$/constants';
import { expect, test } from './test';

test.describe('Preview-Code Linkage', () => {
  test('clicking a preview node jumps editor cursor to that node', async ({ editPage }) => {
    const { page } = editPage;

    await editPage.clearEditor();
    await editPage.typeInEditor(
      `flowchart TD
    A[Alpha] --> B[Beta]
    B --> C[Gamma]`,
      { bottom: false }
    );

    await page.waitForTimeout(1500);

    const container = page.getByTestId(TID.previewContainer);
    const nodeB = container.locator('g.node[id*="-flowchart-B-"]');
    await expect(nodeB).toBeVisible({ timeout: 10_000 });
    await nodeB.click();

    await page.waitForTimeout(500);

    const editorLine = page.locator('.monaco-editor .current-line');
    await expect(editorLine).toBeVisible();
  });

  test('cursor on a node definition line highlights the preview node', async ({ editPage }) => {
    const { page } = editPage;

    await editPage.clearEditor();
    await editPage.typeInEditor(
      `flowchart TD
    A[Alpha] --> B[Beta]
    B --> C[Gamma]`,
      { bottom: false }
    );

    await page.waitForTimeout(1500);

    const container = page.getByTestId(TID.previewContainer);
    await expect(container.locator('g.node')).toHaveCount(3, { timeout: 10_000 });

    const editor = page.locator('.monaco-editor');
    await editor.click();

    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');

    await page.waitForTimeout(500);

    const highlightedNode = container.locator('g.node.linkage-highlight');
    await expect(highlightedNode).toHaveCount(1, { timeout: 5_000 });
  });

  test('right-click rename updates source and preview', async ({ editPage }) => {
    const { page } = editPage;

    await editPage.clearEditor();
    await editPage.typeInEditor(
      `flowchart TD
    A[Alpha] --> B[Beta]`,
      { bottom: false }
    );

    await page.waitForTimeout(1500);

    const container = page.getByTestId(TID.previewContainer);
    const nodeA = container.locator('g.node[id*="-flowchart-A-"]');
    await expect(nodeA).toBeVisible({ timeout: 10_000 });

    await nodeA.click({ button: 'right' });

    const contextMenu = page.getByTestId(TID.contextMenu);
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });

    await page.getByTestId(TID.contextMenuRename).click();

    const renameInput = page.getByTestId(TID.renameInput);
    await expect(renameInput).toBeVisible();

    await renameInput.fill('');
    await renameInput.type('Renamed', { delay: 20 });
    await page.keyboard.press('Enter');

    await page.waitForTimeout(1000);

    await editPage.checkInEditor('Renamed');
    await editPage.checkTextInView('Renamed');
  });

  test('right-click delete removes node from source and preview', async ({ editPage }) => {
    const { page } = editPage;

    await editPage.clearEditor();
    await editPage.typeInEditor(
      `flowchart TD
    A[Alpha] --> B[Beta]
    B --> C[Gamma]`,
      { bottom: false }
    );

    await page.waitForTimeout(1500);

    const container = page.getByTestId(TID.previewContainer);
    const nodeA = container.locator('g.node[id*="-flowchart-A-"]');
    await expect(nodeA).toBeVisible({ timeout: 10_000 });

    await nodeA.click({ button: 'right' });

    const contextMenu = page.getByTestId(TID.contextMenu);
    await expect(contextMenu).toBeVisible({ timeout: 5_000 });

    await page.getByTestId(TID.contextMenuDelete).click();

    await page.waitForTimeout(1000);

    await editPage.checkTextNotInView('Alpha');
    const editor = page.locator('.monaco-editor');
    await expect(editor).not.toContainText('Alpha');
  });
});
