// Keep the existing select as the toolbar's accessible focus/command anchor,
// but render its choices separately: native Windows popups inherit its 44px width.
export function installTextStyleMenu(select) {
  const doc=select.ownerDocument, win=doc.defaultView;
  const menu=doc.createElement('div');
  menu.id='textStyleMenu';menu.className='text-style-menu';menu.hidden=true;
  menu.setAttribute('role','listbox');doc.body.append(menu);
  select.setAttribute('aria-controls',menu.id);select.setAttribute('aria-expanded','false');
  const close=(focus=false)=>{menu.hidden=true;select.setAttribute('aria-expanded','false');if(focus)select.focus({preventScroll:true});};
  const choose=value=>{close();select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));};
  const open=(last=false)=>{
    if(!menu.hidden){close(true);return;}
    menu.replaceChildren();menu.setAttribute('aria-label',select.getAttribute('aria-label')||select.title);
    for(const option of select.options){
      const button=doc.createElement('button');button.type='button';button.tabIndex=-1;
      button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.selected));
      button.textContent=option.textContent;button.dataset.value=option.value;
      button.onclick=()=>choose(option.value);menu.append(button);
    }
    menu.hidden=false;select.setAttribute('aria-expanded','true');
    const rect=select.getBoundingClientRect(),margin=8;
    menu.style.left=Math.max(margin,Math.min(rect.left,win.innerWidth-menu.offsetWidth-margin))+'px';
    menu.style.top=Math.max(margin,rect.bottom+menu.offsetHeight+6<=win.innerHeight-margin?rect.bottom+6:rect.top-menu.offsetHeight-6)+'px';
    (last?menu.lastElementChild:menu.firstElementChild)?.focus({preventScroll:true});
  };
  select.addEventListener('mousedown',event=>event.preventDefault());
  select.addEventListener('click',event=>{event.preventDefault();open();});
  select.addEventListener('keydown',event=>{
    if(['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();open(event.key==='ArrowUp');}
  });
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close(true);return;}
    const items=[...menu.children],index=items.indexOf(doc.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
      items[next].focus();
    }
  });
  doc.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target)&&event.target!==select)close();});
  win.addEventListener('resize',()=>close());
  doc.addEventListener('scroll',event=>{if(!menu.contains(event.target))close();},true);
}
