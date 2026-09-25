// Gesture Recognition and Hand Kinematics Analyzer
class GestureRecognizer {
  constructor() {
    this.prevPinchState = {};
  }

  // Calculate Euclidean distance between two 3D or 2D landmarks
  dist(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // 2D distance for screen-space calculations
  dist2D(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Check if a finger is extended relative to its MCP joint and wrist
  isFingerExtended(landmarks, tipIdx, pipIdx, mcpIdx) {
    const wrist = landmarks[0];
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    const mcp = landmarks[mcpIdx];
    
    // Finger is extended if tip is farther from wrist than pip and mcp
    const distTipWrist = this.dist2D(tip, wrist);
    const distPipWrist = this.dist2D(pip, wrist);
    return distTipWrist > distPipWrist * 1.15;
  }

  // Analyze a single hand and return recognized gestures and key metrics
  analyzeHand(landmarks, handIndex = 0, handedness = 'Right') {
    if (!landmarks || landmarks.length < 21) return null;

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    // Check individual finger extension
    const indexExtended = this.isFingerExtended(landmarks, 8, 6, 5);
    const middleExtended = this.isFingerExtended(landmarks, 12, 10, 9);
    const ringExtended = this.isFingerExtended(landmarks, 16, 14, 13);
    const pinkyExtended = this.isFingerExtended(landmarks, 20, 18, 17);

    // Thumb extension (distance from pinky MCP)
    const pinkyMCP = landmarks[17];
    const thumbExtended = this.dist2D(thumbTip, pinkyMCP) > this.dist2D(landmarks[2], pinkyMCP) * 1.2;

    // Pinch detection (Thumb Tip to Index Tip)
    const pinchDist = this.dist2D(thumbTip, indexTip);
    // Dynamic pinch threshold based on hand scale (wrist to middle MCP)
    const handScale = Math.max(0.08, this.dist2D(wrist, landmarks[9]));
    const pinchThreshold = handScale * 0.35;
    const isPinching = pinchDist < pinchThreshold;

    // Middle Pinch (Thumb Tip to Middle Tip)
    const middlePinchDist = this.dist2D(thumbTip, middleTip);
    const isMiddlePinching = middlePinchDist < pinchThreshold;

    // Pointing detection (Index finger extended and prominent compared to other fingers)
    const indexProminent = indexExtended && (this.dist2D(indexTip, wrist) > this.dist2D(middleTip, wrist) * 1.08);
    const otherFingersFolded = (!middleExtended && !ringExtended) || (this.dist2D(middleTip, wrist) < this.dist2D(indexTip, wrist) * 0.85);
    const isPointing = !isPinching && indexExtended && (indexProminent || otherFingersFolded);

    // Gesture Classification
    let gesture = 'UNKNOWN';
    let gestureName = 'Detectando...';
    let icon = '✋';

    const isFrame = indexExtended && thumbExtended && !middleExtended && !ringExtended && !pinkyExtended;

    if (isPinching) {
      gesture = 'PINCH';
      gestureName = 'Pellizco (Agarrar)';
      icon = '👌';
    } else if (isFrame) {
      gesture = 'FRAME';
      gestureName = 'Encuadre (Foto)';
      icon = '📸';
    } else if (isPointing) {
      gesture = 'POINTING';
      gestureName = 'Escribiendo (Índice)';
      icon = '✍️';
    } else if (indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
      gesture = 'PEACE';
      gestureName = 'Paz (Control)';
      icon = '✌️';
    } else if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended && !thumbExtended) {
      gesture = 'FIST';
      gestureName = 'Puño (Atracción)';
      icon = '✊';
    } else if (indexExtended && middleExtended && ringExtended && pinkyExtended && thumbExtended) {
      gesture = 'OPEN_HAND';
      gestureName = 'Mano Abierta';
      icon = '🖐️';
    }

    // Audio trigger on pinch start / release
    const wasPinching = this.prevPinchState[handIndex] || false;
    if (isPinching && !wasPinching) {
      if (window.cyberAudio) window.cyberAudio.playPinch(true);
    } else if (!isPinching && wasPinching) {
      if (window.cyberAudio) window.cyberAudio.playPinch(false);
    }
    this.prevPinchState[handIndex] = isPinching;

    // Pinch Center (midpoint between thumb and index tip)
    const pinchCenter = {
      x: (thumbTip.x + indexTip.x) / 2,
      y: (thumbTip.y + indexTip.y) / 2,
      z: (thumbTip.z + indexTip.z) / 2
    };

    return {
      handIndex,
      handedness,
      gesture,
      gestureName,
      icon,
      isPinching,
      pinchDist,
      pinchCenter,
      isMiddlePinching,
      fingers: {
        thumb: thumbExtended,
        index: indexExtended,
        middle: middleExtended,
        ring: ringExtended,
        pinky: pinkyExtended
      },
      tips: {
        thumb: thumbTip,
        index: indexTip,
        middle: middleTip,
        ring: ringTip,
        pinky: pinkyTip
      },
      wrist,
      handScale
    };
  }
}

window.GestureRecognizer = GestureRecognizer;
