document.addEventListener('DOMContentLoaded', () => {
    
    // --- IMPORTANT: PASTE YOUR FIREBASE CONFIGURATION OBJECT HERE ---
    const firebaseConfig = {
        apiKey: "AIzaSyCrdawtAW4YOyml3ZMJvU28fTPpzqcc42g",
        authDomain: "spot-in-vs.firebaseapp.com",
        projectId: "spot-in-vs",
        storageBucket: "spot-in-vs.appspot.com",
        messagingSenderId: "1016129089223",
        appId: "1:1016129089223:web:0ba77b85068f43fbc7d8e2",
        measurementId: "G-P56LXW478D"
      };
    // --- ---

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    let places = [];
    let availablePlaces = [];
    let username = null;

    const map = L.map('map', { scrollWheelZoom: true, doubleClickZoom: true, minZoom: 5, maxZoom: 18, zoomControl: false }).setView([23.5, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);


    let correctPlace, attempts = 0, compassMarker, guessMarkers = [];
    let hintsUsed = 0, timerInterval = null, timerScore = 1000;
    const WINNING_DISTANCE_KM = 5;
    const MAX_ATTEMPTS = 5;

    const ui = {
        thumbnailContainer: document.getElementById('thumbnail-container'), thumbnailImage: document.getElementById('thumbnail-image'),
        feedbackPanel: document.getElementById('feedback-panel'), distanceFeedback: document.getElementById('distance-feedback'),
        directionFeedback: document.getElementById('direction-feedback'), attemptsFeedback: document.getElementById('attempts-feedback'),
        welcomeOverlay: document.getElementById('welcome-overlay'), usernameInput: document.getElementById('username-input'), startButton: document.getElementById('start-button'),
        resetScoreButton: document.getElementById('reset-score-button'),
        imageModal: document.getElementById('image-modal'), locationImage: document.getElementById('location-image'),
        startGuessingButton: document.getElementById('start-guessing-button'), hintContainer: document.getElementById('hint-container'),
        hintButton: document.getElementById('hint-button'), hintToast: document.getElementById('hint-toast'),
        timerContainer: document.getElementById('timer-container'), timerScore: document.getElementById('timer-score'),
        gameOverOverlay: document.getElementById('game-over-overlay'), gameOverTitle: document.getElementById('game-over-title'),
        gameOverAnswer: document.getElementById('game-over-answer'), placeLeaderboardTitle: document.getElementById('place-leaderboard-title'),
        placeLeaderboardList: document.getElementById('place-leaderboard-list'), lifetimeScore: document.getElementById('lifetime-score'),
        allTimeLeaderboardList: document.getElementById('all-time-leaderboard-list'),
        playAgainButton: document.getElementById('play-again-button'),
        gameOverResetButton: document.getElementById('game-over-reset-button') // ADD THIS LINE
    };

    function checkLocalStorage() {
        const savedUser = localStorage.getItem('geoGuesserUser');
        if (savedUser) {
            username = savedUser;
            ui.usernameInput.value = username;
            ui.resetScoreButton.classList.remove('hidden');
            ui.welcomeOverlay.classList.remove('hidden');
        } else {
            ui.welcomeOverlay.classList.remove('hidden');
            ui.resetScoreButton.classList.add('hidden');
        }
    }

    ui.startButton.addEventListener('click', () => {
        const inputName = ui.usernameInput.value.trim();
        if (inputName) {
            username = inputName;
            localStorage.setItem('geoGuesserUser', username);
            ui.welcomeOverlay.classList.add('hidden');
            loadGameData();
        } else {
            alert("Please enter a name!");
        }
    });

    ui.gameOverResetButton.addEventListener('click', async () => {
        if (confirm("Are you sure you want to reset your score? This action cannot be undone.")) {
            try {
                await db.collection('users').doc(username).delete();
                localStorage.removeItem('geoGuesserUser');
                alert("Your score has been reset.");
                location.reload(); // Refresh the page to start fresh
            } catch (error) {
                console.error("Error resetting score: ", error);
                alert("Could not reset score. Please try again.");
            }
        }
    });

    async function loadGameData() {
        try {
            const response = await fetch('data.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            places = await response.json();
            availablePlaces = [...places];
            console.log("Game data loaded successfully!");
            startNewRound();
        } catch (error) {
            console.error("Could not load game data:", error);
            alert("Failed to load game data. Please check data.json.");
        }
    }

    ui.startGuessingButton.addEventListener('click', () => {
        ui.imageModal.classList.add('hidden');
        [ui.thumbnailContainer, ui.hintContainer, ui.timerContainer].forEach(el => el.classList.remove('hidden'));
        startTimer();
        map.on('click', onMapClick);
    });

    ui.playAgainButton.addEventListener('click', () => {
        ui.gameOverOverlay.classList.add('hidden');
        map.flyTo([23.5, 78.9629], 5, { animate: true, duration: 1.5 });
        setTimeout(startNewRound, 1500);
    });

    ui.hintButton.addEventListener('click', showHint);

    function startNewRound() {
        if (availablePlaces.length === 0) availablePlaces = [...places];
        attempts = 0; hintsUsed = 0; stopTimer();
        [ui.feedbackPanel, ui.thumbnailContainer, ui.hintContainer, ui.timerContainer].forEach(el => el.classList.add('hidden'));
        ui.hintButton.disabled = false;
        if (compassMarker) map.removeLayer(compassMarker);
        guessMarkers.forEach(marker => map.removeLayer(marker));
        guessMarkers = [];
        
        const randomIndex = Math.floor(Math.random() * availablePlaces.length);
        correctPlace = availablePlaces.splice(randomIndex, 1)[0];
        correctPlace.latlng = L.latLng(correctPlace.latlng[0], correctPlace.latlng[1]);
        
        ui.locationImage.src = correctPlace.imageUrl;
        ui.thumbnailImage.src = correctPlace.imageUrl;
        ui.imageModal.classList.remove('hidden');
    }

    function onMapClick(e) {
        map.off('click', onMapClick);
        attempts++;
        const clickedLatLng = e.latlng;
        const distance = clickedLatLng.distanceTo(correctPlace.latlng) / 1000;
        
        if (distance <= WINNING_DISTANCE_KM) {
            handleCorrectGuess(); return;
        }
        if (attempts >= MAX_ATTEMPTS) {
            handleRoundFailed(); return;
        }
        const bearing = calculateBearing(clickedLatLng, correctPlace.latlng);
        const direction = getCardinalDirection(bearing);
        ui.distanceFeedback.textContent = `${Math.round(distance)} km`;
        ui.directionFeedback.textContent = direction;
        ui.attemptsFeedback.textContent = `Attempt ${attempts + 1}/${MAX_ATTEMPTS}`;
        ui.feedbackPanel.classList.remove('hidden');
        addGuessMarker(clickedLatLng);
        showCompass(clickedLatLng, bearing);
        setTimeout(() => map.on('click', onMapClick), 400);
    }

    async function handleCorrectGuess() {
        stopTimer();
        const score = calculateScore();
        await saveScore(username, correctPlace.name, score);
        showGameOverScreen("🎉 Correct!", `The location was ${correctPlace.name}.`, score);
    }

    async function handleRoundFailed() {
        stopTimer();
        await saveScore(username, correctPlace.name, 0); // Still save a 0 score to track attempts if needed
        showGameOverScreen("Out of Attempts!", `The answer was ${correctPlace.name}.`, 0);
    }

    async function showGameOverScreen(title, answer, score) {
        [ui.feedbackPanel, ui.hintContainer, ui.timerContainer, ui.thumbnailContainer].forEach(el => el.classList.add('hidden'));
        if (compassMarker) map.removeLayer(compassMarker);
        map.off('click', onMapClick);
        
        ui.gameOverTitle.textContent = title;
        ui.gameOverAnswer.textContent = answer;
        
        await Promise.all([
            displayPlaceLeaderboard(correctPlace.name),
            displayLifetimeScore(username),
            displayAllTimeLeaderboard()
        ]);
        
        ui.gameOverOverlay.classList.remove('hidden');
        map.flyTo(correctPlace.latlng, 12, { animate: true, duration: 2.0 });
    }

    async function saveScore(playerName, place, roundScore) {
        try {
            // Only save scores for specific rounds if they are greater than 0
            if (roundScore > 0) {
                await db.collection('scores').add({
                    username: playerName, placeName: place, score: roundScore,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            const userRef = db.collection('users').doc(playerName);
            await userRef.set({
                lifetimeScore: firebase.firestore.FieldValue.increment(roundScore)
            }, { merge: true });
        } catch (error) { console.error("Error saving score: ", error); }
    }

    async function displayPlaceLeaderboard(placeName) {
        ui.placeLeaderboardTitle.textContent = `Top Scores for ${placeName}`;
        ui.placeLeaderboardList.innerHTML = '<li>Loading...</li>';
        try {
            const query = db.collection('scores').where('placeName', '==', placeName).orderBy('score', 'desc').limit(5);
            const snapshot = await query.get();
            ui.placeLeaderboardList.innerHTML = '';
            if (snapshot.empty) {
                ui.placeLeaderboardList.innerHTML = '<li>No scores yet!</li>';
                return;
            }
            snapshot.forEach(doc => {
                const data = doc.data();
                ui.placeLeaderboardList.innerHTML += `<li><span>${data.username}</span><span>${data.score}</span></li>`;
            });
        } catch (error) { console.error("Error getting place scores: ", error); }
    }

    async function displayAllTimeLeaderboard() {
        ui.allTimeLeaderboardList.innerHTML = '<li>Loading...</li>';
        try {
            const query = db.collection('users').orderBy('lifetimeScore', 'desc').limit(5);
            const snapshot = await query.get();
            ui.allTimeLeaderboardList.innerHTML = '';
            if (snapshot.empty) {
                ui.allTimeLeaderboardList.innerHTML = '<li>No scores yet!</li>';
                return;
            }
            snapshot.forEach(doc => {
                ui.allTimeLeaderboardList.innerHTML += `<li><span>${doc.id}</span><span>${doc.data().lifetimeScore}</span></li>`;
            });
        } catch (error) {
            console.error("Error getting all-time scores: ", error);
            ui.allTimeLeaderboardList.innerHTML = '<li>Could not load scores.</li>';
        }
    }

    async function displayLifetimeScore(playerName) {
        ui.lifetimeScore.textContent = '...';
        try {
            const doc = await db.collection('users').doc(playerName).get();
            if (doc.exists) {
                ui.lifetimeScore.textContent = doc.data().lifetimeScore;
            } else {
                ui.lifetimeScore.textContent = 0;
            }
        } catch (error) { console.error("Error getting lifetime score: ", error); }
    }

    function startTimer() {
        timerScore = 1000; ui.timerScore.textContent = timerScore;
        timerInterval = setInterval(() => {
            timerScore = Math.max(0, timerScore - 20);
            ui.timerScore.textContent = timerScore;
            if (timerScore === 0) stopTimer();
        }, 1000);
    }
    function stopTimer() { clearInterval(timerInterval); }

    function showHint() {
        if (hintsUsed >= correctPlace.hints.length) return;
        hintsUsed++; const hint = correctPlace.hints[hintsUsed - 1];
        ui.hintToast.textContent = hint; ui.hintToast.classList.add('visible');
        setTimeout(() => ui.hintToast.classList.remove('visible'), 3000);
        if (hintsUsed >= correctPlace.hints.length) ui.hintButton.disabled = true;
    }

    function calculateScore() {
        const attemptScore = 500 - ((attempts - 1) * 100);
        const hintPenalty = hintsUsed * 100;
        const finalScore = timerScore + attemptScore - hintPenalty;
        return Math.max(0, Math.round(finalScore));
    }

    function addGuessMarker(latlng) {
        const icon = L.divIcon({ className: 'guess-marker-icon', html: `<div class="guess-marker-div"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
        guessMarkers.push(L.marker(latlng, { icon: icon }).addTo(map));
    }

    function showCompass(latlng, angle) {
        if (compassMarker) map.removeLayer(compassMarker);
        const icon = L.divIcon({ className: 'compass-marker', html: `<div class="compass-ring"><div class="compass-pointer"></div></div>`, iconSize: [60, 60], iconAnchor: [30, 30] });
        compassMarker = L.marker(latlng, { icon: icon }).addTo(map);
        setTimeout(() => {
            const pointer = compassMarker.getElement().querySelector('.compass-pointer');
            if (pointer) pointer.style.transform = `rotate(${angle}deg)`;
        }, 0);
    }
    
    function calculateBearing(start, end) {
        const startLat = (start.lat * Math.PI) / 180, startLng = (start.lng * Math.PI) / 180, endLat = (end.lat * Math.PI) / 180, endLng = (end.lng * Math.PI) / 180;
        let dLng = endLng - startLng; let dPhi = Math.log(Math.tan(endLat / 2.0 + Math.PI / 4.0) / Math.tan(startLat / 2.0 + Math.PI / 4.0));
        if (Math.abs(dLng) > Math.PI) dLng = dLng > 0.0 ? -(2.0 * Math.PI - dLng) : (2.0 * Math.PI + dLng);
        return ((Math.atan2(dLng, dPhi) * 180) / Math.PI + 360) % 360;
    }

    function getCardinalDirection(angle) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return directions[Math.round(angle / 45) % 8];
    }

    checkLocalStorage();
});