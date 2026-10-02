/**
 * Animated Weather Trend & Barometric Forecast Graphic Renderer
 */

class WeatherTrendAnimator {
  static cachedOnlineState = null;
  static lastFetchTime = 0;

  /**
   * Fetch live location weather state from Open-Meteo API using exact lat & lon
   */
  static async fetchLocationForecast(lat, lon) {
    const now = Date.now();
    // Cache for 10 minutes (600,000 ms)
    if (this.cachedOnlineState && (now - this.lastFetchTime < 600000)) {
      return this.cachedOnlineState;
    }

    if (!lat || !lon) return null;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat).toFixed(4)}&longitude=${Number(lon).toFixed(4)}&current=weather_code,is_day,surface_pressure`;
      const res = await fetch(url);
      const data = await res.json();

      if (data && data.current) {
        const code = data.current.weather_code;
        const isDay = data.current.is_day === 1;
        this.cachedOnlineState = this.mapWmoToState(code, isDay);
        this.lastFetchTime = now;
        return this.cachedOnlineState;
      }
    } catch (err) {
      console.warn('[Location Weather Sync Warning]', err);
    }
    return null;
  }

  static mapWmoToState(wmoCode, isDaytime = true) {
    if (wmoCode === 0) {
      return {
        state: isDaytime ? 'sunny' : 'clear_night',
        title: isDaytime ? 'CLEAR / SUNNY' : 'CLEAR SKIES',
        desc: isDaytime ? 'GPS Location Verified • Fine & Sunny' : 'GPS Location Verified • Clear Night',
        color: isDaytime ? '#fbbf24' : '#38bdf8'
      };
    } else if (wmoCode >= 1 && wmoCode <= 3) {
      return {
        state: 'partly_cloudy',
        title: 'PARTLY CLOUDY',
        desc: 'GPS Location Verified • Scattered clouds',
        color: '#38bdf8'
      };
    } else if (wmoCode === 45 || wmoCode === 48) {
      return {
        state: 'partly_cloudy',
        title: 'FOGGY / MIST',
        desc: 'GPS Location Verified • Reduced visibility',
        color: '#94a3b8'
      };
    } else if (wmoCode >= 51 && wmoCode <= 67) {
      return {
        state: 'rain',
        title: 'RAIN SHOWERS',
        desc: 'GPS Location Verified • Active rain showers',
        color: '#60a5fa'
      };
    } else if (wmoCode >= 71 && wmoCode <= 86) {
      return {
        state: 'rain',
        title: 'SNOW / SLEET',
        desc: 'GPS Location Verified • Winter precipitation',
        color: '#93c5fd'
      };
    } else if (wmoCode >= 95) {
      return {
        state: 'storm',
        title: 'THUNDERSTORM',
        desc: 'GPS Location Verified • Active thunderstorm warning',
        color: '#f43f5e'
      };
    }
    return null;
  }

  /**
   * Async sensor-fusion location forecast combining physical sensors + GPS location feed
   */
  static async getForecastStateAsync(pressureHpa, trendHpa = 0, isDaytime = true, windDirDeg = null, lat = null, lon = null, sensorData = null) {
    const localSensorState = this.getForecastState(pressureHpa, trendHpa, isDaytime, windDirDeg, sensorData);

    // If live rain or severe wind storm is detected by physical sensors, prioritize live sensor reading over API
    if (localSensorState.state === 'rain' || localSensorState.state === 'storm') {
      return localSensorState;
    }

    if (lat && lon) {
      const gpsState = await this.fetchLocationForecast(lat, lon);
      if (gpsState) {
        // If remote API claims clear or partly cloudy, but local physical sensors indicate high humidity or rain stats, override API
        const humidity = sensorData ? Number(sensorData.outdoorHumidity) : null;
        const rainVal = sensorData ? Number(sensorData.rainRate || sensorData.piezoRainRateMm || 0) : 0;
        if (rainVal > 0 || (humidity !== null && humidity >= 90 && trendHpa <= 0)) {
          return localSensorState;
        }

        if (trendHpa < -1.8) {
          return {
            state: 'storm',
            title: 'STORMY / GALE',
            desc: 'Barometer Alert • Rapid pressure drop detected!',
            color: '#f43f5e',
            isDaytime
          };
        }
        return gpsState;
      }
    }

    return localSensorState;
  }

  /**
   * Calculate high-accuracy local forecast state based on multi-sensor fusion:
   * Solar Radiation, UV Index, Rain Rate, Wind Speed/Gust, Barometric Pressure & 3-hour trend, and Daytime/Nighttime
   */
  static getForecastState(pressureHpa, trendHpa = 0, isDaytime = true, windDirDeg = null, sensorData = null) {
    const p = pressureHpa || 1013.25;
    const data = sensorData || {};

    const solar = (data.solarRadiation !== undefined && data.solarRadiation !== null) ? Number(data.solarRadiation) : null;
    const uv = (data.uvIndex !== undefined && data.uvIndex !== null) ? Number(data.uvIndex) : null;
    const piezoRate = (data.piezoRainRateMm !== undefined && data.piezoRainRateMm !== null) ? Number(data.piezoRainRateMm) : 0;
    const rainRate = (data.rainRate !== undefined && data.rainRate !== null) ? Number(data.rainRate) : piezoRate;
    const rain1h = (data.rain1h !== undefined && data.rain1h !== null) ? Number(data.rain1h) : 0;
    const dailyRain = (data.dailyRain !== undefined && data.dailyRain !== null) ? Number(data.dailyRain) : 0;
    const gust = (data.windGust !== undefined && data.windGust !== null) ? Number(data.windGust) : 0;
    const speed = (data.windSpeed !== undefined && data.windSpeed !== null) ? Number(data.windSpeed) : 0;
    const humidity = (data.outdoorHumidity !== undefined && data.outdoorHumidity !== null) ? Number(data.outdoorHumidity) : null;

    // 1. PHYSICAL RAIN SENSOR ALERT
    const isRaining = (rainRate > 0 || piezoRate > 0);
    if (isRaining) {
      const activeRate = Math.max(rainRate, piezoRate);
      if (gust > 13.0 || speed > 10.0 || trendHpa < -1.2) {
        return {
          state: 'storm',
          title: 'HEAVY RAIN / STORM',
          desc: `Rain Sensor Alert • Active rainfall & gusting winds (${gust} m/s)`,
          color: '#f43f5e',
          isDaytime
        };
      }
      return {
        state: 'rain',
        title: 'ACTIVE RAINFALL',
        desc: `Rain Sensor Alert • Active rainfall detected (${activeRate.toFixed(1)} mm/h)`,
        color: '#60a5fa',
        isDaytime
      };
    }

    if (humidity !== null && humidity >= 92 && trendHpa < 0) {
      return {
        state: 'rain',
        title: 'DRIZZLE / RAIN SHOWERS',
        desc: `Humidity Sensor Alert • Near saturation (${humidity}%) & falling pressure`,
        color: '#60a5fa',
        isDaytime
      };
    }

    // 2. HIGH WIND GALE ALERT FROM ANEMOMETER
    if (gust >= 15.0 || speed >= 11.0) {
      return {
        state: 'storm',
        title: 'GALE / HIGH WINDS',
        desc: `Wind Sensor Alert • Peak gust ${gust} m/s (${Math.round(gust * 2.237)} mph)`,
        color: '#f43f5e',
        isDaytime
      };
    }

    // 3. DAYTIME SOLAR RADIATION & UV SENSOR ANALYSIS
    if (isDaytime) {
      if (solar !== null && solar >= 380) {
        return {
          state: 'sunny',
          title: 'CLEAR & SUNNY',
          desc: `Solar Sensor Verified • High solar irradiance (${solar} W/m²)`,
          color: '#fbbf24',
          isDaytime
        };
      }
      if (uv !== null && uv >= 3.5) {
        return {
          state: 'sunny',
          title: 'CLEAR & SUNNY',
          desc: `UV Sensor Verified • Strong solar UV Index (${uv})`,
          color: '#fbbf24',
          isDaytime
        };
      }
      if (solar !== null && solar > 140 && solar < 380) {
        return {
          state: 'partly_cloudy',
          title: 'PARTLY CLOUDY',
          desc: `Solar Sensor Verified • Moderate solar irradiance (${solar} W/m²)`,
          color: '#38bdf8',
          isDaytime
        };
      }
      if (solar !== null && solar <= 140 && (new Date().getHours() >= 10 && new Date().getHours() <= 16)) {
        return {
          state: 'partly_cloudy',
          title: 'OVERCAST / CLOUDY',
          desc: `Solar Sensor Verified • Dense cloud cover (${solar} W/m²)`,
          color: '#94a3b8',
          isDaytime
        };
      }
    } else {
      // 4. NIGHTTIME HUMIDITY & BAROMETER ANALYSIS
      if (p >= 1012.0 && humidity !== null && humidity < 85) {
        return {
          state: 'clear_night',
          title: 'CLEAR NIGHT',
          desc: `Sensors Verified • Clear starry night (${humidity}% humidity)`,
          color: '#38bdf8',
          isDaytime
        };
      }
      if (humidity !== null && humidity >= 92) {
        return {
          state: 'partly_cloudy',
          title: 'FOG / LOW STRATUS',
          desc: `Humidity Sensor Verified • High humidity (${humidity}%) & mist`,
          color: '#94a3b8',
          isDaytime
        };
      }
    }

    // 5. BAROMETRIC TREND & ZAMBRETTI ALGORITHM
    let isSoutherly = false;
    if (windDirDeg !== null && windDirDeg !== undefined) {
      isSoutherly = (windDirDeg >= 135 && windDirDeg <= 250);
    }
    const effectiveTrend = isSoutherly ? trendHpa - 0.2 : trendHpa;

    if (p >= 1012.0 && effectiveTrend >= -0.3) {
      return {
        state: isDaytime ? 'sunny' : 'clear_night',
        title: isDaytime ? 'CLEAR / SUNNY' : 'CLEAR SKIES',
        desc: effectiveTrend > 0.5 
          ? (isDaytime ? 'Rising pressure • Fine sunny weather' : 'Rising pressure • Fair night weather')
          : (isDaytime ? 'High pressure • Clear skies' : 'High pressure • Clear night skies'),
        color: isDaytime ? '#fbbf24' : '#38bdf8',
        isDaytime
      };
    } 

    if (p >= 1020 || effectiveTrend > 1.0) {
      return {
        state: isDaytime ? 'sunny' : 'clear_night',
        title: isDaytime ? 'CLEAR / SUNNY' : 'CLEAR SKIES',
        desc: isDaytime ? 'Rising pressure • Fair weather expected' : 'Rising pressure • Clear night skies expected',
        color: isDaytime ? '#fbbf24' : '#38bdf8',
        isDaytime
      };
    } 

    if ((p >= 1005 && effectiveTrend >= -0.8) || (effectiveTrend > 0.2 && p >= 980)) {
      return {
        state: 'partly_cloudy',
        title: effectiveTrend > 0.3 ? 'IMPROVING' : 'PARTLY CLOUDY',
        desc: effectiveTrend > 0.3 ? 'Rising pressure • Weather improving' : 'Steady pressure • Moderate cloudiness',
        color: '#38bdf8',
        isDaytime
      };
    } 

    if (p >= 995 || effectiveTrend >= -1.5) {
      return {
        state: 'rain',
        title: 'RAIN SHOWERS',
        desc: effectiveTrend >= 0 ? 'Low pressure • Rain showers / Unsettled' : 'Falling pressure • Precipitation likely',
        color: '#60a5fa',
        isDaytime
      };
    } 

    return {
      state: 'storm',
      title: 'STORMY / GALE',
      desc: 'Rapid pressure drop • Storm warning!',
      color: '#f43f5e',
      isDaytime
    };
  }

  /**
   * Render Animated Weather SVG Icon
   */
  static renderTrendIcon(containerId, forecastState) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const state = forecastState ? forecastState.state : 'partly_cloudy';

    let svgHtml = '';

    if (state === 'sunny') {
      svgHtml = `
        <div class="trend-icon-box sunny">
          <svg viewBox="0 0 100 100" class="svg-sun-anim">
            <circle cx="50" cy="50" r="30" fill="rgba(245, 158, 11, 0.25)" class="sun-back-pulse" />
            <circle cx="50" cy="50" r="20" fill="url(#sunGrad)" class="sun-back-pulse" />
            <defs>
              <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#fef08a" />
                <stop offset="100%" stop-color="#f59e0b" />
              </radialGradient>
            </defs>
          </svg>
        </div>
      `;
    } else if (state === 'clear_night') {
      svgHtml = `
        <div class="trend-icon-box clear-night">
          <svg viewBox="0 0 100 100" class="svg-moon-anim">
            <!-- Twinkling Night Stars -->
            <circle cx="22" cy="24" r="1.5" fill="#e2e8f0" opacity="0.85" />
            <circle cx="78" cy="22" r="1.8" fill="#e2e8f0" opacity="0.9" />
            <circle cx="82" cy="72" r="1.2" fill="#e2e8f0" opacity="0.75" />
            <!-- Glowing Crescent Moon -->
            <path d="M 52 24 A 24 24 0 1 0 74 70 A 19 19 0 1 1 52 24 Z" fill="#38bdf8" />
          </svg>
        </div>
      `;
    } else if (state === 'partly_cloudy') {
      const showMoon = (forecastState && forecastState.isDaytime === false);
      svgHtml = `
        <div class="trend-icon-box partly">
          <svg viewBox="0 0 100 100" class="svg-cloud-anim">
            ${showMoon ? `
              <!-- Crescent Moon behind cloud -->
              <path d="M 32 18 A 14 14 0 1 0 46 44 A 11 11 0 1 1 32 18 Z" fill="#38bdf8" />
            ` : `
              <!-- Sun behind cloud -->
              <circle cx="38" cy="38" r="16" fill="#f59e0b" class="sun-back-pulse" />
            `}
            <!-- Cloud -->
            <path d="M 30,65 Q 20,65 20,53 Q 20,43 32,42 Q 38,30 52,32 Q 62,28 72,36 Q 80,38 80,50 Q 80,65 68,65 Z" 
                  fill="rgba(255,255,255,0.85)" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))" class="cloud-drift" />
          </svg>
        </div>
      `;
    } else if (state === 'rain') {
      svgHtml = `
        <div class="trend-icon-box rain">
          <svg viewBox="0 0 100 100" class="svg-rain-anim">
            <path d="M 25,50 Q 15,50 15,40 Q 15,30 26,29 Q 32,18 46,20 Q 56,16 66,24 Q 74,26 74,38 Q 74,50 62,50 Z" 
                  fill="#94a3b8" />
            <!-- Rain drops -->
            <line x1="30" y1="58" x2="25" y2="72" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" class="drop d1" />
            <line x1="48" y1="58" x2="43" y2="72" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" class="drop d2" />
            <line x1="66" y1="58" x2="61" y2="72" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" class="drop d3" />
          </svg>
        </div>
      `;
    } else {
      // Storm
      svgHtml = `
        <div class="trend-icon-box storm">
          <svg viewBox="0 0 100 100" class="svg-storm-anim">
            <path d="M 25,45 Q 15,45 15,35 Q 15,25 26,24 Q 32,13 46,15 Q 56,11 66,19 Q 74,21 74,33 Q 74,45 62,45 Z" 
                  fill="#475569" />
            <!-- Lightning bolt -->
            <polygon points="50,42 40,60 48,60 42,80 60,56 51,56" fill="#fef08a" class="bolt-flash" />
          </svg>
        </div>
      `;
    }

    container.innerHTML = svgHtml;
  }

  /**
   * Render Barometric Pressure Trend Arrow Icon (Up / Down / Steady)
   */
  static renderPressureTrendIcon(containerId, trendVal = 0) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let svgHtml = '';

    if (trendVal > 0.3) {
      // Rising Trend - Green Upward Arrow
      svgHtml = `
        <div class="trend-icon-box pressure-rising" title="Pressure Rising (+${trendVal} hPa/3h)">
          <svg viewBox="0 0 40 40" style="width: 28px; height: 28px;">
            <circle cx="20" cy="20" r="18" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" stroke-width="2.5" />
            <path d="M 20 9 L 10 21 L 16 21 L 16 30 L 24 30 L 24 21 L 30 21 Z" fill="#10b981" class="arrow-up-anim" />
          </svg>
        </div>
      `;
    } else if (trendVal < -0.3) {
      // Falling Trend - Red Downward Arrow
      svgHtml = `
        <div class="trend-icon-box pressure-falling" title="Pressure Falling (${trendVal} hPa/3h)">
          <svg viewBox="0 0 40 40" style="width: 28px; height: 28px;">
            <circle cx="20" cy="20" r="18" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="2.5" />
            <path d="M 20 31 L 10 19 L 16 19 L 16 10 L 24 10 L 24 19 L 30 19 Z" fill="#ef4444" class="arrow-down-anim" />
          </svg>
        </div>
      `;
    } else {
      // Steady Trend - Cyan Horizontal Double Arrow
      svgHtml = `
        <div class="trend-icon-box pressure-steady" title="Pressure Steady (±0.0 hPa/3h)">
          <svg viewBox="0 0 40 40" style="width: 28px; height: 28px;">
            <circle cx="20" cy="20" r="18" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" stroke-width="2.5" />
            <path d="M 10 20 L 17 13 L 17 17 L 23 17 L 23 13 L 30 20 L 23 27 L 23 23 L 17 23 L 17 27 Z" fill="#38bdf8" class="arrow-steady-anim" />
          </svg>
        </div>
      `;
    }

    container.innerHTML = svgHtml;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherTrendAnimator;
}
