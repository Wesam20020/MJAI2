import { useEffect, useRef } from 'react';
import {
  Clock, Mesh, OrthographicCamera, PlaneGeometry,
  Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer,
} from 'three';
import './FloatingLines.css';

const vertexShader = `
precision highp float;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3  iResolution;
uniform float animationSpeed;

uniform bool enableTop;
uniform bool enableMiddle;
uniform bool enableBottom;

uniform int topLineCount;
uniform int middleLineCount;
uniform int bottomLineCount;

uniform float topLineDistance;
uniform float middleLineDistance;
uniform float bottomLineDistance;

uniform vec3 topWavePosition;
uniform vec3 middleWavePosition;
uniform vec3 bottomWavePosition;

uniform vec2 iMouse;
uniform bool interactive;
uniform float bendRadius;
uniform float bendStrength;
uniform float bendInfluence;

uniform bool parallax;
uniform float parallaxStrength;
uniform vec2 parallaxOffset;

uniform vec3 lineGradient[8];
uniform int lineGradientCount;

const vec3 BLACK = vec3(0.0);
const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;
const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;

mat2 rotate(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

vec3 background_color(vec2 uv) {
  vec3 col = vec3(0.0);
  float y = sin(uv.x - 0.2) * 0.3 - 0.1;
  float m = uv.y - y;
  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
  return col * 0.5;
}

const int MAX_GRADIENT_STOPS = 8;

float wave(vec2 uv, float freq, vec2 baseUv, vec2 mouseUv, bool interactive) {
  float wave = sin(uv.x * freq + iTime * animationSpeed);
  
  if (interactive) {
    float dist = distance(baseUv, mouseUv);
    if (dist < bendRadius) {
      float influence = 1.0 - (dist / bendRadius);
      wave += influence * bendStrength * bendInfluence;
    }
  }
  
  return wave;
}

vec3 getLineColor(float t, vec3 baseColor) {
  if (lineGradientCount <= 0) return baseColor;
  if (lineGradientCount == 1) return lineGradient[0] * 0.5;
  float clampedT = clamp(t, 0.0, 0.9999);
  float scaled = clampedT * float(lineGradientCount - 1);
  int idx = int(floor(scaled));
  float f = fract(scaled);
  int idx2 = min(idx + 1, lineGradientCount - 1);
  return mix(lineGradient[idx], lineGradient[idx2], f) * 0.5;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / min(iResolution.y, iResolution.x);
  vec2 baseUv = gl_FragCoord.xy / iResolution.xy;
  vec2 mouseUv = iMouse / iResolution.xy;
  
  if (parallax) {
    uv += parallaxOffset * parallaxStrength;
  }

  vec3 col = background_color(uv);

  if (enableBottom) {
    float angle = bottomWavePosition.z * log(length(uv) + 1.0);
    vec2 ruv = rotate(angle) * uv;
    for (int i = 0; i < 15; i++) {
      if (i >= bottomLineCount) break;
      float fi = float(i);
      vec3 lineCol = getLineColor(fi / float(bottomLineCount), BLUE);
      col += lineCol * wave(ruv + vec2(bottomLineDistance * 0.01 * fi + bottomWavePosition.x, bottomWavePosition.y), 1.5 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.2;
    }
  }

  if (enableMiddle) {
    float angle = middleWavePosition.z * log(length(uv) + 1.0);
    vec2 ruv = rotate(angle) * uv;
    for (int i = 0; i < 15; i++) {
      if (i >= middleLineCount) break;
      float fi = float(i);
      vec3 lineCol = getLineColor(fi / float(middleLineCount), BLUE);
      col += lineCol * wave(ruv + vec2(middleLineDistance * 0.01 * fi + middleWavePosition.x, middleWavePosition.y), 2.0 + 0.15 * fi, baseUv, mouseUv, interactive);
    }
  }

  if (enableTop) {
    float angle = topWavePosition.z * log(length(uv) + 1.0);
    vec2 ruv = rotate(angle) * uv;
    for (int i = 0; i < 15; i++) {
      if (i >= topLineCount) break;
      float fi = float(i);
      vec3 lineCol = getLineColor(fi / float(topLineCount), PINK);
      col += lineCol * wave(ruv + vec2(topLineDistance * 0.01 * fi + topWavePosition.x, topWavePosition.y), 1.0 + 0.2 * fi, baseUv, mouseUv, interactive) * 0.1;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export default function FloatingLines({
  linesGradient,
  enabledWaves = ['top', 'middle', 'bottom'],
  lineCount = [6],
  lineDistance = [5],
  topWavePosition,
  middleWavePosition,
  bottomWavePosition = { x: 2.0, y: -0.7, rotate: -1 },
  animationSpeed = 1,
  interactive = true,
  bendRadius = 5.0,
  bendStrength = -0.5,
  mouseDamping = 0.05,
  parallax = true,
  parallaxStrength = 0.2,
  mixBlendMode = 'screen',
}) {
  const containerRef = useRef(null);

  const targetMouseRef = useRef(new Vector2(-1000, -1000));
  const currentMouseRef = useRef(new Vector2(-1000, -1000));
  const targetInfluenceRef = useRef(0);
  const currentInfluenceRef = useRef(0);
  const targetParallaxRef = useRef(new Vector2(0, 0));
  const currentParallaxRef = useRef(new Vector2(0, 0));

  const getCount = (waveType) => {
    if (typeof lineCount === 'number') return lineCount;
    const idx = enabledWaves.indexOf(waveType);
    return idx >= 0 ? (lineCount[idx] ?? 6) : 0;
  };
  const getDist = (waveType) => {
    if (typeof lineDistance === 'number') return lineDistance;
    const idx = enabledWaves.indexOf(waveType);
    return idx >= 0 ? (lineDistance[idx] ?? 5) : 5;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let active = true;
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Vector3(1, 1, 1) },
      animationSpeed: { value: animationSpeed },
      enableTop: { value: enabledWaves.includes('top') },
      enableMiddle: { value: enabledWaves.includes('middle') },
      enableBottom: { value: enabledWaves.includes('bottom') },
      topLineCount: { value: enabledWaves.includes('top') ? getCount('top') : 0 },
      middleLineCount: { value: enabledWaves.includes('middle') ? getCount('middle') : 0 },
      bottomLineCount: { value: enabledWaves.includes('bottom') ? getCount('bottom') : 0 },
      topLineDistance: { value: (enabledWaves.includes('top') ? getDist('top') : 5) * 0.01 },
      middleLineDistance: { value: (enabledWaves.includes('middle') ? getDist('middle') : 5) * 0.01 },
      bottomLineDistance: { value: (enabledWaves.includes('bottom') ? getDist('bottom') : 5) * 0.01 },
      topWavePosition: { value: new Vector3(topWavePosition?.x ?? 10.0, topWavePosition?.y ?? 0.5, topWavePosition?.rotate ?? -0.4) },
      middleWavePosition: { value: new Vector3(middleWavePosition?.x ?? 5.0, middleWavePosition?.y ?? 0.0, middleWavePosition?.rotate ?? 0.2) },
      bottomWavePosition: { value: new Vector3(bottomWavePosition?.x ?? 2.0, bottomWavePosition?.y ?? -0.7, bottomWavePosition?.rotate ?? 0.4) },
      iMouse: { value: new Vector2(-1000, -1000) },
      interactive: { value: interactive },
      bendRadius: { value: bendRadius },
      bendStrength: { value: bendStrength },
      bendInfluence: { value: 0 },
      parallax: { value: parallax },
      parallaxStrength: { value: parallaxStrength },
      parallaxOffset: { value: new Vector2(0, 0) },
      lineGradient: { value: Array.from({ length: MAX_GRADIENT_STOPS }, () => new Vector3(1, 1, 1)) },
      lineGradientCount: { value: 0 },
    };

    if (linesGradient?.length > 0) {
      const stops = linesGradient.slice(0, MAX_GRADIENT_STOPS);
      uniforms.lineGradientCount.value = stops.length;
      stops.forEach((c, idx) => {
        uniforms.lineGradient.value[idx].set(c.r, c.g, c.b);
      });
    }

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
    });
    canvas.style.mixBlendMode = mixBlendMode;

    const mesh = new Mesh(new PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const clock = new Clock();
    const animate = () => {
      if (!active) return;
      rafId = requestAnimationFrame(animate);
      uniforms.iTime.value = clock.getElapsedTime();
      currentMouseRef.current.lerp(targetMouseRef.current, mouseDamping);
      currentInfluenceRef.current += (targetInfluenceRef.current - currentInfluenceRef.current) * mouseDamping;
      uniforms.iMouse.value.copy(currentMouseRef.current);
      uniforms.bendInfluence.value = currentInfluenceRef.current;
      if (parallax) {
        currentParallaxRef.current.lerp(targetParallaxRef.current, 0.1);
        uniforms.parallaxOffset.value.copy(currentParallaxRef.current);
      }
      renderer.render(scene, camera);
    };
    let rafId;
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      uniforms.iResolution.value.set(w, h, 1);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      targetMouseRef.current.set(e.clientX - rect.left, rect.bottom - e.clientY);
      targetInfluenceRef.current = 1;
    };
    const handleMouseLeave = () => {
      targetInfluenceRef.current = 0;
    };
    if (interactive) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    if (parallax) {
      const handleScroll = () => {
        const scrolled = window.scrollY;
        targetParallaxRef.current.set(0, scrolled * 0.05);
      };
      window.addEventListener('scroll', handleScroll);
      return () => {
        active = false;
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
      };
    }

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
  }, [animationSpeed, bendRadius, bendStrength, enabledWaves, interactive, linesGradient, mixBlendMode, mouseDamping, parallax, parallaxStrength, topWavePosition, middleWavePosition, bottomWavePosition]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
