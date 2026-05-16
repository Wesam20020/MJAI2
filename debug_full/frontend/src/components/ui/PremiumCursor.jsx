import { useEffect, useRef } from 'react';

const INTERACTIVE =
  'a, button, [role="button"], input, textarea, select, label[for], ' +
  '.dock-item, .lang-option, .quiz-option-btn, .btn';

export default function PremiumCursor() {
  const dotRef  = useRef(null);
  const rafRef  = useRef(null);
  const mouse   = useRef({ x: -200, y: -200 });
  const hover   = useRef(false);
  const visible = useRef(false);

  useEffect(() => {
    // Touch devices keep the native cursor
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const dotEl = dotRef.current;
    if (!dotEl) return;

    document.body.classList.add('cursor-active');

    const onMove = (e) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (!visible.current) {
        visible.current = true;
        dotEl.classList.add('cursor-dot--visible');
      }
    };

    const onOver = (e) => {
      if (!hover.current && e.target.closest(INTERACTIVE)) {
        hover.current = true;
        dotEl.classList.add('cursor-dot--hover');
      }
    };

    const onOut = (e) => {
      if (hover.current && e.target.closest(INTERACTIVE)) {
        hover.current = false;
        dotEl.classList.remove('cursor-dot--hover');
      }
    };

    const onLeave = () => {
      visible.current = false;
      dotEl.classList.remove('cursor-dot--visible');
    };

    const onEnter = () => {
      visible.current = true;
      dotEl.classList.add('cursor-dot--visible');
    };

    // Direct 1:1 position — no lag
    const animate = () => {
      dotEl.style.transform = `translate(${mouse.current.x}px, ${mouse.current.y}px)`;
      rafRef.current = requestAnimationFrame(animate);
    };

    document.addEventListener('mousemove',  onMove,  { passive: true });
    document.addEventListener('mouseover',  onOver,  { passive: true });
    document.addEventListener('mouseout',   onOut,   { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
    document.addEventListener('mouseenter', onEnter, { passive: true });

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      document.body.classList.remove('cursor-active');
      document.removeEventListener('mousemove',  onMove);
      document.removeEventListener('mouseover',  onOver);
      document.removeEventListener('mouseout',   onOut);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Don't mount on touch devices
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
    return null;
  }

  return <div ref={dotRef} className="cursor-dot" aria-hidden="true" />;
}
