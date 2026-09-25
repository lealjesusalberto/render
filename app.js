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
  let frameCaptureProgress = 0;
  let lastCaptureTime = 0;
  let draggedPhotoElement = null;
  let dragHandIndex = -1;
  let dragOffset = { x: 0, y: 0 };
  
  let lastSwipeTime = 0;
  
  let hoverElement = null;
  let hoverProgress = 0;
  let isMenuOpen = false;

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
    
    // Connect fingers between two hands!
    if (handsData.length >= 2) {
      const h1 = handsData[0];
      const h2 = handsData[1];
      const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'];
      
      for (const finger of fingers) {
        const p1 = h1.screenTips[finger];
        const p2 = h2.screenTips[finger];
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        
        // Add a jagged lightning/energy effect by drawing a segmented line
        const segs = 6;
        for (let i = 1; i <= segs; i++) {
          const t = i / segs;
          const cx = p1.x + (p2.x - p1.x) * t;
          const cy = p1.y + (p2.y - p1.y) * t;
          const jitterX = (Math.random() - 0.5) * 15 * (1 - Math.abs(t - 0.5) * 2);
          const jitterY = (Math.random() - 0.5) * 15 * (1 - Math.abs(t - 0.5) * 2);
          
          if (i === segs) {
            ctx.lineTo(p2.x, p2.y);
          } else {
            ctx.lineTo(cx + jitterX, cy + jitterY);
          }
        }
        
        ctx.lineWidth = lineWidth * 0.8;
        ctx.strokeStyle = activeColor;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 15;
        ctx.stroke();
        
        ctx.lineWidth = lineWidth * 0.4;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 5;
        ctx.stroke();
        
        if (Math.random() < 0.2) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          window.particleSystem.emit(midX, midY, 1, activeColor, 1);
        }
      }
    }

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
      } else if (handsData.length < 2) {
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

  // Mode 6: Camera Framing Mode
  function renderCameraMode() {
    let isFraming = false;
    
    if (handsData.length === 2) {
      const h1 = handsData[0];
      const h2 = handsData[1];
      
      if (h1.analysis.gesture === 'FRAME' && h2.analysis.gesture === 'FRAME') {
        isFraming = true;
        
        const pts = [
          h1.screenTips.thumb, h1.screenTips.index,
          h2.screenTips.thumb, h2.screenTips.index
        ];
        
        const minX = Math.min(...pts.map(p => p.x));
        const maxX = Math.max(...pts.map(p => p.x));
        const minY = Math.min(...pts.map(p => p.y));
        const maxY = Math.max(...pts.map(p => p.y));
        
        const frameRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        
        // Draw the framing box using energy strings!
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(h1.screenTips.thumb.x, h1.screenTips.thumb.y);
        ctx.lineTo(h1.screenTips.index.x, h1.screenTips.index.y);
        ctx.lineTo(h2.screenTips.index.x, h2.screenTips.index.y);
        ctx.lineTo(h2.screenTips.thumb.x, h2.screenTips.thumb.y);
        ctx.closePath();
        
        // Outer glow
        ctx.lineWidth = lineWidth * 0.8;
        ctx.strokeStyle = activeColor;
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 15;
        ctx.stroke();
        
        // Inner white core
        ctx.lineWidth = lineWidth * 0.4;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 5;
        ctx.stroke();
        
        // Sparkles on the corners
        if (Math.random() < 0.3) {
          window.particleSystem.emit(h1.screenTips.index.x, h1.screenTips.index.y, 1, activeColor, 1);
          window.particleSystem.emit(h2.screenTips.thumb.x, h2.screenTips.thumb.y, 1, activeColor, 1);
        }
        // Wait for 0.5 second logic (60fps * 0.5 = 30 frames)
        frameCaptureProgress += (100 / 30);
        
        const cx = frameRect.x + frameRect.w / 2;
        const cy = frameRect.y + frameRect.h / 2;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (frameCaptureProgress / 100)));
        ctx.strokeStyle = activeColor;
        ctx.stroke();
        
        const secondsLeft = Math.ceil(1 - (frameCaptureProgress / 100) * 1);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px var(--font-hud)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(secondsLeft > 0 ? secondsLeft : '📸', cx, cy);
        
        ctx.restore();
        
        if (frameCaptureProgress >= 100) {
          capturePhotoFromRect(frameRect);
          frameCaptureProgress = 0; // reset
          if (window.cyberAudio) window.cyberAudio.playClear();
          
          // Flash effect
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(frameRect.x, frameRect.y, frameRect.w, frameRect.h);
          ctx.restore();
        }
      }
    }
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
      case 'camera':
        renderCameraMode();
        break;
    }

    // Always draw hand skeleton tracker on top, UNLESS in camera mode
    if (currentMode !== 'camera') {
      for (const hand of handsData) {
        drawHandSkeleton(hand.landmarks, hand.handedness, hand.analysis.isPinching, activeColor);
      }
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
    
    handlePhotoDragging(handsData);
    handleHoverClick(handsData);
    handleMenuExpansion(handsData);

    requestAnimationFrame(render);
  }
  
  // Hand-based Hover Click Logic (Menu Navigation)
  function handleHoverClick(hands) {
    if (!isMenuOpen) return; // Only process hover if menu is open
    
    let pointingHand = null;
    
    // Buscar mano apuntando
    for (let i = 0; i < hands.length; i++) {
      if (hands[i].analysis.gesture === 'POINTING' || hands[i].analysis.gesture === 'OPEN_HAND') {
        pointingHand = hands[i];
        break;
      }
    }
    
    if (pointingHand) {
      const px = pointingHand.screenTips.index.x;
      const py = pointingHand.screenTips.index.y;
      
      // Dibujar cursor de hover
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#fff';
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Encontrar elemento interactivo debajo
      canvasElement.style.pointerEvents = 'none';
      const el = document.elementFromPoint(px, py);
      canvasElement.style.pointerEvents = 'auto';
      
      let hovered = null;
      if (el) {
        hovered = el.closest('.hover-clickable');
      }
      
      if (hovered && hovered.style.display !== 'none') {
        if (hoverElement === hovered) {
          // Aumentar progreso (tarda ~0.8 segundos a 60fps -> 48 frames)
          hoverProgress += (100 / 48);
          
          // Dibujar anillo de progreso
          ctx.beginPath();
          ctx.arc(px, py, 18, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * (hoverProgress/100)));
          ctx.strokeStyle = activeColor;
          ctx.lineWidth = 4;
          ctx.stroke();
          
          if (hoverProgress >= 100) {
            hoverProgress = 0;
            hoverElement = null; // Reiniciar
            
            // Efecto visual y de sonido
            window.particleSystem.emit(px, py, 12, activeColor, 3);
            if (window.cyberAudio) window.cyberAudio.playPinch(true);
            
            // Ejecutar la acción
            if (hovered.classList.contains('mode-tab')) {
              changeMode(hovered.dataset.mode);
              toggleSpatialMenu(false); // Cerrar menú al elegir
            }
          }
        } else {
          hoverElement = hovered;
          hoverProgress = 0;
        }
      } else {
        hoverElement = null;
        hoverProgress = 0;
      }
    } else {
      hoverElement = null;
      hoverProgress = 0;
    }
  }

  // Two-hand expansion logic to open/close menu
  let lastHandsDist = -1;
  
  function handleMenuExpansion(hands) {
    if (hands.length === 2) {
      // Usar OPEN_HAND o FLAT_HAND en ambas manos para detectar expansión intencional
      const h1Gesture = hands[0].analysis.gesture;
      const h2Gesture = hands[1].analysis.gesture;
      
      const isHand1Open = h1Gesture === 'OPEN_HAND' || h1Gesture === 'FLAT_HAND';
      const isHand2Open = h2Gesture === 'OPEN_HAND' || h2Gesture === 'FLAT_HAND';
      
      if (isHand1Open && isHand2Open) {
        const x1 = hands[0].screenWrist.x;
        const x2 = hands[1].screenWrist.x;
        const dist = Math.abs(x1 - x2);
        
        if (lastHandsDist !== -1) {
          const delta = dist - lastHandsDist;
          
          if (delta > 80 && !isMenuOpen) {
            // Expansion rápida detectada -> Abrir menú
            toggleSpatialMenu(true);
            if (window.cyberAudio) window.cyberAudio.playClear();
            lastHandsDist = -1; // reset para requerir nuevo gesto
            return;
          } else if (delta < -80 && isMenuOpen) {
            // Contracción rápida detectada -> Cerrar menú
            toggleSpatialMenu(false);
            if (window.cyberAudio) window.cyberAudio.playPinch(false);
            lastHandsDist = -1;
            return;
          }
        }
        lastHandsDist = dist;
      } else {
        lastHandsDist = -1;
      }
    } else {
      lastHandsDist = -1;
    }
  }

  function toggleSpatialMenu(forceState) {
    const options = document.getElementById('spatial-menu-options');
    if (typeof forceState !== 'undefined') {
      isMenuOpen = forceState;
    } else {
      isMenuOpen = !isMenuOpen;
    }
    
    if (isMenuOpen) {
      options.style.display = 'flex';
      // Animación pop
      options.style.transform = 'scale(0.8)';
      options.style.opacity = '0';
      options.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      
      requestAnimationFrame(() => {
        options.style.transform = 'scale(1)';
        options.style.opacity = '1';
      });
    } else {
      options.style.display = 'none';
    }
  }

  // Hand-based Photo Dragging Logic
  function handlePhotoDragging(hands) {
    let flatHand = null;
    let flatHandIdx = -1;
    
    // Encontrar una mano que esté haciendo FLAT_HAND (Mano plana / dedos pegados)
    for (let i = 0; i < hands.length; i++) {
      if (hands[i].analysis.gesture === 'FLAT_HAND') {
        flatHand = hands[i];
        flatHandIdx = i;
        break;
      }
    }
    
    if (flatHand) {
      // Usar la punta del dedo medio como punto central de la "paleta" de la mano
      const px = flatHand.screenTips.middle.x;
      const py = flatHand.screenTips.middle.y;
      
      // Dibujar indicador visual de agarre espacial
      ctx.beginPath();
      ctx.arc(px, py, 15, 0, Math.PI * 2);
      ctx.fillStyle = draggedPhotoElement ? 'rgba(0, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.4)';
      ctx.fill();
      
      if (!draggedPhotoElement) {
        // Intentar agarrar una foto bajo la mano
        const photos = document.querySelectorAll('.polaroid-photo');
        // Buscar desde la última (la más arriba en z-index usualmente)
        for (let i = photos.length - 1; i >= 0; i--) {
          const p = photos[i];
          const rect = p.getBoundingClientRect();
          if (px > rect.left && px < rect.right && py > rect.top && py < rect.bottom) {
            draggedPhotoElement = p;
            dragHandIndex = flatHandIdx;
            dragOffset.x = px - rect.left;
            dragOffset.y = py - rect.top;
            
            // Efecto visual de agarre
            p.style.zIndex = '202';
            p.style.boxShadow = `0 15px 35px ${activeColor}88`; 
            if (window.cyberAudio) window.cyberAudio.playPinch(true);
            break; // solo agarrar una
          }
        }
      } else {
        // Si ya estamos arrastrando, actualizar posición
        if (flatHandIdx === dragHandIndex) {
          draggedPhotoElement.style.left = (px - dragOffset.x) + 'px';
          draggedPhotoElement.style.top = (py - dragOffset.y) + 'px';
        }
      }
    } else {
      // Soltar la foto si la mano ya no es FLAT_HAND
      if (draggedPhotoElement) {
        draggedPhotoElement.style.zIndex = '200';
        draggedPhotoElement.style.boxShadow = '2px 6px 15px rgba(0,0,0,0.6)';
        draggedPhotoElement = null;
        dragHandIndex = -1;
        if (window.cyberAudio) window.cyberAudio.playPinch(false);
      }
    }
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
    const wireframe3dControls = document.getElementById('wireframe3d-controls');
    const mobileWireframe3dControls = document.getElementById('mobile-wireframe3d-controls');
    const devDashboard = document.getElementById('dev-dashboard');

    if (wireframe3dControls) wireframe3dControls.style.display = (mode === 'wireframe3d') ? 'flex' : 'none';
    if (mobileWireframe3dControls) mobileWireframe3dControls.style.display = (mode === 'wireframe3d') ? 'flex' : 'none';
    if (devDashboard) {
      const isActive = (mode === 'dashboard');
      devDashboard.style.display = isActive ? 'flex' : 'none';
      if (window.taskManager) window.taskManager.setActive(isActive);
    }
  }

  function changeMode(modeId) {
    currentMode = modeId;
    updateModeUI(currentMode);
    
    modeTabs.forEach(t => {
      t.classList.remove('active');
      if (t.dataset.mode === modeId) {
        t.classList.add('active');
        t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });
    
    if (window.cyberAudio) window.cyberAudio.playPinch(true);
  }

  // UI Event Listeners
  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      changeMode(tab.dataset.mode);
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

  const closeGuideBtn = document.getElementById('close-guide-btn');
  if (closeGuideBtn) {
    closeGuideBtn.addEventListener('click', () => {
      document.getElementById('gesture-guide').style.display = 'none';
    });
  }

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

  // Photo Capture Logic
  function capturePhotoFromRect(rect) {
    if (rect.w < 50 || rect.h < 50) return;
    const snap = document.createElement('canvas');
    snap.width = rect.w;
    snap.height = rect.h;
    const snapCtx = snap.getContext('2d');
    
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = canvasElement.width;
    fullCanvas.height = canvasElement.height;
    const fullCtx = fullCanvas.getContext('2d');
    
    // Draw mirrored video
    fullCtx.save();
    fullCtx.scale(-1, 1);
    fullCtx.drawImage(videoElement, -fullCanvas.width, 0, fullCanvas.width, fullCanvas.height);
    fullCtx.restore();
    
    // NOTA: Se eliminó fullCtx.drawImage(canvasElement, 0, 0); para que la foto quede limpia
    
    // Crop
    snapCtx.drawImage(fullCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    
    const dataUrl = snap.toDataURL('image/png');
    createDraggablePhotoWidget(dataUrl, rect.w, rect.h);
  }

  function createDraggablePhotoWidget(dataUrl, width, height) {
    const div = document.createElement('div');
    div.className = 'polaroid-photo hud-interactive';
    div.style.position = 'absolute';
    
    // Spawn at sides
    const side = Math.random() > 0.5 ? 'left' : 'right';
    let spawnX;
    
    // Max width we want to consider so it doesn't spawn off-screen
    const safeW = Math.max(width, 120); 
    
    if (side === 'left') {
      spawnX = 20 + Math.random() * 80;
    } else {
      spawnX = canvasElement.width - safeW - 20 - (Math.random() * 80);
    }
    
    // Random height somewhere in the middle 60% of the screen
    const safeH = Math.max(height, 140);
    const spawnY = (canvasElement.height * 0.2) + Math.random() * (canvasElement.height * 0.6 - safeH);
    
    div.style.left = spawnX + 'px';
    div.style.top = spawnY + 'px';
    
    // Polaroid Style
    div.style.width = width + 'px';
    div.style.height = height + 'px';
    div.style.minWidth = '120px';
    div.style.minHeight = '140px';
    div.style.resize = 'both';
    div.style.overflow = 'hidden';
    div.style.zIndex = '200';
    div.style.background = '#f4f4f4'; // Off-white polaroid paper
    div.style.padding = '8px 8px 36px 8px'; // Thick bottom margin
    div.style.boxShadow = '2px 6px 15px rgba(0,0,0,0.6)';
    div.style.border = '1px solid #ddd';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.cursor = 'grab';
    
    // Random rotation for natural dropped look
    const rot = (Math.random() - 0.5) * 16;
    div.style.transform = `rotate(${rot}deg)`;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✖';
    closeBtn.style.position = 'absolute';
    closeBtn.style.bottom = '8px';
    closeBtn.style.right = '8px';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#d32f2f';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px';
    closeBtn.style.fontSize = '12px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.onclick = () => div.remove();
    
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = '100%';
    img.style.height = '100%'; // takes all space except padding
    img.style.objectFit = 'cover';
    img.style.pointerEvents = 'none';
    img.style.border = '1px solid #222';
    img.style.backgroundColor = '#111';
    
    div.appendChild(img);
    div.appendChild(closeBtn);
    document.getElementById('app-container').appendChild(div);
    
    // Make draggable (the whole polaroid)
    let isDragging = false;
    let offsetX, offsetY;
    
    const startDrag = (clientX, clientY) => {
      // Avoid dragging if they clicked near the bottom right (resizing handle)
      const rect = div.getBoundingClientRect();
      if (clientX > rect.right - 20 && clientY > rect.bottom - 20) return;
      
      isDragging = true;
      offsetX = clientX - div.offsetLeft;
      offsetY = clientY - div.offsetTop;
      div.style.cursor = 'grabbing';
      
      // Bring to front
      const allPhotos = document.querySelectorAll('.polaroid-photo');
      allPhotos.forEach(p => p.style.zIndex = '200');
      div.style.zIndex = '201';
    };
    
    const doDrag = (clientX, clientY) => {
      if (!isDragging) return;
      div.style.left = (clientX - offsetX) + 'px';
      div.style.top = (clientY - offsetY) + 'px';
    };
    
    const endDrag = () => {
      isDragging = false;
      div.style.cursor = 'grab';
    };
    
    div.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
    document.addEventListener('mousemove', (e) => doDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);
    
    div.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientX, e.touches[0].clientY), {passive: true});
    document.addEventListener('touchmove', (e) => doDrag(e.touches[0].clientX, e.touches[0].clientY), {passive: true});
    document.addEventListener('touchend', endDrag);
  }

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
