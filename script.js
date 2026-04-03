document.addEventListener('DOMContentLoaded', () => {
    const titleScreen = document.getElementById('title-screen');
    const gameScreen = document.getElementById('game-screen');
    const photoCards = document.querySelectorAll('.photo-card');
    const startGameBtn = document.getElementById('start-game');
    const gameBoard = document.getElementById('game-board');
    const levelSpan = document.getElementById('level');
    const movesSpan = document.getElementById('moves');
    const messageDiv = document.getElementById('message');

    let photos = Array(6).fill(null); // Store data URLs for photos
    let currentLevel = 1;
    let moves = 0;
    let flippedCards = [];
    let matchedPairs = 0;
    let cards = [];

    // Default colors
    const defaultColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];

    // Initialize photo cards
    photoCards.forEach((card, index) => {
        card.addEventListener('click', () => takePhoto(index));
    });

    startGameBtn.addEventListener('click', startGame);

    function takePhoto(index) {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true })
                .then(stream => {
                    const video = document.createElement('video');
                    video.srcObject = stream;
                    video.play();

                    const canvas = document.createElement('canvas');
                    canvas.width = 80;
                    canvas.height = 80;
                    const ctx = canvas.getContext('2d');

                    setTimeout(() => {
                        ctx.drawImage(video, 0, 0, 80, 80);
                        const dataURL = canvas.toDataURL('image/png');
                        photos[index] = dataURL;
                        photoCards[index].innerHTML = `<img src="${dataURL}" alt="Photo ${index + 1}">`;
                        photoCards[index].classList.add('has-photo');
                        stream.getTracks().forEach(track => track.stop());
                    }, 1000); // Wait 1 second for camera to start
                })
                .catch(err => {
                    console.error('Error accessing camera:', err);
                    alert('Camera access denied or not available.');
                });
        } else {
            alert('Camera not supported on this device.');
        }
    }

    function startGame() {
        titleScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        initializeLevel();
    }

    function initializeLevel() {
        moves = 0;
        matchedPairs = 0;
        flippedCards = [];
        levelSpan.textContent = `Level ${currentLevel}`;
        movesSpan.textContent = `Moves: ${moves}`;
        messageDiv.textContent = '';

        const numPairs = 3 + (currentLevel - 1); // Level 1: 3 pairs, Level 2: 4, etc.
        const numCards = numPairs * 2;

        // Determine grid columns
        let gridClass = 'grid-3';
        if (numCards === 8) gridClass = 'grid-4';
        else if (numCards === 10) gridClass = 'grid-5';
        else if (numCards === 12) gridClass = 'grid-6';

        gameBoard.className = gridClass;

        // Create card data
        cards = [];
        for (let i = 0; i < numPairs; i++) {
            const value = i % 6; // Cycle through 6 options
            cards.push({ value, isPhoto: photos[value] !== null });
            cards.push({ value, isPhoto: photos[value] !== null });
        }

        // Shuffle cards
        shuffle(cards);

        // Render cards
        gameBoard.innerHTML = '';
        cards.forEach((cardData, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.index = index;

            const front = document.createElement('div');
            front.className = 'front';

            const back = document.createElement('div');
            back.className = 'back';
            if (cardData.isPhoto) {
                back.innerHTML = `<img src="${photos[cardData.value]}" alt="Card">`;
            } else {
                back.style.backgroundColor = defaultColors[cardData.value];
            }

            card.appendChild(front);
            card.appendChild(back);
            card.addEventListener('click', () => flipCard(card, index));
            gameBoard.appendChild(card);
        });
    }

    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function flipCard(card, index) {
        if (flippedCards.length >= 2 || card.classList.contains('flipped') || card.classList.contains('matched')) return;

        card.classList.add('flipped');
        flippedCards.push({ card, index });

        if (flippedCards.length === 2) {
            moves++;
            movesSpan.textContent = `Moves: ${moves}`;

            const [first, second] = flippedCards;
            if (cards[first.index].value === cards[second.index].value) {
                // Match
                setTimeout(() => {
                    first.card.classList.add('matched');
                    second.card.classList.add('matched');
                    matchedPairs++;
                    flippedCards = [];
                    if (matchedPairs === cards.length / 2) {
                        // Level complete
                        setTimeout(() => {
                            messageDiv.textContent = `Level ${currentLevel} Complete!`;
                            setTimeout(() => {
                                currentLevel++;
                                initializeLevel();
                            }, 2000);
                        }, 500);
                    }
                }, 1000);
            } else {
                // No match
                setTimeout(() => {
                    first.card.classList.remove('flipped');
                    second.card.classList.remove('flipped');
                    flippedCards = [];
                }, 1000);
            }
        }
    }
});