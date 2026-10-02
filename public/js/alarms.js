/**
 * Smart Weather Alarms & Audio/Visual Notification System
 */

class WeatherAlarms {
  constructor() {
    this.soundEnabled = true;
    this.frostAlert = false;
    this.highWindAlert = false;
    this.stormAlert = false;
    this.lastRainTotal = null;
    this.audioCtx = null;
    this.currentAlertKeys = '';
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
  }

  playChime(type = 'warning') {
    if (!this.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'storm') {
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.6);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.6);
      } else {
        osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, this.audioCtx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.4);
      }
    } catch (e) {}
  }

  checkTelemetry(data, stats) {
    if (!data) return;

    const bannerContainer = document.getElementById('alarmBannerContainer');
    if (!bannerContainer) return;

    let alerts = [];

    // 1. Frost Alert (Outdoor Temp <= 0°C)
    if (data.outdoorTemp !== null && data.outdoorTemp <= 0.0) {
      alerts.push({
        id: 'frost',
        type: 'danger',
        icon: '❄️',
        title: 'FREEZING / FROST WARNING',
        message: `Outdoor temperature is ${data.outdoorTemp}°C. Watch for ice on roads and frozen pipes!`
      });
      if (!this.frostAlert) {
        this.frostAlert = true;
        this.playChime('warning');
      }
    } else {
      this.frostAlert = false;
    }

    // 2. High Wind Gust Alert (>= 11.2 m/s or 25 mph)
    if (data.windGust !== null && data.windGust >= 11.2) {
      alerts.push({
        id: 'wind',
        type: 'warning',
        icon: '💨',
        title: 'HIGH WIND GUST WARNING',
        message: `Peak wind gust recorded at ${WeatherUnits.formatWind(data.windGust)} (${data.windDirection})!`
      });
      if (!this.highWindAlert) {
        this.highWindAlert = true;
        this.playChime('warning');
      }
    } else {
      this.highWindAlert = false;
    }

    // 3. Barometric Pressure Drop (Storm Warning)
    if (data.relPressure !== null && data.relPressure < 995.0) {
      alerts.push({
        id: 'storm',
        type: 'danger',
        icon: '🌩️',
        title: 'LOW PRESSURE STORM ALERT',
        message: `Barometric pressure has dropped to ${WeatherUnits.formatPressure(data.relPressure)}. Storm conditions likely!`
      });
      if (!this.stormAlert) {
        this.stormAlert = true;
        this.playChime('storm');
      }
    } else {
      this.stormAlert = false;
    }

    // Render alert banners only when alert state or messages actually change
    if (alerts.length > 0) {
      const alertKeys = alerts.map(a => `${a.id}:${a.message}`).join('|');
      if (this.currentAlertKeys !== alertKeys) {
        this.currentAlertKeys = alertKeys;
        bannerContainer.innerHTML = alerts.map(a => `
          <div class="alarm-toast ${a.type}">
            <div style="font-size: 1.4rem;">${a.icon}</div>
            <div>
              <div style="font-weight: 700; font-size: 0.85rem;">${a.title}</div>
              <div style="font-size: 0.75rem; color: rgba(255,255,255,0.9);">${a.message}</div>
            </div>
          </div>
        `).join('');
        bannerContainer.style.display = 'flex';
      }
    } else {
      if (this.currentAlertKeys !== '') {
        this.currentAlertKeys = '';
        bannerContainer.innerHTML = '';
        bannerContainer.style.display = 'none';
      }
    }
  }
}
