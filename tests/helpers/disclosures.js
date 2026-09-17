// Follow the public disclosure path after controls were relocated; never changes
// experiment state or bypasses disabled controls.
export async function reveal(page, selector) {
  const node = page.locator(selector);
  for (const id of ['experiment-menu','view-menu']) {
    if (await page.locator('#'+id).getAttribute('open') !== null && !await node.evaluate((n,id)=>!!n.closest('#'+id),id)) await page.locator('#'+id+' > summary').click();
  }
  const inSettings = await node.evaluate(n => !!n.closest('#tuning-panel'));
  if (!inSettings && await page.locator('#tuning-panel').isVisible()) await page.locator('#tune').click();
  if (inSettings && await page.locator('#tuning-panel').isHidden()) await page.locator('#tune').click();
  const ancestors = await node.evaluate(n => {
    const ids = []; for (let p=n.parentElement;p;p=p.parentElement) if(p.tagName==='DETAILS' && !p.open && !(n.tagName==='SUMMARY' && p===n.parentElement)) ids.unshift(p.id);
    return ids;
  });
  for (const id of ancestors) await page.locator(`#${id} > summary`).click();
}
