// 3D Object Sculptor & Manipulator (Solid Faces, Wireframe, and Hybrid Hologram)

class WireframeObject3D {
  constructor(canvasWidth, canvasHeight) {
    this.width = canvasWidth;
    this.height = canvasHeight;

    // Transform
    this.position = { x: canvasWidth / 2, y: canvasHeight / 2, z: 0 };
    this.rotation = { x: 0.35, y: 0.55, z: 0 };
    this.scale = { x: 180, y: 180, z: 180 };
    
    // Physics (Inertia)
    this.rotVelocity = { x: 0, y: 0, z: 0 };
    this.posVelocity = { x: 0, y: 0 };
    this.scaleVelocity = 0;

    // Rendering Style: 'solid-wireframe' (Holograma/Cristal) | 'solid' (Sólido Opaco) | 'wireframe' (Solo Líneas)
    this.renderStyle = 'solid-wireframe';

    // Interaction states
    this.modelType = 'cube';
    this.grabbedVertexIdx = -1;
    this.isDraggingObject = false;
    this.lastPinchPos = null;
    this.lastTwoHandDist = null;
    this.lastTwoHandAngle = null;

    // Geometry data
    this.baseVertices = [];
    this.vertices = [];
    this.edges = [];
    this.faces = [];

    this.loadModel('cube');
  }

  resize(width, height) {
    this.position.x = width / 2;
    this.position.y = height / 2;
    this.width = width;
    this.height = height;
  }

  setRenderStyle(style) {
    this.renderStyle = style;
  }

  // Generate 3D Geometries with both Edges and Faces
  loadModel(type) {
    this.modelType = type;
    this.grabbedVertexIdx = -1;
    this.isDraggingObject = false;

    if (type === 'cube') {
      this.buildSubdividedCube();
    } else if (type === 'sphere') {
      this.buildSphere(10, 10);
    } else if (type === 'torus') {
      this.buildTorus(10, 8);
    } else if (type === 'pyramid') {
      this.buildPyramid();
    }

    // Save baseline copy for reset and sculpting reference
    this.baseVertices = this.vertices.map(v => ({ ...v }));
  }

  // Subdivided Solid Cube with Quads on all 6 faces
  buildSubdividedCube() {
    this.vertices = [];
    this.edges = [];
    this.faces = [];
    const size = 1.0;
    const segments = 3;

    const faces = [
      (u, v) => ({ x: u, y: v, z: size }),
      (u, v) => ({ x: u, y: v, z: -size }),
      (u, v) => ({ x: size, y: u, z: v }),
      (u, v) => ({ x: -size, y: u, z: v }),
      (u, v) => ({ x: u, y: size, z: v }),
      (u, v) => ({ x: u, y: -size, z: v })
    ];

    const vertexMap = new Map();
    const getKey = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;

    const addVert = (x, y, z) => {
      const key = getKey(x, y, z);
      if (vertexMap.has(key)) return vertexMap.get(key);
      const idx = this.vertices.length;
      this.vertices.push({ x, y, z });
      vertexMap.set(key, idx);
      return idx;
    };

    const edgeSet = new Set();
    const addEdge = (i1, i2) => {
      if (i1 === i2) return;
      const key = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        this.edges.push([i1, i2]);
      }
    };

    for (let f = 0; f < 6; f++) {
      const faceFn = faces[f];
      for (let i = 0; i < segments; i++) {
        for (let j = 0; j < segments; j++) {
          const u1 = -size + (2 * size * i) / segments;
          const u2 = -size + (2 * size * (i + 1)) / segments;
          const v1 = -size + (2 * size * j) / segments;
          const v2 = -size + (2 * size * (j + 1)) / segments;

          const p00 = faceFn(u1, v1);
          const p10 = faceFn(u2, v1);
          const p11 = faceFn(u2, v2);
          const p01 = faceFn(u1, v2);

          const i00 = addVert(p00.x, p00.y, p00.z);
          const i10 = addVert(p10.x, p10.y, p10.z);
          const i11 = addVert(p11.x, p11.y, p11.z);
          const i01 = addVert(p01.x, p01.y, p01.z);

          addEdge(i00, i10);
          addEdge(i10, i11);
          addEdge(i11, i01);
          addEdge(i01, i00);

          // Solid face quad
          this.faces.push([i00, i10, i11, i01]);
        }
      }
    }
  }

  // Geodesic UV Sphere
  buildSphere(latSegments = 10, lonSegments = 12) {
    this.vertices = [];
    this.edges = [];
    this.faces = [];
    const r = 1.1;

    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat * Math.PI) / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / lonSegments;
        const x = r * sinTheta * Math.cos(phi);
        const y = r * cosTheta;
        const z = r * sinTheta * Math.sin(phi);
        this.vertices.push({ x, y, z });
      }
    }

    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first = lat * (lonSegments + 1) + lon;
        const second = first + lonSegments + 1;

        this.edges.push([first, first + 1]);
        this.edges.push([first, second]);
        this.edges.push([second, second + 1]);

        this.faces.push([first, first + 1, second + 1, second]);
      }
    }
  }

  // Torus / Donut
  buildTorus(tubeSegments = 12, radialSegments = 8) {
    this.vertices = [];
    this.edges = [];
    this.faces = [];
    const R = 0.9;
    const r = 0.38;

    for (let i = 0; i < tubeSegments; i++) {
      const u = (i * 2 * Math.PI) / tubeSegments;
      for (let j = 0; j < radialSegments; j++) {
        const v = (j * 2 * Math.PI) / radialSegments;
        const x = (R + r * Math.cos(v)) * Math.cos(u);
        const y = (R + r * Math.cos(v)) * Math.sin(u);
        const z = r * Math.sin(v);
        this.vertices.push({ x, y, z });
      }
    }

    for (let i = 0; i < tubeSegments; i++) {
      const nextI = (i + 1) % tubeSegments;
      for (let j = 0; j < radialSegments; j++) {
        const nextJ = (j + 1) % radialSegments;
        const curr = i * radialSegments + j;
        const right = nextI * radialSegments + j;
        const up = i * radialSegments + nextJ;
        const diag = nextI * radialSegments + nextJ;

        this.edges.push([curr, right]);
        this.edges.push([curr, up]);

        this.faces.push([curr, right, diag, up]);
      }
    }
  }

  // Octahedral Diamond Pyramid
  buildPyramid() {
    this.vertices = [
      { x: 0, y: -1.3, z: 0 },  // 0: Top apex
      { x: 0, y: 1.3, z: 0 },   // 1: Bottom apex
      { x: 1, y: 0, z: 0 },     // 2
      { x: 0, y: 0, z: 1 },     // 3
      { x: -1, y: 0, z: 0 },    // 4
      { x: 0, y: 0, z: -1 }     // 5
    ];

    this.edges = [
      [0, 2], [0, 3], [0, 4], [0, 5],
      [1, 2], [1, 3], [1, 4], [1, 5],
      [2, 3], [3, 4], [4, 5], [5, 2]
    ];

    // Solid triangle faces
    this.faces = [
      [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 2], // Top pyramid
      [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 2, 5]  // Bottom pyramid
    ];
  }

  resetShape() {
    this.vertices = this.baseVertices.map(v => ({ ...v }));
    this.scale = { x: 180, y: 180, z: 180 };
    this.rotation = { x: 0.35, y: 0.55, z: 0 };
    this.position = { x: this.width / 2, y: this.height / 2, z: 0 };
    this.rotVelocity = { x: 0, y: 0, z: 0 };
    this.posVelocity = { x: 0, y: 0 };
    this.scaleVelocity = 0;
    if (window.cyberAudio) window.cyberAudio.playClear();
  }

  // 3D Matrix Transformations
  transformPoint(pt) {
    let x = pt.x * this.scale.x;
    let y = pt.y * this.scale.y;
    let z = pt.z * this.scale.z;

    // Rotate X
    const cosX = Math.cos(this.rotation.x);
    const sinX = Math.sin(this.rotation.x);
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;

    // Rotate Y
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;

    // Rotate Z
    const cosZ = Math.cos(this.rotation.z);
    const sinZ = Math.sin(this.rotation.z);
    const x3 = x2 * cosZ - y1 * sinZ;
    const y3 = x2 * sinZ + y1 * cosZ;

    // Perspective projection
    const fov = 750;
    const depth = fov / (fov + z2 + this.position.z + 400);

    return {
      screenX: this.position.x + x3 * depth,
      screenY: this.position.y + y3 * depth,
      worldX: x3,
      worldY: y3,
      worldZ: z2,
      depthZ: z2,
      scaleFactor: depth,
      orig3D: pt
    };
  }

  unprojectDelta(dx, dy) {
    const cosZ = Math.cos(-this.rotation.z);
    const sinZ = Math.sin(-this.rotation.z);
    const rx = dx * cosZ - dy * sinZ;
    const ry = dx * sinZ + dy * cosZ;

    const cosY = Math.cos(-this.rotation.y);
    const sinY = Math.sin(-this.rotation.y);
    const rz = -rx * sinY;
    const rx2 = rx * cosY;

    const cosX = Math.cos(-this.rotation.x);
    const sinX = Math.sin(-this.rotation.x);
    const ry2 = ry * cosX - rz * sinX;
    const rz2 = ry * sinX + rz * cosX;

    return {
      x: rx2 / this.scale.x,
      y: ry2 / this.scale.y,
      z: rz2 / this.scale.z
    };
  }

  interact(handsData) {
    // Apply Physics & Damping (Inertia)
    this.rotation.x += this.rotVelocity.x;
    this.rotation.y += this.rotVelocity.y;
    this.rotation.z += this.rotVelocity.z;
    
    this.position.x += this.posVelocity.x;
    this.position.y += this.posVelocity.y;
    
    this.scale.x = Math.max(60, Math.min(this.scale.x + this.scaleVelocity, 450));
    this.scale.y = Math.max(60, Math.min(this.scale.y + this.scaleVelocity, 450));
    this.scale.z = Math.max(60, Math.min(this.scale.z + this.scaleVelocity, 450));

    this.rotVelocity.x *= 0.92;
    this.rotVelocity.y *= 0.92;
    this.rotVelocity.z *= 0.92;
    this.posVelocity.x *= 0.85;
    this.posVelocity.y *= 0.85;
    this.scaleVelocity *= 0.85;

    // Idle rotation if completely still
    if (!this.isInteracting && Math.abs(this.rotVelocity.x) < 0.001 && Math.abs(this.rotVelocity.y) < 0.001) {
      this.rotation.y += 0.003;
      this.rotation.x += 0.0015;
    }

    if (!handsData || handsData.length === 0) {
      this.isInteracting = false;
      this.grabbedVertexIdx = -1;
      this.lastPinchPos = null;
      this.lastTwoHandDist = null;
      return;
    }

    this.isInteracting = true;
    const projected = this.vertices.map((v, idx) => ({
      ...this.transformPoint(v),
      idx
    }));

    // TWO HAND INTERACTION: Rotate, Stretch / Scale along axes
    if (handsData.length >= 2) {
      this.handleTwoHandManipulation(handsData, projected);
      return;
    }

    // ONE HAND INTERACTION: Sculpt or Move/Rotate
    const hand = handsData[0];
    const isPinching = hand.analysis.isPinching;
    const pinchPt = {
      x: (1 - hand.analysis.pinchCenter.x) * this.width,
      y: hand.analysis.pinchCenter.y * this.height
    };

    if (isPinching) {
      if (this.grabbedVertexIdx === -1 && !this.isDraggingObject) {
        let minDist = 50;
        let targetIdx = -1;

        for (const pt of projected) {
          const d = Math.hypot(pt.screenX - pinchPt.x, pt.screenY - pinchPt.y);
          if (d < minDist) {
            minDist = d;
            targetIdx = pt.idx;
          }
        }

        if (targetIdx !== -1) {
          this.grabbedVertexIdx = targetIdx;
          this.lastPinchPos = pinchPt;
          if (window.cyberAudio) window.cyberAudio.playPinch(true);
        } else {
          const distToCenter = Math.hypot(this.position.x - pinchPt.x, this.position.y - pinchPt.y);
          if (distToCenter < 190) {
            this.isDraggingObject = true;
            this.lastPinchPos = pinchPt;
            if (window.cyberAudio) window.cyberAudio.playPinch(true);
          }
        }
      }

      if (this.grabbedVertexIdx !== -1 && this.lastPinchPos) {
        const dx = pinchPt.x - this.lastPinchPos.x;
        const dy = pinchPt.y - this.lastPinchPos.y;
        const d3 = this.unprojectDelta(dx, dy);

        const targetV = this.vertices[this.grabbedVertexIdx];
        const sculptRadius = 0.7;

        for (let i = 0; i < this.vertices.length; i++) {
          const v = this.vertices[i];
          const dist3D = Math.hypot(v.x - targetV.x, v.y - targetV.y, v.z - targetV.z);
          if (dist3D < sculptRadius) {
            const influence = Math.exp(-Math.pow(dist3D / (sculptRadius * 0.5), 2));
            v.x += d3.x * influence;
            v.y += d3.y * influence;
            v.z += d3.z * influence;
          }
        }

        if (window.particleSystem && Math.random() < 0.4) {
          window.particleSystem.emit(pinchPt.x, pinchPt.y, 2, '#ff007f', 2);
        }

        this.lastPinchPos = pinchPt;
      } else if (this.isDraggingObject && this.lastPinchPos) {
        const dx = pinchPt.x - this.lastPinchPos.x;
        const dy = pinchPt.y - this.lastPinchPos.y;
        
        // Add momentum
        this.posVelocity.x = dx * 0.4;
        this.posVelocity.y = dy * 0.4;
        
        this.position.x += dx;
        this.position.y += dy;
        this.lastPinchPos = pinchPt;
      }
    } else {
      if (this.grabbedVertexIdx !== -1 || this.isDraggingObject) {
        if (window.cyberAudio) window.cyberAudio.playPinch(false);
      }
      this.grabbedVertexIdx = -1;
      this.isDraggingObject = false;
      this.lastPinchPos = null;

      // Finger Push / Clay Molding
      const indexTip = hand.screenTips.index;
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        const dist = Math.hypot(p.screenX - indexTip.x, p.screenY - indexTip.y);
        if (dist < 40) {
          const pushForce = (40 - dist) * 0.0025;
          const v = this.vertices[p.idx];
          const len = Math.hypot(v.x, v.y, v.z) || 1;
          v.x += (v.x / len) * pushForce;
          v.y += (v.y / len) * pushForce;
          v.z += (v.z / len) * pushForce;

          if (window.particleSystem && Math.random() < 0.2) {
            window.particleSystem.emit(p.screenX, p.screenY, 1, '#00f3ff', 1);
          }
        }
      }

      // Rotate with open palm (adds rotational velocity)
      if (hand.analysis.gesture === 'OPEN_HAND') {
        const palmCenter = hand.screenTips.middle;
        if (this.prevPalmX !== undefined) {
          const deltaX = palmCenter.x - this.prevPalmX;
          const deltaY = palmCenter.y - this.prevPalmY;
          this.rotVelocity.y = deltaX * 0.003;
          this.rotVelocity.x = -deltaY * 0.003;
        }
        this.prevPalmX = palmCenter.x;
        this.prevPalmY = palmCenter.y;
      } else {
        this.prevPalmX = undefined;
        this.prevPalmY = undefined;
      }
    }
  }

  handleTwoHandManipulation(handsData, projected) {
    const h1 = handsData[0].screenTips.index;
    const h2 = handsData[1].screenTips.index;

    const currentDist = Math.hypot(h2.x - h1.x, h2.y - h1.y);
    const currentAngle = Math.atan2(h2.y - h1.y, h2.x - h1.x);
    const midX = (h1.x + h2.x) / 2;
    const midY = (h1.y + h2.y) / 2;

    if (this.lastTwoHandDist !== null) {
      const distDelta = currentDist - this.lastTwoHandDist;
      this.scaleVelocity = distDelta * 0.8;

      const angleDelta = currentAngle - this.lastTwoHandAngle;
      this.rotVelocity.z = angleDelta * 0.3;

      const dx = midX - this.lastTwoHandMidX;
      const dy = midY - this.lastTwoHandMidY;
      this.posVelocity.x = dx * 0.3;
      this.posVelocity.y = dy * 0.3;
      
      this.position.x += dx * 0.8;
      this.position.y += dy * 0.8;

      if (window.particleSystem && Math.random() < 0.25) {
        window.particleSystem.emit(midX, midY, 2, '#00f3ff', 2);
      }
    }

    this.lastTwoHandDist = currentDist;
    this.lastTwoHandAngle = currentAngle;
    this.lastTwoHandMidX = midX;
    this.lastTwoHandMidY = midY;
  }

  // Hex color to RGB object
  hexToRgb(hex) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  // Render 3D Object with Solid Faces, Shading, and Neon Edges
  draw(ctx, primaryColor = '#00f3ff') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rgb = this.hexToRgb(primaryColor);
    const lightDir = { x: -0.35, y: -0.65, z: 0.67 }; // Directional light from top-left front

    // 1. Transform all vertices
    const projected = this.vertices.map((v, idx) => ({
      ...this.transformPoint(v),
      idx
    }));

    // 2. RENDER SOLID FACES (if style is 'solid' or 'solid-wireframe')
    if (this.renderStyle !== 'wireframe' && this.faces.length > 0) {
      // Sort faces by average depth Z from back to front (Painter's algorithm)
      const sortedFaces = this.faces.map(faceIndices => {
        let sumZ = 0;
        for (const idx of faceIndices) {
          sumZ += projected[idx].depthZ;
        }
        return {
          indices: faceIndices,
          avgZ: sumZ / faceIndices.length
        };
      }).sort((a, b) => a.avgZ - b.avgZ);

      for (const face of sortedFaces) {
        const pts = face.indices.map(i => projected[i]);
        if (pts.length < 3) continue;

        // Calculate face normal in 3D world space
        const v0 = pts[0];
        const v1 = pts[1];
        const v2 = pts[2];

        const ax = v1.worldX - v0.worldX;
        const ay = v1.worldY - v0.worldY;
        const az = v1.worldZ - v0.worldZ;

        const bx = v2.worldX - v0.worldX;
        const by = v2.worldY - v0.worldY;
        const bz = v2.worldZ - v0.worldZ;

        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;

        // Diffuse lighting calculation (dot product with light direction)
        const dot = nx * lightDir.x + ny * lightDir.y + nz * lightDir.z;
        const diffuse = Math.min(1.0, Math.max(0.18, (dot * 0.5 + 0.5)));

        // Shaded face color
        const rShaded = Math.round(rgb.r * diffuse);
        const gShaded = Math.round(rgb.g * diffuse);
        const bShaded = Math.round(rgb.b * diffuse);

        // Opacity: Solid vs Translucent Hologram
        const faceAlpha = (this.renderStyle === 'solid') ? 0.95 : 0.42;

        ctx.beginPath();
        ctx.moveTo(pts[0].screenX, pts[0].screenY);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].screenX, pts[i].screenY);
        }
        ctx.closePath();

        ctx.fillStyle = `rgba(${rShaded}, ${gShaded}, ${bShaded}, ${faceAlpha})`;
        ctx.shadowBlur = 0;
        ctx.fill();

        // Subtle borders on faces for solid look
        if (this.renderStyle === 'solid') {
          ctx.strokeStyle = `rgba(${Math.min(255, rShaded + 40)}, ${Math.min(255, gShaded + 40)}, ${Math.min(255, bShaded + 40)}, 0.8)`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    // 3. RENDER NEON EDGES (if style is 'wireframe' or 'solid-wireframe')
    if (this.renderStyle !== 'solid') {
      const sortedEdges = this.edges.map(([i1, i2]) => {
        const p1 = projected[i1];
        const p2 = projected[i2];
        const avgZ = (p1.depthZ + p2.depthZ) / 2;
        return { p1, p2, avgZ };
      }).sort((a, b) => a.avgZ - b.avgZ);

      for (const edge of sortedEdges) {
        const { p1, p2, avgZ } = edge;
        const depthAlpha = Math.max(0.3, Math.min(1.0, 0.75 + avgZ * 0.002));
        ctx.globalAlpha = depthAlpha;

        ctx.beginPath();
        ctx.moveTo(p1.screenX, p1.screenY);
        ctx.lineTo(p2.screenX, p2.screenY);

        ctx.lineWidth = 3.5;
        ctx.strokeStyle = primaryColor;
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 12;
        ctx.stroke();

        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 2;
        ctx.stroke();
      }
    }

    // 4. Draw Sculpting Nodes / Vertices
    for (const pt of projected) {
      const isGrabbed = (pt.idx === this.grabbedVertexIdx);

      ctx.beginPath();
      if (isGrabbed) {
        ctx.arc(pt.screenX, pt.screenY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 20;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt.screenX, pt.screenY, 14, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (this.renderStyle !== 'solid') {
        ctx.arc(pt.screenX, pt.screenY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = 6;
        ctx.fill();
      }
    }

    // 5. Draw 3D Center Pivot Reticle
    ctx.beginPath();
    ctx.arc(this.position.x, this.position.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
}

window.WireframeObject3D = WireframeObject3D;
