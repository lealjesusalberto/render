// Main Controller: Hand Tracking, Visuals & Interaction Loop

(function () {
  'use strict';

  // Elements
  const videoElement = document.getElementById('video-element');
  const canvasElement = document.getElementById('output-canvas');
  const ctx = canvasElement.getContext('2d');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');

  // HUD Elements
  const fpsDisplay = document.getElementById('fps-val');
  const handsCountDisplay = document.getElementById('hands-count');
  const gestureLabel = document.getElementById('gesture-label');
  const gestureIcon = document.getElementById('gesture-icon');
  const statusDot = document.getElementById('status-dot');

  // Control Elements
  const modeTabs = document.querySelectorAll('.mode-tab');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const lineWidthSlider = document.getElementById('line-width-slider');
  const cameraOpacitySlider = document.getElementById('camera-opacity-slider');
  const audioToggleBtn = document.getElementById('audio-toggle-btn');
  const clearBtn = document.getElementById('clear-btn');
  const snapshotBtn = document.getElementById('snapshot-btn');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const hudSidebar = document.getElementById('hud-sidebar');

  // State
  let currentMode = 'aircanvas'; // 'aircanvas' | 'wireframe3d' | 'harp' | 'grid' | 'beams'
  let activeColor = '#00f3ff';
  let lineWidth = 4;
  let cameraOpacity = 0.85;
  let lastFrameTime = performance.now();
  let frameCount = 0;
  let fps = 0;
  let handsData = [];
  let isVideoReady = false;

  // Hand Connections for Skeleton drawing
  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [9, 13], [13, 14], [14, 15], [15, 16], // Ring
    [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [0, 17]                               // Palm base
  ];

  // Initialize Engines
  const recognizer = new window.GestureRecognizer();
  let harpEngine = null;
  let gridEngine = null;
  let airCanvas = new window.AirCanvasManager();
  let wireframe3d = null;

  // Resize canvas to match window
  function resizeCanvas() {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    if (harpEngine) harpEngine.resize(canvasElement.width, canvasElement.height);
    if (gridEngine) gridEngine.resize(canvasElement.width, canvasElement.height);
    if (wireframe3d) wireframe3d.resize(canvasElement.width, canvasElement.height);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  harpEngine = new window.ElasticHarp(canvasElement.width, canvasElement.height, 8);
  gridEngine = new window.SpacetimeMesh(canvasElement.width, canvasElement.height, 14, 9);
  wireframe3d = new window.WireframeObject3D(canvasElement.width, canvasElement.height);

  // Convert normalized MediaPipe coordinates to mirrored screen coordinates
  function toScreen(normPt) {
    return {
      x: (1 - normPt.x) * canvasElement.width,
      y: normPt.y * canvasElement.height,
      z: normPt.z || 0
    };
  }

  // Draw hand skeleton with glowing sci-fi lines and joints
  function drawHandSkeleton(landmarks, handedness, isPinching, color) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Draw Bones
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, lineWidth * 0.75);

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const p1 = toScreen(landmarks[startIdx]);
      const p2 = toScreen(landmarks[endIdx]);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 2. Draw Joints and Pulsing Fingertips (Fast 2D rendering without raster lag)
    const tipIndices = [4, 8, 12, 16, 20];
    for (let i = 0; i < landmarks.length; i++) {
      const pt = toScreen(landmarks[i]);
      const isTip = tipIndices.includes(i);

      ctx.beginPath();
      if (isTip) {
        const radius = isPinching && (i === 4 || i === 8) ? 8 : 5;
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isPinching ? '#ff007f' : '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }

    // 3. Pinch indicator laser link between Thumb and Index
    if (isPinching) {
      const thumb = toScreen(landmarks[4]);
      const index = toScreen(landmarks[8]);
      ctx.beginPath();
      ctx.moveTo(thumb.x, thumb.y);
      ctx.lineTo(index.x, index.y);
      ctx.strokeStyle = '#ff007f';
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  // Mode 1: Elastic Strings + Inter-finger Web
  function renderHarpMode() {
    // Background harp strings
    harpEngine.interact(handsData, activeColor);
    harpEngine.draw(ctx, activeColor);

    // Dynamic webs connecting fingertips of each hand
    ctx.save();
    for (const hand of handsData) {
      const tips = [
        hand.screenTips.thumb,
        hand.screenTips.index,
        hand.screenTips.middle,
        hand.screenTips.ring,
        hand.screenTips.pinky
      ];

      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = activeColor;
      ctx.shadowBlur = 8;
      ctx.shadowColor = activeColor;

      for (let i = 0; i < tips.length; i++) {
        for (let j = i + 1; j < tips.length; j++) {
          ctx.moveTo(tips[i].x, tips[i].y);
          ctx.lineTo(tips[j].x, tips[j].y);
        }
      }
      ctx.globalAlpha = 0.45;
      ctx.stroke();
    }

    // Two-Hands Quantum Bridge (Lightning arc between hands)
    if (handsData.length >= 2) {
      const h1Index = handsData[0].screenTips.index;
      const h2Index = handsData[1].screenTips.index;
      const dist = Math.hypot(h2Index.x - h1Index.x, h2Index.y - h1Index.y);

      ctx.beginPath();
      ctx.moveTo(h1Index.x, h1Index.y);

      // Jitter lightning arc
      const steps = 10;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = h1Index.x + (h2Index.x - h1Index.x) * t;
        const y = h1Index.y + (h2Index.y - h1Index.y) * t;
        const jitter = (Math.random() - 0.5) * Math.min(50, dist * 0.2);
        ctx.lineTo(x + jitter, y + jitter);
      }
      ctx.lineTo(h2Index.x, h2Index.y);

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.9;
      ctx.stroke();

      if (Math.random() < 0.3) {
        window.particleSystem.emit((h1Index.x + h2Index.x) / 2, (h1Index.y + h2Index.y) / 2, 3, activeColor, 2);
      }
    }
    ctx.restore();
  }

  // Mode 2: Air Canvas (Draw with pointing finger, grab/drag with pinch)
  function renderAirCanvasMode() {
    // 1. Draw all accumulated strokes first
    airCanvas.draw(ctx);

    for (const hand of handsData) {
      const idxTip = hand.screenTips.index;
      const isWriting = (hand.analysis.gesture === 'POINTING');

      if (isWriting) {
        if (!airCanvas.currentStroke) {
          airCanvas.startStroke(idxTip.x, idxTip.y, activeColor, lineWidth);
        } else {
          airCanvas.addPoint(idxTip.x, idxTip.y);
          if (window.cyberAudio && Math.random() < 0.25) {
            window.cyberAudio.playLaserPulse(1 + (idxTip.y / canvasElement.height) * 0.5);
          }
          window.particleSystem.emit(idxTip.x, idxTip.y, 2, activeColor, 1.8);
        }

        // Draw dynamic laser writing brush on fingertip
        ctx.save();
        // Outer pulsing laser ring
        ctx.beginPath();
        const pulse = 12 + Math.sin(Date.now() * 0.015) * 4;
        ctx.arc(idxTip.x, idxTip.y, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 16;
        ctx.stroke();

        // Crosshairs
        ctx.beginPath();
        ctx.moveTo(idxTip.x - 16, idxTip.y);
        ctx.lineTo(idxTip.x + 16, idxTip.y);
        ctx.moveTo(idxTip.x, idxTip.y - 16);
        ctx.lineTo(idxTip.x, idxTip.y + 16);
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Floating status text next to fingertip
        ctx.font = 'bold 12px Orbitron, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 8;
        ctx.fillText('✍️ ESCRIBIENDO', idxTip.x + 22, idxTip.y - 8);
        ctx.restore();

      } else {
        if (airCanvas.currentStroke) {
          airCanvas.endStroke();
        }

        // Idle fingertip pointer circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(idxTip.x, idxTip.y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // Pinch to grab and distort drawn strokes
      if (hand.analysis.isPinching) {
        const pinchPt = toScreen(hand.analysis.pinchCenter);
        airCanvas.grabOrDrag(pinchPt.x, pinchPt.y, true);
        window.particleSystem.emit(pinchPt.x, pinchPt.y, 1, '#ff007f', 1);
      } else {
        airCanvas.grabOrDrag(0, 0, false);
      }
    }
  }

  // Mode 3: Deformable Spacetime Mesh
  function renderGridMode() {
    let isPinching = false;
    let pinchPt = { x: 0, y: 0 };

    for (const hand of handsData) {
      if (hand.analysis.isPinching) {
        isPinching = true;
        pinchPt = toScreen(hand.analysis.pinchCenter);
        break;
      }
    }

    gridEngine.interact(handsData, isPinching, pinchPt.x, pinchPt.y, activeColor);
    gridEngine.draw(ctx, activeColor);
  }

  // Mode 4: Laser Beams & Cosmic Singularity
  function renderBeamsMode() {
    ctx.save();
    for (const hand of handsData) {
      const isFist = hand.analysis.gesture === 'FIST';
      const wrist = hand.screenWrist;

      if (isFist) {
        // Gravitational singularity pull
        ctx.beginPath();
        ctx.arc(wrist.x, wrist.y, 25 + Math.sin(Date.now() * 0.01) * 6, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 30;
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = activeColor;
        ctx.stroke();

        // Accretion swirl particles
        window.particleSystem.emit(wrist.x, wrist.y, 4, activeColor, 4);
      } else {
        // Laser rays projecting from all 5 fingertips
        for (const key in hand.screenTips) {
          const tip = hand.screenTips[key];
          const dx = tip.x - wrist.x;
          const dy = tip.y - wrist.y;
          const len = Math.hypot(dx, dy) || 1;
          const beamLen = Math.max(canvasElement.width, canvasElement.height);

          const targetX = tip.x + (dx / len) * beamLen;
          const targetY = tip.y + (dy / len) * beamLen;

          const grad = ctx.createLinearGradient(tip.x, tip.y, targetX, targetY);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.1, activeColor);
          grad.addColorStop(1, 'transparent');

          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(targetX, targetY);

          ctx.lineWidth = lineWidth * 0.75;
          ctx.strokeStyle = grad;
          ctx.shadowColor = activeColor;
          ctx.shadowBlur = 15;
          ctx.stroke();

          if (Math.random() < 0.25) {
            window.particleSystem.emit(tip.x, tip.y, 2, activeColor, 2);
          }
        }
      }
    }
    ctx.restore();
  }

  // Mode 5: Interactive 3D Wireframe Sculptor (Move, Rotate, Stretch, Sculpt)
  function renderWireframe3DMode() {
    wireframe3d.interact(handsData);
    wireframe3d.draw(ctx, activeColor);
  }

  // Main Render Loop
  function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw active mode
    switch (currentMode) {
      case 'wireframe3d':
        renderWireframe3DMode();
        break;
      case 'harp':
        renderHarpMode();
        break;
      case 'aircanvas':
        renderAirCanvasMode();
        break;
      case 'grid':
        renderGridMode();
        break;
      case 'beams':
        renderBeamsMode();
        break;
    }

    // Always draw hand skeleton tracker on top
    for (const hand of handsData) {
      drawHandSkeleton(hand.landmarks, hand.handedness, hand.analysis.isPinching, activeColor);
    }

    // Draw energy particle system
    window.particleSystem.updateAndDraw(ctx);

    // Calculate FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFrameTime >= 1000) {
      fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
      fpsDisplay.textContent = `${fps} FPS`;
      frameCount = 0;
      lastFrameTime = now;
    }

    requestAnimationFrame(render);
  }

  // Handle MediaPipe Results
  function onResults(results) {
    if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
      loadingOverlay.classList.add('hidden');
    }

    handsData = [];
    const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
    handsCountDisplay.textContent = `${numHands} ${numHands === 1 ? 'Mano' : 'Manos'}`;

    if (numHands > 0) {
      statusDot.classList.add('active');

      let primaryGestureName = 'Seguimiento Activo';
      let primaryIcon = '✋';

      let isPinchingGlobal = false;
      let pinchPtGlobal = null;

      for (let i = 0; i < numHands; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handednessInfo = results.multiHandedness && results.multiHandedness[i] 
          ? results.multiHandedness[i].label 
          : (i === 0 ? 'Right' : 'Left');

        const analysis = recognizer.analyzeHand(landmarks, i, handednessInfo);

        // Precompute screen positions
        const screenTips = {
          thumb: toScreen(landmarks[4]),
          index: toScreen(landmarks[8]),
          middle: toScreen(landmarks[12]),
          ring: toScreen(landmarks[16]),
          pinky: toScreen(landmarks[20])
        };
        const screenWrist = toScreen(landmarks[0]);

        handsData.push({
          landmarks,
          handedness: handednessInfo,
          analysis,
          screenTips,
          screenWrist
        });

        if (analysis.isPinching) {
          isPinchingGlobal = true;
          pinchPtGlobal = screenTips.index;
        }

        if (i === 0 && analysis) {
          primaryGestureName = analysis.gestureName;
          primaryIcon = analysis.icon;
        }
      }

      // Universal Pinch-to-Click and Pinch-to-Drag for DOM elements
      if (isPinchingGlobal && pinchPtGlobal) {
        const now = Date.now();
        // Hide canvas temporarily to find underlying DOM element
        canvasElement.style.pointerEvents = 'none';
        const el = document.elementFromPoint(pinchPtGlobal.x, pinchPtGlobal.y);
        canvasElement.style.pointerEvents = 'auto'; // restore
        
        // Comprobar si se agarró la cabecera del dashboard
        if (!window.pinchDraggedElement && el && el.closest('#dev-dashboard-header')) {
           window.pinchDraggedElement = document.getElementById('dev-dashboard');
           const rect = window.pinchDraggedElement.getBoundingClientRect();
           window.pinchOffsetX = pinchPtGlobal.x - rect.left;
           window.pinchOffsetY = pinchPtGlobal.y - rect.top;
           if (window.cyberAudio) window.cyberAudio.playPinch(true);
        }

        if (window.pinchDraggedElement) {
           // Mover el panel al arrastrar
           window.pinchDraggedElement.style.left = `${pinchPtGlobal.x - window.pinchOffsetX}px`;
           window.pinchDraggedElement.style.top = `${pinchPtGlobal.y - window.pinchOffsetY}px`;
           window.pinchDraggedElement.style.transform = 'none';
        } else {
           // Lógica normal de clic si no se está arrastrando nada
           if (!window.lastPinchClick || (now - window.lastPinchClick > 500)) {
              if (el && (el.tagName === 'BUTTON' || el.closest('.task-item') || el.closest('.hud-interactive'))) {
                 // No hacer clic en el botón si lo que queríamos era arrastrar (evita clic accidental en cabecera)
                 if (!el.closest('#dev-dashboard-header') || el.tagName === 'BUTTON') {
                    el.click();
                    window.lastPinchClick = now;
                    window.particleSystem.emit(pinchPtGlobal.x, pinchPtGlobal.y, 6, activeColor, 3);
                    if (window.cyberAudio) window.cyberAudio.playPinch(true);
                 }
              }
           }
        }
      } else {
        // Soltar el elemento arrastrado cuando se deja de pellizcar
        window.pinchDraggedElement = null;
      }

      gestureLabel.textContent = primaryGestureName;
      gestureIcon.textContent = primaryIcon;
    } else {
      statusDot.classList.remove('active');
      gestureLabel.textContent = 'Buscando Manos...';
      gestureIcon.textContent = '🔍';
    }
  }

  // Initialize MediaPipe Hands
  async function initHandTracking() {
    try {
      loadingText.textContent = 'CONECTANDO CÁMARA & CARGANDO IA...';

      if (!window.Hands) {
        throw new Error('MediaPipe Hands library not loaded. Check internet connection or CDN.');
      }

      const hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      const isMobile = window.innerWidth <= 768;
      const camW = isMobile ? 480 : 640;
      const camH = isMobile ? 360 : 480;

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0, // Lite Model: 3x-4x faster, 60fps on mobile & web!
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55
      });

      hands.onResults(onResults);

      // Camera feed setup with frame-dropping guard (Zero input lag!)
      let isProcessing = false;
      if (window.Camera) {
        const camera = new window.Camera(videoElement, {
          onFrame: async () => {
            if (isProcessing) return; // Prevent frame queue backlog
            isProcessing = true;
            try {
              await hands.send({ image: videoElement });
            } catch (e) {
              console.warn('Frame processing warning:', e);
            } finally {
              isProcessing = false;
            }
          },
          width: camW,
          height: camH
        });
        await camera.start();
        isVideoReady = true;
      } else {
        // Fallback getUserMedia if Camera helper fails
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: camW }, 
            height: { ideal: camH }, 
            facingMode: 'user' 
          }
        });
        videoElement.srcObject = stream;
        await videoElement.play();
        isVideoReady = true;

        async function processFrame() {
          if (videoElement.readyState >= 2 && !isProcessing) {
            isProcessing = true;
            try {
              await hands.send({ image: videoElement });
            } catch (e) {
              console.warn(e);
            } finally {
              isProcessing = false;
            }
          }
          requestAnimationFrame(processFrame);
        }
        processFrame();
      }

      // Start render loop
      render();

    } catch (err) {
      console.error('Initialization error:', err);
      loadingText.innerHTML = `⚠️ ERROR AL INICIAR<br><span style="font-size: 0.8rem; font-weight: normal; color: #ff5555;">${err.message}</span><br><br><button onclick="location.reload()" style="background:#00f3ff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;">Reintentar</button>`;
    }
  }

  function updateModeUI(mode) {
    const airCanvasHint = document.getElementById('aircanvas-hint');
    const airCanvasControls = document.getElementById('aircanvas-controls');
    const wireframe3dControls = document.getElementById('wireframe3d-controls');
    const mobileWireframe3dControls = document.getElementById('mobile-wireframe3d-controls');
    const devDashboard = document.getElementById('dev-dashboard');

    if (airCanvasHint) airCanvasHint.style.display = (mode === 'aircanvas') ? 'block' : 'none';
    if (airCanvasControls) airCanvasControls.style.display = (mode === 'aircanvas') ? 'flex' : 'none';
    if (wireframe3dControls) wireframe3dControls.style.display = (mode === 'wireframe3d') ? 'flex' : 'none';
    if (mobileWireframe3dControls) mobileWireframe3dControls.style.display = (mode === 'wireframe3d') ? 'flex' : 'none';
    if (devDashboard) devDashboard.style.display = (mode === 'dashboard') ? 'flex' : 'none';
  }

  // UI Event Listeners
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;
      updateModeUI(currentMode);
      if (window.cyberAudio) window.cyberAudio.playPinch(true);
    });
  });

  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      activeColor = swatch.dataset.color;
      document.documentElement.style.setProperty('--primary', activeColor);
      document.documentElement.style.setProperty('--primary-glow', `${activeColor}66`);
    });
  });

  lineWidthSlider.addEventListener('input', (e) => {
    lineWidth = parseFloat(e.target.value);
    document.getElementById('line-width-val').textContent = `${lineWidth}px`;
  });

  cameraOpacitySlider.addEventListener('input', (e) => {
    cameraOpacity = parseFloat(e.target.value);
    videoElement.style.opacity = cameraOpacity;
    document.getElementById('camera-opacity-val').textContent = `${Math.round(cameraOpacity * 100)}%`;
  });

  audioToggleBtn.addEventListener('click', () => {
    if (window.cyberAudio) {
      const enabled = window.cyberAudio.toggle();
      audioToggleBtn.classList.toggle('active', enabled);
      audioToggleBtn.querySelector('span').textContent = enabled ? 'Audio: ON' : 'Audio: MUTE';
    }
  });

  clearBtn.addEventListener('click', () => {
    airCanvas.clear();
    window.particleSystem.clear();
  });

  const undoBtn = document.getElementById('undo-stroke-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', () => {
      airCanvas.undo();
      if (window.cyberAudio) window.cyberAudio.playPinch(false);
    });
  }

  const clearCanvasBtn = document.getElementById('clear-canvas-btn');
  if (clearCanvasBtn) {
    clearCanvasBtn.addEventListener('click', () => {
      airCanvas.clear();
      window.particleSystem.clear();
      if (window.cyberAudio) window.cyberAudio.playClear();
    });
  }

  // 3D Render Style Buttons (Cristal, Sólido, Líneas)
  const styleBtns = document.querySelectorAll('.style-btn');
  styleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const style = btn.dataset.style;
      if (wireframe3d) {
        wireframe3d.setRenderStyle(style);
        if (window.cyberAudio) window.cyberAudio.playPinch(true);
      }
    });
  });

  // 3D Model Selector Buttons
  const modelBtns = document.querySelectorAll('.model-btn');
  modelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const model = btn.dataset.model;
      if (wireframe3d) {
        wireframe3d.loadModel(model);
        if (window.cyberAudio) window.cyberAudio.playPinch(true);
      }
    });
  });

  const resetShapeBtn = document.getElementById('reset-shape-btn');
  if (resetShapeBtn) {
    resetShapeBtn.addEventListener('click', () => {
      if (wireframe3d) {
        wireframe3d.resetShape();
      }
    });
  }

  // Snapshot / Screenshot
  snapshotBtn.addEventListener('click', () => {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = canvasElement.width;
    snapCanvas.height = canvasElement.height;
    const snapCtx = snapCanvas.getContext('2d');

    // Draw video frame (mirrored)
    snapCtx.save();
    snapCtx.scale(-1, 1);
    snapCtx.drawImage(videoElement, -snapCanvas.width, 0, snapCanvas.width, snapCanvas.height);
    snapCtx.restore();

    // Draw lines overlay
    snapCtx.drawImage(canvasElement, 0, 0);

    // Save as image file
    const link = document.createElement('a');
    link.download = `cyberhand_${Date.now()}.png`;
    link.href = snapCanvas.toDataURL('image/png');
    link.click();

    if (window.cyberAudio) window.cyberAudio.playPinch(true);
  });

  toggleSidebarBtn.addEventListener('click', () => {
    hudSidebar.classList.toggle('collapsed');
  });

  // Unlock Web Audio on first user interaction
  document.body.addEventListener('click', () => {
    if (window.cyberAudio) window.cyberAudio.resume();
  }, { once: true });

  // Start Application
  window.addEventListener('load', () => {
    updateModeUI(currentMode);
    initHandTracking();
  });

})();
