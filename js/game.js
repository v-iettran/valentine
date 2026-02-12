/**
 * Valentine experience — state machine, particles, heart, choices, fireworks, reveal
 * States: 0 Idle | 1 Holding | 2 Collapse | 3 Explosion→Question | 4 Choice | 5 Final
 */

(function () {
  'use strict';

  const STATE = { IDLE: 0, HOLDING: 1, COLLAPSE: 2, EXPLOSION: 3, CHOICE: 4, FINAL: 5 };

  const CONFIG = {
    particleCount: Math.min(1200, Math.floor((window.innerWidth * window.innerHeight) / 1200)),
    minHoldMs: 2000,
    heartFormDurationMs: 1800,
    collapsePauseMs: 1000,
    implodeMs: 280,
    explodeMs: 600,
    questionFadeInMs: 1000,
    noShrinkDurationMs: 300,
    sparkleMs: 2400,
    dyeFadeMs: 2200,
    fireworkDurationMs: 3800,
    fireworkBurstCount: 8,
    fireworkParticlesPerBurst: 150,
    fireworkVelocityMin: 3,
    fireworkVelocityMax: 7,
    fireworkGravity: 0.05,
    promptText: { hold: 'Press and hold', release: 'Release' },
    questionText: 'Will you be my Valentine?',
    heartGravity: 0.003,
    heartPullMin: 0.003,
    heartPullMax: 0.0055,
    heartSuction: 0.02,
    heartSwirl: 0.003,
    heartOrbitSpeed: 0.0006,
    heartDamp: 0.96,
    heartNoise: 0.03,
    heartChaos: 0.06,
  };

  const NO_TEASER_TEXTS = [
    'Are you sure?',
    'I spent 2 hours making this...',
    'How about yes?',
    'CHOOSE YES.',
    'Oops...',
  ];

  const NO_SCALES = [0.85, 0.7, 0.5, 0.35, 0.2];

  let canvas, ctx;
  let width, height;
  let particles = [];
  let heartPoints = [];
  let heartBoundaryPoints = [];
  let state = STATE.IDLE;
  let holdStartTime = 0;
  let releaseStartTime = 0;
  let collapsePauseStartTime = 0;
  let dyeStartTime = 0;
  let pointerX = 0;
  let pointerY = 0;
  let heartCenterX = 0;
  let heartCenterY = 0;
  let explosionCenterX = 0;
  let explosionCenterY = 0;
  let promptEl, choiceSection, choiceQuestion, noTeaser, btnYes, btnNo, btnFinal;
  let choiceGifWrap, choiceGifEls;
  let modalOverlay, modalClose, revealScreen, revealContent, revealImageWrap, chosenWisely;
  let appRoot;
  let noClickCount = 0;
  let isPointerDown = false;
  let rafId = null;
  let fireworkCanvas, fireworkCtx;
  let fireworkParticles = [];
  let fireworkStartTime = 0;
  let transitionToFinalStartTime = 0;
  const FADE_TO_FINAL_DURATION_MS = 1800;

  const HEART_NORM = 18;

  function organicHeartXY(t, radius, seed) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const nx = x / 16;
    const ny = y / 16;
    const wobble = 0.06 * (Math.sin(5 * t + seed) * 0.5 + Math.sin(3 * t + seed * 1.7) * 0.5);
    const r = radius * (1 + wobble);
    const asym = 0.04 * Math.sin(t + 0.8);
    return {
      x: (nx * r * (1 + asym) * HEART_NORM),
      y: (ny * r * HEART_NORM),
    };
  }

  function sampleHeartPoint() {
    const t = Math.random() * Math.PI * 2;
    const r = 0.22 + Math.random() * 0.76;
    const seed = Math.random() * 100;
    return organicHeartXY(t, r, seed);
  }

  function buildHeartPoints(count) {
    const points = [];
    const numLayers = 16;
    const layerRadii = [];
    let totalWeight = 0;
    for (let layer = 0; layer < numLayers; layer++) {
      const radius = 0.18 + (1 - layer / numLayers) * 0.82;
      layerRadii.push(radius);
      totalWeight += 2 - radius;
    }
    for (let layer = 0; layer < numLayers; layer++) {
      const radius = layerRadii[layer];
      const pointsInLayer = Math.max(1, Math.round(count * (2 - radius) / totalWeight));
      const seed = layer * 7.3;
      for (let i = 0; i < pointsInLayer && points.length < count; i++) {
        const t = (i / pointsInLayer) * Math.PI * 2 + 0.02 * Math.sin(layer + i);
        points.push(organicHeartXY(t, radius, seed + i * 0.1));
      }
    }
    while (points.length < count) {
      points.push(sampleHeartPoint());
    }
    return points.slice(0, count);
  }

  function heartOutlineAt(t, radius) {
    const sinT = Math.sin(t);
    const cosT = Math.cos(t);
    const x = 16 * Math.pow(sinT, 3);
    const y = -(13 * cosT - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const nx = (x / 16) * radius * HEART_NORM;
    const ny = (y / 16) * radius * HEART_NORM;
    const dxdt = 48 * Math.pow(sinT, 2) * cosT;
    const dydt = 13 * sinT - 10 * Math.sin(2 * t) + 6 * Math.sin(3 * t) + 4 * Math.sin(4 * t);
    const len = Math.hypot(dxdt, dydt) || 1;
    return { x: nx, y: ny, tx: dxdt / len, ty: dydt / len };
  }

  function buildHeartBoundaryPoints() {
    const pts = [];
    const numHearts = 100;
    const pointsPerHeart = 150;
    const rMin = 0.38, rMax = 0.98;
    const gap = (rMax - rMin) / (numHearts - 1);
    for (let h = 0; h < numHearts; h++) {
      const r = rMin + h * gap;
      for (let k = 0; k < pointsPerHeart; k++) {
        const t = (k / pointsPerHeart) * Math.PI * 2;
        pts.push(heartOutlineAt(t, r));
      }
    }
    return pts;
  }

  const MAX_PARTICLES = 2800;
  const SPAWN_INTERVAL_MS = 120;
  let lastSpawnTime = 0;

  function createParticle(i) {
    const baseX = Math.random() * width;
    const baseY = Math.random() * height;
    const colorType = Math.random() < 0.75 ? (Math.random() < 0.85 ? 0 : 1) : 2;
    return {
      x: baseX,
      y: baseY,
      vx: 0,
      vy: 0,
      baseX,
      baseY,
      phase: Math.random() * Math.PI * 2,
      angle: Math.random() * Math.PI * 2,
      angleSpeed: 0.0002 + Math.random() * 0.0004,
      driftRadius: 25 + Math.random() * 50,
      orbitRadius: 80 + Math.random() * Math.min(width, height) * 0.35,
      orbitSpeed: 0.00015 + Math.random() * 0.0002,
      size: 1.0 + Math.random() * 1.4,
      alpha: 0.5 + Math.random() * 0.5,
      colorType,
      pinkFactor: 0,
    };
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < CONFIG.particleCount; i++) {
      particles.push(createParticle(i));
    }
    heartPoints = buildHeartPoints(CONFIG.particleCount);
    heartBoundaryPoints = buildHeartBoundaryPoints();
  }

  function spawnParticle() {
    if (particles.length >= MAX_PARTICLES) return;
    particles.push(createParticle(particles.length));
  }

  const orbitCenterX = () => width / 2;
  const orbitCenterY = () => height / 2;

  function updateFloat(p, t) {
    p.angle += p.angleSpeed * (0.7 + Math.sin(t * 0.0003 + p.phase) * 0.3);
    const dx = Math.cos(p.angle) * p.driftRadius * 0.012;
    const dy = Math.sin(p.angle) * p.driftRadius * 0.012;
    const ocx = orbitCenterX();
    const ocy = orbitCenterY();
    const orbitAngle = (t * p.orbitSpeed + p.phase) % (Math.PI * 2);
    const ox = ocx + Math.cos(orbitAngle) * p.orbitRadius * 0.12;
    const oy = ocy + Math.sin(orbitAngle) * p.orbitRadius * 0.12;
    const wobble = 0.006;
    const wx = Math.sin(t * 0.0005 + p.phase * 2) * wobble * 50;
    const wy = Math.cos(t * 0.0004 + p.phase * 1.3) * wobble * 50;
    p.baseX += dx + wx + (ox - p.baseX) * 0.002;
    p.baseY += dy + wy + (oy - p.baseY) * 0.002;
    p.x = p.baseX + (p.x - p.baseX) * 0.996;
    p.y = p.baseY + (p.y - p.baseY) * 0.996;
    pushTrail(p);
  }

  const CONDENSE_DURATION_MS = 3500;
  const HEART_LINE_FLOW = 0.14;

  /** While holding: pull particles into heart shape at center */
  function updateToHeart(p, i, progress, now, elapsed) {
    const pt = heartBoundaryPoints[i % heartBoundaryPoints.length];
    const scale = Math.min(width, height) * 1.22 / HEART_NORM;
    const condenseProgress = elapsed > CONFIG.heartFormDurationMs
      ? Math.min(1, (elapsed - CONFIG.heartFormDurationMs) / CONDENSE_DURATION_MS)
      : 0;
    const condense = 1 - condenseProgress * 0.14;
    const breathe = 1 + 0.012 * Math.sin(now * 0.0018 + pt.x * 0.05) * Math.cos(now * 0.0012 + pt.y * 0.05);
    const tx = heartCenterX + pt.x * scale * condense * breathe;
    const ty = heartCenterY + pt.y * scale * condense * breathe;
    const pull = progress >= 1
      ? CONFIG.heartPullMin * 1.3 + (CONFIG.heartPullMax - CONFIG.heartPullMin) * 0.7
      : CONFIG.heartPullMin + (CONFIG.heartPullMax - CONFIG.heartPullMin) * Math.min(1, progress * 1.2);
    const toTargetX = tx - p.x;
    const toTargetY = ty - p.y;
    const distToTarget = Math.hypot(toTargetX, toTargetY) || 0.001;
    const invDist = 1 / distToTarget;
    const nx = toTargetX * invDist;
    const ny = toTargetY * invDist;
    const distToCenter = Math.hypot(p.x - heartCenterX, p.y - heartCenterY) || 0.001;
    const suction = CONFIG.heartSuction * (1 + 30 / (distToTarget * 0.02 + 1));
    p.vx += nx * suction;
    p.vy += ny * suction;
    const curveRadius = Math.min(width, height) * 0.42;
    const curveFactor = Math.min(1, distToCenter / curveRadius);
    const perpX = -ny;
    const perpY = nx;
    p.vx += perpX * CONFIG.heartSwirl * (0.3 + 0.7 * curveFactor);
    p.vy += perpY * CONFIG.heartSwirl * (0.3 + 0.7 * curveFactor);
    const orbitDx = p.x - heartCenterX;
    const orbitDy = p.y - heartCenterY;
    if (p.orbitDir === undefined) p.orbitDir = Math.random() > 0.5 ? 1 : -1;
    const orbitMult = (0.5 + (i % 9) * 0.06) * p.orbitDir * curveFactor;
    p.vx += -orbitDy * CONFIG.heartOrbitSpeed * orbitMult;
    p.vy += orbitDx * CONFIG.heartOrbitSpeed * orbitMult;
    p.vx += (tx - p.x) * pull;
    p.vy += (ty - p.y) * pull;
    p.vx += pt.tx * HEART_LINE_FLOW * (0.4 + 0.6 * Math.min(1, progress * 1.5));
    p.vy += pt.ty * HEART_LINE_FLOW * (0.4 + 0.6 * Math.min(1, progress * 1.5));
    p.vy += CONFIG.heartGravity;
    const heartRadius = Math.min(width, height) * 0.2;
    const nearHeart = Math.max(0, 1 - distToCenter / heartRadius);
    p.pinkFactor = Math.min(1, p.pinkFactor + nearHeart * 0.08);
    p.vx += Math.sin(now * 0.0015 + p.phase) * CONFIG.heartNoise;
    p.vy += Math.cos(now * 0.0012 + p.phase * 1.2) * CONFIG.heartNoise;
    p.vx += Math.sin(now * 0.002 + i * 0.5) * CONFIG.heartChaos;
    p.vy += Math.cos(now * 0.0018 + p.phase) * CONFIG.heartChaos;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= CONFIG.heartDamp;
    p.vy *= CONFIG.heartDamp;
    pushTrail(p);
  }

  /** Collapse into a single dot at center (not heart) */
  function updateImplode(p, progress) {
    const pull = 0.32;
    p.x += (explosionCenterX - p.x) * pull;
    p.y += (explosionCenterY - p.y) * pull;
    pushTrail(p);
  }

  /** Explosion: move straight outward from center, no change in direction (fixed projection). Speed reduced 20%. */
  function updateExplode(p, i, progress) {
    if (p.splashAngle === undefined) {
      p.splashAngle = Math.random() * Math.PI * 2;
      p.splashSpeed = (3 + Math.random() * 4) * 0.45;
    }
    const maxDist = Math.min(width, height) * 0.7;
    const dist = progress * maxDist * p.splashSpeed;
    p.x = explosionCenterX + Math.cos(p.splashAngle) * dist;
    p.y = explosionCenterY + Math.sin(p.splashAngle) * dist;
    pushTrail(p);
  }

  const TRAIL_LEN = 14;

  function pushTrail(p) {
    if (!p.trail) p.trail = [];
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > TRAIL_LEN) p.trail.shift();
  }

  function updateSparkle(p, i, t) {
    if (!p.sparkleVx) {
      p.sparkleVx = (Math.random() - 0.5) * 0.4;
      p.sparkleVy = (Math.random() - 0.5) * 0.4;
    }
    const drift = 0.12;
    p.sparkleVx += Math.sin(t * 0.0012 + p.phase) * drift + (Math.random() - 0.5) * 0.08;
    p.sparkleVy += Math.cos(t * 0.001 + p.phase * 1.2) * drift + (Math.random() - 0.5) * 0.08;
    p.sparkleVx *= 0.98;
    p.sparkleVy *= 0.98;
    p.x += p.sparkleVx;
    p.y += p.sparkleVy;
    pushTrail(p);
  }

  /** Draw shooting-star style tail: fade from head to tail */
  function drawParticleTrail(p, dyeProgress) {
    if (!p.trail || p.trail.length < 2) return;
    const d = typeof dyeProgress === 'number' ? dyeProgress : 0;
    for (let k = 0; k < p.trail.length - 1; k++) {
      const t = k / (p.trail.length - 1);
      const a = (1 - t) * 0.35 * p.alpha * (1 - t * 0.7);
      ctx.strokeStyle = particleColor(p, a, d);
      ctx.lineWidth = Math.max(0.6, (1 - t) * 1.8);
      ctx.beginPath();
      ctx.moveTo(p.trail[k].x, p.trail[k].y);
      ctx.lineTo(p.trail[k + 1].x, p.trail[k + 1].y);
      ctx.stroke();
    }
  }

  function particleColor(p, alpha, dyeProgress) {
    const pinkBlend = Math.min(1, (p.pinkFactor || 0) + (dyeProgress || 0) * 0.6);
    let r = 255, g = 255, b = 255;
    if (p.colorType === 1) { r = 200; g = 220; b = 255; }
    else if (p.colorType === 2) { r = 235; g = 200; b = 245; }
    r = r + (255 - r) * pinkBlend;
    g = g + (180 - g) * pinkBlend;
    b = b + (210 - b) * pinkBlend;
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
  }

  function drawParticle(p, i, t, dyeProgress) {
    const isSparkle = (state === STATE.EXPLOSION && (explosionPhase === 'sparkle' || explosionPhase === 'question'));
    const phaseLabel = state === STATE.HOLDING ? 'toHeart' : '';
    const glow = phaseLabel === 'toHeart' ? 1.5 : 1;
    const d = typeof dyeProgress === 'number' ? dyeProgress : 0;
    /* Shooting-star tail behind every moving particle */
    drawParticleTrail(p, d);
    if (isSparkle) {
      const sizeFlicker = 0.72 + 0.56 * Math.sin(t * 0.0038 + p.phase) * Math.cos(t * 0.0021 + i * 0.5);
      const brightFlicker = 0.55 + 0.5 * Math.sin(t * 0.0042 + p.phase * 1.3) * Math.cos(t * 0.0027 + i * 0.7);
      ctx.fillStyle = particleColor(p, p.alpha * brightFlicker, d);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * sizeFlicker, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const size = p.size * glow;
    ctx.fillStyle = particleColor(p, p.alpha * 0.95, d);
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
    if (glow > 1 && state === STATE.HOLDING) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = particleColor(p, 0.12 * p.alpha, d);
      ctx.fill();
    }
  }

  function triggerScreenShake() {
    if (appRoot) appRoot.classList.add('screen-shake');
    setTimeout(() => {
      if (appRoot) appRoot.classList.remove('screen-shake');
    }, 600);
  }

  let explosionPhase = 'implode'; // implode | pause | explode | sparkle | question

  function tick(now) {
    if (!ctx || !width || !height) return;
    const t = now;

    if (state === STATE.IDLE) {
      if (t - lastSpawnTime >= SPAWN_INTERVAL_MS) {
        lastSpawnTime = t;
        spawnParticle();
      }
      particles.forEach((p, i) => updateFloat(p, t));
    } else if (state === STATE.HOLDING) {
      const elapsed = t - holdStartTime;
      const progress = Math.min(1, elapsed / CONFIG.heartFormDurationMs);
      if (t - lastSpawnTime >= SPAWN_INTERVAL_MS) {
        lastSpawnTime = t;
        spawnParticle();
      }
      if (promptEl && elapsed >= CONFIG.minHoldMs && promptEl.textContent !== CONFIG.promptText.release) {
        promptEl.textContent = CONFIG.promptText.release;
        promptEl.classList.add('ready');
      }
      particles.forEach((p, i) => updateToHeart(p, i, progress, t, elapsed));
    } else if (state === STATE.COLLAPSE) {
      const elapsed = t - releaseStartTime;
      if (explosionPhase === 'implode') {
        const progress = Math.min(1, elapsed / CONFIG.implodeMs);
        particles.forEach((p) => updateImplode(p, progress));
        if (progress >= 1) {
          explosionPhase = 'pause';
          collapsePauseStartTime = t;
        }
      } else if (explosionPhase === 'pause') {
        const pauseElapsed = t - collapsePauseStartTime;
        if (pauseElapsed >= CONFIG.collapsePauseMs) {
          explosionPhase = 'explode';
          releaseStartTime = t;
          state = STATE.EXPLOSION;
          triggerScreenShake();
        }
      }
    } else if (state === STATE.EXPLOSION) {
      const elapsed = t - releaseStartTime;
      if (explosionPhase === 'explode') {
        const progress = Math.min(1, elapsed / CONFIG.explodeMs);
        particles.forEach((p, i) => updateExplode(p, i, progress));
        if (progress >= 1) {
          explosionPhase = 'sparkle';
          releaseStartTime = t;
          particles.forEach((p) => { p.trail = []; });
        }
      } else if (explosionPhase === 'sparkle') {
        particles.forEach((p, i) => updateSparkle(p, i, t));
        if (elapsed >= CONFIG.sparkleMs) {
          explosionPhase = 'question';
          releaseStartTime = t;
          showChoiceUI();
        }
      } else if (explosionPhase === 'question') {
        particles.forEach((p, i) => updateSparkle(p, i, t));
        const questionElapsed = t - releaseStartTime;
        if (choiceQuestion) {
          const op = Math.min(1, questionElapsed / CONFIG.questionFadeInMs);
          choiceQuestion.style.opacity = String(op);
          choiceQuestion.style.transform = `translateY(${8 * (1 - op)}px)`;
        }
        if (questionElapsed >= CONFIG.questionFadeInMs) {
          state = STATE.CHOICE;
        }
      }
    } else if (state === STATE.CHOICE) {
      particles.forEach((p, i) => updateSparkle(p, i, t));
      if (transitionToFinalStartTime > 0 && t - transitionToFinalStartTime >= FADE_TO_FINAL_DURATION_MS) {
        transitionToFinalStartTime = 0;
        state = STATE.FINAL;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        return;
      }
    }

    const isDyed = (state === STATE.COLLAPSE || state === STATE.EXPLOSION || state === STATE.CHOICE) && dyeStartTime > 0;
    const dyeProgress = isDyed ? Math.min(1, (t - dyeStartTime) / CONFIG.dyeFadeMs) : 0;

    if (state !== STATE.FINAL) {
      /* Same dark background for idle, holding, collapse, explosion, and choice */
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, '#050510');
      g.addColorStop(0.5, '#0a0820');
      g.addColorStop(1, '#0d0b28');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    if (state === STATE.HOLDING) {
      const r = Math.min(width, height) * 1.3;
      const g = ctx.createRadialGradient(heartCenterX, heartCenterY, 0, heartCenterX, heartCenterY, r);
      g.addColorStop(0, 'rgba(255, 200, 220, 0.2)');
      g.addColorStop(0.5, 'rgba(255, 160, 195, 0.08)');
      g.addColorStop(1, 'rgba(255, 120, 165, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    if (state === STATE.EXPLOSION && explosionPhase === 'sparkle') {
      const cx = width / 2;
      const cy = height / 2;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.55);
      grad.addColorStop(0, 'rgba(255, 185, 215, 0.06)');
      grad.addColorStop(0.5, 'rgba(255, 160, 195, 0.02)');
      grad.addColorStop(1, 'rgba(255, 130, 170, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
    if (state !== STATE.FINAL) {
      particles.forEach((p, i) => drawParticle(p, i, t, dyeProgress));
    }
    /* No pink overlay so explosion stays visible on dark background */
    rafId = requestAnimationFrame(tick);
  }

  function setChoiceGifVisible(index) {
    if (!choiceGifEls || !choiceGifEls.length) return;
    const i = Math.min(Math.max(0, index), choiceGifEls.length - 1);
    choiceGifEls.forEach((el, j) => el.classList.toggle('hidden', j !== i));
  }

  function showChoiceUI() {
    if (promptEl) promptEl.classList.add('hidden');
    if (choiceSection) {
      choiceSection.classList.remove('hidden');
      setChoiceGifVisible(0);
      if (choiceQuestion) {
        choiceQuestion.style.opacity = '0';
        choiceQuestion.style.transform = 'translateY(8px)';
      }
    }
  }

  function setPointerFromEvent(e) {
    const c = document.getElementById('particleCanvas');
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const scaleX = (width || rect.width) / rect.width;
    const scaleY = (height || rect.height) / rect.height;
    if (e.touches && e.touches.length) {
      pointerX = (e.touches[0].clientX - rect.left) * scaleX;
      pointerY = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      pointerX = (e.clientX - rect.left) * scaleX;
      pointerY = (e.clientY - rect.top) * scaleY;
    }
  }

  function startHold(e) {
    if (state !== STATE.IDLE) return;
    setPointerFromEvent(e);
    heartCenterX = pointerX;
    heartCenterY = pointerY;
    isPointerDown = true;
    state = STATE.HOLDING;
    holdStartTime = performance.now();
    lastSpawnTime = holdStartTime;
  }

  function releaseHold() {
    if (state !== STATE.HOLDING) return;
    isPointerDown = false;
    explosionCenterX = pointerX;
    explosionCenterY = pointerY;
    const held = performance.now() - holdStartTime;
    if (held < CONFIG.minHoldMs) {
      state = STATE.IDLE;
      if (promptEl) {
        promptEl.textContent = CONFIG.promptText.hold;
        promptEl.classList.remove('hidden', 'ready');
      }
      initParticles();
      return;
    }
    state = STATE.COLLAPSE;
    explosionPhase = 'implode';
    releaseStartTime = performance.now();
    dyeStartTime = performance.now();
    if (promptEl) promptEl.classList.add('hidden');
  }

  function setupInput() {
    const isButton = (e) => e.target && e.target.closest && e.target.closest('button');
    function onPointerDown(e) {
      if ((state === STATE.IDLE || state === STATE.HOLDING) && !isButton(e)) e.preventDefault();
      setPointerFromEvent(e);
      if (state === STATE.IDLE) {
        heartCenterX = pointerX;
        heartCenterY = pointerY;
        startHold(e);
      }
    }
    function onPointerMove(e) {
      setPointerFromEvent(e);
      if (state === STATE.HOLDING && isPointerDown) {
        heartCenterX = pointerX;
        heartCenterY = pointerY;
      }
    }
    function onPointerUp(e) {
      if (!isButton(e)) e.preventDefault();
      releaseHold();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('mouseleave', onPointerUp);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('blur', onPointerUp);
    document.addEventListener('touchstart', onPointerDown, { passive: false });
    document.addEventListener('touchmove', (e) => { e.preventDefault(); onPointerMove(e); }, { passive: false });
    document.addEventListener('touchend', onPointerUp, { passive: false });
    document.addEventListener('touchcancel', onPointerUp);
    window.addEventListener('touchend', onPointerUp, { passive: false });
    window.addEventListener('touchcancel', onPointerUp);
  }

  function openModal() {
    if (modalOverlay) modalOverlay.classList.remove('hidden');
  }

  function closeModal() {
    if (modalOverlay) modalOverlay.classList.add('hidden');
  }

  function onYesClick() {
    openModal();
  }

  function onNoClick(e) {
    e.preventDefault();
    if (!btnNo || !noTeaser) return;
    noClickCount++;
    setChoiceGifVisible(noClickCount);
    const idx = Math.min(noClickCount - 1, NO_TEASER_TEXTS.length - 1);
    noTeaser.textContent = NO_TEASER_TEXTS[idx];
    noTeaser.classList.remove('hidden');

    const scale = NO_SCALES[Math.min(noClickCount - 1, NO_SCALES.length - 1)];
    btnNo.style.setProperty('--no-scale', String(scale));
    btnNo.classList.add('no-btn-shake');
    setTimeout(() => btnNo.classList.remove('no-btn-shake'), CONFIG.noShrinkDurationMs);
    btnNo.style.transform = `scale(${scale})`;
    btnNo.style.transition = `transform ${CONFIG.noShrinkDurationMs}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;

    if (noClickCount === 4 && btnYes) {
      btnYes.classList.add('yes-pulse');
      setTimeout(() => btnYes.classList.remove('yes-pulse'), 1500);
    }

    if (noClickCount >= 5) {
      btnNo.style.opacity = '0';
      btnNo.style.pointerEvents = 'none';
      btnNo.style.visibility = 'hidden';
      btnNo.style.transform = 'scale(0)';
      setTimeout(() => {
        if (btnNo && btnNo.parentNode) btnNo.parentNode.removeChild(btnNo);
      }, CONFIG.noShrinkDurationMs + 50);
    }
  }

  const FIREWORK_TRAIL_LEN = 10;

  /** Hue ranges for variety: pink, coral, yellow, gold, mint, cyan, lavender, peach */
  const FIREWORK_HUE_RANGES = [
    [320, 360], [0, 25], [25, 55], [45, 75], [160, 200], [185, 220], [260, 300], [10, 45],
  ];
  function randomFireworkHue() {
    const range = FIREWORK_HUE_RANGES[Math.floor(Math.random() * FIREWORK_HUE_RANGES.length)];
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  function spawnFireworkBurst(cx, cy) {
    const count = CONFIG.fireworkParticlesPerBurst;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = CONFIG.fireworkVelocityMin + Math.random() * (CONFIG.fireworkVelocityMax - CONFIG.fireworkVelocityMin);
      fireworkParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        alpha: 0.9 + Math.random() * 0.1,
        hue: randomFireworkHue(),
        saturation: 0.55 + Math.random() * 0.4,
        lightness: 0.72 + Math.random() * 0.24,
        size: 1.2 + Math.random() * 1.2,
        trail: [],
      });
    }
  }

  let fireworkCssW = 0;
  let fireworkCssH = 0;

  function tickFireworks(now) {
    if (!fireworkCtx || !fireworkCanvas) return;
    const fw = fireworkCssW;
    const fh = fireworkCssH;
    const elapsed = now - fireworkStartTime;

    if (elapsed < 0) {
      requestAnimationFrame(tickFireworks);
      return;
    }

    const burstInterval = CONFIG.fireworkDurationMs / CONFIG.fireworkBurstCount;
    const burstIndex = Math.floor(elapsed / burstInterval);
    if (burstIndex < CONFIG.fireworkBurstCount && elapsed >= burstIndex * burstInterval && elapsed < burstIndex * burstInterval + 50) {
      /* Random position on screen with margin */
      const margin = 0.15;
      const cx = margin * fw + Math.random() * (1 - 2 * margin) * fw;
      const cy = margin * fh + Math.random() * (1 - 2 * margin) * fh;
      spawnFireworkBurst(cx, cy);
    }

    fireworkCtx.clearRect(0, 0, fw, fh);

    fireworkParticles.forEach((p, i) => {
      p.vx *= 0.99;
      p.vy += CONFIG.fireworkGravity;
      p.x += p.vx;
      p.y += p.vy;
      p.alpha = Math.max(0, p.alpha - 0.012);
      if (!p.trail) p.trail = [];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > FIREWORK_TRAIL_LEN) p.trail.shift();
      if (p.alpha <= 0) {
        fireworkParticles.splice(i, 1);
        return;
      }
      const [r, g, b] = hslToRgb(p.hue / 360, p.saturation ?? 0.8, p.lightness ?? 0.75);
      /* Draw tail (shooting star style) */
      if (p.trail.length >= 2) {
        for (let k = 0; k < p.trail.length - 1; k++) {
          const t = k / (p.trail.length - 1);
          const tailAlpha = (1 - t) * 0.4 * p.alpha * (1 - t * 0.6);
          fireworkCtx.strokeStyle = `rgba(${r},${g},${b},${tailAlpha})`;
          fireworkCtx.lineWidth = Math.max(0.5, (1 - t) * 2);
          fireworkCtx.beginPath();
          fireworkCtx.moveTo(p.trail[k].x, p.trail[k].y);
          fireworkCtx.lineTo(p.trail[k + 1].x, p.trail[k + 1].y);
          fireworkCtx.stroke();
        }
      }
      fireworkCtx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`;
      fireworkCtx.beginPath();
      fireworkCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      fireworkCtx.fill();
    });

    if (elapsed < CONFIG.fireworkDurationMs || fireworkParticles.length > 0) {
      requestAnimationFrame(tickFireworks);
    } else {
      if (revealContent) revealContent.classList.add('reveal-visible');
      if (chosenWisely) {
        chosenWisely.classList.remove('hidden');
      }
    }
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function onFinalClick() {
    transitionToFinalStartTime = performance.now();
    if (choiceSection) choiceSection.classList.add('choice-fade-out');
    if (revealScreen) {
      revealScreen.classList.remove('hidden');
      revealScreen.classList.add('reveal-fade-in');
    }
    setTimeout(() => {
      if (choiceSection) choiceSection.classList.add('hidden');
    }, 400);
    requestAnimationFrame(() => {
      fireworkCanvas = document.getElementById('fireworkCanvas');
      if (fireworkCanvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        fireworkCssW = fireworkCanvas.offsetWidth;
        fireworkCssH = fireworkCanvas.offsetHeight;
        fireworkCanvas.width = fireworkCssW * dpr;
        fireworkCanvas.height = fireworkCssH * dpr;
        fireworkCanvas.style.width = fireworkCssW + 'px';
        fireworkCanvas.style.height = fireworkCssH + 'px';
        fireworkCtx = fireworkCanvas.getContext('2d');
        fireworkCtx.scale(dpr, dpr);
      }
      fireworkParticles = [];
      fireworkStartTime = performance.now();
      tickFireworks(fireworkStartTime);
    });
  }

  function resize() {
    canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    if (state === STATE.IDLE) initParticles();
  }

  function init() {
    appRoot = document.getElementById('app');
    promptEl = document.getElementById('promptText');
    choiceSection = document.getElementById('choiceSection');
    choiceGifWrap = document.getElementById('choiceGifWrap');
    choiceGifEls = choiceGifWrap ? Array.from(choiceGifWrap.querySelectorAll('.choice-gif')) : [];
    choiceQuestion = document.getElementById('choiceQuestion');
    noTeaser = document.getElementById('noTeaser');
    btnYes = document.getElementById('btnYes');
    btnNo = document.getElementById('btnNo');
    btnFinal = document.getElementById('btnFinal');
    modalOverlay = document.getElementById('modalOverlay');
    modalClose = document.getElementById('modalClose');
    revealScreen = document.getElementById('revealScreen');
    revealContent = document.getElementById('revealContent');
    revealImageWrap = document.getElementById('revealImageWrap');
    chosenWisely = document.getElementById('chosenWisely');

    resize();
    pointerX = width / 2;
    pointerY = height / 2;
    heartCenterX = pointerX;
    heartCenterY = pointerY;
    explosionCenterX = pointerX;
    explosionCenterY = pointerY;
    window.addEventListener('resize', resize);
    setupInput();

    if (btnYes) btnYes.addEventListener('click', onYesClick);
    if (btnNo) {
      btnNo.style.setProperty('--no-scale', '1');
      btnNo.addEventListener('click', onNoClick);
    }
    if (btnFinal) btnFinal.addEventListener('click', onFinalClick);
    if (modalClose) modalClose.addEventListener('click', closeModal);

    rafId = requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
