document.addEventListener('DOMContentLoaded', () => {
    
    const places = [
        { name: "India Gate", location: "New Delhi, Delhi", latlng: [28.6129, 77.2295], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/0/09/India_Gate_in_New_Delhi_03-2016.jpg", hints: ["State/UT: Delhi", "A memorial to fallen soldiers."] },
        { name: "Hawa Mahal", location: "Jaipur, Rajasthan", latlng: [26.9239, 75.8267], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d2/Hawa_Mahal_in_Jaipur_07-2016.jpg", hints: ["State: Rajasthan", "Known as the 'Palace of Winds'."] },
        { name: "Golden Temple", location: "Amritsar, Punjab", latlng: [31.6200, 74.8765], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Harmandir_Sahib%2C_Amritsar%2C_Punjab%2C_India.jpg", hints: ["State: Punjab", "The holiest Gurdwara of Sikhism."] },
        { name: "Taj Mahal", location: "Agra, Uttar Pradesh", latlng: [27.1751, 78.0421], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bd/Taj_Mahal%2C_Agra%2C_India_edit3.jpg", hints: ["State: Uttar Pradesh", "A mausoleum on the Yamuna river."] },
        { name: "Mysore Palace", location: "Mysuru, Karnataka", latlng: [12.3052, 76.6552], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a4/Mysore_Palace_at_night.jpg", hints: ["State: Karnataka", "The former seat of the Wadiyar dynasty."] },
    ];

    // --- Using OpenStreetMap for a classic, live map feel ---
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
        welcomeOverlay: document.getElementById('welcome-overlay'), startButton: document.getElementById('start-button'),
        imageModal: document.getElementById('image-modal'), locationImage: document.getElementById('location-image'),
        startGuessingButton: document.getElementById('start-guessing-button'), hintContainer: document.getElementById('hint-container'),
        hintButton: document.getElementById('hint-button'), hintToast: document.getElementById('hint-toast'),
        timerContainer: document.getElementById('timer-container'), timerScore: document.getElementById('timer-score'),
        gameOverOverlay: document.getElementById('game-over-overlay'), gameOverTitle: document.getElementById('game-over-title'),
        gameOverAnswer: document.getElementById('game-over-answer'), gameOverScore: document.getElementById('game-over-score'),
        playAgainButton: document.getElementById('play-again-button')
    };
    
    // --- EVENT LISTENERS ---
    ui.startButton.addEventListener('click', () => {
        ui.welcomeOverlay.classList.remove('visible');
        ui.welcomeOverlay.classList.add('hidden');
        startNewRound();
    });
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
        attempts = 0;
        hintsUsed = 0;
        stopTimer();
        
        [ui.feedbackPanel, ui.thumbnailContainer, ui.hintContainer, ui.timerContainer].forEach(el => el.classList.add('hidden'));
        ui.hintButton.disabled = false;
        
        if (compassMarker) map.removeLayer(compassMarker);
        guessMarkers.forEach(marker => map.removeLayer(marker));
        guessMarkers = [];
        
        correctPlace = places[Math.floor(Math.random() * places.length)];
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
            handleCorrectGuess();
            return;
        }
        if (attempts >= MAX_ATTEMPTS) {
            handleRoundFailed();
            return;
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

    function handleCorrectGuess() {
        stopTimer();
        const score = calculateScore();
        showGameOverScreen("🎉 Correct!", `The location was ${correctPlace.name}.`, score);
    }

    function handleRoundFailed() {
        stopTimer();
        showGameOverScreen("Out of Attempts!", `The answer was ${correctPlace.name}.`, 0);
    }

    function showGameOverScreen(title, answer, score) {
        [ui.feedbackPanel, ui.hintContainer, ui.timerContainer, ui.thumbnailContainer].forEach(el => el.classList.add('hidden'));
        if (compassMarker) map.removeLayer(compassMarker);
        map.off('click', onMapClick);
        
        ui.gameOverTitle.textContent = title;
        ui.gameOverAnswer.textContent = answer;
        ui.gameOverScore.textContent = score;
        ui.gameOverOverlay.classList.remove('hidden');

        map.flyTo(correctPlace.latlng, 12, { animate: true, duration: 2.0 });
    }

    function startTimer() {
        timerScore = 1000;
        ui.timerScore.textContent = timerScore;
        timerInterval = setInterval(() => {
            timerScore = Math.max(0, timerScore - 20);
            ui.timerScore.textContent = timerScore;
            if (timerScore === 0) stopTimer();
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function showHint() {
        if (hintsUsed >= correctPlace.hints.length) return;
        hintsUsed++;
        const hint = correctPlace.hints[hintsUsed - 1];
        ui.hintToast.textContent = hint;
        ui.hintToast.classList.add('visible');
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
        let dLng = endLng - startLng;
        let dPhi = Math.log(Math.tan(endLat / 2.0 + Math.PI / 4.0) / Math.tan(startLat / 2.0 + Math.PI / 4.0));
        if (Math.abs(dLng) > Math.PI) dLng = dLng > 0.0 ? -(2.0 * Math.PI - dLng) : (2.0 * Math.PI + dLng);
        return ((Math.atan2(dLng, dPhi) * 180) / Math.PI + 360) % 360;
    }

    function getCardinalDirection(angle) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return directions[Math.round(angle / 45) % 8];
    }
});