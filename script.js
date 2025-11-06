document.addEventListener('DOMContentLoaded', () => {
    
    const places = [
        { name: "India Gate", location: "New Delhi, Delhi", latlng: [28.6129, 77.2295], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/0/09/India_Gate_in_New_Delhi_03-2016.jpg", hints: ["State/UT: Delhi", "A memorial to fallen soldiers."] },
        { name: "Hawa Mahal", location: "Jaipur, Rajasthan", latlng: [26.9239, 75.8267], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d2/Hawa_Mahal_in_Jaipur_07-2016.jpg", hints: ["State: Rajasthan", "Known as the 'Palace of Winds'."] },
        { name: "Golden Temple", location: "Amritsar, Punjab", latlng: [31.6200, 74.8765], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e3/Harmandir_Sahib%2C_Amritsar%2C_Punjab%2C_India.jpg", hints: ["State: Punjab", "The holiest Gurdwara of Sikhism."] },
        { name: "Taj Mahal", location: "Agra, Uttar Pradesh", latlng: [27.1751, 78.0421], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/bd/Taj_Mahal%2C_Agra%2C_India_edit3.jpg", hints: ["State: Uttar Pradesh", "A mausoleum on the Yamuna river."] },
        { name: "Mysore Palace", location: "Mysuru, Karnataka", latlng: [12.3052, 76.6552], imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a4/Mysore_Palace_at_night.jpg", hints: ["State: Karnataka", "The former seat of the Wadiyar dynasty."] },
    ];

    const map = L.map('map', { scrollWheelZoom: true, doubleClickZoom: true, minZoom: 5, maxZoom: 18, zoomControl: false }).setView([23.5, 78.9629], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // --- SCORING & GAME STATE VARIABLES ---
    let correctPlace, attempts = 0, compassMarker, guessMarkers = [];
    let hintsUsed = 0;
    let timerInterval = null;
    let timerScore = 1000;
    const WINNING_DISTANCE_KM = 5;
    const MAX_ATTEMPTS = 5;

    const uiElements = {
        thumbnailContainer: document.getElementById('thumbnail-container'),
        thumbnailImage: document.getElementById('thumbnail-image'),
        feedbackPanel: document.getElementById('feedback-panel'),
        distanceFeedback: document.getElementById('distance-feedback'),
        directionFeedback: document.getElementById('direction-feedback'),
        attemptsFeedback: document.getElementById('attempts-feedback'),
        welcomeOverlay: document.getElementById('welcome-overlay'),
        startButton: document.getElementById('start-button'),
        imageModal: document.getElementById('image-modal'),
        locationImage: document.getElementById('location-image'),
        startGuessingButton: document.getElementById('start-guessing-button'),
        hintContainer: document.getElementById('hint-container'),
        hintButton: document.getElementById('hint-button'),
        hintToast: document.getElementById('hint-toast'),
        timerContainer: document.getElementById('timer-container'),
        timerScore: document.getElementById('timer-score'),
    };
    
    uiElements.startButton.addEventListener('click', () => {
        uiElements.welcomeOverlay.classList.remove('visible');
        uiElements.welcomeOverlay.classList.add('hidden');
        startNewRound();
    });

    uiElements.startGuessingButton.addEventListener('click', () => {
        uiElements.imageModal.classList.add('hidden');
        [uiElements.thumbnailContainer, uiElements.hintContainer, uiElements.timerContainer].forEach(el => el.classList.remove('hidden'));
        startTimer();
        map.on('click', onMapClick);
    });

    uiElements.hintButton.addEventListener('click', showHint);

    function startNewRound() {
        attempts = 0;
        hintsUsed = 0;
        stopTimer();
        
        [uiElements.feedbackPanel, uiElements.thumbnailContainer, uiElements.hintContainer, uiElements.timerContainer].forEach(el => el.classList.add('hidden'));
        uiElements.hintButton.disabled = false;
        
        if (compassMarker) map.removeLayer(compassMarker);
        guessMarkers.forEach(marker => map.removeLayer(marker));
        guessMarkers = [];
        map.eachLayer(layer => { if (layer instanceof L.Popup) map.removeLayer(layer); });

        correctPlace = places[Math.floor(Math.random() * places.length)];
        correctPlace.latlng = L.latLng(correctPlace.latlng[0], correctPlace.latlng[1]);
        
        uiElements.locationImage.src = correctPlace.imageUrl;
        uiElements.thumbnailImage.src = correctPlace.imageUrl;
        uiElements.imageModal.classList.remove('hidden');

        map.flyTo([23.5, 78.9629], 5, { animate: true, duration: 1.0 });
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
        
        uiElements.distanceFeedback.textContent = `${Math.round(distance)} km`;
        uiElements.directionFeedback.textContent = direction;
        uiElements.attemptsFeedback.textContent = `Attempt ${attempts + 1}/${MAX_ATTEMPTS}`;
        uiElements.feedbackPanel.classList.remove('hidden');

        addGuessMarker(clickedLatLng);
        showCompass(clickedLatLng, bearing);

        setTimeout(() => map.on('click', onMapClick), 400);
    }

    function handleCorrectGuess() {
        stopTimer();
        const score = calculateScore();

        [uiElements.feedbackPanel, uiElements.hintContainer, uiElements.timerContainer].forEach(el => el.classList.add('hidden'));
        if (compassMarker) map.removeLayer(compassMarker);
        
        const popupContent = `<h3>${correctPlace.name}</h3><p>${correctPlace.location}</p><div class="reveal-score"><h4>Final Score</h4><p>${score}</p></div>`;
        L.popup({closeButton: false, autoClose: false, closeOnClick: false}).setLatLng(correctPlace.latlng).setContent(popupContent).openOn(map);
        
        map.flyTo(correctPlace.latlng, 14, { animate: true, duration: 2.0 });
        setTimeout(startNewRound, 7000);
    }

    function handleRoundFailed() {
        stopTimer();
        [uiElements.feedbackPanel, uiElements.hintContainer, uiElements.timerContainer].forEach(el => el.classList.add('hidden'));
        if (compassMarker) map.removeLayer(compassMarker);

        const popupContent = `<h3>Better Luck Next Time!</h3><p>The answer was ${correctPlace.name}</p><div class="reveal-score"><h4>Final Score</h4><p>0</p></div>`;
        L.popup({closeButton: false, autoClose: false, closeOnClick: false}).setLatLng(correctPlace.latlng).setContent(popupContent).openOn(map);

        map.flyTo(correctPlace.latlng, 14, { animate: true, duration: 2.0 });
        setTimeout(startNewRound, 7000);
    }

    function startTimer() {
        timerScore = 1000;
        uiElements.timerScore.textContent = timerScore;
        timerInterval = setInterval(() => {
            timerScore = Math.max(0, timerScore - 20);
            uiElements.timerScore.textContent = timerScore;
            if (timerScore === 0) {
                stopTimer();
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function showHint() {
        if (hintsUsed >= correctPlace.hints.length) return;
        hintsUsed++;
        const hint = correctPlace.hints[hintsUsed - 1];
        uiElements.hintToast.textContent = hint;
        uiElements.hintToast.classList.add('visible');
        setTimeout(() => uiElements.hintToast.classList.remove('visible'), 3000);
        if (hintsUsed >= correctPlace.hints.length) {
            uiElements.hintButton.disabled = true;
        }
    }

    function calculateScore() {
        const attemptScore = 500 - ((attempts - 1) * 100);
        const hintPenalty = hintsUsed * 100;
        const finalScore = timerScore + attemptScore - hintPenalty;
        return Math.max(0, Math.round(finalScore));
    }

    function addGuessMarker(latlng) {
        const icon = L.divIcon({ className: 'guess-marker-icon', html: `<div class="guess-marker-div"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
        const guessMarker = L.marker(latlng, { icon: icon }).addTo(map);
        guessMarkers.push(guessMarker);
    }

    function showCompass(latlng, angle) {
        if (compassMarker) map.removeLayer(compassMarker);
        const icon = L.divIcon({ className: 'compass-marker', html: `<div class="compass-ring"><div class="compass-pointer"></div></div>`, iconSize: [60, 60], iconAnchor: [30, 30] });
        compassMarker = L.marker(latlng, { icon: icon }).addTo(map);
        setTimeout(() => {
            const pointer = compassMarker.getElement().querySelector('.compass-pointer');
            if (pointer) { pointer.style.transform = `rotate(${angle}deg)`; }
        }, 0);
    }
    
    function calculateBearing(start, end) {
        const startLat = (start.lat * Math.PI) / 180, startLng = (start.lng * Math.PI) / 180;
        const endLat = (end.lat * Math.PI) / 180, endLng = (end.lng * Math.PI) / 180;
        let dLng = endLng - startLng;
        let dPhi = Math.log(Math.tan(endLat / 2.0 + Math.PI / 4.0) / Math.tan(startLat / 2.0 + Math.PI / 4.0));
        if (Math.abs(dLng) > Math.PI) dLng = dLng > 0.0 ? -(2.0 * Math.PI - dLng) : (2.0 * Math.PI + dLng);
        return ((Math.atan2(dLng, dPhi) * 180) / Math.PI + 360) % 360;
    }

    function getCardinalDirection(angle) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(angle / 45) % 8;
        return directions[index];
    }
});