/**
 * Moon Phase & Solar Astronomy Calculator
 * Includes High-Accuracy Astronomical Moon Phase & Dynamic SVG Shadow Mask Generator
 */

class Astronomy {
  static userLat = 52.685732;
  static userLon = -2.033592;
  static userAltMeters = 140;
  static userCityName = '';
  static locationLabel = '52.69°N, 2.03°W';

  static setLocation(lat, lon, altMeters, cityName) {
    if (lat !== null && lat !== undefined && !isNaN(lat)) this.userLat = Number(lat);
    if (lon !== null && lon !== undefined && !isNaN(lon)) this.userLon = Number(lon);
    if (altMeters !== null && altMeters !== undefined && !isNaN(altMeters)) this.userAltMeters = Number(altMeters);
    if (cityName !== undefined && cityName !== null) this.userCityName = String(cityName).trim();

    const latDir = this.userLat >= 0 ? 'N' : 'S';
    const lonDir = this.userLon >= 0 ? 'E' : 'W';
    const latStr = `${Math.abs(this.userLat).toFixed(2)}°${latDir}`;
    const lonStr = `${Math.abs(this.userLon).toFixed(2)}°${lonDir}`;
    const coordsStr = `${latStr}, ${lonStr}`;

    this.locationLabel = this.userCityName ? `${this.userCityName} (${coordsStr})` : coordsStr;
  }

  /**
   * Calculate High-Precision Astronomical Moon Phase, Illumination %, and Phase Name
   */
  static getMoonPhase(date = new Date()) {
    const time = date.getTime();
    // Known accurate New Moon epoch: Jan 11, 2024, 11:57:00 UTC = 1704974220000 ms
    const knownNewMoon = 1704974220000;
    const synodicMs = 29.53058770576 * 86400 * 1000;

    let phaseIndex = ((time - knownNewMoon) % synodicMs) / synodicMs;
    if (phaseIndex < 0) phaseIndex += 1;

    // Illumination fraction (0% to 100%)
    const illumination = Math.round((1 - Math.cos(phaseIndex * 2 * Math.PI)) / 2 * 100);
    const ageDays = Math.round(phaseIndex * 29.5305877 * 10) / 10;

    let phaseName = 'New Moon';
    let icon = '🌑';

    if (phaseIndex < 0.03 || phaseIndex >= 0.97) {
      phaseName = 'New Moon'; icon = '🌑';
    } else if (phaseIndex < 0.22) {
      phaseName = 'Waxing Crescent'; icon = '🌒';
    } else if (phaseIndex < 0.28) {
      phaseName = 'First Quarter'; icon = '🌓';
    } else if (phaseIndex < 0.47) {
      phaseName = 'Waxing Gibbous'; icon = '🌔';
    } else if (phaseIndex < 0.53) {
      phaseName = 'Full Moon'; icon = '🌕';
    } else if (phaseIndex < 0.72) {
      phaseName = 'Waning Gibbous'; icon = '🌖';
    } else if (phaseIndex < 0.78) {
      phaseName = 'Last Quarter'; icon = '🌗';
    } else {
      phaseName = 'Waning Crescent'; icon = '🌘';
    }

    return {
      phaseIndex,
      illumination,
      phaseName,
      icon,
      ageDays
    };
  }

  /**
   * Calculate Solar Times
   */
  static getSolarTimes(date = new Date(), lat = Astronomy.userLat, lon = Astronomy.userLon) {
    const now = new Date(date);
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

    const declination = 23.45 * Math.sin(((284 + dayOfYear) / 365) * 2 * Math.PI);
    const latRad = lat * (Math.PI / 180);
    const decRad = declination * (Math.PI / 180);

    let cosH = -Math.tan(latRad) * Math.tan(decRad);
    cosH = Math.min(1, Math.max(-1, cosH));
    const h = Math.acos(cosH) * (180 / Math.PI) / 15;

    // Timezone offset in hours including Daylight Saving Time (DST)
    const tzOffsetHours = -now.getTimezoneOffset() / 60;

    const solarNoonHour = 12.0 - (lon / 15) + tzOffsetHours;
    const sunriseHour = solarNoonHour - h;
    const sunsetHour = solarNoonHour + h;

    const formatHour = (hr) => {
      const positiveHr = (hr % 24 + 24) % 24;
      const hInt = Math.floor(positiveHr);
      const mInt = Math.round((positiveHr - hInt) * 60);
      const finalH = (hInt + Math.floor(mInt / 60)) % 24;
      const finalM = mInt % 60;
      return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
    };

    const currentHourDec = now.getHours() + (now.getMinutes() / 60);
    const isDaytime = (currentHourDec >= sunriseHour && currentHourDec < sunsetHour);

    const dayLengthHours = Math.floor(2 * h);
    const dayLengthMins = Math.round(((2 * h) - dayLengthHours) * 60);

    const altFeet = Math.round(Astronomy.userAltMeters * 3.28084);

    return {
      sunrise: formatHour(sunriseHour),
      sunset: formatHour(sunsetHour),
      dayLength: `${dayLengthHours}h ${dayLengthMins}m`,
      isDaytime,
      cityName: Astronomy.userCityName,
      locationName: Astronomy.locationLabel,
      locationCoords: Astronomy.locationLabel,
      altitudeStr: `${Astronomy.userAltMeters}m (${altFeet} ft)`
    };
  }

  /**
   * Render Large Day / Night Animated Celestial / Weather Tendency Graphic
   */
  static renderCelestialGraphic(containerId, isDaytime, moonInfo, forecastState) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const state = forecastState ? forecastState.state : 'sunny';

    if (state === 'rain') {
      // Large Animated Rain Cloud with Falling Drops Graphic
      el.innerHTML = `
        <div style="position: relative; width: 155px; height: 155px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 160 160" style="width: 155px; height: 155px; display: block; overflow: visible;">
            <defs>
              <linearGradient id="rainCloudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#cbd5e1" />
                <stop offset="100%" stop-color="#64748b" />
              </linearGradient>
              <filter id="rainCloudShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.5"/>
              </filter>
            </defs>
            <!-- Rain Cloud -->
            <g filter="url(#rainCloudShadow)" class="cloud-drift">
              <path d="M 40 85 Q 25 85 25 70 Q 25 56 42 53 Q 50 36 72 38 Q 88 32 104 44 Q 118 46 118 64 Q 118 85 100 85 Z" 
                    fill="url(#rainCloudGrad)" />
            </g>
            <!-- Animated Falling Rain Drops -->
            <g class="svg-rain-anim">
              <line x1="48" y1="94" x2="40" y2="116" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" class="drop d1" />
              <line x1="72" y1="94" x2="64" y2="116" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" class="drop d2" />
              <line x1="96" y1="94" x2="88" y2="116" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" class="drop d3" />
              <line x1="116" y1="94" x2="108" y2="116" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" class="drop d1" style="animation-delay: 0.4s;" />
            </g>
          </svg>
        </div>
      `;
    } else if (state === 'storm') {
      // Large Animated Storm Cloud with Flashing Lightning Bolt Graphic
      el.innerHTML = `
        <div style="position: relative; width: 155px; height: 155px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 160 160" style="width: 155px; height: 155px; display: block; overflow: visible;">
            <defs>
              <linearGradient id="stormCloudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#475569" />
                <stop offset="100%" stop-color="#1e293b" />
              </linearGradient>
              <filter id="lightningGlow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <!-- Dark Storm Cloud -->
            <path d="M 40 75 Q 25 75 25 60 Q 25 46 42 43 Q 50 26 72 28 Q 88 22 104 34 Q 118 36 118 54 Q 118 75 100 75 Z" 
                  fill="url(#stormCloudGrad)" />
            <!-- Flashing Lightning Bolt -->
            <polygon points="78,68 62,98 74,98 64,130 96,90 82,90" fill="#fef08a" filter="url(#lightningGlow)" class="bolt-flash" />
            <!-- Rain drops -->
            <line x1="46" y1="84" x2="38" y2="104" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" class="drop d1" />
            <line x1="108" y1="84" x2="100" y2="104" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" class="drop d3" />
          </svg>
        </div>
      `;
    } else if (state === 'partly_cloudy') {
      if (isDaytime) {
        // Large Animated Sun behind Drifting Cloud Graphic (Daytime)
        el.innerHTML = `
          <div style="position: relative; width: 155px; height: 155px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 160 160" style="width: 155px; height: 155px; display: block; overflow: visible;">
              <defs>
                <radialGradient id="sunCorePartly" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#fff7ed" />
                  <stop offset="50%" stop-color="#fde047" />
                  <stop offset="100%" stop-color="#f59e0b" />
                </radialGradient>
                <filter id="cloudShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.5"/>
                </filter>
              </defs>
              <!-- Sun behind Cloud -->
              <g transform="translate(56, 56)">
                <circle cx="0" cy="0" r="34" fill="rgba(253, 224, 71, 0.3)" class="sun-back-pulse" />
                <circle cx="0" cy="0" r="26" fill="url(#sunCorePartly)" class="sun-back-pulse" />
              </g>
              <!-- Drifting Cloud Front -->
              <g filter="url(#cloudShadow)" class="cloud-drift">
                <path d="M 45 108 Q 30 108 30 90 Q 30 75 48 72 Q 56 54 76 57 Q 92 50 108 62 Q 120 64 120 82 Q 120 108 102 108 Z" 
                      fill="rgba(255, 255, 255, 0.95)" />
              </g>
            </svg>
          </div>
        `;
      } else {
        // Large Animated Crescent Moon behind Drifting Cloud Graphic (Nighttime)
        el.innerHTML = `
          <div style="position: relative; width: 155px; height: 155px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 160 160" style="width: 155px; height: 155px; display: block; overflow: visible;">
              <defs>
                <filter id="moonGlowFilter" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="cloudShadowNight" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.6"/>
                </filter>
              </defs>

              <!-- Twinkling Night Backdrop Stars -->
              <circle cx="28" cy="28" r="1.5" fill="#e2e8f0" opacity="0.85" />
              <circle cx="132" cy="32" r="1.8" fill="#e2e8f0" opacity="0.9" />
              <circle cx="138" cy="85" r="1.2" fill="#e2e8f0" opacity="0.75" />
              <circle cx="22" cy="115" r="1.4" fill="#e2e8f0" opacity="0.8" />

              <!-- Crescent Moon behind Cloud -->
              <g transform="translate(56, 48)" filter="url(#moonGlowFilter)">
                <circle cx="0" cy="0" r="28" fill="rgba(56, 189, 248, 0.25)" class="sun-back-pulse" />
                <path d="M -10 -20 A 22 22 0 1 0 10 18 A 16 16 0 1 1 -10 -20 Z" fill="#38bdf8" />
              </g>

              <!-- Drifting Cloud Front -->
              <g filter="url(#cloudShadowNight)" class="cloud-drift">
                <path d="M 45 108 Q 30 108 30 90 Q 30 75 48 72 Q 56 54 76 57 Q 92 50 108 62 Q 120 64 120 82 Q 120 108 102 108 Z" 
                      fill="rgba(226, 232, 240, 0.92)" />
              </g>
            </svg>
          </div>
        `;
      }
    } else if (state === 'sunny' && isDaytime) {
      // Large Animated Glowing Sun Graphic (160x160 ViewBox centered at 80,80)
      el.innerHTML = `
        <div style="position: relative; width: 155px; height: 155px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 160 160" style="width: 155px; height: 155px; display: block; overflow: visible;">
            <defs>
              <radialGradient id="sunCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#fff7ed" />
                <stop offset="40%" stop-color="#fde047" />
                <stop offset="80%" stop-color="#f59e0b" />
                <stop offset="100%" stop-color="#d97706" />
              </radialGradient>
              <filter id="sunGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <!-- Soft Solar Radiant Glow Corona -->
            <circle cx="80" cy="80" r="54" fill="rgba(253, 224, 71, 0.25)" class="sun-back-pulse" />

            <!-- Core Glowing Sun -->
            <circle cx="80" cy="80" r="38" fill="url(#sunCore)" filter="url(#sunGlow)" class="sun-back-pulse" />
          </svg>
        </div>
      `;
    } else {
      // Large Realistic 3D Illuminated Moon Sphere with Dynamic Shadow Mask (Nighttime Clear / Default)
      if (!moonInfo) moonInfo = this.getMoonPhase();

      const phaseIndex = moonInfo.phaseIndex || 0.33;
      const illumination = moonInfo.illumination !== undefined ? moonInfo.illumination : 78;
      const R = 44;
      const cx = 80, cy = 80;

      // Determine lit side (Waxing = Right side illuminated in Northern Hemisphere)
      const isWaxing = phaseIndex <= 0.5;
      const cosPhase = Math.cos(phaseIndex * 2 * Math.PI);
      const rx = Math.abs(cosPhase * R);

      // SVG path for shadow mask overlay (covering unlit portion of moon disk)
      let shadowPath = '';
      if (illumination >= 97) {
        // Full Moon: 0% shadow
        shadowPath = '';
      } else if (illumination <= 3) {
        // New Moon: 100% shadow
        shadowPath = `M ${cx} ${cy - R} A ${R} ${R} 0 1 0 ${cx} ${cy + R} A ${R} ${R} 0 1 0 ${cx} ${cy - R} Z`;
      } else {
        if (phaseIndex < 0.25) {
          // Waxing Crescent: Left 75% shadowed, Right Crescent lit
          shadowPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 0 ${cx} ${cy + R} A ${rx.toFixed(1)} ${R} 0 0 0 ${cx} ${cy - R} Z`;
        } else if (phaseIndex < 0.50) {
          // Waxing Gibbous: Left 25% shadowed, Right 75% (3/4 Moon) lit!
          shadowPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 0 ${cx} ${cy + R} A ${rx.toFixed(1)} ${R} 0 0 1 ${cx} ${cy - R} Z`;
        } else if (phaseIndex < 0.75) {
          // Waning Gibbous: Right 25% shadowed, Left 75% (3/4 Moon) lit!
          shadowPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} A ${rx.toFixed(1)} ${R} 0 0 0 ${cx} ${cy - R} Z`;
        } else {
          // Waning Crescent: Right 75% shadowed, Left Crescent lit
          shadowPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} A ${rx.toFixed(1)} ${R} 0 0 1 ${cx} ${cy - R} Z`;
        }
      }

      el.innerHTML = `
        <div style="position: relative; width: 155px; height: 155px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 160 160" style="width: 155px; height: 155px; display: block; overflow: visible;">
            <defs>
              <radialGradient id="moonSurface" cx="35%" cy="35%" r="65%">
                <stop offset="0%" stop-color="#ffffff" />
                <stop offset="50%" stop-color="#e2e8f0" />
                <stop offset="85%" stop-color="#cbd5e1" />
                <stop offset="100%" stop-color="#94a3b8" />
              </radialGradient>

              <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stop-color="rgba(148, 163, 184, 0)" />
                <stop offset="100%" stop-color="rgba(56, 189, 248, 0.3)" />
              </radialGradient>

              <filter id="moonShadowFilter">
                <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#38bdf8" flood-opacity="0.35"/>
              </filter>
            </defs>

            <!-- Star Backdrop -->
            <circle cx="20" cy="25" r="1.5" fill="#ffffff" opacity="0.8" />
            <circle cx="140" cy="30" r="1.2" fill="#ffffff" opacity="0.9" />
            <circle cx="25" cy="135" r="1.4" fill="#ffffff" opacity="0.7" />
            <circle cx="135" cy="130" r="1.8" fill="#ffffff" opacity="0.8" />
            <circle cx="145" cy="75" r="1.0" fill="#ffffff" opacity="0.6" />

            <!-- Moon Base Sphere (Fully Lit Surface Texture) -->
            <g filter="url(#moonShadowFilter)">
              <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#moonSurface)" />

              <!-- Realistic Lunar Maria & Craters -->
              <ellipse cx="68" cy="62" rx="9" ry="7" fill="#64748b" opacity="0.35" />
              <ellipse cx="92" cy="70" rx="12" ry="10" fill="#64748b" opacity="0.3" />
              <ellipse cx="76" cy="94" rx="10" ry="8" fill="#64748b" opacity="0.32" />
              <circle cx="94" cy="50" r="5" fill="#475569" opacity="0.25" />
              <circle cx="60" cy="85" r="4" fill="#475569" opacity="0.25" />
              <circle cx="85" cy="108" r="3" fill="#475569" opacity="0.2" />
            </g>

            <!-- Dynamic Shadow Mask (Unlit Portion of Moon) -->
            ${shadowPath ? `<path d="${shadowPath}" fill="#0b0f19" opacity="0.88" />` : ''}

            <!-- Atmosphere Glow Ring -->
            <circle cx="${cx}" cy="${cy}" r="${R + 2}" fill="url(#moonGlow)" pointer-events="none" />
          </svg>
        </div>
      `;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Astronomy;
}
