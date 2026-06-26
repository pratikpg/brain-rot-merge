// game.js - Brain Rot Merge Game Core Logic (Dynamic Outline Physics Edition)

// 1. GAME DEFINITIONS AND TIER CONFIGURATIONS
const Tiers = [
  { id: 0, name: "Tralaleo", imgSrc: "assets/tralaleo.png", color: "#3b82f6", score: 2, size: 47 },     // 5% larger (45 -> 47)
  { id: 1, name: "Larele", imgSrc: "assets/larele.png", color: "#22c55e", score: 4, size: 68 },       // 5% larger (65 -> 68)
  { id: 2, name: "Capuchinna", imgSrc: "assets/capuchinna.png", color: "#ec4899", score: 8, size: 89 },   // 5% larger (85 -> 89)
  { id: 3, name: "Sigma Boy", imgSrc: "assets/sigma_boy.png", color: "#f97316", score: 16, size: 116 },  // 5% larger (110 -> 116)
  { id: 4, name: "Mewing Cat", imgSrc: "assets/mewing_cat.png", color: "#06b6d4", score: 32, size: 147 },  // 5% larger (140 -> 147)
  { id: 5, name: "The Rizzler", imgSrc: "assets/the_rizzler.png", color: "#a855f7", score: 64, size: 184 },   // 5% larger (175 -> 184)
  { id: 6, name: "Skibidi Blob", imgSrc: "assets/skibidi_blob.png", color: "#6b7280", score: 128, size: 226 }, // 5% larger (215 -> 226)
  { id: 7, name: "Giga Chad", imgSrc: "assets/giga_chad_emoji.png", color: "#eab308", score: 256, size: 273 }, // 5% larger (260 -> 273)
  { id: 8, name: "Meme King", imgSrc: "assets/brain_rot_king.png", color: "#ef4444", score: 512, size: 326 }    // 5% larger (310 -> 326)
];

// Helper functions for logical dimensions (always square to prevent squeezing!)
function getHalfWidth(tier) {
  return tier.size / 2;
}

function getHalfHeight(tier) {
  return tier.size / 2;
}

// Canvas Setup
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 450;
canvas.height = 700;

const canvasWrapper = document.getElementById("canvasWrapper");

// UI Elements
const currentScoreEl = document.getElementById("currentScore");
const bestScoreEl = document.getElementById("bestScore");
const nextPreviewImg = document.getElementById("nextPreviewImg");
const startOverlay = document.getElementById("startOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const legendOverlay = document.getElementById("legendOverlay");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const restartOverlayBtn = document.getElementById("restartOverlayBtn");
const legendBtn = document.getElementById("legendBtn");
const closeLegendBtn = document.getElementById("closeLegendBtn");
const muteBtn = document.getElementById("muteBtn");
const muteIcon = document.getElementById("muteIcon");
const muteText = document.getElementById("muteText");
const gameOverCommentEl = document.getElementById("gameOverComment");
const finalScoreEl = document.getElementById("finalScore");
const finalBestEl = document.getElementById("finalBest");

// Matter.js Aliases
const Engine = Matter.Engine,
      World = Matter.World,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events,
      Runner = Matter.Runner;

// Game State variables
let engine;
let world;
let runner;
let gameState = 'start';
let score = 0;
let highScore = localStorage.getItem("brainrot_highscore") || 0;
bestScoreEl.innerText = highScore;

// Debug and Speech Synthesis throttle state
let DEBUG_PRESPAWN = false; // Set to true to start with larger characters for testing
let lastKingMergeTime = 0;

// Explicit male voice configuration for SpeechSynthesis
let maleVoice = null;
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  // Search for David, UK Male, or any name containing "male"
  maleVoice = voices.find(v => 
    v.name.toLowerCase().includes("male") ||
    v.name.toLowerCase().includes("david") ||
    v.name.toLowerCase().includes("google uk english male")
  ) || voices.find(v => v.lang.startsWith("en"));
}
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

// Cache Busting Version Control
const CURRENT_VERSION = "1.0.1";
function checkForUpdates() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return; // Don't check for updates when testing locally
  }
  fetch('version.json?t=' + Date.now())
    .then(res => res.json())
    .then(data => {
      if (data && data.version !== CURRENT_VERSION) {
        console.log("New version detected:", data.version);
        // Force browser to reload with the new version as query parameter
        window.location.href = window.location.pathname + '?v=' + data.version;
      }
    })
    .catch(err => console.warn("Update check failed:", err));
}

// Spawner Settings
const dropY = 80;
const warningLineY = 160;
let spawnerX = 225;
let currentTier = 0;
let nextTier = 0;
let canDrop = true;
let spawnerActive = false;

// Cooldown and Timers
let lastTime = Date.now();
let dangerTime = 0;
let isDangerActive = false;

// Sprite loading and dynamic background extraction / boundary tracing
const loadedImages = {};
const transparentCanvases = {};
let processedImagesCount = 0;
let assetsLoaded = false;

Tiers.forEach(tier => {
  const img = new Image();
  img.src = tier.imgSrc;
  img.onload = () => {
    // 1. Process white background to transparent using BFS flood fill
    makeImageTransparent(img, (transCanvas) => {
      transparentCanvases[tier.id] = transCanvas;
      
      // 2. Dynamically trace transparent boundary to calculate physical outline vertices
      tier.vertices = extractVerticesFromImage(transCanvas, tier.size);
      
      // 3. Calculate mathematical centroid of vertices to correct image alignment offset
      let sumX = 0, sumY = 0;
      tier.vertices.forEach(v => {
        sumX += v.x;
        sumY += v.y;
      });
      tier.centroid = {
        x: sumX / tier.vertices.length,
        y: sumY / tier.vertices.length
      };

      processedImagesCount++;
      if (processedImagesCount === Tiers.length) {
        assetsLoaded = true;
        console.log("All character sprites loaded, transparency extracted, and physics outlines mapped.");
      }
    });
  };
  img.onerror = () => {
    console.warn(`Failed to load sprite for ${tier.name}`);
    // Fallback circular vertices
    tier.vertices = createCircularVertices(tier.size / 2);
    tier.centroid = { x: 0, y: 0 };
    processedImagesCount++;
    if (processedImagesCount === Tiers.length) {
      assetsLoaded = true;
    }
  };
  loadedImages[tier.id] = img;
});

// Fallback vertices generator
function createCircularVertices(radius) {
  const verts = [];
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    verts.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return verts;
}

// BFS Flood Fill algorithm to make outer white background pixels transparent while preserving inner whites (eyes, smiles, teeth)
function makeImageTransparent(img, callback) {
  const offCanvas = document.createElement("canvas");
  offCanvas.width = img.naturalWidth || img.width;
  offCanvas.height = img.naturalHeight || img.height;
  const oCtx = offCanvas.getContext("2d");
  oCtx.drawImage(img, 0, 0);
  
  try {
    const imgData = oCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    const data = imgData.data;
    const w = offCanvas.width;
    const h = offCanvas.height;
    
    const visited = new Uint8Array(w * h);
    const queue = [];
    
    function pushIfWhite(x, y) {
      const idx = y * w + x;
      if (visited[idx]) return;
      
      const pixelIdx = idx * 4;
      const r = data[pixelIdx];
      const g = data[pixelIdx + 1];
      const b = data[pixelIdx + 2];
      
      // If color is very close to white background
      if (r > 240 && g > 240 && b > 240) {
        visited[idx] = 1;
        queue.push(idx);
      }
    }
    
    // Seed borders into queue
    for (let x = 0; x < w; x++) {
      pushIfWhite(x, 0);
      pushIfWhite(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      pushIfWhite(0, y);
      pushIfWhite(w - 1, y);
    }
    
    // BFS queue loop
    let qIdx = 0;
    while (qIdx < queue.length) {
      const curr = queue[qIdx++];
      const cx = curr % w;
      const cy = Math.floor(curr / w);
      
      const neighbors = [
        { x: cx + 1, y: cy },
        { x: cx - 1, y: cy },
        { x: cx, y: cy + 1 },
        { x: cx, y: cy - 1 }
      ];
      
      neighbors.forEach(n => {
        if (n.x >= 0 && n.x < w && n.y >= 0 && n.y < h) {
          pushIfWhite(n.x, n.y);
        }
      });
    }
    
    // Make visited pixels transparent
    for (let idx = 0; idx < visited.length; idx++) {
      if (visited[idx]) {
        const pixelIdx = idx * 4;
        data[pixelIdx + 3] = 0; // Alpha = 0
      }
    }
    
    oCtx.putImageData(imgData, 0, 0);
    callback(offCanvas);
  } catch (err) {
    console.error("Error making background transparent:", err);
    callback(img); // Fallback
  }
}

// Traces the transparent boundary of the character using radial raycast steps to generate clockwise physical outline vertices
function extractVerticesFromImage(canvas, size) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  
  const cx = w / 2;
  const cy = h / 2;
  
  const numSamples = 12; // 12-sided polygon captures custom body outlines (ears, neck, wizard hats) perfectly
  const vertices = [];
  
  for (let i = 0; i < numSamples; i++) {
    const angle = (i / numSamples) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    // Max radius from center to boundary diagonal corners
    const maxRadius = Math.sqrt(cx*cx + cy*cy);
    let px = cx;
    let py = cy;
    
    // Shoot ray from outer diagonal limit inwards to find outer-most solid pixel boundary
    for (let r = maxRadius; r >= 0; r -= 1.2) {
      const rx = Math.round(cx + r * cos);
      const ry = Math.round(cy + r * sin);
      
      if (rx >= 0 && rx < w && ry >= 0 && ry < h) {
        const pixelIdx = (ry * w + rx) * 4;
        const alpha = data[pixelIdx + 3];
        
        if (alpha > 40) { // Solid boundary pixel found
          px = rx;
          py = ry;
          break;
        }
      }
    }
    
    // Scale coordinate relative to target logical game size and apply a 5% scaling offset.
    // This compensates for the flat segments of the 12-sided polygon clipping the circular visual curves,
    // prevents visual overlapping, and increases game difficulty under density pressure.
    const scaleFactor = 1.05;
    const scaleX = (size / w) * scaleFactor;
    const scaleY = (size / h) * scaleFactor;
    vertices.push({
      x: (px - cx) * scaleX,
      y: (py - cy) * scaleY
    });
  }
  
  return vertices;
}

// Sound Controller
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isMuted = false;

function initAudio() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// 2. AUDIO SYNTHESIS
function playDropSound() {
  if (isMuted) return;
  initAudio();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.22);
  
  gainNode.gain.setValueAtTime(0.08, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

function playBounceSound(speed) {
  if (isMuted) return;
  initAudio();
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.linearRampToValueAtTime(45, now + 0.07);
  
  const volume = Math.min(0.06, speed * 0.008);
  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

function playMergeSound(tier) {
  if (isMuted) return;
  initAudio();
  const now = audioCtx.currentTime;
  
  let notes = [261.63, 329.63];
  let duration = 0.12;
  let type = 'sine';
  
  if (tier === 1) notes = [329.63, 392.00];
  else if (tier === 2) notes = [392.00, 523.25];
  else if (tier === 3) notes = [523.25, 659.25, 783.99];
  else if (tier === 4) { notes = [587.33, 739.99, 880.00]; type = 'triangle'; }
  else if (tier === 5) { notes = [659.25, 830.61, 987.77]; type = 'triangle'; }
  else if (tier === 6) { notes = [783.99, 987.77, 1174.66, 1318.51]; type = 'triangle'; duration = 0.08; }
  else if (tier === 7) { notes = [880.00, 1109.73, 1318.51, 1661.22]; type = 'sine'; duration = 0.08; }
  else if (tier >= 8) { notes = [1046.50, 1318.51, 1567.98, 2093.00, 2637.02]; type = 'sine'; duration = 0.07; }
  
  let timeOffset = 0;
  notes.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + timeOffset);
    
    gainNode.gain.setValueAtTime(0.08, now + timeOffset);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + duration);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start(now + timeOffset);
    osc.stop(now + timeOffset + duration);
    
    timeOffset += duration * 0.75;
  });
}

function speakMemeName(name, tier) {
  if (isMuted) return;
  if (!('speechSynthesis' in window)) return;
  
  // Prevent smaller merges from cutting off the Meme King speech instruction
  if (Date.now() - lastKingMergeTime < 5000 && tier < 8) {
    return;
  }
  
  try {
    window.speechSynthesis.cancel();
    
    // For Meme King instructions, update the timestamp
    if (name.includes("Brain Rot King formed")) {
      lastKingMergeTime = Date.now();
    }
    
    const utterance = new SpeechSynthesisUtterance(name);
    if (maleVoice) {
      utterance.voice = maleVoice;
    }
    
    if (tier === 0) {
      utterance.pitch = 2.0; utterance.rate = 1.7;
    } else if (tier === 1) {
      utterance.pitch = 1.4; utterance.rate = 1.2;
    } else if (tier === 2) {
      utterance.pitch = 1.8; utterance.rate = 2.0;
    } else if (tier === 3) {
      utterance.pitch = 0.6; utterance.rate = 1.1;
    } else if (tier === 4) {
      if (name === Tiers[4].name) utterance.text = "shh Mewing";
      utterance.pitch = 1.2; utterance.rate = 1.0;
    } else if (tier === 5) {
      if (name === Tiers[5].name) utterance.text = "The Rizzler";
      utterance.pitch = 0.85; utterance.rate = 0.8;
    } else if (tier === 6) {
      if (name === Tiers[6].name) utterance.text = "Skibidi toilet";
      utterance.pitch = 1.6; utterance.rate = 1.7;
    } else if (tier === 7) {
      if (name === Tiers[7].name) utterance.text = "Giga Chad";
      utterance.pitch = 0.35; utterance.rate = 0.9;
    } else if (tier === 8) {
      if (name === Tiers[8].name) {
        utterance.text = "Meme King! Wow!";
      }
      utterance.pitch = 1.3; utterance.rate = 1.4;
    }
    
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("SpeechSynthesis error:", err);
  }
}

// 3. FX AND PARTICLES
const particles = [];
const floatingTexts = [];
let shakeDuration = 0;
let shakeIntensity = 0;

function triggerShake(duration, intensity) {
  shakeDuration = duration;
  shakeIntensity = intensity;
}

class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8 - 4;
    this.radius = Math.random() * 4 + 3;
    this.color = color;
    this.alpha = 1;
    this.decay = Math.random() * 0.02 + 0.015;
    this.gravity = 0.22;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.alpha -= this.decay;
  }
  
  draw(c) {
    c.save();
    c.globalAlpha = this.alpha;
    c.fillStyle = this.color;
    c.shadowBlur = 8;
    c.shadowColor = this.color;
    c.beginPath();
    c.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

class FloatingText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.vy = -1.8;
    this.alpha = 1;
    this.decay = 0.015;
  }
  
  update() {
    this.y += this.vy;
    this.alpha -= this.decay;
  }
  
  draw(c) {
    c.save();
    c.globalAlpha = this.alpha;
    c.fillStyle = this.color;
    c.font = "bold 20px 'Fredoka', sans-serif";
    c.textAlign = "center";
    c.shadowBlur = 5;
    c.shadowColor = "rgba(0, 0, 0, 0.6)";
    c.fillText(this.text, this.x, this.y);
    c.restore();
  }
}

function createExplosion(x, y, color, size) {
  const count = Math.min(35, Math.floor(size * 0.6));
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color));
  }
}

// Helper to draw custom outline shape
function drawShapePath(c, x, y, vertices, angle = 0) {
  if (!vertices || vertices.length === 0) return;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    c.lineTo(vertices[i].x, vertices[i].y);
  }
  c.closePath();
  c.restore();
}

// 4. PHYSICS ENGINE SETUP
function initPhysics() {
  engine = Engine.create();
  // Enable sleeping to freeze settled bodies and prevent constant jittering/sliding
  engine.enableSleeping = true;
  // Increase position and velocity solver iterations to prevent physical overlaps and boundary clipping
  engine.positionIterations = 16;
  engine.velocityIterations = 16;
  
  world = engine.world;
  world.gravity.y = 1.15; // Tuned gravity for balanced falling feel (reduced from 1.25)
  
  runner = Runner.create();
  
  // Container boundaries (make boundaries thicker to prevent boundary clipping under high pressures)
  const floor = Bodies.rectangle(225, 750, 450, 110, { 
    isStatic: true, 
    friction: 0.4, 
    frictionStatic: 0.6,
    slop: 0.1,
    label: "wall"
  });
  const leftWall = Bodies.rectangle(-50, 350, 100, 700, { 
    isStatic: true, 
    friction: 0.4, 
    frictionStatic: 0.6,
    slop: 0.1,
    label: "wall"
  });
  const rightWall = Bodies.rectangle(500, 350, 100, 700, { 
    isStatic: true, 
    friction: 0.4, 
    frictionStatic: 0.6,
    slop: 0.1,
    label: "wall"
  });
  
  Composite.add(world, [floor, leftWall, rightWall]);
  
  const mergesToProcess = [];
  
  Events.on(engine, 'collisionStart', event => {
    const pairs = event.pairs;
    pairs.forEach(pair => {
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;
      
      if (bodyA.label === "meme" && bodyB.label === "meme" && bodyA.tier === bodyB.tier) {
        if (!bodyA.isMerged && !bodyB.isMerged) {
          bodyA.isMerged = true;
          bodyB.isMerged = true;
          mergesToProcess.push({ bodyA, bodyB });
        }
      }
      
      const relVelocity = Math.sqrt(
        Math.pow(bodyA.velocity.x - bodyB.velocity.x, 2) +
        Math.pow(bodyA.velocity.y - bodyB.velocity.y, 2)
      );
      if (relVelocity > 1.2) {
        playBounceSound(relVelocity);
      }
    });
  });
  
function wakeAllBodies() {
  const bodies = Composite.allBodies(world);
  bodies.forEach(body => {
    if (!body.isStatic) {
      Matter.Sleeping.set(body, false);
    }
  });
}

  Events.on(engine, 'afterUpdate', () => {
    while (mergesToProcess.length > 0) {
      const { bodyA, bodyB } = mergesToProcess.shift();
      
      if (!Composite.allBodies(world).includes(bodyA) || !Composite.allBodies(world).includes(bodyB)) {
        continue;
      }
      
      const x = (bodyA.position.x + bodyB.position.x) / 2;
      const y = (bodyA.position.y + bodyB.position.y) / 2;
      const tier = bodyA.tier;
      
      Composite.remove(world, bodyA);
      Composite.remove(world, bodyB);
      
      // Explicitly wake up all other sleeping bodies so they fall and settle when their support is removed
      wakeAllBodies();
      
      const nextTierId = tier + 1;
      if (nextTierId < Tiers.length) {
        const nextTier = Tiers[nextTierId];
        
        // Spawn evolved body using traced outline vertices
        const options = {
          restitution: 0.05,
          friction: 0.35,
          frictionStatic: 0.6,
          frictionAir: 0.015, // Reduced from 0.03 for slightly faster physics settle time
          slop: 0.1,
          // Scale density exponentially so larger characters are much heavier
          density: 0.001 * Math.pow(1.12, nextTierId),
          label: "meme",
          tier: nextTierId,
          spawnedAt: Date.now()
        };
        
        const newMeme = Bodies.fromVertices(x, y, [ nextTier.vertices ], options);
        
        // Bouncy pop upward and torque spin on merge
        Matter.Body.setVelocity(newMeme, { x: (Math.random() - 0.5) * 1.5, y: -4.5 });
        Matter.Body.setAngularVelocity(newMeme, (Math.random() - 0.5) * 0.1);
        Composite.add(world, newMeme);
        
        const size = getHalfWidth(nextTier);
        addScore(nextTier.score, x, y, nextTier.color);
        playMergeSound(nextTierId);
        if (nextTierId !== 8) {
          speakMemeName(nextTier.name, nextTierId);
        }
        
        createExplosion(x, y, nextTier.color, size);
        triggerShake(14, 3 + nextTierId * 0.7);
        
        if (nextTierId === 8) {
          // Display floating banner instructions when Meme King is formed
          floatingTexts.push(new FloatingText(x, y - 50, "👑 MEME KING FORMED! 👑", "#ef4444"));
          speakMemeName("Brain Rot King formed! Merge two to clear the board!", 8);
        }
      } else {
        // Ultimate merge: Two Meme Kings touch!
        addScore(2500, x, y, "#ffffff");
        playMergeSound(8);
        speakMemeName("Brain Rot King Absolute!", 8);
        createExplosion(x, y, "#ffffff", 140);
        triggerShake(28, 14);
      }
    }
  });
}

function addScore(points, x, y, color) {
  score += points;
  currentScoreEl.innerText = score;
  
  currentScoreEl.classList.add("bump");
  setTimeout(() => currentScoreEl.classList.remove("bump"), 140);
  
  if (score > highScore) {
    highScore = score;
    bestScoreEl.innerText = highScore;
    localStorage.setItem("brainrot_highscore", highScore);
  }
  
  floatingTexts.push(new FloatingText(x, y, `+${points}`, color));
}

// 5. AIM & DROP CONTROLS
function updatePointer(e) {
  if (gameState !== 'playing' || !spawnerActive) return;
  
  const canvasRect = canvas.getBoundingClientRect();
  let clientX;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
  } else {
    clientX = e.clientX;
  }
  
  const rawX = ((clientX - canvasRect.left) / canvasRect.width) * canvas.width;
  const hw = getHalfWidth(Tiers[currentTier]);
  
  spawnerX = Math.max(hw + 4, Math.min(canvas.width - hw - 4, rawX));
}

function triggerDrop() {
  if (gameState !== 'playing' || !canDrop) return;
  
  const tier = Tiers[currentTier];
  const options = {
    restitution: 0.05,
    friction: 0.35,
    frictionStatic: 0.6,
    frictionAir: 0.015, // Reduced from 0.03 for faster, punchier falling speed
    slop: 0.1,
    // Scale density exponentially so larger characters are much heavier
    density: 0.001 * Math.pow(1.12, currentTier),
    label: "meme",
    tier: currentTier,
    spawnedAt: Date.now()
  };
  
  const body = Bodies.fromVertices(spawnerX, dropY, [ tier.vertices ], options);
  
  // Apply a tiny random torque on dropping
  Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);
  Composite.add(world, body);
  playDropSound();
  
  canDrop = false;
  spawnerActive = false;
  
  setTimeout(() => {
    if (gameState !== 'playing') return;
    
    currentTier = nextTier;
    nextTier = Math.floor(Math.random() * 4); // Spawns tiers 0 to 3
    updateNextPreview();
    
    const hw = getHalfWidth(Tiers[currentTier]);
    spawnerX = Math.max(hw + 4, Math.min(canvas.width - hw - 4, spawnerX));
    
    canDrop = true;
    spawnerActive = true;
  }, 550);
}

function updateNextPreview() {
  nextPreviewImg.src = Tiers[nextTier].imgSrc;
}

// Event Listeners
canvas.addEventListener('mousemove', updatePointer);
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  updatePointer(e);
}, { passive: false });

canvas.addEventListener('mouseup', triggerDrop);
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  triggerDrop();
});

// 6. CANVAS RENDER LOOP
function drawWarningLine() {
  ctx.save();
  ctx.strokeStyle = isDangerActive ? "rgba(236, 72, 153, 0.85)" : "rgba(168, 85, 247, 0.4)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 6]);
  if (isDangerActive) {
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(236, 72, 153, 0.8)";
  }
  ctx.beginPath();
  ctx.moveTo(0, warningLineY);
  ctx.lineTo(canvas.width, warningLineY);
  ctx.stroke();
  ctx.restore();
}

// Renders the transparent background-stripped sprite overlaid with a thin glowing custom physical boundary
function drawMeme(body) {
  const tier = Tiers[body.tier];
  const x = body.position.x;
  const y = body.position.y;
  const transCanvas = transparentCanvases[body.tier];
  
  if (!body.vertices || body.vertices.length === 0) return;
  
  ctx.save();
  
  // 1. Translate, rotate, and draw transparent background-stripped sprite
  ctx.translate(x, y);
  ctx.rotate(body.angle);
  
  const hw = getHalfWidth(tier);
  const hh = getHalfHeight(tier);
  const cx = tier.centroid.x;
  const cy = tier.centroid.y;
  
  if (assetsLoaded && transCanvas) {
    // Offset drawing by centroid coordinates to cancel out center-of-mass shift and align image perfectly with outline vertices
    ctx.drawImage(transCanvas, -hw - cx, -hh - cy, hw * 2, hh * 2);
  } else {
    // Fallback vector drawing
    ctx.fillStyle = tier.color;
    ctx.beginPath();
    ctx.moveTo(tier.vertices[0].x - cx, tier.vertices[0].y - cy);
    for (let i = 1; i < tier.vertices.length; i++) {
      ctx.lineTo(tier.vertices[i].x - cx, tier.vertices[i].y - cy);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(12, hw * 0.55)}px 'Fredoka', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tier.name[0], 0, 0);
  }
  
  ctx.restore();
}

// Draws preview shape at top
function drawSpawner() {
  const tier = Tiers[currentTier];
  const transCanvas = transparentCanvases[currentTier];
  const hw = getHalfWidth(tier);
  const hh = getHalfHeight(tier);
  
  // Vertical guide line
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(spawnerX, dropY);
  ctx.lineTo(spawnerX, canvas.height);
  ctx.stroke();
  ctx.restore();
  
  // Draw sprite
  ctx.save();
  ctx.translate(spawnerX, dropY);
  if (assetsLoaded && transCanvas) {
    ctx.drawImage(transCanvas, -hw, -hh, hw * 2, hh * 2);
  } else {
    ctx.fillStyle = tier.color;
    drawShapePath(ctx, 0, 0, tier.vertices);
    ctx.fill();
    
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.max(12, hw * 0.55)}px 'Fredoka', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tier.name[0], 0, 0);
  }
  ctx.restore();
}

function checkGameOver(dt) {
  const bodies = Composite.allBodies(world);
  const now = Date.now();
  let overflowing = false;
  
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (body.isStatic) continue;
    
    if (now - body.spawnedAt > 1500) {
      // Check if at least 50% of the object's height is above the warning line
      const midpointY = (body.bounds.min.y + body.bounds.max.y) / 2;
      if (midpointY < warningLineY) {
        overflowing = true;
        break;
      }
    }
  }
  
  if (overflowing) {
    dangerTime += dt;
    isDangerActive = true;
    canvasWrapper.classList.add("danger");
    
    ctx.save();
    ctx.fillStyle = "rgba(236, 72, 153, 0.95)";
    ctx.font = "bold 14px 'Space Grotesk', sans-serif";
    ctx.textAlign = "right";
    const remaining = Math.max(0, (7000 - dangerTime) / 1000);
    ctx.fillText(`DANGER: ${remaining.toFixed(1)}s`, canvas.width - 15, warningLineY - 12);
    ctx.restore();
    
    if (dangerTime >= 7000) {
      triggerGameOver();
    }
  } else {
    dangerTime = 0;
    isDangerActive = false;
    canvasWrapper.classList.remove("danger");
  }
}

function spawnMemeBody(x, y, tierId) {
  const tier = Tiers[tierId];
  if (!tier.vertices) {
    console.warn(`Vertices not loaded yet for tier ${tierId}`);
    return;
  }
  const options = {
    restitution: 0.05,
    friction: 0.35,
    frictionStatic: 0.6,
    frictionAir: 0.03,
    slop: 0.1,
    density: 0.001 * Math.pow(1.12, tierId),
    label: "meme",
    tier: tierId,
    spawnedAt: Date.now()
  };
  const body = Bodies.fromVertices(x, y, [ tier.vertices ], options);
  Composite.add(world, body);
  return body;
}

function spawnDebugCharacters() {
  // Spawn two Giga Chads (tier 7) close to each other so they merge
  spawnMemeBody(150, 480, 7);
  spawnMemeBody(300, 480, 7);
  
  // Spawn a few other larger characters
  spawnMemeBody(100, 250, 5); // The Rizzler (tier 5)
  spawnMemeBody(320, 250, 4); // Mewing Cat (tier 4)
}

function triggerGameOver() {
  gameState = 'gameover';
  runner.enabled = false;
  
  let comment = "You overflowed! Pure skill issue.";
  if (score >= 100 && score < 500) comment = "Not bad, but your Mewing streak is weak.";
  else if (score >= 500 && score < 1500) comment = "Rizzler in training. Keep cooking!";
  else if (score >= 1500 && score < 4000) comment = "Certified Sigma. Skibidi approved!";
  else if (score >= 4000) comment = "GIGA CHAD! You have achieved peak Brain Rot!";
  
  gameOverCommentEl.innerText = comment;
  finalScoreEl.innerText = score;
  finalBestEl.innerText = highScore;
  
  gameOverOverlay.classList.add("active");
  lastKingMergeTime = 0; // Reset so game over announcement isn't throttled
  speakMemeName("Game Over!", 3);
  checkForUpdates(); // Check for updates in the background
}

function resetGame() {
  DEBUG_PRESPAWN = false; // Disable debug spawning on reset so player starts clean
  checkForUpdates(); // Check for updates on reset
  
  const bodies = Composite.allBodies(world);
  bodies.forEach(body => {
    if (!body.isStatic) {
      Composite.remove(world, body);
    }
  });
  
  score = 0;
  currentScoreEl.innerText = score;
  
  currentTier = Math.floor(Math.random() * 4);
  nextTier = Math.floor(Math.random() * 4);
  updateNextPreview();
  
  canDrop = true;
  spawnerActive = true;
  dangerTime = 0;
  isDangerActive = false;
  canvasWrapper.classList.remove("danger");
  
  particles.length = 0;
  floatingTexts.length = 0;
  
  lastKingMergeTime = 0; // Reset king merge throttle time
  
  gameState = 'playing';
  runner.enabled = true;
  lastTime = Date.now();
  
  gameOverOverlay.classList.remove("active");
  startOverlay.classList.remove("active");
}

// 7. CORE DRAW / UPDATE LOOP
function loop() {
  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;
  
  if (gameState === 'playing') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    if (shakeDuration > 0) {
      const dx = (Math.random() - 0.5) * shakeIntensity;
      const dy = (Math.random() - 0.5) * shakeIntensity;
      ctx.translate(dx, dy);
      shakeDuration--;
    }
    
    drawWarningLine();
    
    const bodies = Composite.allBodies(world);
    bodies.forEach(body => {
      if (body.label === "meme") {
        drawMeme(body);
      }
    });
    
    if (spawnerActive) {
      drawSpawner();
    }
    
    // Update and Draw Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      if (particles[i].alpha <= 0) {
        particles.splice(i, 1);
      } else {
        particles[i].draw(ctx);
      }
    }
    
    // Update and Draw Floating Texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      floatingTexts[i].update();
      if (floatingTexts[i].alpha <= 0) {
        floatingTexts.splice(i, 1);
      } else {
        floatingTexts[i].draw(ctx);
      }
    }
    
    checkGameOver(dt);
    
    ctx.restore();
  }
  
  requestAnimationFrame(loop);
}

// 8. BUTTON CONTROLS INITIALIZATION
startBtn.addEventListener('click', () => {
  initAudio();
  initPhysics();
  
  Runner.run(runner, engine);
  
  currentTier = Math.floor(Math.random() * 4);
  nextTier = Math.floor(Math.random() * 4);
  updateNextPreview();
  
  startOverlay.classList.remove('active');
  gameState = 'playing';
  canDrop = true;
  spawnerActive = true;
  lastTime = Date.now();
  
  if (DEBUG_PRESPAWN) {
    spawnDebugCharacters();
  }
  
  playMergeSound(0);
  speakMemeName("Let's cook!", 0);
});

restartBtn.addEventListener('click', () => {
  initAudio();
  if (gameState !== 'start') resetGame();
});

restartOverlayBtn.addEventListener('click', () => {
  initAudio();
  resetGame();
});

legendBtn.addEventListener('click', () => {
  legendOverlay.classList.add('active');
});

closeLegendBtn.addEventListener('click', () => {
  legendOverlay.classList.remove('active');
});

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) {
    muteText.innerText = "Unmute";
    muteBtn.classList.add("muted");
    muteIcon.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63(14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
  } else {
    muteText.innerText = "Mute";
    muteBtn.classList.remove("muted");
    muteIcon.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
    initAudio();
  }
});

requestAnimationFrame(loop);
