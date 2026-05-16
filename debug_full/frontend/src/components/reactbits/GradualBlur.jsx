import './GradualBlur.css';

/* Page background color — matches --bg-1 from global.css */
const BG = '7, 17, 31';

/**
 * GradualBlur — a single gradient overlay that fades content into
 * the page background. Uses a CSS gradient (not backdrop-filter layers)
 * to avoid visible banding artifacts.
 *
 * direction: 'top' | 'bottom'
 * height: CSS height string or number (px)
 * opacity: 0–1 (how opaque the fade endpoint is)
 * style: extra inline styles (for positioning overrides)
 */
export default function GradualBlur({
  direction = 'bottom',
  height = '4rem',
  opacity = 0.9,
  style = {},
}) {
  const isBottom = direction === 'bottom';

  return (
    <div
      className="gradual-blur-fade"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        [isBottom ? 'bottom' : 'top']: 0,
        height,
        background: isBottom
          ? `linear-gradient(to bottom, transparent 0%, rgba(${BG}, ${opacity}) 100%)`
          : `linear-gradient(to top, transparent 0%, rgba(${BG}, ${opacity}) 100%)`,
        zIndex: 2,
        ...style,
      }}
    />
  );
}
