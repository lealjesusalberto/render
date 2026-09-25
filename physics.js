// Physics Engine for Elastic Strings, Spacetime Mesh, and Particles

class VerletPoint {
  constructor(x, y, pinned = false) {
    this.x = x;
    this.y = y;
    this.oldX = x;
    this.oldY = y;
    this.pinned = pinned;
    this.grabbed = false;
    this.radius = 4;
  }

  update(damping = 0.98) {
    if (this.pinned || this.grabbed) return;
    const vx = (this.x - this.oldX) * damping;
    const vy = (this.y - this.oldY) * damping;
    this.oldX = this.x;
    this.oldY = this.y;
    this.x += vx;
    this.y += vy;
  }
}

class VerletStick {
  constructor(p1, p2, length = null, stiffness = 0.8) {
    this.p1 = p1;
    this.p2 = p2;
    this.length = length || Math.hypot(p2.x - p1.x, p2.y - p1.y);
    this.stiffness = stiffness;
    this.vibration = 0;
  }

  update() {
    const dx = this.p2.x - this.p1.x;
    const dy = this.p2.y - this.p1.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const diff = (this.length - dist) / dist;
    const offset = diff * 0.5 * this.stiffness;

    const ox = dx * offset;
    const oy = dy * offset;

    if (!this.p1.pinned && !this.p1.grabbed) {
      this.p1.x -= ox;
      this.p1.y -= oy;
    }
    if (!this.p2.pinned && !this.p2.grabbed) {
      this.p2.x += ox;
      this.p2.y += oy;
    }
  }
}

// Particle System for Energy Sparks & Trails
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.maxParticles = 120;
  }

  emit(x, y, count = 3, color = '#00f3ff', speed = 3) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        this.particles.shift();
      }
      const angle = Math.random() * Math.PI * 2;
      const v = (Math.random() * 0.8 + 0.2) * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 1.0,
        decay: Math.random() * 0.04 + 0.03,
        size: Math.random() * 2.5 + 1.2,
        color
      });
    }
  }

  updateAndDraw(ctx) {
    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life * 0.85;
      ctx.fill();
    }
    ctx.restore();
  }

  clear() {
    this.particles = [];
  }
}

// Deformable Interactive Grid (Spacetime Mesh)
class SpacetimeMesh {
  constructor(width, height, cols = 12, rows = 8) {
    this.width = width;
    this.height = height;
    this.cols = cols;
    this.rows = rows;
    this.points = [];
    this.sticks = [];
    this.grabbedPoint = null;
    this.init();
  }

  init() {
    this.points = [];
    this.sticks = [];
    const stepX = this.width / (this.cols + 1);
    const stepY = this.height / (this.rows + 1);

    for (let r = 0; r <= this.rows; r++) {
      for (let c = 0; c <= this.cols; c++) {
        const x = (c + 0.5) * stepX;
        const y = (r + 0.5) * stepY;
        const isBorder = (r === 0 || r === this.rows || c === 0 || c === this.cols);
        const pt = new VerletPoint(x, y, isBorder);
        this.points.push(pt);
      }
    }

    // Connect horizontal & vertical sticks
    for (let r = 0; r <= this.rows; r++) {
      for (let c = 0; c <= this.cols; c++) {
        const idx = r * (this.cols + 1) + c;
        if (c < this.cols) {
          this.sticks.push(new VerletStick(this.points[idx], this.points[idx + 1], stepX, 0.45));
        }
        if (r < this.rows) {
          const belowIdx = (r + 1) * (this.cols + 1) + c;
          this.sticks.push(new VerletStick(this.points[idx], this.points[belowIdx], stepY, 0.45));
        }
      }
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.init();
  }

  interact(handsData, isPinching, pinchX, pinchY, color = '#00f3ff') {
    // 1. Pinch manipulation: grab and drag nearest point
    if (isPinching) {
      if (!this.grabbedPoint) {
        let minDist = 80;
        let candidate = null;
        for (const pt of this.points) {
          const d = Math.hypot(pt.x - pinchX, pt.y - pinchY);
          if (d < minDist) {
            minDist = d;
            candidate = pt;
          }
        }
        if (candidate) {
          this.grabbedPoint = candidate;
          this.grabbedPoint.grabbed = true;
        }
      }
      if (this.grabbedPoint) {
        this.grabbedPoint.x = pinchX;
        this.grabbedPoint.y = pinchY;
      }
    } else {
      if (this.grabbedPoint) {
        this.grabbedPoint.grabbed = false;
        this.grabbedPoint = null;
      }
    }

    // 2. Proximity repulsion / wave ripple from fingertips
    if (handsData && handsData.length > 0) {
      for (const hand of handsData) {
        for (const key in hand.screenTips) {
          const tip = hand.screenTips[key];
          for (const pt of this.points) {
            if (pt.pinned || pt.grabbed) continue;
            const dx = pt.x - tip.x;
            const dy = pt.y - tip.y;
            const d = Math.hypot(dx, dy);
            if (d < 70 && d > 1) {
              const force = (70 - d) / 70 * 4;
              pt.x += (dx / d) * force;
              pt.y += (dy / d) * force;
            }
          }
        }
      }
    }

    // Update Verlet points and sticks
    for (const pt of this.points) {
      pt.update(0.96);
    }
    for (let iter = 0; iter < 3; iter++) {
      for (const stick of this.sticks) {
        stick.update();
      }
    }
  }

  draw(ctx, color = '#00f3ff') {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.65;

    ctx.beginPath();
    for (const stick of this.sticks) {
      ctx.moveTo(stick.p1.x, stick.p1.y);
      ctx.lineTo(stick.p2.x, stick.p2.y);
    }
    ctx.stroke();

    // Draw vertex dots
    ctx.fillStyle = '#ffffff';
    for (const pt of this.points) {
      if (pt.grabbed) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ff007f';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// Multi-Segment Elastic Strings (Laser Harp & Finger Web)
class ElasticHarp {
  constructor(width, height, numStrings = 7) {
    this.width = width;
    this.height = height;
    this.numStrings = numStrings;
    this.strings = [];
    this.notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]; // C major pentatonic / scale
    this.init();
  }

  init() {
    this.strings = [];
    const step = this.width / (this.numStrings + 1);
    const segments = 12;

    for (let s = 0; s < this.numStrings; s++) {
      const baseX = (s + 1) * step;
      const points = [];
      const segHeight = this.height / segments;

      for (let i = 0; i <= segments; i++) {
        const isEnd = (i === 0 || i === segments);
        points.push(new VerletPoint(baseX, i * segHeight, isEnd));
      }

      const sticks = [];
      for (let i = 0; i < segments; i++) {
        sticks.push(new VerletStick(points[i], points[i + 1], segHeight, 0.7));
      }

      this.strings.push({
        baseX,
        points,
        sticks,
        frequency: this.notes[s % this.notes.length],
        lastPluck: 0,
        color: null
      });
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.init();
  }

  interact(handsData, color = '#00f3ff') {
    const now = Date.now();

    for (const string of this.strings) {
      // Check collision with all fingertips
      if (handsData) {
        for (const hand of handsData) {
          for (const key in hand.screenTips) {
            const tip = hand.screenTips[key];
            for (let i = 1; i < string.points.length - 1; i++) {
              const pt = string.points[i];
              const d = Math.hypot(pt.x - tip.x, pt.y - tip.y);
              if (d < 45) {
                const push = (45 - d);
                const dir = tip.x > pt.x ? -1 : 1;
                pt.x += dir * push * 0.4;

                // Trigger sound & vibration if plucked
                if (now - string.lastPluck > 180) {
                  string.lastPluck = now;
                  if (window.cyberAudio) {
                    window.cyberAudio.playPluck(string.frequency, push / 45);
                  }
                  if (window.particleSystem) {
                    window.particleSystem.emit(pt.x, pt.y, 8, color, 4);
                  }
                }
              }
            }
          }
        }
      }

      // Physics integration
      for (const pt of string.points) {
        // Soft pull back to base X position
        if (!pt.pinned) {
          pt.x += (string.baseX - pt.x) * 0.08;
          pt.update(0.94);
        }
      }
      for (let iter = 0; iter < 3; iter++) {
        for (const stick of string.sticks) {
          stick.update();
        }
      }
    }
  }

  draw(ctx, baseColor = '#00f3ff') {
    ctx.save();
    for (const string of this.strings) {
      ctx.beginPath();
      ctx.moveTo(string.points[0].x, string.points[0].y);
      for (let i = 1; i < string.points.length; i++) {
        const xc = (string.points[i - 1].x + string.points[i].x) / 2;
        const yc = (string.points[i - 1].y + string.points[i].y) / 2;
        ctx.quadraticCurveTo(string.points[i - 1].x, string.points[i - 1].y, xc, yc);
      }
      const last = string.points[string.points.length - 1];
      ctx.lineTo(last.x, last.y);

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = baseColor;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 12;
      ctx.stroke();

      // Core bright line
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Air Canvas Stroke Manager
class AirCanvasManager {
  constructor() {
    this.strokes = [];
    this.currentStroke = null;
    this.grabbedStroke = null;
    this.grabbedPointIdx = -1;
    this.maxPointsPerStroke = 500;
  }

  startStroke(x, y, color = '#00f3ff', width = 5) {
    this.currentStroke = {
      color,
      width,
      points: [{ x, y, timestamp: Date.now() }]
    };
    this.strokes.push(this.currentStroke);
  }

  addPoint(x, y) {
    if (!this.currentStroke) return;
    const pts = this.currentStroke.points;
    const last = pts[pts.length - 1];
    const dist = Math.hypot(x - last.x, y - last.y);
    if (dist > 3) {
      pts.push({ x, y, timestamp: Date.now() });
      if (pts.length > this.maxPointsPerStroke) {
        pts.shift();
      }
    }
  }

  endStroke() {
    this.currentStroke = null;
  }

  // Manipulate strokes using pinch
  grabOrDrag(pinchX, pinchY, isPinching) {
    if (isPinching) {
      if (!this.grabbedStroke) {
        // Find nearest point among all strokes
        let minDist = 40;
        let hitStroke = null;
        let hitIdx = -1;

        for (const s of this.strokes) {
          for (let i = 0; i < s.points.length; i++) {
            const p = s.points[i];
            const d = Math.hypot(p.x - pinchX, p.y - pinchY);
            if (d < minDist) {
              minDist = d;
              hitStroke = s;
              hitIdx = i;
            }
          }
        }

        if (hitStroke) {
          this.grabbedStroke = hitStroke;
          this.grabbedPointIdx = hitIdx;
          this.lastDragX = pinchX;
          this.lastDragY = pinchY;
        }
      }

      if (this.grabbedStroke) {
        const dx = pinchX - this.lastDragX;
        const dy = pinchY - this.lastDragY;
        // Drag nearest point or elastic influence surrounding points
        const pts = this.grabbedStroke.points;
        for (let i = 0; i < pts.length; i++) {
          const factor = Math.exp(-Math.pow(i - this.grabbedPointIdx, 2) / 36);
          pts[i].x += dx * factor;
          pts[i].y += dy * factor;
        }
        this.lastDragX = pinchX;
        this.lastDragY = pinchY;
      }
    } else {
      this.grabbedStroke = null;
      this.grabbedPointIdx = -1;
    }
  }

  clear() {
    this.strokes = [];
    this.currentStroke = null;
    this.grabbedStroke = null;
    if (window.cyberAudio) window.cyberAudio.playClear();
  }

  undo() {
    if (this.strokes.length > 0) {
      this.strokes.pop();
    }
  }

  draw(ctx) {
    if (this.strokes.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of this.strokes) {
      const pts = stroke.points;
      if (pts.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      for (let i = 1; i < pts.length; i++) {
        const xc = (pts[i - 1].x + pts[i].x) / 2;
        const yc = (pts[i - 1].y + pts[i].y) / 2;
        ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, xc, yc);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

      // Fast Neon Outer Glow (Ultra-fast GPU stroke without shadowBlur lag)
      ctx.lineWidth = stroke.width + 6;
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = 0.35;
      ctx.stroke();

      // Sharp Crisp Inner Core
      ctx.lineWidth = stroke.width;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.95;
      ctx.stroke();
    }
    ctx.restore();
  }
}

window.VerletPoint = VerletPoint;
window.VerletStick = VerletStick;
window.ParticleSystem = ParticleSystem;
window.SpacetimeMesh = SpacetimeMesh;
window.ElasticHarp = ElasticHarp;
window.AirCanvasManager = AirCanvasManager;

// Tareas UI Manager y Dashboard de Ingeniería
class TaskManager {
  constructor() {
    this.isOpen = true; // Por defecto abierto en esta vista
    this.buttonRect = { x: 20, y: 80, w: 200, h: 45 };
    this.voiceBtnRect = { x: 20, y: 135, w: 200, h: 40 };
    
    // Tareas orientadas a Ingeniería de Software
    this.tasks = [
      { text: "Daily Standup - 10:00 AM", done: false },
      { text: "Revisar Pull Request #42", done: false },
      { text: "Optimizar query de base de datos", done: false },
      { text: "Desplegar v2.1 a Producción", done: false }
    ];
    this.lastToggleTime = 0;
    
    // Web Speech API
    this.isListening = false;
    this.recognition = null;
    this.setupSpeechRecognition();
  }

  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'es-ES'; // Idioma español
      this.recognition.continuous = false;
      this.recognition.interimResults = false;

      this.recognition.onstart = () => {
        this.isListening = true;
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
           // Añadir lo que el usuario dictó como nueva tarea
           this.tasks.push({ text: "🗣️ " + transcript, done: false });
           if (window.cyberAudio) window.cyberAudio.playPluck(500, 1);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn("Error de reconocimiento de voz:", event.error);
        this.isListening = false;
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };
    } else {
      console.warn("Web Speech API no soportada en este navegador.");
    }
  }

  toggleListening() {
    if (!this.recognition) return;
    if (this.isListening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        console.error(e);
      }
    }
  }

  updateAndDraw(ctx, handsData, activeColor) {
    const now = Date.now();
    let isPinching = false;
    let pinchPt = null;

    if (handsData && handsData.length > 0) {
      for (const hand of handsData) {
        if (hand.analysis.isPinching) {
          isPinching = true;
          pinchPt = hand.screenTips.index;
          break;
        }
      }
    }

    // Comprobar clic en el botón principal (Dashboard)
    if (isPinching && pinchPt && (now - this.lastToggleTime > 400)) {
      if (
        pinchPt.x >= this.buttonRect.x && pinchPt.x <= this.buttonRect.x + this.buttonRect.w &&
        pinchPt.y >= this.buttonRect.y && pinchPt.y <= this.buttonRect.y + this.buttonRect.h
      ) {
        this.isOpen = !this.isOpen;
        this.lastToggleTime = now;
        if (window.particleSystem) window.particleSystem.emit(pinchPt.x, pinchPt.y, 5, activeColor, 3);
        if (window.cyberAudio) window.cyberAudio.playPinch(true);
      }
      
      // Comprobar clic en botón de voz
      if (
        this.isOpen &&
        pinchPt.x >= this.voiceBtnRect.x && pinchPt.x <= this.voiceBtnRect.x + this.voiceBtnRect.w &&
        pinchPt.y >= this.voiceBtnRect.y && pinchPt.y <= this.voiceBtnRect.y + this.voiceBtnRect.h
      ) {
         this.toggleListening();
         this.lastToggleTime = now;
         if (window.particleSystem) window.particleSystem.emit(pinchPt.x, pinchPt.y, 8, '#ff007f', 4);
         if (window.cyberAudio) window.cyberAudio.playPinch(true);
      }
    }

    ctx.save();
    
    // Dibujar Botón Principal (Header del Dashboard)
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(this.buttonRect.x, this.buttonRect.y, this.buttonRect.w, this.buttonRect.h, 8);
    } else {
      ctx.rect(this.buttonRect.x, this.buttonRect.y, this.buttonRect.w, this.buttonRect.h);
    }
    ctx.fillStyle = this.isOpen ? activeColor : 'rgba(0, 0, 0, 0.7)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = activeColor;
    ctx.stroke();

    ctx.fillStyle = this.isOpen ? '#000' : '#fff';
    ctx.font = 'bold 15px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💻 Dev Dashboard', this.buttonRect.x + this.buttonRect.w / 2, this.buttonRect.y + this.buttonRect.h / 2);

    // Dibujar Lista y Botón de Voz
    if (this.isOpen) {
      // Botón de Dictado por Voz
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(this.voiceBtnRect.x, this.voiceBtnRect.y, this.voiceBtnRect.w, this.voiceBtnRect.h, 8);
      else ctx.rect(this.voiceBtnRect.x, this.voiceBtnRect.y, this.voiceBtnRect.w, this.voiceBtnRect.h);
      
      ctx.fillStyle = this.isListening ? '#ff007f' : 'rgba(13, 17, 27, 0.85)';
      ctx.fill();
      ctx.strokeStyle = this.isListening ? '#fff' : '#ff007f';
      ctx.stroke();
      
      ctx.fillStyle = '#fff';
      ctx.font = '13px "Orbitron", sans-serif';
      const voiceText = this.isListening ? "🎙️ Escuchando..." : "🎤 Dictar Tarea";
      ctx.fillText(voiceText, this.voiceBtnRect.x + this.voiceBtnRect.w / 2, this.voiceBtnRect.y + this.voiceBtnRect.h / 2);

      // Panel de Lista
      const listX = this.buttonRect.x;
      const listY = this.voiceBtnRect.y + this.voiceBtnRect.h + 10;
      const listW = 320;
      const listH = this.tasks.length * 45 + 20;

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(listX, listY, listW, listH, 8);
      } else {
        ctx.rect(listX, listY, listW, listH);
      }
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fill();
      ctx.strokeStyle = activeColor;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = '14px Arial, sans-serif';

      for (let i = 0; i < this.tasks.length; i++) {
        const taskY = listY + 25 + (i * 45);
        
        // Draw Checkbox
        ctx.beginPath();
        ctx.rect(listX + 15, taskY - 14, 20, 20);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Handle Checkbox click
        if (isPinching && pinchPt && (now - this.lastToggleTime > 400)) {
          if (
            pinchPt.x >= listX + 5 && pinchPt.x <= listX + listW &&
            pinchPt.y >= taskY - 20 && pinchPt.y <= taskY + 15
          ) {
            this.tasks[i].done = !this.tasks[i].done;
            this.lastToggleTime = now;
            if (window.particleSystem) window.particleSystem.emit(pinchPt.x, pinchPt.y, 4, '#0f0', 2);
            if (window.cyberAudio) window.cyberAudio.playPinch(false);
          }
        }

        if (this.tasks[i].done) {
          ctx.beginPath();
          ctx.moveTo(listX + 19, taskY - 2);
          ctx.lineTo(listX + 25, taskY + 5);
          ctx.lineTo(listX + 33, taskY - 10);
          ctx.strokeStyle = '#0f0';
          ctx.stroke();
          ctx.fillStyle = '#888';
        } else {
          ctx.fillStyle = '#fff';
        }

        ctx.fillText(this.tasks[i].text, listX + 50, taskY + 1);
        
        // Draw strikethrough if done
        if (this.tasks[i].done) {
           ctx.beginPath();
           ctx.moveTo(listX + 50, taskY);
           ctx.lineTo(listX + 50 + ctx.measureText(this.tasks[i].text).width, taskY);
           ctx.strokeStyle = '#888';
           ctx.lineWidth = 1;
           ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}

window.TaskManager = TaskManager;
window.taskManager = new TaskManager();
window.particleSystem = new ParticleSystem();
