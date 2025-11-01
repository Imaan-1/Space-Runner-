import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// --- GLOBAL TEXTURE LOADER AND CACHE ---
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

const MODELS = {
  ufo: "models/Ufo.glb", // 👈 *** REPLACE THIS WITH YOUR FILENAME ***
};
const modelCache = {};
const TEXTURES = {
  rocketBody: "metal_texture.jpg",
  asteroidSurface: "asteroid.jpg",
  saturnPlanet: "saturn-colour.jpg",
  saturnRing: "saturn-rings.png",
  // === 🛠️ ADDED SPACESHIP FLOOR TEXTURE ===
  spaceshipFloor: "spaceship_floor_grid.jpg",
  // ======================================
};
const textureCache = {};
let allTexturesLoaded = false;
let updateCharacterSelectorDisplay;
let updateLevelSelectorUI;
let startGame;

// --- Loading function for textures ---
function loadTextures(callback) {
  const texturePromises = Object.entries(TEXTURES).map(([key, url]) => {
    return new Promise((resolve) => {
      textureLoader.load(
        url,
        (texture) => {
          // Added wrapping and filtering for better texture quality
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.minFilter = THREE.LinearMipMapLinearFilter;
          textureCache[key] = texture;
          resolve();
        },
        undefined,
        () => {
          console.error(
            `Failed to load texture: ${url}. Using fallback color.`
          );
          textureCache[key] = null; // Use null as fallback indicator
          resolve();
        }
      );
    });
  });

  const modelPromises = Object.entries(MODELS).map(([key, url]) => {
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        url,
        (gltf) => {
          // Success: store the loaded model in our cache
          modelCache[key] = gltf;
          resolve();
        },
        undefined, // onProgress callback (not needed)
        (error) => {
          // Failed
          console.error(`Failed to load model: ${url}`, error);
          modelCache[key] = null;
          reject(error); // Use reject to fail fast, or resolve() to continue without it
        }
      );
    });
  });

  Promise.all([...texturePromises, ...modelPromises]).then(() => {
    allTexturesLoaded = true;
    console.log("All textures loaded (or failed to load).");
    if (callback) callback();
  });
}

// --- CHARACTER DEFINITIONS (Hyper Cube added back, trail color is less intense) ---
const PLAYER_OBJECTS = {
  rocket: {
    name: "Galaxy Cruiser",
    isUnlocked: true,
    unlockLevel: 1,
    createModel: createRocketModel,
    colliderSize: { width: 1, height: 1, depth: 1.8 },
    trailColor: 0xff4500, // Orange-Red
    trailSize: 0.18,
    trailMaterial: null,
    textures: { body: "rocketBody", accent: null },
  },
  asteroid: {
    name: "Rogue Asteroid",
    isUnlocked: false,
    unlockLevel: 2,
    createModel: createAsteroidModel,
    colliderSize: { width: 1.2, height: 1.2, depth: 1.2 },
    trailColor: 0x90ee90, // Light Green
    trailSize: 0.22,
    trailMaterial: null,
    textures: { surface: "asteroidSurface" },
  },
  planet: {
    name: "Wandering Saturn",
    isUnlocked: false,
    unlockLevel: 3,
    createModel: createSaturnModel,
    colliderSize: { width: 1.5, height: 1.5, depth: 1.5 },
    trailColor: 0xffd700, // Gold
    trailSize: 0.25,
    trailMaterial: null,
    textures: { planet: "saturnPlanet", ring: "saturnRing" },
  },
  orb: {
    name: "Swirling Orb",
    isUnlocked: false,
    unlockLevel: 3,
    createModel: createOrbModel,
    colliderSize: { width: 1.4, height: 1.4, depth: 1.4 },
    unlockText: "Score 500 in Level 3", // 🛠️ MODIFIED UNLOCK TEXT
    trailColor: 0x00ffff, // Cyan
    trailSize: 0.15,
    trailMaterial: null,
    textures: {},
  },
  // --- NEW CHARACTER ADDED BACK ---
  hypercube: {
    name: "Hyper Cube",
    isUnlocked: false,
    unlockLevel: 3,
    createModel: createHyperCubeModel,
    colliderSize: { width: 1.2, height: 1.2, depth: 1.2 },
    unlockText: "Score 1000 in Level 3", // 🛠️ MODIFIED UNLOCK TEXT
    trailColor: 0x66ff66, // LESS INTENSE NEON GREEN
    trailSize: 0.2,
    trailMaterial: null,
    textures: { core: "orb" }, // 🛠️ ADDED a 'core' texture link
  },
};
let selectedObjectId = "rocket";
const characterOrder = ["rocket", "asteroid", "planet", "orb", "hypercube"];

// --- Level State Management (MODIFIED) ---
let selectedLevel = 1;
const LEVEL_UNLOCK_SCORES = { 1: 500, 2: 1000, 3: Infinity };
let unlockedLevels = { 1: true, 2: false, 3: false }; // 🛠️ Level 3 now starts locked
let highScores = { 1: 0, 2: 0, 3: 0 };

// --- Load Unlocks from localStorage (NO CHANGES) ---
const savedUnlocks = JSON.parse(localStorage.getItem("spaceRunnerUnlocks"));
if (savedUnlocks) {
  savedUnlocks.forEach((id) => {
    if (PLAYER_OBJECTS[id]) {
      PLAYER_OBJECTS[id].isUnlocked = true;
    }
  });
}
const savedLevelUnlocks = JSON.parse(
  localStorage.getItem("spaceRunnerUnlockedLevels")
);
if (savedLevelUnlocks) {
  unlockedLevels = { ...unlockedLevels, ...savedLevelUnlocks };
}
const savedHighScores = JSON.parse(
  localStorage.getItem("spaceRunnerHighScores")
);
if (savedHighScores) {
  highScores = { ...highScores, ...savedHighScores };
}

// ---- QUEST & REWARD SYSTEM DATA (MODIFIED) ----
const QUEST_TYPES = [
  {
    name: "Jump X times in one run",
    key: "jump",
    min: 3,
    max: 8,
    runOnly: true,
    checker: (progress) => progress.jumps >= progress.target,
    progressText: (progress) => `Jumps: ${progress.jumps} / ${progress.target}`,
    reward: 10,
  },
  {
    name: "Survive Y points in one run",
    key: "score",
    min: 100,
    max: 500,
    runOnly: true,
    checker: (progress) => progress.score >= progress.target,
    progressText: (progress) => `Score: ${progress.score} / ${progress.target}`,
    reward: 10,
  },
  // 🛠️ NEW QUEST: Score over X points in Y consecutive runs
  {
    name: "Score over X points in Y consecutive runs", // 🛠️ Updated template for clarity
    key: "consecutiveScore",
    scoreMin: 100,
    scoreMax: 200,
    streakMin: 2,
    streakMax: 4,
    runOnly: false,
    checker: (progress) => progress.currentStreak >= progress.targetStreak,
    // 🛠️ MODIFIED: Removed redundant bracketed text
    progressText: (progress) =>
      `Streak: ${progress.currentStreak} / ${progress.targetStreak}`,
    reward: 20, // Higher reward for a persistent challenge
  },
];

function getRandomQuests(n = 3) {
  const chosen = [];
  const questTypesToUse = [...QUEST_TYPES];

  while (chosen.length < n && questTypesToUse.length > 0) {
    const randomIndex = Math.floor(Math.random() * questTypesToUse.length);
    const qt = questTypesToUse.splice(randomIndex, 1)[0];
    
    let target = 0;
    
    // Default structure for quest data
    const questData = {
      ...qt,
      target,
      done: false,
      jumps: 0,
      score: 0,
      currentStreak: 0, 
      targetScore: 0,
      targetStreak: 0,
      lastRunPassed: false, // For consecutiveScore tracking
    };

    if (qt.key === "consecutiveScore") {
        // Set properties for the consecutiveScore quest
        questData.targetScore = Math.floor(Math.random() * (qt.scoreMax - qt.scoreMin + 1)) + qt.scoreMin;
        questData.targetStreak = Math.floor(Math.random() * (qt.streakMax - qt.streakMin + 1)) + qt.streakMin;
    } else {
        // Set properties for other quests
        questData.target = Math.floor(Math.random() * (qt.max - qt.min + 1)) + qt.min;
    }
    
    chosen.push(questData);
  }
  return chosen;
}

// 🛠️ FIX IMPLEMENTED HERE
function loadDailyQuests() {
  let quests = JSON.parse(localStorage.getItem("spaceRunnerQuests"));
  let lastDay = localStorage.getItem("spaceRunnerQuestDay");
  const nowDay = new Date().toDateString();
  
  // Logic to reset quests if a new day starts or no quests are saved
  if (!quests || lastDay !== nowDay) {
    quests = getRandomQuests();
    localStorage.setItem("spaceRunnerQuests", JSON.stringify(quests));
    localStorage.setItem("spaceRunnerQuestDay", nowDay);
    localStorage.removeItem("spaceRunnerQuestRewarded"); 
  } else {
    // 🎯 FIX: Re-map the quest functions and ensure persistence fields exist.
    quests = quests.map((q) => {
      const questType = QUEST_TYPES.find((qt) => qt.key === q.key);
      if (questType) {
        
        // 1. Copy the executable functions from the constant (THE FIX!)
        q.progressText = questType.progressText;
        q.checker = questType.checker;
        
        // 2. Ensure all dynamic properties for new quest types are explicitly set if missing
        if (questType.key === "consecutiveScore") {
            // These properties must be re-initialized if missing, but their current value preserved if they exist.
            q.targetScore = q.targetScore || questType.scoreMin;
            q.targetStreak = q.targetStreak || questType.streakMin;
            q.currentStreak = q.currentStreak || 0;
            q.lastRunPassed = q.lastRunPassed || false;
        }
        
        // Return the modified object
        return q;
      }
      return q;
    });
  }
  return quests;
}


function saveDailyQuests(quests) {
  localStorage.setItem("spaceRunnerQuests", JSON.stringify(quests));
}

let dailyQuests = loadDailyQuests();

// ---- DEBUG HELPERS (accessible from browser console) ----
window.resetQuests = function () {
  localStorage.removeItem("spaceRunnerQuests");
  localStorage.removeItem("spaceRunnerQuestDay");
  localStorage.removeItem("spaceRunnerQuestRewarded");
  console.log("Quests reset! Reload the page to get new quests.");
};

window.addStars = function (amount) {
  const stars = parseInt(localStorage.getItem("spaceRunnerStars") || "0", 10);
  localStorage.setItem("spaceRunnerStars", String(stars + amount));
  console.log(`Added ${amount} stars. New total: ${stars + amount}`);
};

window.checkQuests = function () {
  console.log("Current Quests:", dailyQuests);
  console.log("Current Stars:", localStorage.getItem("spaceRunnerStars"));
};

// ---- SHOP SYSTEM DATA ----
const SHOP_ITEMS = [
  {
    id: "nebula_skin",
    name: "Nebula Cruiser",
    icon: "🌌",
    price: 50,
    type: "skin",
    description: "A cosmic purple skin for Galaxy Cruiser",
    basedOn: "rocket",
    color: 0x9333ea,
    trailColor: 0xc084fc,
  },
  {
    id: "fire_skin",
    name: "Inferno Rocket",
    icon: "🔥",
    price: 75,
    type: "skin",
    description: "A fiery red skin for Galaxy Cruiser",
    basedOn: "rocket",
    color: 0xff3333,
    trailColor: 0xff6b00,
  },
  {
    id: "ice_asteroid",
    name: "Frozen Comet",
    icon: "❄️",
    price: 100,
    type: "character",
    description: "Exclusive icy variant of Rogue Asteroid",
    basedOn: "asteroid",
    color: 0x7dd3fc,
    trailColor: 0xbfdbfe,
  },
  // 🛠️ ADDED: Quantum Decahedron skin for Hyper Cube
  {
    id: "decahedron_skin",
    name: "Quantum Decahedron",
    icon: "💎",
    price: 150,
    type: "skin",
    description: "Transforms Hyper Cube into a swirling blue decahedron",
    basedOn: "hypercube",
    color: 0x38bdf8, // Neon Blue color
    trailColor: 0x67e8f9, // Cyan trail
  },
  // 🛠️ END ADDED
];

function loadShopPurchases() {
  return JSON.parse(localStorage.getItem("spaceRunnerShopPurchases")) || [];
}

function saveShopPurchases(purchases) {
  localStorage.setItem("spaceRunnerShopPurchases", JSON.stringify(purchases));
}

let shopPurchases = loadShopPurchases();

function getEquippedSkin() {
  return localStorage.getItem("spaceRunnerEquippedSkin") || null;
}

function setEquippedSkin(skinId) {
  if (skinId) {
    localStorage.setItem("spaceRunnerEquippedSkin", skinId);
  } else {
    localStorage.removeItem("spaceRunnerEquippedSkin");
  }
}

let equippedSkin = getEquippedSkin();

// ---- SOUND EFFECT SYSTEM ----
const audio = {
  bgm: new Audio(
    "sounds/invasion-march-star-wars-style-cinematic-music-219585.mp3"
  ),
  jump: new Audio("sounds/jump.wav"),
  crash: new Audio("sounds/dying.mp3"),
  click: new Audio("sounds/buttonclick.mp3"),
  // --- NEW SOUND ADDED ---
  collect: new Audio("sounds/collect.mp3"), // Corrected file name to .mp3
};

audio.bgm.loop = true;
audio.bgm.volume = 0.14;
audio.jump.volume = 1.0;
// --- NEW SOUND VOLUME SETTING ---
audio.collect.volume = 0.6;

function playSound(s) {
  if (!audio[s]) return;
  if (s === "crash") {
    audio.crash.volume = 1.0;
  }
  audio[s].currentTime = 0;
  audio[s].play();
}

// --- INITIAL SETUP & GLOBAL FUNCTIONS ---

// --- NEW: Custom Purchase Notification Function ---
function showPurchaseNotification(title, message, icon) {
  const modal = document.getElementById("purchaseNotificationModal");
  document.getElementById("purchase-title").textContent = title;
  document.getElementById("purchase-message").textContent = message;
  document.getElementById("purchase-icon").textContent = icon;

  modal.style.display = "flex";

  const closeBtn = document.getElementById("close-purchase-modal-btn");
  // Ensure we only have one handler attached at a time
  const closeHandler = () => {
    modal.style.display = "none";
    closeBtn.removeEventListener("click", closeHandler);
    playSound("click");
  };

  // Re-assign the click handler every time the modal is shown
  // to ensure a fresh event listener that only closes the current instance.
  // In this case, we remove the handler *after* it runs to keep it clean.
  closeBtn.removeEventListener("click", closeHandler); 
  closeBtn.addEventListener("click", closeHandler);
}
// --- END NEW: Custom Purchase Notification Function ---

loadTextures(() => {
  setupMenu();
  setupCharacterSelector();
  setupQuestsAndShop();
  initGame();
});

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    audio.bgm.play().catch(() => {});
  }, 700);
});

// --- MENU BUTTON CLICK SOUNDS ---
document.addEventListener("click", (e) => {
  if (
    e.target.tagName === "BUTTON" ||
    e.target.classList.contains("level-select-btn")
  ) {
    playSound("click");
  }
});

// --- MENU & CHARACTER SELECTOR LOGIC (MODIFIED for 2-page structure) ---

function createStarfield() {
  const starfield = document.getElementById("starfield");
  if (!starfield || starfield.children.length > 0) return;
  for (let i = 0; i < 300; i++) {
    const star = document.createElement("div");
    star.className = "star";
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.width = `${Math.random() * 2 + 1.5}px`;
    star.style.height = star.style.width;
    star.style.animationDelay = `${Math.random() * 3}s`;
    starfield.appendChild(star);
  }
  const createShootingStar = () => {
    const shootingStar = document.createElement("div");
    shootingStar.style.position = "absolute";
    shootingStar.style.width = "2px";
    shootingStar.style.height = "150px";
    shootingStar.style.background =
      "linear-gradient(to top, transparent, rgba(255, 255, 255, 0.7))";
    shootingStar.style.left = `${Math.random() * 100}%`;
    shootingStar.style.top = `${Math.random() * 100}%`;
    shootingStar.style.animation = `shootingStar ${
      Math.random() * 1 + 0.5
    }s linear forwards`;
    shootingStar.style.transform = "rotate(45deg)";
    starfield.appendChild(shootingStar);
    setTimeout(() => {
      if (starfield.contains(shootingStar)) starfield.removeChild(shootingStar);
    }, 1500);
  };
  setInterval(createShootingStar, 2000);
}

// NEW: Function to manage screen transitions
function showScreen(id) {
  document.querySelectorAll(".menuScreen").forEach((screen) => {
    screen.classList.remove("active");
  });
  document.getElementById(id).classList.add("active");
}

function setupMenu() {
  createStarfield();

  // --- Mouse Parallax Effect ---
  const starfield = document.getElementById("starfield");
  window.addEventListener("mousemove", (e) => {
    const xRatio = (e.clientX - window.innerWidth / 2) / window.innerWidth;
    const yRatio = (e.clientY - window.innerHeight / 2) / window.innerHeight;
    starfield.style.transform = `translate(${xRatio * -30}px, ${
      yRatio * -30
    }px)`;
  });

  // --- BUTTON EVENT LISTENERS (NEW LOGIC) ---
  document
    .getElementById("choose-char-button")
    .addEventListener("click", () => {
      showScreen("characterSelectionScreen");
      updateCharacterSelectorDisplay(); // Ensure the character selector updates
    });

  // Start mission button on the character screen
  document.getElementById("start-button").addEventListener("click", () => {
    const obj = PLAYER_OBJECTS[selectedObjectId];
    if (obj.isUnlocked) {
      if (startGame) startGame();
    }
  });

  // Back to levels button on character screen
  document
    .getElementById("back-to-levels-btn")
    .addEventListener("click", () => {
      showScreen("levelSelectionScreen");
    });

  // --- Level Selection Logic ---
  const levelBtns = {
    1: document.getElementById("level-1-btn"),
    2: document.getElementById("level-2-btn"),
    3: document.getElementById("level-3-btn"),
  };

  updateLevelSelectorUI = () => {
    for (const [level, btn] of Object.entries(levelBtns)) {
      const levelNum = parseInt(level);
      if (unlockedLevels[levelNum]) {
        btn.disabled = false;
        // 🛠️ MODIFIED: Removed level name
        btn.innerHTML = `LEVEL ${levelNum}`;
      } else {
        btn.disabled = true;
        // 🛠️ MODIFIED: Removed level name
        btn.innerHTML = `LEVEL ${levelNum} <span>🔒</span>`;
      }
      if (levelNum === selectedLevel) {
        btn.classList.add("selected");
      } else {
        btn.classList.remove("selected");
      }
    }

    // Update the Start Mission button text on the char screen to reflect the selected level
    const startBtn = document.getElementById("start-button");
    if (startBtn) {
      startBtn.textContent = `🎮 START LEVEL ${selectedLevel}`;
    }

    const unlock2Info = document.getElementById("unlock-level-2-info");
    const unlock3Info = document.getElementById("unlock-level-3-info");
    const unlockContainer = document.getElementById("unlock-info-container");

    // Show/Hide Level 2 unlock text
    if (unlockedLevels[2]) {
      unlock2Info.classList.add("hidden");
    } else {
      unlock2Info.classList.remove("hidden");
    }

    // Show/Hide Level 3 unlock text
    if (unlockedLevels[3]) {
      unlock3Info.classList.add("hidden");
    } else {
      unlock3Info.classList.remove("hidden");
    }

    // Hide the whole container if BOTH are unlocked
    if (unlockedLevels[2] && unlockedLevels[3]) {
      unlockContainer.classList.add("hidden");
    } else {
      unlockContainer.classList.remove("hidden");
    }
  };

  // 🛠️ MODIFIED: Removed level names entirely
  function getLevelName(level) {
    return "";
  }

  levelBtns[1].addEventListener("click", () => {
    selectedLevel = 1;
    updateLevelSelectorUI();
  });
  levelBtns[2].addEventListener("click", () => {
    if (unlockedLevels[2]) {
      selectedLevel = 2;
      updateLevelSelectorUI();
    }
  });
  levelBtns[3].addEventListener("click", () => {
    if (unlockedLevels[3]) {
      selectedLevel = 3;
      updateLevelSelectorUI();
    }
  });
  updateLevelSelectorUI();
}
function setupCharacterSelector() {
  const previewCanvas = document.getElementById("character-preview");

  // Wait a moment for CSS to apply, then get size
  setTimeout(() => {
    const computedStyle = window.getComputedStyle(previewCanvas);
    const canvasWidth = parseInt(computedStyle.width) || 300;
    const canvasHeight = parseInt(computedStyle.height) || 300;
    const canvasSize = Math.min(canvasWidth, canvasHeight);

    // Set canvas rendering size
    previewCanvas.width = canvasSize;
    previewCanvas.height = canvasSize;

    if (renderer) {
      renderer.setSize(canvasSize, canvasSize);
      renderPreview();
    }
  }, 100);

  // Initial size
  previewCanvas.width = 300;
  previewCanvas.height = 300;

  const scene = new THREE.Scene();
  scene.background = null; // Transparent background for the scene

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 0, 2.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas: previewCanvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0); // Transparent clear color
  renderer.setSize(300, 300);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(2, 2, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
  fillLight.position.set(-2, 0, -1);
  scene.add(fillLight);

  let currentModel;

  console.log("Character selector initialized");

  // FIX: Character preview rendering logic
  function renderPreview() {
    if (!allTexturesLoaded) {
      console.log("Textures not loaded yet");
      return;
    }
    // Remove old model completely
    if (currentModel) {
      scene.remove(currentModel);
      // Dispose of geometries and materials to free memory
      currentModel.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      currentModel = null;
    }

    // Create new model for the selected character
    const characterObj = PLAYER_OBJECTS[selectedObjectId];
    console.log("Creating model for:", selectedObjectId, characterObj);

    // 🛠️ Check for equipped skin override
    let skinOverride = null;
    // Find the equipped skin object
    const equippedItem = equippedSkin ? SHOP_ITEMS.find(item => item.id === equippedSkin) : null;

    if (equippedItem && equippedItem.basedOn === selectedObjectId) {
        skinOverride = equippedItem;
    }

    currentModel = characterObj.createModel(skinOverride); // Pass override to model creator

    currentModel.rotation.x = 0;
    currentModel.position.set(0, 0, 0);
    scene.add(currentModel);
    renderer.render(scene, camera); // Render once immediately
    console.log("Character rendered:", selectedObjectId, currentModel);
  }

  function animatePreview() {
    requestAnimationFrame(animatePreview);
    const time = Date.now();
    if (currentModel) {
      if (currentModel.userData.customAnimate) {
        currentModel.userData.customAnimate(time);
      } else if (currentModel.userData.shaderMaterial) {
        currentModel.userData.shaderMaterial.uniforms.time.value += 0.05;
        currentModel.rotation.y += 0.01;
      } else {
        currentModel.rotation.y += 0.01;
      }
    }
    renderer.render(scene, camera);
  }

  // MODIFIED FUNCTION
  updateCharacterSelectorDisplay = () => {
    const obj = PLAYER_OBJECTS[selectedObjectId];

    // 🛠️ UPDATE: Display character name or skin name if equipped
    let displayCharName = obj.name;
    const equippedItem = equippedSkin ? SHOP_ITEMS.find(item => item.id === equippedSkin) : null;
    if (equippedItem && equippedItem.basedOn === selectedObjectId) {
        displayCharName = equippedItem.name;
    }
    document.getElementById("character-name").textContent = displayCharName;


    const lockEl = document.getElementById("character-lock");
    const statusEl = document.getElementById("character-status");
    const startBtn = document.getElementById("start-button");
    const previewEl = document.getElementById("character-preview");
    const lockOverlayEl = document.getElementById("lock-overlay"); // NEW: Get the overlay

    // --- VISUAL FEEDBACK: Update border color and shadow dynamically ---
    if (obj.isUnlocked) {
      // *** MODIFIED to use a strong NEON PINK GLOW/BORDER (matches CSS theme) ***
      previewEl.style.borderColor = "#F472B6"; // Neon Pink
      previewEl.style.boxShadow = "0 0 20px #F472B6, 0 0 40px #C084FC"; // Pink core, Purple bloom
    } else {
      // Set neutral color and shadow when locked (keeping original gray/neutral)
      previewEl.style.borderColor = "#9ca3af";
      previewEl.style.boxShadow = "0 0 10px #9ca3af";
    }

    if (obj.isUnlocked) {
      lockEl.classList.add("hidden");
      // statusEl is not found in index.html, so commenting out to avoid error (but keeping the original structure)
      // if (statusEl) {
      //     statusEl.classList.remove('hidden');
      //     statusEl.textContent = 'UNLOCKED!';
      // }
      startBtn.disabled = false; // <--- FIX: Ensure button is enabled when unlocked
      lockOverlayEl.classList.add("hidden"); // NEW: Hide the lock overlay
    } else {
      lockEl.classList.remove("hidden");
      // if (statusEl) {
      //     statusEl.classList.add('hidden');
      // }

      if (obj.unlockText) {
        lockEl.querySelector(".unlock-text").textContent = obj.unlockText;
      } else {
        lockEl.querySelector(
          ".unlock-text"
        ).textContent = `Unlock at Level ${obj.unlockLevel}`;
      }

      startBtn.disabled = true; // <--- FIX: Ensure button is disabled when locked
      lockOverlayEl.classList.remove("hidden"); // NEW: Show the lock overlay
    }
    if (allTexturesLoaded) {
      renderPreview();
    }
  };

  document.getElementById("next-char").addEventListener("click", () => {
    const i = characterOrder.indexOf(selectedObjectId);
    selectedObjectId = characterOrder[(i + 1) % characterOrder.length];
    updateCharacterSelectorDisplay();
  });
  document.getElementById("prev-char").addEventListener("click", () => {
    const i = characterOrder.indexOf(selectedObjectId);
    selectedObjectId =
      characterOrder[(i - 1 + characterOrder.length) % characterOrder.length];
    updateCharacterSelectorDisplay();
  });

  // Force initial render after a short delay
  setTimeout(() => {
    console.log("Force initial render");
    renderPreview();
  }, 500);

  updateCharacterSelectorDisplay();
  animatePreview();

  console.log("Character selector setup complete");
}

// --- 3D MODEL CREATION FUNCTIONS ---

function createRocketModel(skinOverride) {
  const modelGroup = new THREE.Group();
  const bodyTexture = textureCache["rocketBody"];
  
  // 🛠️ FIX: Apply skin color override if available
  let bodyColor = bodyTexture ? 0xffffff : 0xbbbbbb; // Default body color
  let accentColor = 0xcc3333; // Default accent color

  if (skinOverride) {
      bodyColor = skinOverride.color;
      accentColor = skinOverride.color; // Use the same color for accents for simplicity
  }
  
  const materials = {
    body: new THREE.MeshStandardMaterial({
      color: bodyColor, // Use custom color
      map: bodyTexture,
      metalness: 0.9,
      roughness: 0.7,
      flatShading: false,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: accentColor, // Use custom color
      metalness: 0.5,
      roughness: 0.3,
      flatShading: false,
    }),
    engine: new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0x333333,
      emissiveIntensity: 0.2,
    }),
  };
  const bodyGeo = new THREE.CylinderGeometry(0.35, 0.5, 1.8, 64);
  const body = new THREE.Mesh(bodyGeo, materials.body);
  body.castShadow = true;
  modelGroup.add(body);
  const noseGeo = new THREE.ConeGeometry(0.35, 0.8, 32);
  const nose = new THREE.Mesh(noseGeo, materials.accent);
  nose.position.y = 1.3;
  nose.castShadow = true;
  modelGroup.add(nose);
  const engineGeo = new THREE.CylinderGeometry(0.4, 0.55, 0.5, 32);
  const engine = new THREE.Mesh(engineGeo, materials.engine);
  engine.position.y = -1.15;
  engine.castShadow = true;
  modelGroup.add(engine);
  for (let i = -1; i <= 1; i += 2) {
    const bGroup = new THREE.Group();
    const bGeo = new THREE.CylinderGeometry(0.15, 0.18, 1.2, 16);
    const booster = new THREE.Mesh(bGeo, materials.body);
    booster.castShadow = true;
    bGroup.add(booster);
    const bnGeo = new THREE.ConeGeometry(0.15, 0.25, 16);
    const bNose = new THREE.Mesh(bnGeo, materials.accent);
    bNose.position.y = 0.725;
    bNose.castShadow = true;
    bGroup.add(bNose);
    bGroup.position.set(i * 0.5, -0.2, 0);
    modelGroup.add(bGroup);
  }
  return modelGroup;
}
function createSaturnModel() {
  const modelGroup = new THREE.Group();
  const planetTexture = textureCache["saturnPlanet"];
  const ringTexture = textureCache["saturnRing"];
  const planetMat = new THREE.MeshStandardMaterial({
    color: planetTexture ? 0xffffff : 0xffd700,
    map: planetTexture,
    metalness: 0.1,
    roughness: 0.9,
  });
  const planetGeo = new THREE.SphereGeometry(0.7, 64, 64);
  const planet = new THREE.Mesh(planetGeo, planetMat);
  planet.castShadow = true;
  modelGroup.add(planet);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ringTexture ? 0xffffff : 0x8b4513,
    map: ringTexture,
    side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.RingGeometry(0.8, 1.5, 128);
  if (ringTexture) {
    const uvs = ringGeo.attributes.uv.array;
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i + 1] *= 0.5;
    }
    ringGeo.attributes.uv.needsUpdate = true;
  }
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2.5;
  ring.receiveShadow = true;
  modelGroup.add(ring);
  return modelGroup;
}
function createAsteroidModel(skinOverride) {
  const modelGroup = new THREE.Group();
  const surfaceTexture = textureCache["asteroidSurface"];
  
  // 🛠️ FIX: Apply skin color override if available
  let meshColor = surfaceTexture ? 0xffffff : 0x555555;
  if (skinOverride) {
      meshColor = skinOverride.color;
  }
  
  const mat = new THREE.MeshStandardMaterial({
    color: meshColor, // Use custom color
    map: surfaceTexture,
    roughness: 1.0,
    metalness: 0.0,
    flatShading: true,
    emissive: 0x333333,
    emissiveIntensity: 0.1,
  });
  const geo = new THREE.IcosahedronGeometry(0.8, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + (Math.random() - 0.5) * 0.6);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const asteroid = new THREE.Mesh(geo, mat);
  asteroid.castShadow = true;
  if (surfaceTexture) {
    surfaceTexture.repeat.set(4, 4);
    surfaceTexture.needsUpdate = true;
  }
  modelGroup.add(asteroid);
  return modelGroup;
}
function createOrbModel() {
  const modelGroup = new THREE.Group();
  const orbMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      color: { value: new THREE.Color(0x00ffff) },
    },
    vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
    fragmentShader: `
            uniform float time;
            uniform vec3 color;
            varying vec2 vUv;
            varying vec3 vPosition;

            void main() {
                float swirl = sin(vUv.x * 10.0 + time * 2.0) * cos(vUv.y * 10.0 + time * 1.5);
                swirl += sin(vUv.y * 15.0 + time * 3.0) * 0.5;
                float glow = 1.0 - length(vUv - 0.5) * 2.0;
                glow = max(0.0, glow + swirl * 0.3);
                glow = pow(glow, 2.0);
                gl_FragColor = vec4(color * glow, glow);
            }
        `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const geometry = new THREE.SphereGeometry(0.7, 64, 64);
  const orb = new THREE.Mesh(geometry, orbMaterial);
  orb.userData.shaderMaterial = orbMaterial;
  modelGroup.add(orb);
  const pointLight = new THREE.PointLight(0x00ffff, 2, 10);
  modelGroup.add(pointLight);
  return modelGroup;
}

// --- MODIFIED MODEL: Hyper Cube / Quantum Decahedron ---
function createHyperCubeModel(skinOverride) {
  const modelGroup = new THREE.Group();

  // --- 🛠️ 1. CHECK FOR EQUIPPED SKIN ---
  let isDecahedronSkin = false;
  let customColor = 0x66ff66; // Default Neon Green

  if (skinOverride && skinOverride.id === "decahedron_skin") {
    isDecahedronSkin = true;
    customColor = skinOverride.color;
  } else if (equippedSkin === "decahedron_skin") {
    isDecahedronSkin = true;
    const skinItem = SHOP_ITEMS.find((i) => i.id === "decahedron_skin");
    if (skinItem) customColor = skinItem.color;
  }
  // --- END CHECK ---

  // 2. Main Shape - Wireframe Cube or Decahedron
  let geometry;
  if (isDecahedronSkin) {
    // 🛠️ USE ICOSAHEDRON GEOMETRY FOR A DECAHEDRON SHAPE (20 faces, high-poly look)
    geometry = new THREE.IcosahedronGeometry(1.2, 0); 
    modelGroup.userData.shape = 'decahedron';
  } else {
    geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    modelGroup.userData.shape = 'cube';
  }

  // 🛠️ Use a Shader Material for the Decahedron to make it swirl and glow
  const material = isDecahedronSkin ? new THREE.ShaderMaterial({
      uniforms: {
          time: { value: 0.0 },
          color: { value: new THREE.Color(customColor) },
      },
      vertexShader: `
          varying vec2 vUv;
          void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
      `,
      fragmentShader: `
          uniform float time;
          uniform vec3 color;
          varying vec2 vUv;

          void main() {
              float swirl = sin(vUv.x * 10.0 + time * 0.5) * cos(vUv.y * 10.0 + time * 0.3);
              float opacity = 0.8 + sin(time) * 0.1;
              gl_FragColor = vec4(color * (1.0 + swirl * 0.5), opacity);
          }
      `,
      wireframe: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
  }) : new THREE.MeshBasicMaterial({
      color: customColor,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
  });


  const shapeMesh = new THREE.Mesh(geometry, material);
  if (isDecahedronSkin) {
      shapeMesh.userData.shaderMaterial = material;
  }
  
  // 3. Inner Core - Swirling Orb
  const coreMaterial = new THREE.ShaderMaterial({
      uniforms: {
          time: { value: 0.0 },
          color: { value: new THREE.Color(customColor) },
      },
      vertexShader: `
              varying vec2 vUv;
              varying vec3 vPosition;
              void main() {
                  vUv = uv;
                  vPosition = position;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
          `,
      fragmentShader: `
              uniform float time;
              uniform vec3 color;
              varying vec2 vUv;
              varying vec3 vPosition;

              void main() {
                  // A simple wave/swirl effect for the core
                  float swirl = sin(vUv.x * 5.0 + time * 2.0) * cos(vUv.y * 5.0 + time * 1.5);
                  swirl += sin(vUv.y * 8.0 + time * 3.0) * 0.5;
                  float glow = 1.0 - length(vUv - 0.5) * 2.0;
                  glow = max(0.0, glow + swirl * 0.3);
                  glow = pow(glow, 2.0);
                  gl_FragColor = vec4(color * glow, glow);
              }
          `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
  });
  
  const coreGeo = new THREE.SphereGeometry(0.2, 16, 16);
  const core = new THREE.Mesh(coreGeo, coreMaterial);
  core.userData.shaderMaterial = coreMaterial; // Mark for animation updates

  modelGroup.add(shapeMesh);
  modelGroup.add(core);

  // Custom animation for the cube/decahedron for the selector and in-game
  modelGroup.userData.customAnimate = (time) => {
    // Rotate the outer shape
    shapeMesh.rotation.x += 0.01;
    shapeMesh.rotation.y += 0.02;
    shapeMesh.rotation.z += 0.015;
    
    // Rotate the inner core slower
    core.rotation.y += 0.005;

    // Update time uniforms for both shaders
    const timeValue = time * 0.0005;
    if (shapeMesh.userData.shaderMaterial) {
        shapeMesh.userData.shaderMaterial.uniforms.time.value = timeValue;
    }
    if (core.userData.shaderMaterial) {
        core.userData.shaderMaterial.uniforms.time.value = timeValue;
    }

    // Pulse the scale for an energy effect
    const scalePulse = 1.0 + Math.sin(time * 0.005) * 0.05;
    modelGroup.scale.set(scalePulse, scalePulse, scalePulse);
  };

  return modelGroup;
}
// --- END MODIFIED MODEL: Hyper Cube / Quantum Decahedron ---

// Apply skin colors to player model
function applySkinToPlayer(player, skinItem) {
  if (!player || !skinItem) return;

  // Apply color to all meshes in the visual model
  player.visualModel.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => {
          if (mat.color && !mat.isShaderMaterial) {
            mat.color.setHex(skinItem.color);
          }
        });
      } else {
        if (child.material.color && !child.material.isShaderMaterial) {
          child.material.color.setHex(skinItem.color);
        }
      }
    }
  });

  console.log(
    `Applied skin: ${skinItem.name} with color ${skinItem.color.toString(16)}`
  );
}

// =================================================================
// === NEW: STARFIELD & SHOOTING STAR LOGIC ========================
// =================================================================

// New global array to hold the THREE.js shooting stars
let shootingStars = [];
let player;

// Global variable for the shooting star interval ID
let shootingStarInterval;

// Function to create a single THREE.js shooting star

// MODIFIED: createGalaxyBackground now creates static stars that are always visible
let galaxy; // Declare galaxy globally so it can be accessed in animate()

function createGalaxyBackground() {
  const particleCount = 8000;
  const positions = [];
  // Increased the size of the box for the stars to spread out more
  const range = 500;
  for (let i = 0; i < particleCount; i++) {
    // Use a box to distribute stars in 3D space
    const x = (Math.random() - 0.5) * range;
    const y = (Math.random() - 0.5) * range;
    const z = (Math.random() - 0.5) * range;
    positions.push(x, y, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  const material = new THREE.PointsMaterial({
    size: 0.15, // Small size for distant stars
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false, // Important: Allows stars to be seen even if they are far away
  });

  // Assign to global variable
  galaxy = new THREE.Points(geometry, material);

  // Set a very low renderOrder to ensure it renders behind all obstacles and ground
  galaxy.renderOrder = -999;

  // Initially place stars far away
  galaxy.position.z = -200;

  return galaxy;
}
// =================================================================
// === END STARFIELD & SHOOTING STAR LOGIC =========================
// =================================================================

// --- FIXED: CREATE GOLD COLLECTIBLE STAR MODEL (upright + continuous Y-rotation) ---
function createCollectibleStar() {
  const group = new THREE.Group();

  // Create a 5-pointed star shape
  const shape = new THREE.Shape();
  const outerRadius = 0.3;
  const innerRadius = 0.15;
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const extrudeSettings = { depth: 0.1, bevelEnabled: false };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffd700,
    emissiveIntensity: 1.5,
    metalness: 0.8,
    roughness: 0.3,
  });

  const star = new THREE.Mesh(geometry, material);
  // No rotation.x to make the star stand upright
  star.rotation.y = Math.PI / 2; // initial twist
  star.castShadow = true;
  star.receiveShadow = true;
  group.add(star);

  // Pulse glow and continuous Y-rotation
  group.userData.update = () => {
    // Continuous 360-degree rotation on the Y-axis
    star.rotation.y += 0.05; 
    
    const scale = 1 + Math.sin(Date.now() * 0.004) * 0.05;
    group.scale.set(scale, scale, scale);
  };

  return group;
}
// --- END FIXED: CREATE GOLD COLLECTIBLE STAR MODEL ---

// --- NEW: Function to update the Star Counter HUD ---
function updateStarCounterHUD() {
  const starCount = localStorage.getItem("spaceRunnerStars") || "0";
  const starElement = document.getElementById("stars-count");
  if (starElement) {
    starElement.textContent = starCount;
  }
  const starHUD = document.getElementById("starCountHUD");
  if (starHUD) {
    starHUD.textContent = `⭐ Collected: ${starCount}`;
  }
}
// --- END NEW: Function to update the Star Counter HUD ---
function initGame() {
  function spawnShootingStar() {
    // Geometry is a thin cylinder or box
    if (!player) return;
    const geometry = new THREE.CylinderGeometry(0.05, 0.0, 15, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending, // Makes it glow
    });

    const star = new THREE.Mesh(geometry, material);

    // Random position far in front of the camera, high up
    const x = (Math.random() - 0.5) * 60;
    const y = 20 + Math.random() * 20;
    // Set it far in front of the player, in the visible distance (relative to player's Z)
    const z = player.position.z - 200 - Math.random() * 100;

    star.position.set(x, y, z);

    // Rotate to give a diagonal trail look
    star.rotation.z = Math.PI / 4 + (Math.random() * 0.5 - 0.25);
    star.rotation.x = Math.PI / 2; // Point it back

    // Store properties for animation and cleanup
    star.userData.speed = 0.5 + Math.random() * 0.5;
    star.userData.lifetime = 0;
    star.userData.maxLifetime = 100; // Frames before removal

    scene.add(star);
    shootingStars.push(star);
  }
  let isFirstPerson = false;
  let isPaused = false;

  const gameState = {
    score: 0,
    internalLevel: 1,
    isGameOver: false,
    newlyUnlockedCharacterId: null,
    newlyUnlockedLevel: null,
    singularityUsed: false,
    highScoreNotified: false,
    startingHighScore: 0,
  };
  const gameConfig = {
    playerSpeed: -0.15,
    spawnInterval: 25,
    minSpawnInterval: 15, // 🛠️ NEW: Minimum distance between obstacles
    levelColors: {
      1: { bg: "#010103" },
      2: { bg: "#0c0a1f" },
      3: { bg: "#1d0b30" },
    },
  };
  const INTERNAL_LEVEL_THRESHOLDS = { 4: 4000, 5: 7000 };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(gameConfig.levelColors[1].bg);
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById("gameScreen").appendChild(renderer.domElement);

  // --- PAUSE MENU DOM ELEMENTS ---
  const pauseButton = document.getElementById("pause-button");
  const pauseScreen = document.getElementById("pauseScreen");
  const resumeButton = document.getElementById("resume-button");
  const restartPauseButton = document.getElementById("restart-pause-button");
  const menuPauseButton = document.getElementById("menu-pause-button");

  document.getElementById(
    "highScore"
  ).innerText = `High Score: ${highScores[selectedLevel]}`;

  let obstacles = [],
    trailParticles = [],
    grounds = [],
    lastSpawnZ,
    animationId;
  let trailMaterial, trailGeometry, trailColor, trailSize; // Trail variables
  
  // --- NEW: Collectible Star Array ---
  const collectibleStars = [];
  // --- END NEW: Collectible Star Array ---

  // MINIMAP VARIABLES
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas.getContext('2d');
  minimapCanvas.width = 150;
  minimapCanvas.height = 150;
  
  const minimap = {
    width: 150,
    height: 150,
    scale: 0.8, // Adjust this to change zoom level
    playerHistory: [], // Store player positions for trail
    maxHistory: 20 // Number of positions to keep for trail
  };

  function renderMinimap() {
    if (!player || !minimapCtx) return;
    
    // Clear minimap with transparent background
    minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
    
    // Draw background
    minimapCtx.fillStyle = 'rgba(10, 10, 30, 0.8)';
    minimapCtx.fillRect(0, 0, minimap.width, minimap.height);
    
    // Draw grid
    minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    for (let x = 0; x <= minimap.width; x += 15) {
        minimapCtx.moveTo(x, 0);
        minimapCtx.lineTo(x, minimap.height);
    }
    for (let y = 0; y <= minimap.height; y += 15) {
        minimapCtx.moveTo(0, y);
        minimapCtx.lineTo(minimap.width, y);
    }
    minimapCtx.stroke();
    
    // Center of minimap (player position)
    const centerX = minimap.width / 2;
    const centerY = minimap.height / 2;
    
    // Get the 3 closest obstacles
    const closestObstacles = obstacles
        .filter(obstacle => {
            return obstacle.group && 
                   obstacle.group.position && 
                   (obstacle.isActive === undefined || obstacle.isActive === true);
        })
        .map(obstacle => {
            // Calculate relative position to player
            const relX = obstacle.group.position.x - player.position.x;
            const relZ = obstacle.group.position.z - player.position.z;
            const distance = Math.sqrt(relX * relX + relZ * relZ);
            return { 
                obstacle, 
                distance, 
                relX, 
                relZ,
                type: obstacle.constructor.name
            };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
    
    // Draw the 3 closest obstacles at their ACTUAL relative positions
    closestObstacles.forEach(({ obstacle, relX, relZ, type }, index) => {
        // Convert relative position to minimap coordinates
        const obstacleX = centerX + relX * minimap.scale;
        const obstacleY = centerY + relZ * minimap.scale;
        
        // Check if obstacle is within minimap bounds
        const isInBounds = 
            obstacleX >= 0 && obstacleX <= minimap.width &&
            obstacleY >= 0 && obstacleY <= minimap.height;
        
        if (!isInBounds) return;
        
        // Color assignment based on type
        let color = '#ff4444';
        switch (type) {
            case 'SatelliteWreckage':
                color = '#ffaa00';
                break;
            case 'UFO':
                color = '#00ff00';
                break;
            case 'EnergyField':
                color = '#00ffff';
                break;
            case 'AsteroidField':
                color = '#888888';
                break;
            case 'PlasmaShots':
                color = '#ff4500';
                break;
            case 'QuantumGate':
                color = '#00ff7f';
                break;
            default:
                color = '#ff4444';
        }
        
        // Draw obstacle dot at its actual relative position
        minimapCtx.fillStyle = color;
        minimapCtx.beginPath();
        minimapCtx.arc(obstacleX, obstacleY, 5, 0, Math.PI * 2);
        minimapCtx.fill();
        
        // Draw obstacle number
        minimapCtx.fillStyle = '#ffffff';
        minimapCtx.font = 'bold 12px Arial';
        minimapCtx.textAlign = 'center';
        minimapCtx.textBaseline = 'middle';
        minimapCtx.fillText((index + 1).toString(), obstacleX, obstacleY);
    });
    
    // Update player history for trail
    minimap.playerHistory.push({
        x: 0,
        z: 0
    });
    
    // Keep only recent positions
    if (minimap.playerHistory.length > minimap.maxHistory) {
        minimap.playerHistory.shift();
    }
    
    // Draw player trail (showing movement path) - REMOVED the upward trail
    if (minimap.playerHistory.length > 1) {
        minimapCtx.strokeStyle = 'rgba(255, 105, 180, 0.4)';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        
        // Draw trail as dots behind player position
        minimap.playerHistory.forEach((pos, index) => {
            if (index > 0) { // Skip the first position (current position)
                const trailX = centerX;
                const trailY = centerY + (index * 2); // Trail goes down instead of up
                minimapCtx.lineTo(trailX, trailY);
            }
        });
        
        minimapCtx.stroke();
    }
    
    // Draw player as pink dot in center (NO direction line)
    minimapCtx.fillStyle = '#ff00ff';
    minimapCtx.beginPath();
    minimapCtx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    minimapCtx.fill();
    
    // Add subtle glow to player dot (optional)
    minimapCtx.shadowColor = '#ff00ff';
    minimapCtx.shadowBlur = 8;
    minimapCtx.fill();
    minimapCtx.shadowBlur = 0;
    
    // Draw border
    minimapCtx.strokeStyle = '#ff00ff';
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(0, 0, minimap.width, minimap.height);
    
    // Draw compass indicators (keeping these but they're just text)
    minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    minimapCtx.font = '10px Arial';
    minimapCtx.textAlign = 'center';
    minimapCtx.fillText('N', centerX, 12);
    minimapCtx.fillText('S', centerX, minimap.height - 5);
    minimapCtx.textAlign = 'left';
    minimapCtx.fillText('W', 5, centerY + 3);
    minimapCtx.textAlign = 'right';
    minimapCtx.fillText('E', minimap.width - 5, centerY + 3);
    
    // Draw info
    minimapCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    minimapCtx.font = '9px Arial';
    minimapCtx.textAlign = 'center';
    //minimapCtx.fillText(`OBSTACLES: ${closestObstacles.length}/3`, centerX, minimap.height - 15);
}


  // --- Classes (Box, Player, AsteroidField, UFO, EnergyField, PlasmaShots, QuantumGate) ---
  class Box extends THREE.Mesh {
    constructor({ width, height, depth, color, position, emissiveIntensity }) {
      super(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity:
            emissiveIntensity === undefined ? 0.2 : emissiveIntensity,
        })
      );
      this.width = width;
      this.height = height;
      this.depth = depth;
      this.position.set(position.x, position.y, position.z);
    }
  }
  class Player extends THREE.Group {
    constructor({
      characterId,
      velocity = { x: 0, y: 0, z: 0 },
      position = { x: 0, y: 0, z: 0 },
    }) {
      super();
      this.position.set(position.x, position.y, position.z);
      this.velocity = velocity;
      this.gravity = -0.004;
      this.onGround = false;
      const objData = PLAYER_OBJECTS[characterId];
      this.width = objData.colliderSize.width;
      this.height = objData.colliderSize.height;
      this.depth = objData.colliderSize.depth;
      
      // 🛠️ Check for equipped skin override for model creation
      let skinOverride = null;
      // Find the equipped skin object
      const equippedItem = equippedSkin ? SHOP_ITEMS.find(item => item.id === equippedSkin) : null;
      if (equippedItem && equippedItem.basedOn === characterId) {
          skinOverride = equippedItem;
      }

      this.visualModel = objData.createModel(skinOverride); // Pass override to model creator

      if (characterId === "rocket") {
        this.visualModel.rotation.x = -Math.PI / 2;
        this.visualModel.position.z = -0.2;
      }
      this.add(this.visualModel);
      const colliderGeo = new THREE.BoxGeometry(
        this.width,
        this.height,
        this.depth
      );
      const colliderMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
      });
      this.colliderBox = new THREE.Mesh(colliderGeo, colliderMat);
      this.add(this.colliderBox);
      this.orbitingObstacles = [];
      // 🛠️ NEW: Ability activation flag for Saturn power
      this.isActivatingAbility = false; 
    }
    update(grounds) {
      this.position.x += this.velocity.x;
      this.position.z += this.velocity.z;
      this.applyGravity(grounds);
      if (this.orbitingObstacles.length > 0) {
        this.orbitingObstacles.forEach((obstacle, index) => {
          const angle = Date.now() * 0.001 + index;
          obstacle.group.position.x = Math.cos(angle) * 3;
          obstacle.group.position.z = Math.sin(angle) * 3;
        });
      }
    }
    applyGravity(grounds) {
      this.velocity.y += this.gravity;
      this.position.y += this.velocity.y;
      this.onGround = false;
      for (const ground of grounds) {
        if (boxCollision({ box1: this.colliderBox, box2: ground })) {
          this.onGround = true;
          this.velocity.y = 0;
          this.position.y =
            ground.position.y + ground.height / 2 + this.height / 2;
          break;
        }
      }
    }
  }
 
  class AsteroidField {
    constructor(p) {
      this.group = new THREE.Group();
      p.y = -1.75;
      this.group.position.copy(p);
      scene.add(this.group);
      this.colliders = [];
      for (let i = 0; i < 4; i++) {
        const a = new Box({
          width: Math.random() * 1 + 0.8,
          height: Math.random() * 1 + 0.8,
          depth: Math.random() * 1 + 0.8,
          color: ["#8B4513", "#CD853F", "#D2691E", "#A0522D"][i],
          position: { x: (i - 2) * 2, y: 0.4, z: 0 },
          emissiveIntensity: 0,
        });
        a.scale.set(
          Math.random() * 0.3 + 0.7,
          Math.random() * 0.3 + 0.7,
          Math.random() * 0.3 + 0.7
        );
        a.castShadow = true;
        this.group.add(a);
        this.colliders.push(a);
      }
    }
    update() {
      const t = Date.now() * 0.001;
      this.group.children.forEach((a, i) => {
        a.position.x = (i - 2) * 2 + Math.sin(t + i) * 2.5;
        a.rotation.x += 0.01;
        a.rotation.y += 0.015;
        a.rotation.z += 0.008;
      });
    }
  }
  class UFO {
    constructor(p) {
      this.group = new THREE.Group();
      p.y = -1.75;
      this.group.position.copy(p);
      scene.add(this.group);
      this.colliders = [];
      if (modelCache.ufo && modelCache.ufo.scene) {
        const ufoModel = modelCache.ufo.scene.clone();

        // === ❗️ TWEAK THESE VALUES ❗️ ===
        // You will NEED to adjust these to make your model
        // look correct in the game.
        ufoModel.scale.set(1, 1, 1); // e.g., 0.5, 0.5, 0.5
        ufoModel.rotation.y = Math.PI; // Rotate 180 degrees
        ufoModel.position.y = 1.25; // Move it up
        // ================================

        // Make the model cast shadows
        ufoModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
          }
        });

        this.group.add(ufoModel);
      } else {
        console.error("UFO model not found in cache! Did it fail to load?");
      }

      // --- 2. Add the INVISIBLE Collider ---
      // This is the *real* hitbox. The old UFO used two boxes,
      // we'll just use one big one.
      // (width: 3, height: 1.5, depth: 3)
      const collider = new Box({
        width: 3,
        height: 1.5,
        depth: 3,
        color: 0xff0000, // Red (so you can see it while testing)
        position: { x: 0, y: 1.25, z: 0 },
        emissiveIntensity: 0,
      });

      // --- ❗️ SET OPACITY TO 0 TO HIDE IT ---
      collider.material.transparent = true;
      collider.material.opacity = 0.0; // 👈 Set to 0.0 when done!
      // (Set to 0.5 to see the hitbox while you test)

      this.group.add(collider);
      this.colliders.push(collider); // This is what the player collides with
    }
    update() {
      const t = Date.now() * 0.0008;
      this.group.position.x = Math.sin(t) * 4;
      this.group.rotation.y = t * 0.5;
      this.group.rotation.y = t * 0.5;
    }
  }

    class EnergyField {
    constructor(p) {
      this.group = new THREE.Group();
      p.y = -1.75;
      this.group.position.copy(p);
      scene.add(this.group);
      this.colliders = [];
      const colors = ["#00FFFF", "#FF00FF", "#00FF00"];
      const beamPositions = [
        { x: -4, z: -2 },
        { x: -1, z: -2 },
        { x: 1, z: 0 },
        { x: 4, z: 0 },
        { x: -4, z: 2 },
        { x: -1, z: 2 },
      ];
      beamPositions.forEach((pos, i) => {
        const beam = new Box({
          width: 0.4,
          height: 4,
          depth: 0.4,
          color: colors[i % colors.length],
          position: { x: pos.x, y: 2, z: pos.z },
          emissiveIntensity: 0.3,
        });
        beam.castShadow = true;
        this.group.add(beam);
        this.colliders.push(beam);
      });
    }
    update() {
      const t = Date.now() * 0.002;
      this.group.children.forEach((b) => {
        b.material.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.2;
      });
    }
  }

  class PlasmaShots {
    constructor(p) {
      this.group = new THREE.Group();
      p.y = -1.75;
      this.group.position.copy(p);
      scene.add(this.group);
      this.colliders = [];
      for (let i = 0; i < 3; i++) {
        const s = new Box({
          width: 0.6,
          height: 0.6,
          depth: 0.6,
          color: "#FF4500",
          position: { x: i * 2 - 2, y: 0.3, z: 0 },
          emissiveIntensity: 0.4,
        });
        s.castShadow = true;
        this.group.add(s);
        this.colliders.push(s);
      }
    }
    update() {
      const t = Date.now() * 0.0015;
      this.group.children.forEach((s, i) => {
        s.position.x = i * 2 - 2 + Math.sin(t + i) * 3;
        s.position.z = Math.sin(t * 0.8 + i) * 2;
        s.rotation.x += 0.05;
        s.rotation.z += 0.03;
      });
    }
  }
 
  class QuantumGate {
    constructor(p) {
      this.group = new THREE.Group();
      p.y = -1.75;
      this.group.position.copy(p);
      scene.add(this.group);
      this.colliders = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2,
          r = 3;
        const g = new Box({
          width: 0.4,
          height: 4,
          depth: 0.4,
          color: "#00FF7F",
          position: { x: Math.cos(a) * r, y: 2, z: Math.sin(a) * r },
          emissiveIntensity: 0.3,
        });
        g.castShadow = true;
        this.group.add(g);
        this.colliders.push(g);
      }
    }
    update() {
      const t = Date.now() * 0.0005;
      this.group.children.forEach((g, i) => {
        const a = (i / 8) * Math.PI * 2 + t,
          r = 3;
        g.position.x = Math.cos(a) * r;
        g.position.z = Math.sin(a) * r;
        g.material.emissiveIntensity = 0.3 + Math.sin(t * 3) * 0.2;
      });
    }
}

// NEW STYLED OBSTACLES FOR LEVEL 1


class SatelliteWreckage {
    constructor(p) {
        this.group = new THREE.Group();
        p.y = -1.75;
        this.group.position.copy(p);
        scene.add(this.group);
        this.colliders = [];

        // Movement properties
        this.speed = 0.08 + Math.random() * 0.04; // Speed toward player
        this.rotationSpeed = 0.005 + Math.random() * 0.005; // Tumbling speed
        this.isActive = true;

        // 🛠️ MODIFIED: Scale down the entire group to make it smaller
        this.group.scale.set(0.6, 0.6, 0.6); 

        // Create satellite parts with different geometries
        this.createSatelliteParts();
        
        // Add debris field with particle system
        this.createDebrisField();
        
        // Add electrical arcs between pieces
        this.createElectricalArcs();
        
        // Add flickering lights
        this.createEmergencyLights();

        console.log("SatelliteWreckage spawned - moving toward player!");
    }

    createSatelliteParts() {
        // Main satellite body (damaged cylinder)
        const bodyGeometry = new THREE.CylinderGeometry(0.8, 0.6, 2, 8);
        this.damageGeometry(bodyGeometry, 0.3);
        
        const bodyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                baseColor: { value: new THREE.Color(0x2a4b8d) },
                emissiveColor: { value: new THREE.Color(0x4a90e2) },
                damageColor: { value: new THREE.Color(0xff6b35) },
                noiseScale: { value: 5.0 },
                sparkIntensity: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;
                uniform float time;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    vNormal = normal;
                    
                    // Add subtle wobble to simulate damage
                    float damageWave = sin(time * 2.0 + position.x * 3.0) * 0.1;
                    vec3 wobblePosition = position + normal * damageWave * 0.1;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(wobblePosition, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 baseColor;
                uniform vec3 emissiveColor;
                uniform vec3 damageColor;
                uniform float noiseScale;
                uniform float sparkIntensity;
                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;
                
                // Simple noise function for damage patterns
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }
                
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));
                    
                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }
                
                void main() {
                    // Base metal with scratches
                    vec2 uv = vUv * noiseScale;
                    float metalNoise = noise(uv + time * 0.5);
                    vec3 finalColor = mix(baseColor, baseColor * 0.7, metalNoise);
                    
                    // Damage patterns
                    float damage = noise(vUv * 8.0 + time * 0.2);
                    damage = pow(damage, 3.0);
                    finalColor = mix(finalColor, damageColor, damage * 0.3);
                    
                    // Spark effects at damaged edges
                    float edge = dot(vNormal, vec3(0.0, 1.0, 0.0));
                    float spark = sin(time * 10.0 + vPosition.x * 20.0) * 0.5 + 0.5;
                    spark *= pow(1.0 - abs(edge), 4.0);
                    spark *= damage;
                    
                    finalColor += emissiveColor * spark * sparkIntensity;
                    
                    // Flickering emissive from broken electronics
                    float flicker = hash(vec2(time * 15.0, vUv.x));
                    flicker = step(0.7, flicker) * damage;
                    finalColor += vec3(1.0, 0.8, 0.2) * flicker * 0.5;
                    
                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `
        });

        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        this.group.add(body);
        this.colliders.push(body);
        body.userData.shaderMaterial = bodyMaterial;

        // Solar panel (broken)
        const panelGeometry = new THREE.PlaneGeometry(2, 1.5);
        const panelMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                panelColor: { value: new THREE.Color(0x1a3a6d) },
                solarColor: { value: new THREE.Color(0xffd700) },
                broken: { value: 0.8 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                uniform float time;
                
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    
                    // Panel wobble effect
                    float wave = sin(time * 3.0 + worldPosition.x * 2.0) * 0.2;
                    vec3 wobblePos = position + normal * wave * 0.1;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(wobblePos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 panelColor;
                uniform vec3 solarColor;
                uniform float broken;
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                
                void main() {
                    // Crack patterns
                    float cracks = 0.0;
                    for(float i = 0.0; i < 5.0; i++) {
                        float crack = sin(vUv.x * 30.0 + i * 10.0 + time) * 0.5 + 0.5;
                        crack = 1.0 - smoothstep(0.4, 0.6, crack);
                        cracks += crack * 0.2;
                    }
                    
                    // Solar cell grid with broken parts
                    vec2 grid = fract(vUv * vec2(8.0, 6.0));
                    float cell = step(0.1, grid.x) * step(0.1, grid.y) * step(grid.x, 0.9) * step(grid.y, 0.9);
                    
                    // Random broken cells
                    float cellHash = fract(sin(dot(floor(vUv * vec2(8.0, 6.0)), vec2(12.9898, 78.233))) * 43758.5453);
                    float isBroken = step(broken, cellHash);
                    
                    vec3 color = panelColor;
                    color = mix(color, solarColor, cell * (1.0 - isBroken) * 0.3);
                    color = mix(color, vec3(0.1), cracks);
                    
                    // Flickering broken cells
                    float flicker = sin(time * 20.0 + vWorldPosition.x * 10.0) * 0.5 + 0.5;
                    color += solarColor * isBroken * flicker * 0.5;
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.DoubleSide
        });

        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        panel.position.set(1.5, 0.5, 0);
        panel.rotation.y = Math.PI / 2;
        panel.castShadow = true;
        this.group.add(panel);
        this.colliders.push(panel);
        panel.userData.shaderMaterial = panelMaterial;

        // Antenna (bent)
        const antennaGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
        const antenna = new THREE.Mesh(antennaGeometry, new THREE.MeshStandardMaterial({ 
            color: 0x888888,
            emissive: 0x444444 
        }));
        antenna.position.set(-0.8, 1.2, 0);
        antenna.rotation.z = Math.PI / 6;
        this.group.add(antenna);
        this.colliders.push(antenna);

        // Fuel tank (leaking)
        const tankGeometry = new THREE.SphereGeometry(0.4, 16, 16);
        const tankMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                leakPosition: { value: new THREE.Vector2(0.7, 0.5) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                uniform float time;
                
                void main() {
                    vUv = uv;
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec2 leakPosition;
                varying vec2 vUv;
                varying vec3 vNormal;
                
                void main() {
                    vec3 baseColor = vec3(0.3, 0.3, 0.4);
                    
                    // Leaking fuel effect
                    float leakDist = distance(vUv, leakPosition);
                    float leak = 1.0 - smoothstep(0.0, 0.3, leakDist);
                    leak *= sin(time * 5.0) * 0.5 + 0.5;
                    
                    // Frost/crystal formation from leaking fuel
                    float frost = sin(vUv.x * 20.0 + time * 2.0) * 0.5 + 0.5;
                    frost *= sin(vUv.y * 15.0 + time * 3.0) * 0.5 + 0.5;
                    frost = pow(frost, 3.0) * leak;
                    
                    vec3 color = mix(baseColor, vec3(0.8, 0.9, 1.0), frost);
                    color = mix(color, vec3(0.1, 0.2, 0.8), leak * 0.3);
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });

        const tank = new THREE.Mesh(tankGeometry, tankMaterial);
        tank.position.set(0, -0.5, 0.8);
        this.group.add(tank);
        this.colliders.push(tank);
        tank.userData.shaderMaterial = tankMaterial;
    }

    createDebrisField() {
        const debrisCount = 15;
        this.debrisParticles = [];

        for (let i = 0; i < debrisCount; i++) {
            const size = Math.random() * 0.2 + 0.05;
            const geometry = new THREE.OctahedronGeometry(size);
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0.0 },
                    baseColor: { value: new THREE.Color(0x4a5568) },
                    glowColor: { value: new THREE.Color(0x00ffff) }
                },

                vertexShader: `
                    uniform float time;
                    attribute float speed;
                    attribute float offset;
                    varying vec3 vPosition;
                    
                    // Proper rotation matrix function
                    mat4 rotationMatrix(vec3 axis, float angle) {
                        axis = normalize(axis);
                        float s = sin(angle);
                        float c = cos(angle);
                        float oc = 1.0 - c;
                        
                        return mat4(oc * axis.x * axis.x + c,        oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
                                oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,        oc * axis.y * axis.z - axis.x * s, 0.0,
                                oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c,        0.0,
                                0.0,                               0.0,                               0.0,                               1.0);
                    }
                    
                    void main() {
                        vPosition = position;
                        // Debris tumble rotation
                        float tumble = time * speed + offset;
                        
                        // Create rotation axis and angle
                        vec3 rotationAxis = normalize(vec3(sin(tumble), cos(tumble * 1.3), sin(tumble * 0.7)));
                        float rotationAngle = tumble;
                        
                        mat4 rotation = rotationMatrix(rotationAxis, rotationAngle);
                        vec3 rotatedPos = (rotation * vec4(position, 1.0)).xyz;
                        
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(rotatedPos, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 baseColor;
                    uniform vec3 glowColor;
                    uniform float time;
                    varying vec3 vPosition;
                    
                    void main() {
                        // Metallic debris with occasional glow
                        float pulse = sin(time * 3.0 + vPosition.x * 10.0) * 0.5 + 0.5;
                        pulse = pow(pulse, 4.0);
                        
                        vec3 color = mix(baseColor, glowColor, pulse * 0.3);
                        
                        // Sparkle effect
                        float sparkle = sin(time * 20.0 + vPosition.y * 30.0) * 0.5 + 0.5;
                        sparkle *= sin(time * 15.0 + vPosition.z * 25.0) * 0.5 + 0.5;
                        sparkle = step(0.8, sparkle);
                        
                        color += glowColor * sparkle * 0.5;
                        
                        gl_FragColor = vec4(color, 1.0);
                    }
                `
            });

            const debris = new THREE.Mesh(geometry, material);
            
            // Set custom attributes for animation
            debris.userData.speed = Math.random() * 2 + 1;
            debris.userData.offset = Math.random() * Math.PI * 2;
            debris.userData.radius = Math.random() * 3 + 1;
            debris.userData.angle = Math.random() * Math.PI * 2;
            
            // Position debris in a cloud around the satellite
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 3 + 1;
            const height = (Math.random() - 0.5) * 2;
            debris.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );

            this.group.add(debris);
            this.debrisParticles.push(debris);
            debris.userData.shaderMaterial = material;
        }
    }

    createElectricalArcs() {
        this.arcs = [];
        const arcCount = 4;

        for (let i = 0; i < arcCount; i++) {
            const points = [];
            const segments = 8;
            
            for (let j = 0; j <= segments; j++) {
                const t = j / segments;
                const x = (Math.random() - 0.5) * 2;
                const y = (Math.random() - 0.5) * 2;
                const z = (Math.random() - 0.5) * 2;
                points.push(new THREE.Vector3(x, y, z));
            }

            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 20, 0.02, 8, false);
            
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0.0 },
                    arcColor: { value: new THREE.Color(0x00ffff) },
                    arcSpeed: { value: Math.random() * 3 + 2 }
                },
                vertexShader: `
                    uniform float time;
                    uniform float arcSpeed;
                    varying float vAlpha;
                    
                    void main() {
                        // Traveling arc effect
                        float travel = mod(time * arcSpeed, 1.0);
                        float distFromStart = position.y; // Using y as distance proxy
                        float arcWave = sin((distFromStart - travel) * 20.0) * 0.5 + 0.5;
                        vAlpha = arcWave;
                        
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 arcColor;
                    varying float vAlpha;
                    
                    void main() {
                        vec3 color = arcColor * vAlpha;
                        gl_FragColor = vec4(color, vAlpha * 0.8);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending
            });

            const arc = new THREE.Mesh(geometry, material);
            arc.position.set(
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2,
                (Math.random() - 0.5) * 2
            );
            
            this.group.add(arc);
            this.arcs.push(arc);
            arc.userData.shaderMaterial = material;
        }
    }

    createEmergencyLights() {
        this.lights = [];
        const lightCount = 3;

        for (let i = 0; i < lightCount; i++) {
            const light = new THREE.PointLight(0xff0000, 1, 3);
            light.position.set(
                (Math.random() - 0.5) * 3,
                (Math.random() - 0.5) * 2 + 1,
                (Math.random() - 0.5) * 3
            );
            
            this.group.add(light);
            this.lights.push(light);
        }
    }

    damageGeometry(geometry, intensity) {
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            
            // Random damage displacement
            const damage = (Math.random() - 0.5) * intensity;
            position.setX(i, x + damage);
            position.setY(i, y + damage * 0.5);
            position.setZ(i, z + damage);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
    }

    update() {
        if (!this.isActive) return;

        const t = Date.now() * 0.001;

        // MOVE TOWARD PLAYER (SCREEN)
        this.group.position.z += this.speed;

        // Main satellite tumbling
        this.group.rotation.x += this.rotationSpeed;
        this.group.rotation.y += this.rotationSpeed * 1.2;
        this.group.rotation.z += this.rotationSpeed * 0.8;

        // Update shader uniforms
        this.group.traverse((child) => {
            if (child.userData && child.userData.shaderMaterial) {
                child.userData.shaderMaterial.uniforms.time.value = t;
            }
        });

        // Animate debris particles
        this.debrisParticles.forEach((debris, i) => {
            debris.userData.angle += 0.02 * debris.userData.speed;
            const radius = debris.userData.radius;
            const height = Math.sin(t * debris.userData.speed + i) * 0.5;
            
            debris.position.set(
                Math.cos(debris.userData.angle) * radius,
                height,
                Math.sin(debris.userData.angle) * radius
            );
        });

        // Animate emergency lights
        this.lights.forEach((light, i) => {
            const flicker = Math.sin(t * 10 + i * 2) * 0.5 + 0.5;
            light.intensity = flicker * 2;
        });

        // Gentle floating motion
        this.group.position.y = Math.sin(t * 0.5) * 0.2;

        // Remove if too far behind player (cleanup)
        if (this.group.position.z > player.position.z + 50) {
            this.remove();
        }
    }

    remove() {
        // Clean up the satellite from the scene
        scene.remove(this.group);
        this.isActive = false;
        
        // Find and remove from obstacles array
        const index = obstacles.indexOf(this);
        if (index > -1) {
            obstacles.splice(index, 1);
        }
    }

    // Check collision with player
    // In the SatelliteWreckage class, replace the checkPlayerCollision method:

    checkPlayerCollision() {
        if (!this.isActive || !player) return false;

        // Get world position and bounding box for player
        const playerBox = new THREE.Box3().setFromObject(player.colliderBox);
        
        for (const collider of this.colliders) {
            // Get world position and bounding box for this collider
            const colliderBox = new THREE.Box3().setFromObject(collider);
            
            // Debug: Visualize collision boxes (remove in production)
            // const helper1 = new THREE.Box3Helper(playerBox, 0xff0000);
            // const helper2 = new THREE.Box3Helper(colliderBox, 0x00ff00);
            // scene.add(helper1);
            // scene.add(helper2);
            // setTimeout(() => {
            //     scene.remove(helper1);
            //     scene.remove(helper2);
            // }, 100);
            
            if (playerBox.intersectsBox(colliderBox)) {
                console.log("Collision detected with satellite wreckage!");
                return true;
            }
        }
        return false;
    }
    // Add this method to the SatelliteWreckage class
    isTooCloseToPlayer() {
        if (!player) return false;
        const distance = Math.abs(this.group.position.z - player.position.z);
        return distance < 15; // Minimum safe distance
    }
}


  // --- UPDATED OBSTACLE TYPES LIST ---
  // UFO is index 4, QuantumGate is index 5
  const obstacleTypes = [
    AsteroidField,
    PlasmaShots,
    SatelliteWreckage, 
    EnergyField,
    UFO, // Index 4
    QuantumGate, // Index 5
   
  ];

  // --- MODIFIED: Create, but don't add to scene yet ---
  createGalaxyBackground();
  // --- END MODIFIED ---

  const spaceLight = new THREE.DirectionalLight(0xffffff, 1.5);
  spaceLight.position.set(5, 5, 2);
  spaceLight.castShadow = true;
  scene.add(spaceLight);
  scene.add(new THREE.AmbientLight(0x87ceeb, 0.5));
  const keys = { a: { pressed: false }, d: { pressed: false } };

  // MODIFIED: startGame now removes ALL menu screens and ensures gameScreen is visible
  startGame = () => {
    // 1. Hide ALL menu screens FIRST
    document
      .querySelectorAll(".menuScreen")
      .forEach((screen) => screen.classList.remove("active"));

    // 2. Make the gameScreen visible IMMEDIATELY
    document.getElementById("gameScreen").classList.remove("hidden");

    // 3. Setup and start the rendering loop
    setupNewGame();
  };
  function boxCollision({ box1, box2 }) {
    const b1p = new THREE.Vector3();
    box1.getWorldPosition(b1p);
    const b2p = new THREE.Vector3();
    box2.getWorldPosition(b2p);
    const b1 = box1.geometry.parameters;
    const b2 = box2.geometry.parameters;
    return (
      Math.abs(b1p.x - b2p.x) * 2 < b1.width + b2.width &&
      Math.abs(b1p.y - b2p.y) * 2 < b1.height + b2.height &&
      Math.abs(b1p.z - b2p.z) * 2 < b1.depth + b2.depth
    );
  }

  // --- FIXED: STAR SPAWN LOGIC (lower altitude & 10-second frequency) ---
  let starSpawnInterval;
  function spawnCollectibleStar() {
    if (!player || gameState.isGameOver) return;

    const star = createCollectibleStar();

    const trackWidth = 8; // adjust to your track width
    const x = (Math.random() - 0.5) * trackWidth * 2;

    // ✅ FIXED: Max Y-height capped at 1.0 (on or slightly above track level)
    const y = 0.3 + Math.random() * 0.7; // Range: 0.3 to 1.0

    // Spawn far in front of the player
    const z = player.position.z - 100 - Math.random() * 100;

    star.position.set(x, y, z);
    scene.add(star);
    collectibleStars.push(star);
  }
  // --- END FIXED: STAR SPAWN LOGIC ---

  // --- NEW: Function to update the Star Counter HUD ---
  function updateStarCounterHUD() {
    const starCount = localStorage.getItem("spaceRunnerStars") || "0";
    const starElement = document.getElementById("stars-count");
    if (starElement) {
      starElement.textContent = starCount;
    }
    const starHUD = document.getElementById("starCountHUD");
    if (starHUD) {
      starHUD.textContent = `⭐ Collected: ${starCount}`;
    }
  }
  // --- END NEW: Function to update the Star Counter HUD ---
  
  // 🛠️ NEW: Run-specific quest tracking for the Consecutive Score quest
  let runQuestTracker = {
      isConsecutiveScoreQuestActive: false,
      isNoJumpQuestActive: false,
      didPassScoreThreshold: false,
      didJump: false,
      didUseAbility: false
  };

  function setupNewGame() {
    isPaused = false;
    // FIX: Ensure pause screens are hidden at start
    pauseScreen.style.display = "none";
    pauseButton.style.display = "flex";

    gameState.isGameOver = false;
    gameState.score = 0;
    gameState.internalLevel = selectedLevel;
    gameState.newlyUnlockedCharacterId = null;
    gameState.newlyUnlockedLevel = null;
    gameState.singularityUsed = false;
    gameState.highScoreNotified = false;
    gameState.startingHighScore = highScores[selectedLevel];

    // Reset run-only quest progress
    resetQuestProgressForRun();
    
    // 🛠️ NEW: Identify and track run-specific quests for this game instance
    runQuestTracker.isConsecutiveScoreQuestActive = dailyQuests.some(q => q.key === "consecutiveScore" && !q.done);
    runQuestTracker.didPassScoreThreshold = false; // Reset for new run
    runQuestTracker.didJump = false; // Reset for new run
    runQuestTracker.didUseAbility = false; // Reset for new run


    // Reset minimap history
    minimap.playerHistory = [];

    // --- NEW: Shooting Star Setup ---
    if (shootingStarInterval) clearInterval(shootingStarInterval);
    shootingStarInterval = setInterval(spawnShootingStar, 3000); // Spawn a shooting star every 3 seconds
    
    // --- ✅ FIXED: Collectible Star Spawn Interval (10 seconds) ---
    if (starSpawnInterval) clearInterval(starSpawnInterval);
    starSpawnInterval = setInterval(spawnCollectibleStar, 10000); // Spawn one every 10 seconds
    // --- END FIXED: Star Spawn Setup ---


    // --- MODIFICATION: Speeds adjusted to be even slower ---
    switch (selectedLevel) {
      case 1:
        gameConfig.playerSpeed = -0.08;
        gameConfig.spawnInterval = 25;
        gameConfig.minSpawnInterval = 15;
        scene.background = new THREE.Color(gameConfig.levelColors[1].bg);
        break;
      case 2:
        gameConfig.playerSpeed = -0.12;
        gameConfig.spawnInterval = 22;
        gameConfig.minSpawnInterval = 12;
        scene.background = new THREE.Color(gameConfig.levelColors[2].bg);
        break;
      case 3:
        gameConfig.playerSpeed = -0.16;
        gameConfig.spawnInterval = 18;
        gameConfig.minSpawnInterval = 10;
        scene.background = new THREE.Color(gameConfig.levelColors[3].bg);
        break;
    }

    lastSpawnZ = -20;
    obstacles = [];
    trailParticles = [];
    grounds = [];
    // --- NEW: Clean collectible stars on game start ---
    collectibleStars.forEach((s) => scene.remove(s));
    collectibleStars.length = 0;
    // --- END NEW: Clean collectible stars on game start ---

    // --- NEW TRAIL SETUP ---
    const charData = PLAYER_OBJECTS[selectedObjectId];

    // Use skin trail color if equipped
    if (equippedSkin) {
      const skinItem = SHOP_ITEMS.find((item) => item.id === equippedSkin);
      if (
        skinItem &&
        skinItem.basedOn === selectedObjectId &&
        skinItem.trailColor
      ) {
        trailColor = skinItem.trailColor;
      } else {
        trailColor = charData.trailColor;
      }
    } else {
      trailColor = charData.trailColor;
    }

    trailSize = charData.trailSize;

    // Create new materials if not already created
    if (!charData.trailMaterial) {
      charData.trailMaterial = new THREE.MeshBasicMaterial({
        color: trailColor,
        transparent: true,
        blending: THREE.AdditiveBlending, // Added blending for a glowing look
        opacity: 0.9,
      });
    }
    trailMaterial = charData.trailMaterial;
    trailGeometry = new THREE.SphereGeometry(trailSize, 6, 6); // Use character-specific size
    // --- END NEW TRAIL SETUP ---

    player = new Player({ characterId: selectedObjectId });

    // Apply equipped skin if any
    if (equippedSkin) {
      const skinItem = SHOP_ITEMS.find((item) => item.id === equippedSkin);
      if (
        skinItem &&
        skinItem.basedOn === selectedObjectId
        // Note: applySkinToPlayer only applies StandardMaterial colors, 
        // the HyperCube shader logic is handled inside createHyperCubeModel now.
      ) {
        if (selectedObjectId !== 'hypercube') {
          applySkinToPlayer(player, skinItem);
        }
      }
    }

    scene.add(player);

    // --- NEW: Add starfield to player's group, not scene directly ---
    player.add(galaxy);
    // --- END NEW ---

    // === 🛠️ MODIFIED GROUND CREATION TO USE TEXTURE ===
    const groundTexture = textureCache["spaceshipFloor"];
    if (groundTexture) {
      // Set repeat values for the texture
      // --- MODIFIED: DECREASED REPEAT VALUES FOR LARGER TEXTURE ---
      groundTexture.repeat.set(2, 10); // Repeat 2 times across width, 5 times across depth for a much larger look
      // ==========================================================
      groundTexture.needsUpdate = true;
    }
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: groundTexture ? 0xffffff : 0x1a1a2e, // Use white if using texture, otherwise fallback to old color
      map: groundTexture || null, // Apply the texture if it loaded
      emissive: 0x111111,
      emissiveIntensity: 0.1,
      metalness: 0.9,
      roughness: 0.8,
    });

    for (let i = 0; i < 2; i++) {
      const g = new Box({
        width: 10,
        height: 0.5,
        depth: 200,
        color: 0x1a1a2e,
        position: { x: 0, y: -2, z: -i * 200 },
        emissiveIntensity: 0,
      });
      g.material = groundMaterial.clone(); // Clone to allow individual material updates if needed, though mostly for depth
      g.receiveShadow = true;
      scene.add(g);
      grounds.push(g);
    }
    // =================================================

    for (let i = 0; i < 8; i++) spawnObstacle();

    document.getElementById("score").innerText = "Score: 0";
    document.getElementById("level").innerText = `Level: ${selectedLevel}`;
    document.getElementById(
      "highScore"
    ).innerText = `High Score: ${highScores[selectedLevel]}`;

    // --- NEW: Update star HUD on game start ---
    updateStarCounterHUD();
    // --- END NEW: Update star HUD on game start ---

    if (animationId) cancelAnimationFrame(animationId);
    animate();
  }

  function spawnObstacle() {
    let availableObstacles;
    
    // 🛠️ MODIFIED: Ensure UFO (index 4) and Quantum Gate (index 5) are included in Level 3 spawning.
    if (selectedLevel === 1) {
       availableObstacles = obstacleTypes.slice(0, 3);
    } else if (selectedLevel === 2) {
      availableObstacles = obstacleTypes.slice(0, 4); // Asteroid, Plasma, Satellite, EnergyField
    } else if (selectedLevel === 3) {
      // Level 3 should spawn up to QuantumGate (index 5)
      availableObstacles = obstacleTypes.slice(0, 6); 
    } else {
        // Default to spawning up to the internal level progression for max variety
        const sliceEnd = Math.min(
          gameState.internalLevel + 1,
          obstacleTypes.length
        );
        availableObstacles = obstacleTypes.slice(0, sliceEnd);
    }
    
    const oC =
      availableObstacles[Math.floor(Math.random() * availableObstacles.length)];
    
    // 🛠️ FIX: Ensure minSpawnInterval is respected
    const maxInterval = gameConfig.spawnInterval;
    const minInterval = gameConfig.minSpawnInterval;
    // Calculate a random interval between min and max
    const randomInterval = minInterval + Math.random() * (maxInterval - minInterval);

    const p = new THREE.Vector3((Math.random() - 0.5) * 3, 0, lastSpawnZ - randomInterval);
    const nO = new oC(p);
    obstacles.push(nO);
    lastSpawnZ = p.z; // Update lastSpawnZ to the new obstacle's Z position
  }

  // --- NEW: Collision Check for Stars ---
  function checkStarCollection() {
    if (!player) return;
    // Use the visual model for star collision, as it's the visible part
    const playerBox = new THREE.Box3().setFromObject(player.visualModel);

    for (let i = collectibleStars.length - 1; i >= 0; i--) {
      const star = collectibleStars[i];
      // Get world-space bounding box for the star
      const starBox = new THREE.Box3().setFromObject(star);
      
      if (playerBox.intersectsBox(starBox)) {
        // Star collected!

        playSound("collect");

        // Add star to localStorage
        const stars = parseInt(
          localStorage.getItem("spaceRunnerStars") || "0",
          10
        );
        localStorage.setItem("spaceRunnerStars", String(stars + 1));
        
        // --- NEW: Update star HUD immediately after collection ---
        updateStarCounterHUD();
        // --- END NEW: Update star HUD immediately after collection ---

        // Remove from list immediately
        collectibleStars.splice(i, 1);

        // Visual fade out
        const mat = star.children[0].material;
        let opacity = 1;
        const fade = setInterval(() => {
          opacity -= 0.05;
          mat.emissiveIntensity = opacity * 2;
          star.scale.multiplyScalar(0.97);
          
          if (opacity <= 0) {
            clearInterval(fade);
            scene.remove(star);
            star.children[0].geometry.dispose();
            mat.dispose();
          }
        }, 30);
      }
    }
  }
  // --- END NEW: Collision Check for Stars ---

  // --- MODIFICATION: Updated triggerGameOver with new button logic ---
  function triggerGameOver(r) {
    if (gameState.isGameOver) return;
    gameState.isGameOver = true;

    playSound("crash"); // Play crash SFX once only

    // --- NEW: Stop Shooting Star Spawner and Star Spawner ---
    if (shootingStarInterval) clearInterval(shootingStarInterval);
    if (starSpawnInterval) clearInterval(starSpawnInterval);
    // --- END NEW: Stop Shooting Star Spawner and Star Spawner ---

    // 🛠️ NEW: Update quest progress based on the final score
    updateQuestProgressOnGameOver(gameState.score);


    pauseButton.style.display = "none"; // NEW
    pauseScreen.style.display = "none"; // NEW
    isPaused = false; // NEW

    cancelAnimationFrame(animationId);
    document.getElementById("gameOverReason").textContent = r;

    const gOS = document.getElementById("gameOverScreen");
    const buttonContainer = document.getElementById("game-over-buttons");
    const unlockPromptContainer = document.getElementById("unlock-prompt");

    buttonContainer.innerHTML = "";
    unlockPromptContainer.innerHTML = "";
    unlockPromptContainer.style.display = "none";

    let unlockHTML = "";
    let hasUnlock = false;

    // Check for Level Unlock
    if (gameState.newlyUnlockedLevel) {
      unlockHTML += `<p class="unlock-congrats">🎊 Level ${gameState.newlyUnlockedLevel} Unlocked! 🎊</p>`;
      hasUnlock = true;
    }

    // Check for Character Unlock
    if (gameState.newlyUnlockedCharacterId) {
      const unlockedChar = PLAYER_OBJECTS[gameState.newlyUnlockedCharacterId];
      unlockHTML += `<p class="unlock-congrats">🎉 You've unlocked the <strong>${unlockedChar.name}</strong>! 🎉</p>`;
      hasUnlock = true;
    }

    // Now update the DOM with new button logic
    if (hasUnlock) {
      unlockPromptContainer.innerHTML = unlockHTML;
      let buttonAdded = false;

      // --- NEW: Combined Button Logic ---
      if (gameState.newlyUnlockedLevel && gameState.newlyUnlockedCharacterId) {
        const combinedBtn = document.createElement("button");
        combinedBtn.className = "play-combined-button";
        combinedBtn.textContent = `Play Level ${
          gameState.newlyUnlockedLevel
        } with ${PLAYER_OBJECTS[gameState.newlyUnlockedCharacterId].name}`;
        combinedBtn.onclick = () => {
          selectedLevel = gameState.newlyUnlockedLevel;
          selectedObjectId = gameState.newlyUnlockedCharacterId;
          resetGame();
        };
        unlockPromptContainer.appendChild(combinedBtn);
        buttonAdded = true;
      }

      // --- FALLBACK: If only a level is unlocked (future-proofing) ---
      if (gameState.newlyUnlockedLevel && !gameState.newlyUnlockedCharacterId) {
        const playNextBtn = document.createElement("button");
        playNextBtn.className = "play-next-button";
        playNextBtn.textContent = `▶️ Play Level ${gameState.newlyUnlockedLevel}`;
        playNextBtn.onclick = () => {
          selectedLevel = gameState.newlyUnlockedLevel;
          resetGame();
        };
        if (buttonAdded) playNextBtn.style.marginTop = "10px";
        unlockPromptContainer.appendChild(playNextBtn);
        buttonAdded = true;
      }

      // --- FALLBACK: If only a character is unlocked (future-proofing) ---
      if (gameState.newlyUnlockedCharacterId && !gameState.newlyUnlockedLevel) {
        const tryNewBtn = document.createElement("button");
        tryNewBtn.className = "try-new-button";
        tryNewBtn.textContent = `🚀 Try the ${
          PLAYER_OBJECTS[gameState.newlyUnlockedCharacterId].name
        }`;
        tryNewBtn.onclick = () => {
          selectedObjectId = gameState.newlyUnlockedCharacterId;
          resetGame();
        };
        if (buttonAdded) tryNewBtn.style.marginTop = "10px";
        unlockPromptContainer.appendChild(tryNewBtn);
      }

      unlockPromptContainer.style.display = "block";
    }

    // --- MODIFIED --- (Fix crash bug for shader material)
    player.visualModel.traverse((c) => {
      if (c.isMesh && c.material) {
        if (Array.isArray(c.material)) {
          c.material.forEach((mat) => {
            if (mat.isShaderMaterial) {
              mat.uniforms.color.value.set(0xd1201b);
            } else if (mat.color) {
              mat.color.set(0xd1201b);
            }
          });
        } else {
          if (c.material.isShaderMaterial) {
            // Handle shader material (the orb or hypercube)
            c.material.uniforms.color.value.set(0xd1201b); // Set the color uniform to red
          } else if (c.material.color) {
            // Handle standard materials (rocket, etc.)
            c.material.color.set(0xd1201b);
          }
        }
      }
    });
    // --- END MODIFIED ---

    const playAgainBtn = document.createElement("button");
    playAgainBtn.className = "restart-button";
    playAgainBtn.textContent = "Play Again";
    playAgainBtn.onclick = resetGame;

    const menuBtn = document.createElement("button");
    menuBtn.className = "menu-button";
    menuBtn.textContent = "Back to Menu";
    menuBtn.onclick = backToMenu;

    buttonContainer.appendChild(playAgainBtn);
    buttonContainer.appendChild(menuBtn);

    gOS.style.display = "block";
  }

  function cleanUpScene() {
    if (player) {
      // --- NEW: Remove starfield from player before removing player ---
      player.remove(galaxy);
      scene.remove(player);
    }
    // --- NEW: Add galaxy back to scene so it's not disposed with player,
    //          but just sitting there waiting to be re-parented ---
    scene.add(galaxy);
    // --- END NEW ---

    obstacles.forEach((o) => scene.remove(o.group));
    grounds.forEach((g) => scene.remove(g));
    trailParticles.forEach((p) => scene.remove(p));
    // --- NEW: Cleanup Shooting Stars and Collectible Stars ---
    shootingStars.forEach((s) => scene.remove(s));
    shootingStars = [];
    collectibleStars.forEach((s) => scene.remove(s));
    collectibleStars.length = 0; // Ensures the array is empty for a fresh start
    // --- END NEW: Cleanup Shooting Stars and Collectible Stars ---
    obstacles = [];
    grounds = [];
    trailParticles = [];
  }

  function resetGame() {
    document.getElementById("gameOverScreen").style.display = "none";
    cleanUpScene();
    setupNewGame();
  }

  // MODIFIED: backToMenu now shows the Level Selection Screen
  function backToMenu() {
    if (animationId) cancelAnimationFrame(animationId);

    // --- NEW: Stop Shooting Star Spawner and Star Spawner ---
    if (shootingStarInterval) clearInterval(shootingStarInterval);
    if (starSpawnInterval) clearInterval(starSpawnInterval);
    // --- END NEW: Stop Shooting Star Spawner and Star Spawner ---

    isPaused = false;
    pauseButton.style.display = "none";
    pauseScreen.style.display = "none";

    cleanUpScene();
    document.getElementById("gameOverScreen").style.display = "none";
    document.getElementById("gameScreen").classList.add("hidden"); // Use class list for consistency

    // Clear minimap
    if (minimapCtx) {
        minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    }
    minimap.playerHistory = [];

    // Show the primary menu screen
    showScreen("levelSelectionScreen");

    updateCharacterSelectorDisplay();
    updateLevelSelectorUI();
  }

  window.addEventListener("keydown", (e) => {
    switch (e.code) {
      case "KeyA":
      case "ArrowLeft": // 🛠️ ADDED ARROW KEY
        keys.a.pressed = true;
        break;
      case "KeyD":
      case "ArrowRight": // 🛠️ ADDED ARROW KEY
        keys.d.pressed = true;
        break;
      case "Space":
      case "ArrowUp": // 🛠️ ADDED ARROW KEY
        if (player && player.onGround) {
          playSound("jump");
          player.velocity.y = 0.12;
          updateQuestProgress("jump"); // Track jump for quests
          runQuestTracker.didJump = true; // 🛠️ NEW: Track jump for no ability quest
        }
        break;
      case "KeyR":
        if (gameState.isGameOver) resetGame();
        break;
      case "KeyP":
        togglePause(!isPaused);
        break;
    }
  });

  window.addEventListener("keyup", (e) => {
    switch (e.code) {
      case "KeyA":
      case "ArrowLeft": // 🛠️ ADDED ARROW KEY
        keys.a.pressed = false;
        break; // Added break to stop fallthrough
      case "KeyD":
      case "ArrowRight": // 🛠️ ADDED ARROW KEY
        keys.d.pressed = false;
        break; // Added break to stop fallthrough
    }
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyV") isFirstPerson = !isFirstPerson;
  });

  // --- SINGULARITY ABILITY ---
  window.addEventListener("keydown", (e) => {
    // 🛠️ MODIFIED: Added a cooldown check to prevent double-activation and only allow on Saturn
    if (
      e.code === "KeyQ" &&
      selectedObjectId === "planet" &&
      !gameState.singularityUsed &&
      !player.isActivatingAbility
    ) {
      player.isActivatingAbility = true; // Set flag to prevent rapid fire
      activateSingularity();
      runQuestTracker.didUseAbility = true; // 🛠️ NEW: Track ability use
      // Clear the flag after a short delay (e.g., 500ms)
      setTimeout(() => {
          if (player) player.isActivatingAbility = false;
      }, 500);
    }
  });
  let rippleEffect;
  function activateSingularity() {
    if (gameState.singularityUsed) return;
    
    // New array to track obstacles successfully pulled into orbit in this activation
    const obstaclesToOrbit = []; 
    
    // 1. First, check for obstacles in the expanded range
    obstacles.forEach((obstacle) => {
      // 🛠️ INCREASED RANGE FROM 8 TO 15
      const distance = player.position.distanceTo(obstacle.group.position);
      if (distance < 15) { 
        obstaclesToOrbit.push(obstacle);
      }
    });

    // 2. Only activate if we found at least one target
    if (obstaclesToOrbit.length === 0) {
        // 🛠️ Do NOT set gameState.singularityUsed = true if nothing was hit.
        // The ability is not consumed, allowing the player to try again.
        console.log("Singularity failed: No obstacles in range.");
        // We set didUseAbility flag *before* this check, so we must reset it if ability was not consumed.
        runQuestTracker.didUseAbility = false; 
        return; 
    }
    
    // --- ABILITY ACTIVATED ---
    gameState.singularityUsed = true; // Ability is now consumed
    
    const rippleGeometry = new THREE.SphereGeometry(1, 32, 32);
    const rippleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.5,
      wireframe: true,
    });
    rippleEffect = new THREE.Mesh(rippleGeometry, rippleMaterial);
    rippleEffect.position.copy(player.position);
    scene.add(rippleEffect);
    let rippleSize = 1;
    const animateRipple = () => {
      rippleSize += 0.1;
      rippleEffect.scale.set(rippleSize, rippleSize, rippleSize);
      rippleEffect.material.opacity -= 0.01;
      if (rippleEffect.material.opacity <= 0) {
        scene.remove(rippleEffect);
        rippleEffect.geometry.dispose();
        rippleEffect.material.dispose();
        rippleEffect = null;
      } else {
        requestAnimationFrame(animateRipple);
      }
    };
    animateRipple();
    
    // Move all obstacles found in range into the player's orbit
    obstaclesToOrbit.forEach((obstacle, index) => { // Use the filtered list
      player.orbitingObstacles.push(obstacle);
      // Adjusted: use player's object to set orbiting position, not obstacle's group
      obstacle.group.position.set(0, 2, 0); 
      player.add(obstacle.group);
      obstacle.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.emissive = new THREE.Color(0x00ffff);
          child.material.emissiveIntensity = 0.5;
        }
      });
    });
    
    setTimeout(() => {
      releaseOrbitingObstacles();
    }, 3000);
  }
  function releaseOrbitingObstacles() {
    player.orbitingObstacles.forEach((obstacle) => {
      player.remove(obstacle.group);
      scene.add(obstacle.group);
      obstacle.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.emissive = new THREE.Color(0x000000);
          child.material.emissiveIntensity = 0;
        }
      });
      const force = new THREE.Vector3(
        Math.random() - 0.5,
        0,
        Math.random() - 0.5
      )
        .normalize()
        .multiplyScalar(0.5);
      obstacle.group.velocity = force;
      const animateOutward = () => {
        obstacle.group.position.add(obstacle.group.velocity);
        obstacle.group.velocity.multiplyScalar(0.95);
        if (obstacle.group.velocity.length() > 0.01) {
          requestAnimationFrame(animateOutward);
        }
      };
      animateOutward();
    });
    player.orbitingObstacles = [];
  }

  // --- NEW PAUSE LOGIC ---
  function togglePause(pauseState) {
    if (gameState.isGameOver) return;
    isPaused = pauseState;
    pauseScreen.style.display = isPaused ? "block" : "none";

    if (!isPaused && !gameState.isGameOver) {
      pauseButton.style.display = "flex";
    } else {
      pauseButton.style.display = "none";
    }

    if (isPaused) {
      cancelAnimationFrame(animationId);
    } else {
      animate();
    }
  }

  pauseButton.addEventListener("click", () => togglePause(true));
  resumeButton.addEventListener("click", () => togglePause(false));

  restartPauseButton.addEventListener("click", () => {
    pauseScreen.style.display = "none";
    isPaused = false;
    resetGame();
  });

  menuPauseButton.addEventListener("click", () => {
    pauseScreen.style.display = "none";
    isPaused = false;
    backToMenu();
  });

  function animate() {
    if (isPaused) return;

    animationId = requestAnimationFrame(animate);
    player.update(grounds);

    const time = Date.now();
    if (player.visualModel) {
      // 🛠️ Always check for customAnimate now, as the HyperCube uses it
      if (player.visualModel.userData.customAnimate) {
        player.visualModel.userData.customAnimate(time);
      } else if (player.visualModel.userData.shaderMaterial) {
        // Fallback for non-HyperCube models that use shaders (e.g., Orb)
        player.visualModel.userData.shaderMaterial.uniforms.time.value += 0.05;
      }
    }
    
    // --- NEW: Update Collectible Stars ---
    collectibleStars.forEach((s) => s.userData.update && s.userData.update());
    checkStarCollection();
    // --- END NEW: Update Collectible Stars ---

    // --- NEW: Anchor the starfield to the player/camera ---
    if (galaxy && player) {
      // Keep the galaxy positioned far behind the player and slightly below to fill the background
      galaxy.position.set(0, 0, -300);
      // The player's group rotation causes the starfield to rotate as the player moves (galaxy is a child of player)
      galaxy.rotation.y += 0.0001;
    }
    // --- END NEW ---

    // --- NEW: Update Shooting Stars (Permanent Background Fix) ---
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const star = shootingStars[i];

      // Move the star (shooting diagonally towards the player/camera)
      star.position.z += star.userData.speed * 2;
      star.position.y -= star.userData.speed * 0.1;

      star.userData.lifetime++;

      // Fade and remove after maxLifetime
      if (star.userData.lifetime > star.userData.maxLifetime) {
        star.material.opacity *= 0.95;
      }

      // Remove if completely faded or too close to the player
      if (star.material.opacity < 0.05 || star.position.z > player.position.z) {
        scene.remove(star);
        shootingStars.splice(i, 1);
        star.geometry.dispose();
        star.material.dispose();
      }
    }
    // --- END NEW: Update Shooting Stars ---

    if (isFirstPerson) {
      const fpHeight = player.height * 1.4;
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(player.quaternion);
      camera.position.copy(player.position);
      camera.position.y += fpHeight;
      camera.lookAt(camera.position.clone().add(forward));
    } else {
      const cO = new THREE.Vector3(0, 2, 8);
      camera.position.copy(player.position).add(cO);
      camera.lookAt(player.position);
    }

    if (player.position.y < -10) triggerGameOver("You fell into deep space!");

    // 🛠️ FIX: Corrected and simplified continuous spawning logic. 
    // Spawn a new obstacle if the last spawned obstacle is closer to the player 
    // than a large viewing distance threshold (e.g., 80 units).
    const spawningViewDistance = -80; // Load new obstacles 80 units ahead
    
    if (lastSpawnZ > player.position.z + spawningViewDistance) {
        spawnObstacle();
    }


obstacles.forEach((o) => {
    o.update();
    
    // Skip collision check if game is over
    if (gameState.isGameOver) return;
    
    // For SatelliteWreckage, use a simple distance check that accounts for its movement
    if (o instanceof SatelliteWreckage) {
        // Only check collision if satellite is in front of player (moving toward player)
        if (o.group.position.z < player.position.z + 10) {
            const distance = o.group.position.distanceTo(player.position);
            // Use a reasonable collision distance that matches the satellite's size
            // 🛠️ NOTE: The Satellite is scaled to 0.6, so the collision distance is smaller in game units
            if (distance < 3) { 
                console.log("Satellite collision! Distance:", distance);
                triggerGameOver("You crashed into satellite wreckage!");
                return;
            }
        }
    } else {
        // For other obstacles, use the standard collision check
        let collisionDetected = false;
        o.colliders.forEach((c) => {
            if (boxCollision({ box1: player.colliderBox, box2: c })) {
                collisionDetected = true;
            }
        });
        if (collisionDetected) {
            triggerGameOver("You crashed into an obstacle!");
            return;
        }
    }
});
    grounds.forEach((g) => {
      if (camera.position.z < g.position.z - g.depth / 2)
        g.position.z -= grounds.length * g.depth;
    });

    if (!gameState.isGameOver) {
      gameState.score = Math.floor(-player.position.z);
      document.getElementById("score").innerText = `Score: ${gameState.score}`;
      
      // 🛠️ NEW: Update didPassScoreThreshold for the consecutive score quest
      dailyQuests.filter(q => q.key === "consecutiveScore" && !q.done).forEach(q => {
          if (gameState.score >= q.targetScore) {
              runQuestTracker.didPassScoreThreshold = true;
          }
      });


      if (gameState.score > highScores[selectedLevel]) {
        if (!gameState.highScoreNotified && gameState.startingHighScore > 0) {
          gameState.highScoreNotified = true;
          const lUE = document.getElementById("levelUp");
          lUE.innerText = `🌟 New High Score! 🌟`;
          lUE.classList.add("show");
          setTimeout(() => lUE.classList.remove("show"), 2500);
        }
        highScores[selectedLevel] = gameState.score;
        localStorage.setItem(
          "spaceRunnerHighScores",
          JSON.stringify(highScores)
        );
        document.getElementById(
          "highScore"
        ).innerText = `High Score: ${highScores[selectedLevel]}`;
      }

      // --- Level & Character Unlock Logic (Non-Stopping) ---
      // Check for Level 2 Unlock (from Level 1)
      if (
        selectedLevel === 1 &&
        !unlockedLevels[2] &&
        gameState.score >= LEVEL_UNLOCK_SCORES[1]
      ) {
        unlockedLevels[2] = true;
        localStorage.setItem(
          "spaceRunnerUnlockedLevels",
          JSON.stringify(unlockedLevels)
        );
        gameState.newlyUnlockedLevel = 2;

        const lUE = document.getElementById("levelUp");
        lUE.innerText = `Level 2 Unlocked!`;
        lUE.classList.add("show");
        setTimeout(() => lUE.classList.remove("show"), 3000);

        if (!PLAYER_OBJECTS["asteroid"].isUnlocked) {
          PLAYER_OBJECTS["asteroid"].isUnlocked = true;
          const unlocked = JSON.parse(
            localStorage.getItem("spaceRunnerUnlocks")
          ) || ["rocket"];
          if (!unlocked.includes("asteroid")) {
            unlocked.push("asteroid");
            localStorage.setItem(
              "spaceRunnerUnlocks",
              JSON.stringify(unlocked)
            );
          }
          gameState.newlyUnlockedCharacterId = "asteroid";

          const uN = document.getElementById("unlock-notification");
          uN.innerHTML = `New Vehicle Unlocked:<br/><strong>${PLAYER_OBJECTS["asteroid"].name}</strong>`;
          uN.classList.add("show");
          setTimeout(() => uN.classList.remove("show"), 3000);
        }
      }

      // Check for Level 3 Unlock (from Level 2)
      if (
        selectedLevel === 2 &&
        !unlockedLevels[3] &&
        gameState.score >= LEVEL_UNLOCK_SCORES[2]
      ) {
        unlockedLevels[3] = true;
        localStorage.setItem(
          "spaceRunnerUnlockedLevels",
          JSON.stringify(unlockedLevels)
        );
        gameState.newlyUnlockedLevel = 3;

        const lUE = document.getElementById("levelUp");
        lUE.innerText = `Level 3 Unlocked!`;
        lUE.classList.add("show");
        setTimeout(() => lUE.classList.remove("show"), 3000);

        if (!PLAYER_OBJECTS["planet"].isUnlocked) {
          PLAYER_OBJECTS["planet"].isUnlocked = true;
          const unlocked = JSON.parse(
            localStorage.getItem("spaceRunnerUnlocks")
          ) || ["rocket"];
          if (!unlocked.includes("planet")) {
            unlocked.push("planet");
            localStorage.setItem(
              "spaceRunnerUnlocks",
              JSON.stringify(unlocked)
            );
          }
          gameState.newlyUnlockedCharacterId = "planet";

          const uN = document.getElementById("unlock-notification");
          uN.innerHTML = `New Vehicle Unlocked:<br/><strong>${PLAYER_OBJECTS["planet"].name}</strong>`;
          uN.classList.add("show");
          setTimeout(() => uN.classList.remove("show"), 3000);
        }
      }

      // 🛠️ MODIFIED: Check for Orb Unlock (from Level 3, score 500)
      if (
        selectedLevel === 3 &&
        !PLAYER_OBJECTS["orb"].isUnlocked &&
        gameState.score >= 500
      ) {
        PLAYER_OBJECTS["orb"].isUnlocked = true;
        const unlocked = JSON.parse(
          localStorage.getItem("spaceRunnerUnlocks")
        ) || ["rocket"];
        if (!unlocked.includes("orb")) {
          unlocked.push("orb");
          localStorage.setItem("spaceRunnerUnlocks", JSON.stringify(unlocked));
        }
        gameState.newlyUnlockedCharacterId = "orb";

        const uN = document.getElementById("unlock-notification");
        uN.innerHTML = `New Vehicle Unlocked:<br/><strong>${PLAYER_OBJECTS["orb"].name}</strong>`;
        uN.classList.add("show");
        setTimeout(() => uN.classList.remove("show"), 3000);
      }

      // 🛠️ MODIFIED: Check for Hyper Cube Unlock (from Level 3, score 1000)
      if (
        selectedLevel === 3 &&
        !PLAYER_OBJECTS["hypercube"].isUnlocked &&
        gameState.score >= 1000
      ) {
        PLAYER_OBJECTS["hypercube"].isUnlocked = true;
        const unlocked = JSON.parse(
          localStorage.getItem("spaceRunnerUnlocks")
        ) || ["rocket"];
        if (!unlocked.includes("hypercube")) {
          unlocked.push("hypercube");
          localStorage.setItem("spaceRunnerUnlocks", JSON.stringify(unlocked));
        }
        gameState.newlyUnlockedCharacterId = "hypercube";

        const uN = document.getElementById("unlock-notification");
        uN.innerHTML = `New Vehicle Unlocked:<br/><strong>${PLAYER_OBJECTS["hypercube"].name}</strong>`;
        uN.classList.add("show");
        setTimeout(() => uN.classList.remove("show"), 3000);
      }

      // --- Level 3 Progression ---
      if (selectedLevel === 3) {
        const nIL = gameState.internalLevel + 1;
        if (
          INTERNAL_LEVEL_THRESHOLDS[nIL] &&
          gameState.score >= INTERNAL_LEVEL_THRESHOLDS[nIL]
        ) {
          gameState.internalLevel = nIL;
          document.getElementById("level").innerText = `Level: 3 (Stage ${
            nIL - 2
          })`;

          const lUE = document.getElementById("levelUp");
          lUE.innerText = `Stage ${nIL - 2}`;
          lUE.classList.add("show");
          setTimeout(() => lUE.classList.remove("show"), 2000);

          if (nIL === 4) {
            gameConfig.playerSpeed -= 0.01;
            gameConfig.spawnInterval = 16;
          } else if (nIL === 5) {
            gameConfig.playerSpeed -= 0.01;
            gameConfig.spawnInterval = 14;
          }
        }
      }
    }

    if (selectedLevel === 3 && gameState.internalLevel >= 3)
      gameConfig.playerSpeed -= 0.000001;

    player.velocity.x = 0;
    player.velocity.z = gameConfig.playerSpeed;
    if (keys.a.pressed) player.velocity.x = -0.05;
    else if (keys.d.pressed) player.velocity.x = 0.05;
    // galaxy rotation is handled in the new block above

    if (!gameState.isGameOver && trailParticles.length < 50) {
      const trailParticle = new THREE.Mesh(
        trailGeometry,
        trailMaterial.clone()
      );

      const randomColor = new THREE.Color(trailColor);
      randomColor.offsetHSL(
        0,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.2
      );
      trailParticle.material.color.set(randomColor);

      trailParticle.position.copy(player.position);
      if (selectedObjectId === "rocket") {
        trailParticle.position.z += player.depth / 2;
      }
      scene.add(trailParticle);
      trailParticles.push(trailParticle);
    }
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i];
      p.material.opacity *= 0.93;
      if (p.material.opacity < 0.01) {
        scene.remove(p);
        trailParticles.splice(i, 1);
      }
    }

    // Render minimap
    renderMinimap();
    renderer.render(scene, camera);
  }
}

// ---- QUESTS & SHOP UI SETUP ----
function setupQuestsAndShop() {
  document.getElementById("quests-btn").addEventListener("click", () => {
    document.getElementById("questsScreen").style.display = "flex";
    renderQuestScreen();
  });

  document.getElementById("close-quests-btn").addEventListener("click", () => {
    document.getElementById("questsScreen").style.display = "none";
  });

  document.getElementById("shop-btn").addEventListener("click", () => {
    document.getElementById("shopScreen").style.display = "flex";
    renderShopScreen();
  });

  document.getElementById("close-shop-btn").addEventListener("click", () => {
    document.getElementById("shopScreen").style.display = "none";
  });
}

function renderQuestScreen() {
  const quests = dailyQuests;
  const container = document.getElementById("quest-list-container");
  if (!container) return;

  let html = "";
  let completedAll = true;
  let unclaimedStars = 0;
  let hasUnclaimedQuests = false;

  quests.forEach((q) => {
    const questClass = q.done ? "quest-item completed" : "quest-item";
    const isClaimed = q.claimed !== false;
    
    // 🛠️ MODIFIED: Dynamic quest title replacement (FIXED TEMPLATE LOGIC)
    let title = q.name;
    if (q.key === "consecutiveScore") {
        // Use targetScore and targetStreak for the name template
        title = `Score over ${q.targetScore} points in ${q.targetStreak} consecutive runs`;
    } else {
        // Use standard target for other quests
        title = title.replace(/ X | Y | Z /g, ` ${q.target} `);
    }
    // ------------------------------------------

    html += `<div class="${questClass}">`;
    html += `<div class="quest-title">${title}</div>`; 
    html += `<div class="quest-progress">${q.progressText(q)}</div>`; 
    if (q.done) {
      if (isClaimed) {
        html += `<div class="quest-completed-badge">✓ CLAIMED (+${q.reward} ⭐)</div>`;
      } else {
        html += `<div class="quest-completed-badge" style="background: linear-gradient(45deg, #fbbf24, #f59e0b);">⭐ READY TO CLAIM (+${q.reward} ⭐)</div>`;
        unclaimedStars += q.reward;
        hasUnclaimedQuests = true;
      }
    }
    html += `</div>`;
    if (!q.done) completedAll = false;
  });

  if (completedAll && !localStorage.getItem("spaceRunnerQuestRewarded")) {
    unclaimedStars += 30;
  }

  if (
    hasUnclaimedQuests ||
    (completedAll && !localStorage.getItem("spaceRunnerQuestRewarded"))
  ) {
    html += `<div class="unclaimed-stars-info">💫 Unclaimed Rewards: ${unclaimedStars} Stars</div>`;
    html += `<button class="claim-rewards-btn" onclick="claimQuestRewards()">✨ CLAIM ${unclaimedStars} STARS ✨</button>`;
  } else if (completedAll && localStorage.getItem("spaceRunnerQuestRewarded")) {
    html += `<div class="quest-reward-info">✅ All daily quests completed! New quests available tomorrow.</div>`;
  } else {
    html += `<div class="quest-reward-info">Complete quests to earn stars!</div>`;
  }

  container.innerHTML = html;
}

window.claimQuestRewards = function () {
  let totalStars = 0;

  dailyQuests.forEach((q) => {
    if (q.done && q.claimed === false) {
      totalStars += q.reward;
      q.claimed = true;
    }
  });

  const allDone = dailyQuests.every((q) => q.done);
  if (allDone && !localStorage.getItem("spaceRunnerQuestRewarded")) {
    totalStars += 30;
    localStorage.setItem("spaceRunnerQuestRewarded", "yes");
  }

  const currentStars = parseInt(
    localStorage.getItem("spaceRunnerStars") || "0",
    10
  );
  localStorage.setItem("spaceRunnerStars", String(currentStars + totalStars));

  saveDailyQuests(dailyQuests);
  renderQuestScreen();
  playSound("click");

  console.log(
    `Claimed ${totalStars} stars. New total: ${currentStars + totalStars}`
  );
};

function renderShopScreen() {
  const stars = parseInt(localStorage.getItem("spaceRunnerStars") || "0", 10);
  document.getElementById("stars-count").textContent = stars;

  const equippedInfoDiv = document.getElementById("equipped-info");
  if (equippedInfoDiv) {
    if (equippedSkin) {
      const equippedItem = SHOP_ITEMS.find((item) => item.id === equippedSkin);
      if (equippedItem) {
        equippedInfoDiv.innerHTML = `
                    <div style="background: rgba(34, 197, 94, 0.1); border: 2px solid var(--neon-blue); padding: 12px; border-radius: 10px;">
                        <div style="color: var(--neon-blue); font-weight: bold; margin-bottom: 8px;">Currently Equipped: ${equippedItem.icon} ${equippedItem.name}</div>
                        <button class="shop-buy-btn" style="background: linear-gradient(45deg, var(--neon-purple), var(--neon-pink)); color: white; font-size: 0.9rem; padding: 8px 20px;" onclick="unequipSkin()">REMOVE SKIN</button>
                    </div>
                `;
      }
    } else {
      equippedInfoDiv.innerHTML =
        '<div style="color: #9ca3af; font-size: 0.95rem;">No skin equipped (using default appearance)</div>';
    }
  }

  const container = document.getElementById("shop-items-container");
  if (!container) return;

  let html = "";

  SHOP_ITEMS.forEach((item) => {
    const owned = shopPurchases.includes(item.id);
    const isEquipped = equippedSkin === item.id;
    const itemClass = owned ? "shop-item owned" : "shop-item";

    html += `<div class="${itemClass}">`;
    html += `<div class="shop-item-icon">${item.icon}</div>`;
    html += `<div class="shop-item-name">${item.name}</div>`;
    html += `<div class="shop-item-description">${item.description}</div>`;
    html += `<div class="shop-item-price">⭐ ${item.price}</div>`;

    if (owned) {
      if (isEquipped) {
        html += `<div class="shop-owned-badge" style="background: linear-gradient(45deg, var(--neon-blue), #0ea5e9);">✓ EQUIPPED</div>`;
      } else {
        html += `<button class="shop-buy-btn" style="background: linear-gradient(45deg, #3b82f6, #60a5fa);" onclick="equipShopItem('${item.id}')">EQUIP</button>`;
      }
    } else {
      const canAfford = stars >= item.price;
      const btnDisabled = canAfford ? "" : "disabled";
      html += `<button class="shop-buy-btn" ${btnDisabled} onclick="buyShopItem('${item.id}')">BUY</button>`;
    }

    html += `</div>`;
  });

  if (SHOP_ITEMS.length === 0) {
    html =
      '<p style="color: #e5e7eb;">No items available yet. Check back soon!</p>';
  }

  container.innerHTML = html;
}

window.buyShopItem = function (itemId) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return;

  const stars = parseInt(localStorage.getItem("spaceRunnerStars") || "0", 10);

  if (stars < item.price) {
    // MODIFIED: Use custom modal instead of alert
    showPurchaseNotification(
      "INSUFFICIENT FUNDS",
      `You need ${item.price - stars} more stars to purchase the ${item.name}.`,
      "❌"
    );
    return;
  }

  if (shopPurchases.includes(itemId)) {
    // MODIFIED: Use custom modal instead of alert
    showPurchaseNotification(
      "ALREADY OWNED",
      `You already own the ${item.name}! Check your equipped skin.`,
      "✅"
    );
    return;
  }

  localStorage.setItem("spaceRunnerStars", String(stars - item.price));
  shopPurchases.push(itemId);
  saveShopPurchases(shopPurchases);
  renderShopScreen();
  playSound("click");
  
  // MODIFIED: Use custom modal instead of alert
  showPurchaseNotification(
    "PURCHASE SUCCESSFUL!",
    `You can now equip the ${item.name}!`,
    item.icon
  );
};

window.equipShopItem = function (itemId) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!item) return;

  if (!shopPurchases.includes(itemId)) {
    showPurchaseNotification(
        "EQUIP FAILED",
        "You must purchase this item first!",
        "🛑"
    );
    return;
  }

  equippedSkin = itemId;
  setEquippedSkin(itemId);
  renderShopScreen();
  playSound("click");
  console.log(`Equipped: ${item.name}`);
  
  // 🛠️ FIX: Update the character preview when a skin is equipped
  if (typeof updateCharacterSelectorDisplay === 'function') {
      updateCharacterSelectorDisplay();
  }
};

window.unequipSkin = function () {
  equippedSkin = null;
  setEquippedSkin(null);
  renderShopScreen();
  playSound("click");
  console.log("Skin removed - using default appearance");

  // 🛠️ FIX: Update the character preview when a skin is unequipped
  if (typeof updateCharacterSelectorDisplay === 'function') {
      updateCharacterSelectorDisplay();
  }
};

// ---- QUEST PROGRESS UPDATE HOOKS (MODIFIED) ----
function updateQuestProgress(type, value) {
  let newlyCompleted = false;
  dailyQuests.forEach((q) => {
    if (q.key === type && !q.done) {
      const wasDone = q.done;
      if (type === "jump") {
        q.jumps = (q.jumps || 0) + 1;
      } else if (type === "score") {
        q.score = Math.max(q.score || 0, value);
      }
      
      // Check completion status for run-only quests now
      if (q.runOnly && q.checker(q)) {
        q.done = true;
      }

      if (!wasDone && q.done) {
        newlyCompleted = true;
        q.claimed = false;
        console.log(
          `Quest completed! Claim your ${q.reward} stars in the Quests menu!`
        );
        showQuestCompleteNotification();
      }
    }
  });

  if (newlyCompleted) {
    const allDone = dailyQuests.every((q) => q.done);
    if (allDone && !localStorage.getItem("spaceRunnerQuestRewarded")) {
      console.log("All quests completed! Claim your +30 bonus stars!");
    }
  }

  saveDailyQuests(dailyQuests);
}

// 🛠️ NEW: Function to handle quest updates after the run ends
function updateQuestProgressOnGameOver(finalScore) {
    let newlyCompleted = false;
    dailyQuests.forEach(q => {
        if (!q.done) {
            const wasDone = q.done;

            if (q.key === "score") {
                // Update simple score quest (Max score in one run)
                q.score = Math.max(q.score || 0, finalScore);
                if (q.checker(q)) q.done = true;
            } else if (q.key === "consecutiveScore") {
                // Update consecutive score quest
                const passed = finalScore >= q.targetScore;

                if (passed) {
                    q.currentStreak = (q.currentStreak || 0) + 1;
                    q.lastRunPassed = true;
                } else {
                    // Fail: reset streak to 0 but keep lastRunPassed false
                    q.currentStreak = 0;
                    q.lastRunPassed = false;
                }
                
                if (q.checker(q)) q.done = true;
            }
            
            if (!wasDone && q.done) {
                newlyCompleted = true;
                q.claimed = false;
                console.log(`Quest completed! Claim your ${q.reward} stars!`);
                showQuestCompleteNotification();
            }
        }
    });

    if (newlyCompleted) {
        const allDone = dailyQuests.every(q => q.done);
        if (allDone && !localStorage.getItem("spaceRunnerQuestRewarded")) {
            console.log("All quests completed! Claim your +30 bonus stars!");
        }
    }
    saveDailyQuests(dailyQuests);
}


function showQuestCompleteNotification() {
  const notification = document.getElementById("quest-complete-notification");
  if (!notification) return;

  notification.classList.remove("shooting");
  void notification.offsetWidth;
  notification.classList.add("shooting");

  setTimeout(() => {
    notification.classList.remove("shooting");
  }, 2000);
}

function resetQuestProgressForRun() {
  dailyQuests.forEach((q) => {
    if (q.runOnly && !q.done) {
      q.jumps = 0;
      q.score = 0;
    }
    // 🛠️ NEW: Handle streak decay for consecutiveScore quests
    if (q.key === "consecutiveScore" && !q.done) {
        // If the player started a new run without clearing the previous one, the streak resets
        if (q.currentStreak > 0 && !q.lastRunPassed) {
             q.currentStreak = 0;
        }
        // Always reset this flag for the current run. It's updated on Game Over.
        q.lastRunPassed = false; 
    }
  });
  saveDailyQuests(dailyQuests);
}