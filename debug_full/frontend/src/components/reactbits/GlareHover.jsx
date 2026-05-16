import './GlareHover.css';

export default function GlareHover({
  children,
  className = '',
  glareOpacity = 0.18,
  glareAngle = -28,
  glareSize = 260,
  transitionDuration = 850,
  style = {},
  ...props
}) {
  return (
    <div
      className={`glare-hover ${className}`}
      style={{
        '--glare-opacity': glareOpacity,
        '--glare-angle': `${glareAngle}deg`,
        '--glare-size': glareSize,
        '--glare-duration': `${transitionDuration}ms`,
        ...style,
      }}
      {...props}
    >
      {children}
      {/* Beam is last child → paints on top of children without z-index fights */}
      <span className="glare-hover-beam" aria-hidden="true" />
    </div>
  );
}
