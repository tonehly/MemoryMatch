/**
 * Memory Match — Game Logic
 * Pure vanilla JS, no dependencies.
 * Capacitor-friendly: all camera access is through getUserMedia
 * with graceful fallback; localStorage used for card config.
 */
(function () {
  'use strict';

  /* =====================================================
     Constants & State
     ===================================================== */
  const CARD_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
  const COLOR_VALUES = {
    red:    'var(--color-red)',
    orange: 'var(--color-orange)',
    yellow: 'var(--color-yellow)',
    green:  'var(--color-green)',
    blue:   'var(--color-blue)',
    purple: 'var(--color-purple)',
  };
  const STARTING_PAIRS   = 3;   // 6 cards = 3 pairs at level 1
  const PAIRS_PER_LEVEL  = 1;   // +2 cards per level = +1 pair
  const LIVES_PER_LEVEL  = 3;
  const FLIP_BACK_DELAY  = 900; // ms before wrong pair flips back
  const NEXT_LEVEL_DELAY = 600; // ms before showing level-complete overlay

  // Card configuration: photo data URLs, keyed by color index 0-5
  const cardPhotos = new Array(6).fill(null);

  let currentLevel    = 1;
  let lives           = LIVES_PER_LEVEL;
  let timerSeconds    = 0;
  let timerInterval   = null;
  let flippedCards    = [];   // max 2 at once
  let lockBoard       = false;
  let matchedPairs    = 0;
  let totalPairs      = 0;

  /* =====================================================
     DOM References
     ===================================================== */
  const screenTitle    = document.getElementById('screen-title');
  const screenGame     = document.getElementById('screen-game');
  const screenGameover = document.getElementById('screen-gameover');
  const photoDialog    = document.getElementById('photo-dialog');

  const btnStart       = document.getElementById('btn-start');
  const btnPlayAgain   = document.getElementById('btn-play-again');
  const btnContinue    = document.getElementById('btn-continue');
  const btnNextLevel   = document.getElementById('btn-next-level');

  const cameraVideo    = document.getElementById('camera-video');
  const cameraCanvas   = document.getElementById('camera-canvas');
  const photoPreview   = document.getElementById('photo-preview');
  const cameraPlaceholder = document.getElementById('camera-placeholder');
  const btnTakePhoto   = document.getElementById('btn-take-photo');
  const btnUpdate      = document.getElementById('btn-update');
  const btnCancel      = document.getElementById('btn-cancel');
  const actionssTake   = document.getElementById('modal-actions-take');
  const actionsConfirm = document.getElementById('modal-actions-confirm');

  const hudLevelNum    = document.getElementById('hud-level-num');
  const hudTime        = document.getElementById('hud-time');
  const hudLives       = document.getElementById('hud-lives');
  const gameBoard      = document.getElementById('game-board');
  const overlayLevelup   = document.getElementById('overlay-levelup');
  const levelupMsg       = document.getElementById('levelup-msg');
  const levelupTime      = document.getElementById('levelup-time');
  const overlayCountdown = document.getElementById('overlay-countdown');
  const countdownNum     = document.getElementById('countdown-num');
  const gameoverTitle  = document.getElementById('gameover-title');
  const gameoverSub    = document.getElementById('gameover-sub');

  let activeConfigIndex = -1;  // which card slot is being configured
  let cameraStream      = null;
  let capturedDataUrl   = null; // temp hold before user clicks Update

  /* =====================================================
     Screen Transitions
     ===================================================== */
  function showScreen(screen) {
    [screenTitle, screenGame, screenGameover].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  /* =====================================================
     Title Screen — Config Cards
     ===================================================== */
  function refreshConfigCards() {
    document.querySelectorAll('.config-card').forEach((card, i) => {
      const front = card.querySelector('.config-card-front');
      // Remove old img if any
      const oldImg = front.querySelector('img');
      if (oldImg) oldImg.remove();

      if (cardPhotos[i]) {
        const img = document.createElement('img');
        img.src = cardPhotos[i];
        front.appendChild(img);
        card.classList.add('has-photo');
      } else {
        card.classList.remove('has-photo');
      }
    });
  }

  document.querySelectorAll('.config-card').forEach((card) => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.colorIndex, 10);
      openPhotoDialog(idx);
    });
  });

  /* =====================================================
     Photo Dialog
     ===================================================== */
  function openPhotoDialog(colorIndex) {
    activeConfigIndex = colorIndex;
    capturedDataUrl   = null;

    // Reset UI to "take photo" state
    photoPreview.style.display     = 'none';
    cameraVideo.style.display      = 'block';
    actionssTake.classList.remove('hidden');
    actionsConfirm.classList.add('hidden');
    cameraPlaceholder.style.display = 'flex';

    photoDialog.classList.remove('hidden');
    startCamera();
  }

  function closePhotoDialog() {
    stopCamera();
    photoDialog.classList.add('hidden');
    activeConfigIndex = -1;
    capturedDataUrl   = null;
  }

  async function startCamera() {
    stopCamera();
    cameraPlaceholder.style.display = 'flex';
    cameraVideo.style.display       = 'block';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      cameraVideo.onloadedmetadata = () => {
        cameraPlaceholder.style.display = 'none';
      };
    } catch (err) {
      console.warn('Camera not available:', err);
      cameraPlaceholder.innerHTML = '<span>📷</span><p>Camera not available.<br>Check permissions.</p>';
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
  }

  btnTakePhoto.addEventListener('click', () => {
    if (!cameraStream) return;

    const video = cameraVideo;
    const size  = Math.min(video.videoWidth, video.videoHeight);
    const offX  = (video.videoWidth  - size) / 2;
    const offY  = (video.videoHeight - size) / 2;


    cameraCanvas.width  = size;
    cameraCanvas.height = size;
    const ctx = cameraCanvas.getContext('2d');
    // Mirror horizontally so the photo matches the live preview
    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, offX, offY, size, size, 0, 0, size, size);
    ctx.restore();

    capturedDataUrl = cameraCanvas.toDataURL('image/jpeg', 0.85);

    photoPreview.src           = capturedDataUrl;
    photoPreview.style.display = 'block';
    cameraVideo.style.display  = 'none';
    cameraPlaceholder.style.display = 'none';

    actionssTake.classList.add('hidden');
    actionsConfirm.classList.remove('hidden');
  });

  btnUpdate.addEventListener('click', () => {
    if (capturedDataUrl !== null && activeConfigIndex >= 0) {
      cardPhotos[activeConfigIndex] = capturedDataUrl;
      refreshConfigCards();
    }
    closePhotoDialog();
  });

  btnCancel.addEventListener('click', () => {
    closePhotoDialog();
  });

  // Close modal if overlay background clicked
  photoDialog.addEventListener('click', (e) => {
    if (e.target === photoDialog) closePhotoDialog();
  });

  /* =====================================================
     Game Start / Level Init
     ===================================================== */
  btnStart.addEventListener('click', () => {
    currentLevel = 1;
    showScreen(screenGame);
    startLevel(currentLevel);
  });

  btnPlayAgain.addEventListener('click', () => {
    showScreen(screenTitle);
    refreshConfigCards();
  });

  btnContinue.addEventListener('click', () => {
    lives = LIVES_PER_LEVEL;
    renderLives();
    showScreen(screenGame);
    startTimer();
  });

  btnNextLevel.addEventListener('click', () => {
    overlayLevelup.classList.add('hidden');
    currentLevel++;
    startLevel(currentLevel);
  });

  function startLevel(level) {
    stopTimer();
    flippedCards  = [];
    lockBoard     = true;   // locked during reveal phase
    matchedPairs  = 0;
    lives         = LIVES_PER_LEVEL;

    totalPairs = STARTING_PAIRS + (level - 1) * PAIRS_PER_LEVEL;
    const totalCards = totalPairs * 2;

    hudLevelNum.textContent = level;
    timerSeconds = 0;
    updateTimerDisplay();
    renderLives();
    buildBoard(totalCards);

    // Wait for layout (fitBoard rAF) to settle, then reveal cards
    setTimeout(() => {
      startRevealPhase(level, () => {
        lockBoard = false;
        startTimer();
      });
    }, 120);
  }

  function startRevealPhase(level, callback) {
    const revealSeconds = level >= 10 ? 5 : 3;

    gameBoard.querySelectorAll('.game-card').forEach(c => c.classList.add('flipped'));
    overlayCountdown.classList.remove('hidden');

    let remaining = revealSeconds;

    function tick() {
      if (remaining === 0) {
        overlayCountdown.classList.add('hidden');
        gameBoard.querySelectorAll('.game-card').forEach(c => c.classList.remove('flipped'));
        callback();
        return;
      }
      countdownNum.textContent = remaining;
      // Re-trigger animation each second
      countdownNum.style.animation = 'none';
      void countdownNum.offsetWidth;
      countdownNum.style.animation = 'countPulse 1s ease forwards';
      remaining--;
      setTimeout(tick, 1000);
    }

    tick();
  }

  /* =====================================================
     Board Builder
     ===================================================== */
  function buildBoard(totalCards) {
    gameBoard.innerHTML = '';

    // Determine which colors to use — cycle through 6
    const pairCount  = totalCards / 2;
    const colorPool  = [];
    for (let i = 0; i < pairCount; i++) {
      colorPool.push(i % CARD_COLORS.length);
    }

    // Create pairs array and shuffle
    const cardData = [];
    colorPool.forEach(colorIdx => {
      cardData.push({ colorIdx });
      cardData.push({ colorIdx });
    });
    shuffle(cardData);

    // Grid columns: aim for roughly square grid
    const cols = bestCols(totalCards);
    gameBoard.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    // Max card size based on available area — computed after layout
    cardData.forEach((data, i) => {
      const card = createCardElement(data.colorIdx, i);
      gameBoard.appendChild(card);
    });

    // Ensure board fits within the board-wrap
    requestAnimationFrame(() => fitBoard());
  }

  function bestCols(n) {
    // Prefer layouts that result in a near-square grid
    const isLandscape = window.innerWidth > window.innerHeight;
    if (n <= 6)  return isLandscape ? 3 : 3;
    if (n <= 8)  return isLandscape ? 4 : 4;
    if (n <= 10) return isLandscape ? 5 : 5;
    if (n <= 12) return isLandscape ? 6 : 4;
    if (n <= 16) return isLandscape ? 8 : 4;
    return isLandscape ? 6 : 5;
  }

  function fitBoard() {
    const wrap = document.querySelector('.game-board-wrap');
    if (!wrap) return;
    const totalCards = gameBoard.children.length;
    if (totalCards === 0) return;

    const wrapStyle = getComputedStyle(wrap);
    const hudEl     = document.querySelector('.game-hud');
    const hudH      = hudEl ? hudEl.getBoundingClientRect().height : 0;
    const availW    = window.innerWidth  - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight);
    const availH    = window.innerHeight - hudH - parseFloat(wrapStyle.paddingTop) - parseFloat(wrapStyle.paddingBottom);
    const gapPx     = parseFloat(getComputedStyle(gameBoard).gap) || 12;

    // Try every possible column count; keep the one that yields the largest card that still fits
    let bestSize = 0;
    let bestCols = 1;
    for (let c = 1; c <= totalCards; c++) {
      const r     = Math.ceil(totalCards / c);
      const cardW = (availW - gapPx * (c - 1)) / c;
      const cardH = (availH - gapPx * (r - 1)) / r;
      const size  = Math.min(cardW, cardH);
      if (size > bestSize) { bestSize = size; bestCols = c; }
    }

    const cardSize = Math.floor(bestSize);
    gameBoard.style.gridTemplateColumns = `repeat(${bestCols}, 1fr)`;
    gameBoard.style.width = `${cardSize * bestCols + gapPx * (bestCols - 1)}px`;
    gameBoard.querySelectorAll('.game-card').forEach(c => {
      c.style.width  = `${cardSize}px`;
      c.style.height = `${cardSize}px`;
    });
  }

  window.addEventListener('resize', () => { if (screenGame.classList.contains('active')) fitBoard(); });
  window.addEventListener('orientationchange', () => setTimeout(fitBoard, 200));

  /* =====================================================
     Card Element Factory
     ===================================================== */
  function createCardElement(colorIdx, cardIndex) {
    const div = document.createElement('div');
    div.className = 'game-card';
    div.dataset.colorIndex = colorIdx;
    div.dataset.cardIndex  = cardIndex;

    const inner = document.createElement('div');
    inner.className = 'game-card-inner';

    // Back face
    const back = document.createElement('div');
    back.className = 'game-card-back';
    const pattern = document.createElement('div');
    pattern.className = 'card-back-pattern';
    const q = document.createElement('div');
    q.className = 'card-back-q';
    q.textContent = '?';
    back.appendChild(pattern);
    back.appendChild(q);

    // Front face
    const front = document.createElement('div');
    front.className = 'game-card-front-face';
    front.style.background = COLOR_VALUES[CARD_COLORS[colorIdx]];

    if (cardPhotos[colorIdx]) {
      const img = document.createElement('img');
      img.src = cardPhotos[colorIdx];
      img.alt = CARD_COLORS[colorIdx];
      front.appendChild(img);
    }

    inner.appendChild(back);
    inner.appendChild(front);
    div.appendChild(inner);

    div.addEventListener('click', () => onCardClick(div));
    return div;
  }

  /* =====================================================
     Card Click Logic
     ===================================================== */
  function onCardClick(card) {
    if (lockBoard) return;
    if (card.classList.contains('flipped')) return;
    if (card.classList.contains('matched')) return;

    card.classList.add('flipped');
    flippedCards.push(card);

    if (flippedCards.length === 2) {
      lockBoard = true;
      checkMatch();
    }
  }

  function checkMatch() {
    const [a, b] = flippedCards;
    const match  = a.dataset.colorIndex === b.dataset.colorIndex;

    if (match) {
      // Mark matched after flip animation settles
      setTimeout(() => {
        a.classList.remove('flipped');
        b.classList.remove('flipped');
        a.classList.add('matched');
        b.classList.add('matched');
        spawnParticles(a);
        spawnParticles(b);
        flippedCards = [];
        lockBoard    = false;
        matchedPairs++;
        if (matchedPairs === totalPairs) onLevelComplete();
      }, 400);
    } else {
      // Wrong — shake and flip back
      a.classList.add('wrong');
      b.classList.add('wrong');
      loseLife();
      setTimeout(() => {
        a.classList.remove('flipped', 'wrong');
        b.classList.remove('flipped', 'wrong');
        flippedCards = [];
        lockBoard    = false;
      }, FLIP_BACK_DELAY);
    }
  }

  /* =====================================================
     Lives
     ===================================================== */
  function renderLives() {
    hudLives.innerHTML = '';
    for (let i = 0; i < LIVES_PER_LEVEL; i++) {
      const span = document.createElement('span');
      span.className = 'heart' + (i >= lives ? ' lost' : '');
      span.textContent = '❤️';
      hudLives.appendChild(span);
    }
  }

  function loseLife() {
    lives--;
    renderLives();
    if (lives <= 0) {
      setTimeout(onGameOver, FLIP_BACK_DELAY + 100);
    }
  }

  /* =====================================================
     Timer
     ===================================================== */
  function startTimer() {
    timerInterval = setInterval(() => {
      timerSeconds++;
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function updateTimerDisplay() {
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const s = String(timerSeconds % 60).padStart(2, '0');
    hudTime.textContent = `${m}:${s}`;
  }

  /* =====================================================
     Level Complete / Game Over
     ===================================================== */
  function onLevelComplete() {
    stopTimer();
    setTimeout(() => {
      const starsDiv = overlayLevelup.querySelector('.stars');
      starsDiv.textContent = '⭐'.repeat(Math.max(1, lives));
      levelupMsg.textContent = `Get ready for Level ${currentLevel + 1}!`;
      const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
      const s = String(timerSeconds % 60).padStart(2, '0');
      levelupTime.textContent = `Time: ${m}:${s}`;
      overlayLevelup.classList.remove('hidden');
    }, NEXT_LEVEL_DELAY);
  }

  function onGameOver() {
    stopTimer();
    gameoverTitle.textContent = 'Game Over!';
    gameoverSub.textContent   = `You reached Level ${currentLevel}`;
    showScreen(screenGameover);
  }

  /* =====================================================
     Particles
     ===================================================== */
  const PARTICLE_EMOJIS = ['⭐', '✨', '🌟', '💫'];

  function spawnParticles(card) {
    const rect   = card.getBoundingClientRect();
    const cx     = rect.left + rect.width  / 2;
    const cy     = rect.top  + rect.height / 2;
    const count  = 6;

    for (let i = 0; i < count; i++) {
      const el    = document.createElement('div');
      el.className = 'particle';
      el.textContent = PARTICLE_EMOJIS[Math.floor(Math.random() * PARTICLE_EMOJIS.length)];

      const angle = (360 / count) * i + Math.random() * 30;
      const dist  = 60 + Math.random() * 60;
      const rad   = (angle * Math.PI) / 180;
      el.style.setProperty('--dx', `${Math.cos(rad) * dist}px`);
      el.style.setProperty('--dy', `${Math.sin(rad) * dist}px`);
      el.style.left = `${cx}px`;
      el.style.top  = `${cy}px`;

      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }
  }

  /* =====================================================
     Utilities
     ===================================================== */
  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /* =====================================================
     Fullscreen Toggle
     ===================================================== */
  const btnFullscreen  = document.getElementById('btn-fullscreen');
  const iconExpand     = btnFullscreen.querySelector('.icon-expand');
  const iconCompress   = btnFullscreen.querySelector('.icon-compress');

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function updateFullscreenIcon() {
    const fs = isFullscreen();
    iconExpand.style.display   = fs ? 'none'  : 'block';
    iconCompress.style.display = fs ? 'block' : 'none';
  }

  btnFullscreen.addEventListener('click', () => {
    if (isFullscreen()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', updateFullscreenIcon);
  document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);

  /* =====================================================
     Init
     ===================================================== */
  refreshConfigCards();
  showScreen(screenTitle);

})();
