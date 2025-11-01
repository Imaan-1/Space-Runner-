// --- Starfield Creation Logic (Copied from original game.js) ---
function createStarfield() {
    // Note: The .starfield div is already in landing.html and styled in style.css.
    const starfield = document.getElementById('starfield');
    if (!starfield || starfield.children.length > 0) return;
    
    // Create 300 twinkling stars
    for (let i = 0; i < 300; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.width = `${Math.random() * 2 + 1.5}px`;
        star.style.height = star.style.width;
        star.style.animationDelay = `${Math.random() * 3}s`;
        starfield.appendChild(star);
    }
    
    // Create shooting stars (increased frequency)
    const createShootingStar = () => {
        const shootingStar = document.createElement('div');
        shootingStar.style.position = 'absolute';
        shootingStar.style.width = '2px';
        shootingStar.style.height = '150px';
        shootingStar.style.background = 'linear-gradient(to top, transparent, rgba(255, 255, 255, 0.7))';
        shootingStar.style.left = `${Math.random() * 100}%`;
        shootingStar.style.top = `${Math.random() * 100}%`;
        shootingStar.style.animation = `shootingStar ${Math.random() * 1 + 0.5}s linear forwards`;
        shootingStar.style.transform = 'rotate(45deg)';
        starfield.appendChild(shootingStar);
        setTimeout(() => { if (starfield.contains(shootingStar)) starfield.removeChild(shootingStar); }, 1500);
    };
    // Increased interval for more frequent shooting stars
    setInterval(createShootingStar, 1000); 

    // --- Mouse Parallax Effect (Copied from original game.js) ---
    window.addEventListener('mousemove', (e) => {
        const xRatio = (e.clientX - window.innerWidth / 2) / window.innerWidth;
        const yRatio = (e.clientY - window.innerHeight / 2) / window.innerHeight;
        starfield.style.transform = `translate(${xRatio * -30}px, ${yRatio * -30}px)`;
    });
}
// --- END Starfield Creation Logic ---


// Helper: run handler when DOM is ready (covers both deferred and non-deferred script loads)
function onReady(fn) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        // DOM already ready
        setTimeout(fn, 0);
    }
}

onReady(() => {
    try {
        console.log('[landing-script] DOM ready - initializing landing page');
        // 1. CREATE THE TWINKLING STARS
        createStarfield();

        // Try multiple possible IDs for the landing "begin" button so this script
        // remains resilient to small markup changes.
        const beginButton = document.getElementById('begin-game-button') ||
                            document.getElementById('begin-mission-button') ||
                            document.getElementById('begin-button') ||
                            document.querySelector('.begin-game') ;

        if (beginButton) {
            console.log('[landing-script] Found begin button. Relying on HTML a href="index.html".');
            // The previous logic for navigation was intentionally removed.
        } else {
            console.warn('[landing-script] Begin button not found on landing page. Expected id: begin-game-button or begin-mission-button.');
        }
    } catch (err) {
        console.error('[landing-script] Error initializing landing page:', err);
    }
});