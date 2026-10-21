import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Nonmodal, explicit help. Portaled so sidebars and tables never clip the explanation. */
export default function HelpPopover({title,children}:{title:string;children:ReactNode}){
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),card=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:12,top:12});
  function close(returnFocus=false){setOpen(false);if(returnFocus)trigger.current?.focus();}
  useLayoutEffect(()=>{
    if(!open)return;
    function place(){
      const button=trigger.current?.getBoundingClientRect(),popup=card.current?.getBoundingClientRect();if(!button||!popup)return;
      const left=Math.max(12,Math.min(button.left,window.innerWidth-popup.width-12));
      const below=button.bottom+9;
      const top=Math.max(12,Math.min(below+popup.height>window.innerHeight-12?button.top-popup.height-9:below,window.innerHeight-popup.height-12));
      setPosition({left,top});
    }
    function outside(event:PointerEvent){if(!trigger.current?.contains(event.target as Node)&&!card.current?.contains(event.target as Node))setOpen(false);}
    function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}}
    place();card.current?.focus({preventScroll:true});window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);};
  },[open]);
  return <span className="help-anchor"><button ref={trigger} type="button" className="help-trigger" aria-label={`Ayuda: ${title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} title={`Ver explicación: ${title}`} onClick={()=>setOpen(value=>!value)}>?</button>{open&&createPortal(<div ref={card} id={id} role="dialog" tabIndex={-1} aria-modal="false" aria-labelledby={`${id}-title`} className="help-popover" style={position}><div className="help-popover-heading"><strong id={`${id}-title`}>{title}</strong><button type="button" aria-label={`Cerrar ayuda: ${title}`} onClick={()=>close(true)}>×</button></div><div className="help-copy">{children}</div><small>Escape para cerrar</small></div>,document.body)}</span>;
}
