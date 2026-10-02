/**
 * Weather Station Dashboard Application Controller
 * Realtime WebSocket Stream, Chart.js Analytics, and Historical Telemetry Table
 */

document.addEventListener('DOMContentLoaded', () => {
  let currentData = null;
  let historyData = [];
  let currentStats = null;
  let socket = null;
  let chartInstances = {};

  const alarms = new WeatherAlarms();

  // Helper function to safely update DOM text
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // --- KIOSK MODE TOGGLE ---
  const btnKiosk = document.getElementById('btnKiosk');
  if (btnKiosk) {
    btnKiosk.addEventListener('click', () => {
      document.body.classList.toggle('kiosk-mode');
      if (document.body.classList.contains('kiosk-mode')) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    });
  }

  // --- PAIR DEVICE BUTTON HANDLER ---
  const btnPairWebHID = document.getElementById('btnPairWebHID');
  if (btnPairWebHID) {
    btnPairWebHID.addEventListener('click', async () => {
      btnPairWebHID.textContent = '⏳ Pairing...';
      btnPairWebHID.disabled = true;

      // 1. Instruct Server Backend to Re-scan Physical USB Console
      try {
        const res = await fetch('/api/weather/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'usb' })
        });
        const json = await res.json();
        if (json.success) {
          alert('✅ Physical USB Weather Station Console successfully connected!');
          btnPairWebHID.textContent = '🔌 Pair Device';
          btnPairWebHID.disabled = false;
          return;
        }
      } catch (err) {
        console.warn('[Server USB Pair Error]', err);
      }

      // 2. Fallback Browser WebHID Pairing Popup
      if ('hid' in navigator) {
        try {
          const devices = await navigator.hid.requestDevice({
            filters: []
          });
          if (devices.length > 0) {
            const device = devices[0];
            await device.open();
            alert(`✅ WebHID Browser paired with ${device.productName || 'Fine Offset USB Console'}!`);
          }
        } catch (err) {
          alert('WebHID Pairing Notice: ' + err.message);
        }
      } else {
        alert('⚠️ USB Weather Station not detected.\n\nTip: Ensure the USB cable is firmly plugged into the PC running the Weather Station application.');
      }

      btnPairWebHID.textContent = '🔌 Pair Device';
      btnPairWebHID.disabled = false;
    });
  }

  // --- RESET USB BUTTON HANDLER ---
  const btnResetUSB = document.getElementById('btnResetUSB');
  if (btnResetUSB) {
    btnResetUSB.addEventListener('click', async () => {
      btnResetUSB.textContent = '⚡ Resetting...';
      btnResetUSB.disabled = true;

      try {
        const res = await fetch('/api/weather/usb/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'soft' })
        });
        const json = await res.json();
        if (json.success) {
          console.log('[USB Reset] Triggered successfully:', json.message);
        }
      } catch (err) {
        console.error('[USB Reset Error]', err);
        alert('⚠️ Failed to send USB reset command: ' + err.message);
      } finally {
        setTimeout(() => {
          btnResetUSB.textContent = '⚡ Reset USB';
          btnResetUSB.disabled = false;
        }, 3000);
      }
    });
  }

  // --- TAB NAVIGATION SYSTEM ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => {
        c.classList.remove('active');
        c.style.display = '';
      });

      btn.classList.add('active');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.classList.add('active');
      }

      if (targetId === 'tabAnalytics') renderCharts();
      if (targetId === 'tabHistory') renderHistoryTable();
      if (targetId === 'tabIntegrations') loadIntegrationSettings();
    });
  });

  // --- RADAR & LIGHTNING OVERLAY LAYER SWITCHER ---
  const radarPills = document.querySelectorAll('.radar-layer-pills .range-pill');
  const radarIframe = document.getElementById('radarIframe');

  if (radarPills.length > 0 && radarIframe) {
    radarPills.forEach(pill => {
      pill.addEventListener('click', () => {
        radarPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        let url = pill.getAttribute('data-url');
        if (typeof Astronomy !== 'undefined' && Astronomy.userLat && Astronomy.userLon) {
          const lat = Number(Astronomy.userLat).toFixed(4);
          const lon = Number(Astronomy.userLon).toFixed(4);

          if (url.includes('rainviewer.com')) {
            const isSat = pill.id === 'btnSatelliteClouds';
            url = `https://www.rainviewer.com/map.html?loc=${lat},${lon},7&o=83&${isSat ? 'c=3' : 'c=1'}&l=1&v=1&sm=1&sn=1`;
          } else if (url.includes('blitzortung.org')) {
            url = `https://map.blitzortung.org/#7/${lat}/${lon}`;
          } else if (url.includes('windy.com')) {
            url = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&detailMode=false&zoom=7&level=surface&overlay=radar&product=radar&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
          }
        }
        radarIframe.src = url;
      });
    });
  }

  // --- UNIT SELECTION LISTENERS ---
  const unitTemp = document.getElementById('unitTemp');
  const unitPressure = document.getElementById('unitPressure');
  const unitWind = document.getElementById('unitWind');

  if (unitTemp) {
    unitTemp.value = WeatherUnits.tempUnit;
    unitTemp.addEventListener('change', (e) => {
      WeatherUnits.tempUnit = e.target.value;
      if (currentData) updateUI(currentData);
    });
  }

  if (unitPressure) {
    unitPressure.value = WeatherUnits.pressureUnit;
    unitPressure.addEventListener('change', (e) => {
      WeatherUnits.pressureUnit = e.target.value;
      if (currentData) updateUI(currentData);
    });
  }

  if (unitWind) {
    unitWind.value = WeatherUnits.windUnit;
    unitWind.addEventListener('change', (e) => {
      WeatherUnits.windUnit = e.target.value;
      if (currentData) updateUI(currentData);
    });
  }

  const unitDistance = document.getElementById('unitDistance');
  if (unitDistance) {
    unitDistance.value = WeatherUnits.distanceUnit;
    unitDistance.addEventListener('change', (e) => {
      WeatherUnits.distanceUnit = e.target.value;
      if (currentData) updateUI(currentData);
    });
  }

  // --- WEBSOCKET REALTIME STREAM ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('[WebSocket] Live stream connected.');
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'weather_update') {
          currentData = payload.data;
          currentStats = payload.stats;
          updateStatusIndicator(payload.mode, payload.data ? payload.data.source : null, payload.usbState, payload.ecowittState, payload.stationConfig);
          updateUI(payload.data, payload.rainStats, payload.pressureTrend3h);
          if (payload.stats) updateStatsUI(payload.stats);
          alarms.checkTelemetry(payload.data, payload.stats);
        }
      } catch (err) {
        console.error('[WebSocket] Parsing error:', err);
      }
    };

    socket.onclose = () => {
      console.log('[WebSocket] Connection closed. Reconnecting in 3s...');
      updateStatusIndicator('offline');
      setTimeout(initWebSocket, 3000);
    };

    socket.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
    };
  }

  function updateStatusIndicator(serverMode, source, usbState, ecowittState, stationConfig) {
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');
    if (!dot || !txt) return;

    const deviceType = (stationConfig && stationConfig.deviceType) || serverMode;

    if (deviceType === 'ecowitt_wittboy' || source === 'ecowitt_wittboy') {
      dot.className = 'status-dot live';
      const ageStr = (ecowittState && ecowittState.ageSeconds !== undefined && ecowittState.ageSeconds < 120) ? `${ecowittState.ageSeconds}s ago` : 'active';
      txt.textContent = `EcoWitt Wittboy (WS90) Live (${ageStr})`;
      return;
    }

    if (deviceType === 'simulation' || source === 'simulated') {
      dot.className = 'status-dot live';
      txt.textContent = 'Simulation Stream Active';
      return;
    }

    if (usbState && usbState.isResetting) {
      dot.className = 'status-dot';
      txt.textContent = '⚡ Resetting USB Connection...';
      return;
    }

    if (source === 'webhid_browser') {
      dot.className = 'status-dot live';
      txt.textContent = 'WebHID USB Connected';
      return;
    }

    const isLive = (source === 'usb_hardware') || (usbState && usbState.connected) || (usbState && usbState.ageSeconds < 20);

    if (isLive) {
      dot.className = 'status-dot live';
      const ageStr = (usbState && usbState.ageSeconds !== undefined && usbState.ageSeconds < 60) ? `${usbState.ageSeconds}s ago` : 'active';
      txt.textContent = `Live USB Connected (${ageStr})`;
    } else if (usbState && usbState.staleCount > 0) {
      dot.className = 'status-dot offline';
      txt.textContent = `⚠️ USB Stalled (Auto-Resetting #${usbState.staleCount})...`;
    } else {
      dot.className = 'status-dot offline';
      txt.textContent = 'USB Disconnected / Offline';
    }
  }

  // --- UI UPDATE CONTROLLER ---
  function updateUI(data, rainStats, pressureTrend3h) {
    if (!data) return;

    // Outdoor Row
    setText('valOutdoorTemp', WeatherUnits.formatTemp(data.outdoorTemp));
    setText('valDewPoint', WeatherUnits.formatTemp(data.dewPoint));
    setText('valOutdoorHumidity', data.outdoorHumidity !== null ? `${data.outdoorHumidity}%` : '--');
    setText('valHeatIndex', WeatherUnits.formatTemp(data.heatIndex || data.outdoorTemp));

    // Barometric Pressure & 3-Hour Trend Indicator (Up/Down/Steady)
    setText('valRelPressure', WeatherUnits.formatPressure(data.relPressure));
    setText('valRelPressureSub', WeatherUnits.formatPressure(data.relPressure));
    setText('valAbsPressure', WeatherUnits.formatPressure(data.absPressure));
    
    const trendVal = (pressureTrend3h !== undefined && pressureTrend3h !== null) ? Number(pressureTrend3h) : 0;
    
    let trendBadgeText = '➡️ STEADY';
    let trendColor = '#38bdf8';
    let trendSubText = `${trendVal >= 0 ? '+' : ''}${trendVal} hPa / 3h`;

    if (trendVal > 0.3) {
      trendBadgeText = '📈 RISING';
      trendColor = '#10b981';
      trendSubText = `+${trendVal} hPa / 3h`;
    } else if (trendVal < -0.3) {
      trendBadgeText = '📉 FALLING';
      trendColor = '#ef4444';
      trendSubText = `${trendVal} hPa / 3h`;
    }

    setText('valPressureTrend', trendSubText);

    const forecastBadge = document.getElementById('badgeForecast');
    if (forecastBadge) {
      forecastBadge.textContent = trendBadgeText;
      forecastBadge.style.color = '#ffffff';
      forecastBadge.style.background = trendColor + '33';
      forecastBadge.style.border = `1px solid ${trendColor}66`;
    }

    if (typeof WeatherTrendAnimator !== 'undefined') {
      // Header Pressure Trend Arrow Icon (Up / Down / Steady)
      WeatherTrendAnimator.renderPressureTrendIcon('trendAnimBox', trendVal);
    }

    // Rainfall Calculations (Daily Reset at Midnight, 1-Hour, 24-Hour, Rate & Lifetime)
    let dailyRainVal = (rainStats && rainStats.dailyRain !== undefined) ? rainStats.dailyRain : 0.0;
    let rain1hVal = (rainStats && rainStats.rain1h !== undefined) ? rainStats.rain1h : 0.0;
    let rain24hVal = (rainStats && rainStats.rain24h !== undefined) ? rainStats.rain24h : 0.0;
    let rainRateVal = (rainStats && rainStats.rainRate !== undefined) ? rainStats.rainRate : 0.0;
    let lifetimeRainVal = (rainStats && rainStats.lifetimeRain !== undefined) ? rainStats.lifetimeRain : (data.totalRainMm || 0.0);

    if (data.source === 'ecowitt_wittboy' || (data.piezoDailyRainMm !== undefined && data.piezoDailyRainMm !== null)) {
      if (data.piezoDailyRainMm !== undefined && data.piezoDailyRainMm !== null) {
        dailyRainVal = data.piezoDailyRainMm;
      }
      if (data.piezoRainRateMm !== undefined && data.piezoRainRateMm !== null) {
        rainRateVal = data.piezoRainRateMm;
      }
    }

    setText('valDailyRain', WeatherUnits.formatRain(dailyRainVal));
    setText('valRain1h', WeatherUnits.formatRain(rain1hVal));
    setText('valRain24h', WeatherUnits.formatRain(rain24hVal));
    setText('valRainRate', WeatherUnits.formatRain(rainRateVal) + '/h');
    setText('valLifetimeRain', WeatherUnits.formatRain(lifetimeRainVal));

    // Indoor Row
    setText('valIndoorTemp', WeatherUnits.formatTemp(data.indoorTemp));
    setText('valIndoorHumidity', data.indoorHumidity !== null ? `${data.indoorHumidity}%` : '--');

    // Comfort & Mold Index
    const comfort = calculateComfortIndex(data.indoorTemp, data.indoorHumidity);
    const comfortEl = document.getElementById('valComfortStatus');
    if (comfortEl) {
      comfortEl.textContent = comfort.status;
      comfortEl.style.color = comfort.color;
    }
    setText('valComfortDesc', comfort.desc);

    const mold = calculateMoldRisk(data.indoorHumidity);
    const moldEl = document.getElementById('valMoldRisk');
    if (moldEl) {
      moldEl.textContent = mold.risk;
      moldEl.style.color = mold.color;
    }
    setText('valMoldDesc', mold.desc);

    // Garage Environment Row
    const garageTemp = data.garageTemp !== undefined ? data.garageTemp : null;
    const garageHum = data.garageHumidity !== undefined ? data.garageHumidity : null;
    const garageDew = data.garageDewPoint !== undefined ? data.garageDewPoint : (garageTemp !== null && garageHum !== null ? WeatherUnits.calculateDewPoint(garageTemp, garageHum) : null);

    setText('valGarageTemp', WeatherUnits.formatTemp(garageTemp));
    setText('valGarageDewPoint', WeatherUnits.formatTemp(garageDew));
    setText('valGarageHumidity', garageHum !== null ? `${garageHum}%` : '--');

    const badgeGarageHum = document.getElementById('badgeGarageHum');
    if (badgeGarageHum) {
      if (garageHum !== null) {
        if (garageHum >= 75) { badgeGarageHum.textContent = 'HIGH HUMIDITY'; badgeGarageHum.style.background = 'rgba(245, 158, 11, 0.2)'; badgeGarageHum.style.color = '#f59e0b'; }
        else if (garageHum <= 35) { badgeGarageHum.textContent = 'DRY'; badgeGarageHum.style.background = 'rgba(56, 189, 248, 0.2)'; badgeGarageHum.style.color = '#38bdf8'; }
        else { badgeGarageHum.textContent = 'OK'; badgeGarageHum.style.background = 'rgba(16, 185, 129, 0.2)'; badgeGarageHum.style.color = '#10b981'; }
      }
    }

    // Garage Climate Alert Status (Freeze warning / Normal)
    const alertEl = document.getElementById('valGarageAlert');
    if (alertEl) {
      if (garageTemp !== null && garageTemp <= 0) {
        alertEl.textContent = '⚡ FREEZE WARNING';
        alertEl.style.color = '#ef4444';
        setText('valGarageAlertDesc', 'Garage temperature is below freezing!');
      } else if (garageHum !== null && garageHum >= 75) {
        alertEl.textContent = 'HIGH MOISTURE';
        alertEl.style.color = '#f59e0b';
        setText('valGarageAlertDesc', 'High humidity level in garage');
      } else if (garageTemp !== null) {
        alertEl.textContent = 'NORMAL';
        alertEl.style.color = '#34d399';
        setText('valGarageAlertDesc', 'Safe garage climate');
      } else {
        alertEl.textContent = 'NO SENSOR';
        alertEl.style.color = '#94a3b8';
        setText('valGarageAlertDesc', 'Awaiting EcoWitt sensor data');
      }
    }

    // Garage vs Indoor Temperature Delta
    if (garageTemp !== null && data.indoorTemp !== null && data.indoorTemp !== undefined) {
      const diff = Math.round((data.indoorTemp - garageTemp) * 10) / 10;
      const absDiffStr = WeatherUnits.formatTemp(Math.abs(diff));
      if (diff > 0) {
        setText('valGarageDelta', `-${absDiffStr}`);
        setText('valGarageDeltaDesc', `Garage is ${absDiffStr} cooler than indoor`);
      } else if (diff < 0) {
        setText('valGarageDelta', `+${absDiffStr}`);
        setText('valGarageDeltaDesc', `Garage is ${absDiffStr} warmer than indoor`);
      } else {
        setText('valGarageDelta', '0.0°');
        setText('valGarageDeltaDesc', 'Garage matches indoor temperature');
      }
    } else {
      setText('valGarageDelta', '--');
      setText('valGarageDeltaDesc', 'Comparing to house indoor temp');
    }

    // Downstairs Environment Row
    const downstairsTemp = data.downstairsTemp !== undefined ? data.downstairsTemp : null;
    const downstairsHum = data.downstairsHumidity !== undefined ? data.downstairsHumidity : null;
    const downstairsDew = data.downstairsDewPoint !== undefined ? data.downstairsDewPoint : (downstairsTemp !== null && downstairsHum !== null ? WeatherUnits.calculateDewPoint(downstairsTemp, downstairsHum) : null);

    setText('valDownstairsTemp', WeatherUnits.formatTemp(downstairsTemp));
    setText('valDownstairsDewPoint', WeatherUnits.formatTemp(downstairsDew));
    setText('valDownstairsHumidity', downstairsHum !== null ? `${downstairsHum}%` : '--');

    const badgeDownstairsHum = document.getElementById('badgeDownstairsHum');
    if (badgeDownstairsHum) {
      if (downstairsHum !== null) {
        if (downstairsHum >= 75) { badgeDownstairsHum.textContent = 'HIGH HUMIDITY'; badgeDownstairsHum.style.background = 'rgba(245, 158, 11, 0.2)'; badgeDownstairsHum.style.color = '#f59e0b'; }
        else if (downstairsHum <= 35) { badgeDownstairsHum.textContent = 'DRY'; badgeDownstairsHum.style.background = 'rgba(56, 189, 248, 0.2)'; badgeDownstairsHum.style.color = '#38bdf8'; }
        else { badgeDownstairsHum.textContent = 'OK'; badgeDownstairsHum.style.background = 'rgba(16, 185, 129, 0.2)'; badgeDownstairsHum.style.color = '#10b981'; }
      }
    }

    // Downstairs Climate Alert Status (Cool warning / Normal)
    const alertDownstairsEl = document.getElementById('valDownstairsAlert');
    if (alertDownstairsEl) {
      if (downstairsTemp !== null && downstairsTemp <= 10) {
        alertDownstairsEl.textContent = 'CHILLY / COLD';
        alertDownstairsEl.style.color = '#38bdf8';
        setText('valDownstairsAlertDesc', 'Low temperature downstairs');
      } else if (downstairsHum !== null && downstairsHum >= 75) {
        alertDownstairsEl.textContent = 'HIGH MOISTURE';
        alertDownstairsEl.style.color = '#f59e0b';
        setText('valDownstairsAlertDesc', 'High humidity level downstairs');
      } else if (downstairsTemp !== null) {
        alertDownstairsEl.textContent = 'NORMAL';
        alertDownstairsEl.style.color = '#34d399';
        setText('valDownstairsAlertDesc', 'Optimal downstairs climate');
      } else {
        alertDownstairsEl.textContent = 'NO SENSOR';
        alertDownstairsEl.style.color = '#94a3b8';
        setText('valDownstairsAlertDesc', 'Awaiting EcoWitt sensor data');
      }
    }

    // Downstairs vs Indoor Temperature Delta
    if (downstairsTemp !== null && data.indoorTemp !== null && data.indoorTemp !== undefined) {
      const diff = Math.round((data.indoorTemp - downstairsTemp) * 10) / 10;
      const absDiffStr = WeatherUnits.formatTemp(Math.abs(diff));
      if (diff > 0) {
        setText('valDownstairsDelta', `-${absDiffStr}`);
        setText('valDownstairsDeltaDesc', `Downstairs is ${absDiffStr} cooler than main indoor`);
      } else if (diff < 0) {
        setText('valDownstairsDelta', `+${absDiffStr}`);
        setText('valDownstairsDeltaDesc', `Downstairs is ${absDiffStr} warmer than main indoor`);
      } else {
        setText('valDownstairsDelta', '0.0°');
        setText('valDownstairsDeltaDesc', 'Downstairs matches main indoor temperature');
      }
    } else {
      setText('valDownstairsDelta', '--');
      setText('valDownstairsDeltaDesc', 'Comparing to house indoor temp');
    }

    // Wind & Compass
    setText('valWindSpeed', WeatherUnits.formatWind(data.windSpeed));
    setText('valWindGust', WeatherUnits.formatWind(data.windGust));
    setText('valWindDirText', `${data.windDirection} (${data.windDirectionDeg || 0}°)`);

    // Render Wind Compass SVG & Wind Rose Frequency Diagram
    WeatherGauges.renderCompassRose('windRoseSVG', data.windDirectionDeg, data.windSpeed);
    WeatherGauges.renderWindRoseDiagram('windRoseDiagramContainer', historyData, data);

    // Solar Radiation & UV Index (EcoWitt WS90)
    const solarRad = (data.solarRadiation !== undefined && data.solarRadiation !== null) ? data.solarRadiation : null;
    const uvIdx = (data.uvIndex !== undefined && data.uvIndex !== null) ? data.uvIndex : null;

    if (solarRad !== null || uvIdx !== null) {
      setText('valSolarRad', solarRad !== null ? `${solarRad} W/m²` : '-- W/m²');
      setText('valUvIndex', uvIdx !== null ? `${uvIdx}` : '--');
    }

    setText('valSolarRadCard', solarRad !== null ? `${solarRad} W/m²` : '-- W/m²');
    setText('valLuxEquiv', solarRad !== null ? `${Math.round(solarRad * 126.7)} lux` : '-- lux');

    setText('valUvIndexCard', uvIdx !== null ? `${uvIdx}` : '--');
    const uvBadge = document.getElementById('badgeUvLevel');
    let uvText = 'Low Risk', uvBadgeText = 'LOW', uvColor = '#10b981';
    if (uvIdx !== null) {
      if (uvIdx >= 11) { uvBadgeText = 'EXTREME'; uvText = 'Full Protection Req.'; uvColor = '#a855f7'; }
      else if (uvIdx >= 8) { uvBadgeText = 'VERY HIGH'; uvText = 'Avoid Midday Sun'; uvColor = '#ef4444'; }
      else if (uvIdx >= 6) { uvBadgeText = 'HIGH'; uvText = 'Seek Shade / SPF30+'; uvColor = '#f97316'; }
      else if (uvIdx >= 3) { uvBadgeText = 'MODERATE'; uvText = 'Wear Sunscreen'; uvColor = '#f59e0b'; }
    }
    if (uvBadge) {
      uvBadge.textContent = uvBadgeText;
      uvBadge.style.background = uvColor + '33';
      uvBadge.style.color = uvColor;
    }
    setText('valUvAdvice', uvText);

    // WS90 Piezo Rain
    const piezoRate = (data.piezoRainRateMm !== undefined && data.piezoRainRateMm !== null) ? data.piezoRainRateMm : null;
    const piezoDaily = (data.piezoDailyRainMm !== undefined && data.piezoDailyRainMm !== null) ? data.piezoDailyRainMm : (data.totalRainMm || 0);

    setText('valPiezoRainRateCard', piezoRate !== null ? (WeatherUnits.formatRain(piezoRate) + '/h') : (WeatherUnits.formatRain(rainRateVal) + '/h'));
    setText('valPiezoDailyRainCard', WeatherUnits.formatRain(piezoDaily));

    // WS90 Solar Supercapacitor & Battery
    const capVolt = (data.ws90CapacitorVolt !== undefined && data.ws90CapacitorVolt !== null) ? data.ws90CapacitorVolt : (data.source === 'ecowitt_wittboy' ? 4.8 : null);
    setText('valWs90CapVoltCard', capVolt !== null ? `${capVolt} V` : '-- V');

    const capBadge = document.getElementById('badgeCapStatus');
    let capBadgeText = 'SOLAR POWERED', capColor = '#10b981', capText = 'Solar Charged';
    if (capVolt !== null) {
      if (capVolt >= 4.5) { capBadgeText = 'FULLY CHARGED'; capColor = '#10b981'; capText = 'Supercap Fully Charged'; }
      else if (capVolt >= 3.0) { capBadgeText = 'NORMAL'; capColor = '#38bdf8'; capText = 'Normal Operation'; }
      else { capBadgeText = 'LOW CAPACITOR'; capColor = '#f59e0b'; capText = 'Low Solar Power'; }
    }
    if (capBadge) {
      capBadge.textContent = capBadgeText;
      capBadge.style.background = capColor + '33';
      capBadge.style.color = capColor;
    }
    setText('valCapChargeState', capText);
    setText('valWs90BattStatus', data.ws90BatteryStatus || 'Normal');

    // Ecowitt WH57 Lightning Detector
    const lightningDist = (data.lightningDistanceKm !== undefined && data.lightningDistanceKm !== null) ? data.lightningDistanceKm : null;
    const lightningCount = (data.lightningCountDay !== undefined && data.lightningCountDay !== null) ? data.lightningCountDay : 0;
    const lightningTime = data.lightningLastTime || null;

    setText('valLightningDistCard', lightningDist !== null ? WeatherUnits.formatDistance(lightningDist) : (lightningCount > 0 ? 'Strike logged' : '--'));
    setText('valLightningCountCard', `${lightningCount}`);

    let timeAgoStr = '--';
    if (lightningTime) {
      const diffMs = Date.now() - new Date(lightningTime).getTime();
      if (!isNaN(diffMs) && diffMs >= 0) {
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) timeAgoStr = 'Just now';
        else if (mins < 60) timeAgoStr = `${mins}m ago`;
        else if (mins < 1440) timeAgoStr = `${Math.floor(mins / 60)}h ago`;
        else timeAgoStr = new Date(lightningTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    setText('valLightningTimeCard', timeAgoStr);

    const lightningBadge = document.getElementById('badgeLightningStatus');
    if (lightningBadge) {
      if (lightningDist !== null && lightningDist <= 10) {
        lightningBadge.textContent = '⚡ NEARBY STRIKE';
        lightningBadge.style.background = 'rgba(239, 68, 68, 0.3)';
        lightningBadge.style.color = '#ef4444';
      } else if (lightningCount > 0) {
        lightningBadge.textContent = '⚡ STRIKES DETECTED';
        lightningBadge.style.background = 'rgba(245, 158, 11, 0.3)';
        lightningBadge.style.color = '#f59e0b';
      } else {
        lightningBadge.textContent = 'NO RECENT STRIKES';
        lightningBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        lightningBadge.style.color = '#10b981';
      }
    }

    setText('valWh57BattStatus', data.wh57BatteryStatus || 'Normal');

    // Update Moon Phase & Astronomy Card with Live Weather Trend Graphic (Rain / Sun / Clouds / Storm / Moon)
    const isDaytime = (typeof Astronomy !== 'undefined') ? Astronomy.getSolarTimes().isDaytime : true;
    const userLat = (typeof Astronomy !== 'undefined') ? Astronomy.userLat : null;
    const userLon = (typeof Astronomy !== 'undefined') ? Astronomy.userLon : null;

    if (typeof WeatherTrendAnimator !== 'undefined' && data.relPressure) {
      const mergedSensorData = { ...data, ...(rainStats || {}) };
      WeatherTrendAnimator.getForecastStateAsync(data.relPressure, trendVal, isDaytime, data.windDirectionDeg, userLat, userLon, mergedSensorData)
        .then(forecast => {
          updateAstronomyUI(forecast);
        });
    } else {
      updateAstronomyUI(null);
    }

    updateStatsUI(currentStats);
  }

  let sessionMinTemp = null, sessionMaxTemp = null;
  let sessionMinHum = null, sessionMaxHum = null;
  let sessionMinGarageTemp = null, sessionMaxGarageTemp = null;
  let sessionMinGarageHum = null, sessionMaxGarageHum = null;
  let sessionMinDownstairsTemp = null, sessionMaxDownstairsTemp = null;
  let sessionMinDownstairsHum = null, sessionMaxDownstairsHum = null;
  let sessionMaxSolar = null, sessionMaxUv = null;

  function updateStatsUI(stats) {
    if (!stats) stats = {};

    if (currentData) {
      if (stats.minOutdoorTemp === null || stats.minOutdoorTemp === undefined) {
        if (sessionMinTemp === null || currentData.outdoorTemp < sessionMinTemp) sessionMinTemp = currentData.outdoorTemp;
        stats.minOutdoorTemp = sessionMinTemp;
      }
      if (stats.maxOutdoorTemp === null || stats.maxOutdoorTemp === undefined) {
        if (sessionMaxTemp === null || currentData.outdoorTemp > sessionMaxTemp) sessionMaxTemp = currentData.outdoorTemp;
        stats.maxOutdoorTemp = sessionMaxTemp;
      }
      if (stats.minOutdoorHumidity === null || stats.minOutdoorHumidity === undefined) {
        if (sessionMinHum === null || currentData.outdoorHumidity < sessionMinHum) sessionMinHum = currentData.outdoorHumidity;
        stats.minOutdoorHumidity = sessionMinHum;
      }
      if (stats.maxOutdoorHumidity === null || stats.maxOutdoorHumidity === undefined) {
        if (sessionMaxHum === null || currentData.outdoorHumidity > sessionMaxHum) sessionMaxHum = currentData.outdoorHumidity;
        stats.maxOutdoorHumidity = sessionMaxHum;
      }

      if (currentData.garageTemp !== null && currentData.garageTemp !== undefined) {
        if (stats.minGarageTemp === null || stats.minGarageTemp === undefined) {
          if (sessionMinGarageTemp === null || currentData.garageTemp < sessionMinGarageTemp) sessionMinGarageTemp = currentData.garageTemp;
          stats.minGarageTemp = sessionMinGarageTemp;
        }
        if (stats.maxGarageTemp === null || stats.maxGarageTemp === undefined) {
          if (sessionMaxGarageTemp === null || currentData.garageTemp > sessionMaxGarageTemp) sessionMaxGarageTemp = currentData.garageTemp;
          stats.maxGarageTemp = sessionMaxGarageTemp;
        }
      }

      if (currentData.garageHumidity !== null && currentData.garageHumidity !== undefined) {
        if (stats.minGarageHumidity === null || stats.minGarageHumidity === undefined) {
          if (sessionMinGarageHum === null || currentData.garageHumidity < sessionMinGarageHum) sessionMinGarageHum = currentData.garageHumidity;
          stats.minGarageHumidity = sessionMinGarageHum;
        }
        if (stats.maxGarageHumidity === null || stats.maxGarageHumidity === undefined) {
          if (sessionMaxGarageHum === null || currentData.garageHumidity > sessionMaxGarageHum) sessionMaxGarageHum = currentData.garageHumidity;
          stats.maxGarageHumidity = sessionMaxGarageHum;
        }
      }

      if (currentData.downstairsTemp !== null && currentData.downstairsTemp !== undefined) {
        if (stats.minDownstairsTemp === null || stats.minDownstairsTemp === undefined) {
          if (sessionMinDownstairsTemp === null || currentData.downstairsTemp < sessionMinDownstairsTemp) sessionMinDownstairsTemp = currentData.downstairsTemp;
          stats.minDownstairsTemp = sessionMinDownstairsTemp;
        }
        if (stats.maxDownstairsTemp === null || stats.maxDownstairsTemp === undefined) {
          if (sessionMaxDownstairsTemp === null || currentData.downstairsTemp > sessionMaxDownstairsTemp) sessionMaxDownstairsTemp = currentData.downstairsTemp;
          stats.maxDownstairsTemp = sessionMaxDownstairsTemp;
        }
      }

      if (currentData.downstairsHumidity !== null && currentData.downstairsHumidity !== undefined) {
        if (stats.minDownstairsHumidity === null || stats.minDownstairsHumidity === undefined) {
          if (sessionMinDownstairsHum === null || currentData.downstairsHumidity < sessionMinDownstairsHum) sessionMinDownstairsHum = currentData.downstairsHumidity;
          stats.minDownstairsHumidity = sessionMinDownstairsHum;
        }
        if (stats.maxDownstairsHumidity === null || stats.maxDownstairsHumidity === undefined) {
          if (sessionMaxDownstairsHum === null || currentData.downstairsHumidity > sessionMaxDownstairsHum) sessionMaxDownstairsHum = currentData.downstairsHumidity;
          stats.maxDownstairsHumidity = sessionMaxDownstairsHum;
        }
      }
    }

    setText('statMinOutdoorTemp', WeatherUnits.formatTemp(stats.minOutdoorTemp));
    setText('statMaxOutdoorTemp', WeatherUnits.formatTemp(stats.maxOutdoorTemp));
    setText('statMinOutdoorHumidity', stats.minOutdoorHumidity !== null ? `${stats.minOutdoorHumidity}%` : '--');
    setText('statMaxOutdoorHumidity', stats.maxOutdoorHumidity !== null ? `${stats.maxOutdoorHumidity}%` : '--');

    setText('statMinGarageTemp', WeatherUnits.formatTemp(stats.minGarageTemp));
    setText('statMaxGarageTemp', WeatherUnits.formatTemp(stats.maxGarageTemp));
    setText('statMinGarageHumidity', stats.minGarageHumidity !== null ? `${stats.minGarageHumidity}%` : '--');
    setText('statMaxGarageHumidity', stats.maxGarageHumidity !== null ? `${stats.maxGarageHumidity}%` : '--');

    setText('statMinDownstairsTemp', WeatherUnits.formatTemp(stats.minDownstairsTemp));
    setText('statMaxDownstairsTemp', WeatherUnits.formatTemp(stats.maxDownstairsTemp));
    setText('statMinDownstairsHumidity', stats.minDownstairsHumidity !== null ? `${stats.minDownstairsHumidity}%` : '--');
    setText('statMaxDownstairsHumidity', stats.maxDownstairsHumidity !== null ? `${stats.maxDownstairsHumidity}%` : '--');

    setText('statMinRelPressure', WeatherUnits.formatPressure(stats.minRelPressure));
    setText('statMaxRelPressure', WeatherUnits.formatPressure(stats.maxRelPressure));

    let maxSolarRad = (stats && stats.maxSolarRadiation !== undefined && stats.maxSolarRadiation !== null) ? stats.maxSolarRadiation : null;
    let maxUv = (stats && stats.maxUvIndex !== undefined && stats.maxUvIndex !== null) ? stats.maxUvIndex : null;

    if (currentData) {
      if (currentData.solarRadiation !== null && currentData.solarRadiation !== undefined) {
        if (sessionMaxSolar === null || currentData.solarRadiation > sessionMaxSolar) sessionMaxSolar = currentData.solarRadiation;
        if (maxSolarRad === null || sessionMaxSolar > maxSolarRad) maxSolarRad = sessionMaxSolar;
      }
      if (currentData.uvIndex !== null && currentData.uvIndex !== undefined) {
        if (sessionMaxUv === null || currentData.uvIndex > sessionMaxUv) sessionMaxUv = currentData.uvIndex;
        if (maxUv === null || sessionMaxUv > maxUv) maxUv = sessionMaxUv;
      }
    }

    setText('statMaxSolarRad', maxSolarRad !== null ? `${maxSolarRad} W/m²` : '-- W/m²');
    setText('statMaxUvIndex', maxUv !== null ? `${maxUv}` : '--');

    // Position Spectrum Markers
    if (currentData && stats.minOutdoorTemp !== null && stats.maxOutdoorTemp !== null) {
      const range = (stats.maxOutdoorTemp - stats.minOutdoorTemp) || 1;
      const pct = Math.max(0, Math.min(100, ((currentData.outdoorTemp - stats.minOutdoorTemp) / range) * 100));
      const marker = document.getElementById('spectrumTempMarker');
      if (marker) marker.style.left = `${pct}%`;
    }

    if (currentData && stats.minOutdoorHumidity !== null && stats.maxOutdoorHumidity !== null) {
      const range = (stats.maxOutdoorHumidity - stats.minOutdoorHumidity) || 1;
      const pct = Math.max(0, Math.min(100, ((currentData.outdoorHumidity - stats.minOutdoorHumidity) / range) * 100));
      const marker = document.getElementById('spectrumHumMarker');
      if (marker) marker.style.left = `${pct}%`;
    }

    if (currentData && currentData.relPressure !== null && stats.minRelPressure !== null && stats.maxRelPressure !== null) {
      const range = (stats.maxRelPressure - stats.minRelPressure) || 1;
      const pct = Math.max(0, Math.min(100, ((currentData.relPressure - stats.minRelPressure) / range) * 100));
      const marker = document.getElementById('spectrumPressureMarker');
      if (marker) marker.style.left = `${pct}%`;
    }

    if (currentData && currentData.garageTemp !== null && stats.minGarageTemp !== null && stats.maxGarageTemp !== null) {
      const range = (stats.maxGarageTemp - stats.minGarageTemp) || 1;
      const pct = Math.max(0, Math.min(100, ((currentData.garageTemp - stats.minGarageTemp) / range) * 100));
      const marker = document.getElementById('spectrumGarageTempMarker');
      if (marker) marker.style.left = `${pct}%`;
    }

    if (currentData && currentData.garageHumidity !== null && stats.minGarageHumidity !== null && stats.maxGarageHumidity !== null) {
      const range = (stats.maxGarageHumidity - stats.minGarageHumidity) || 1;
      const pct = Math.max(0, Math.min(100, ((currentData.garageHumidity - stats.minGarageHumidity) / range) * 100));
      const marker = document.getElementById('spectrumGarageHumMarker');
      if (marker) marker.style.left = `${pct}%`;
    }

    if (currentData && currentData.downstairsTemp !== null && stats.minDownstairsTemp !== null && stats.maxDownstairsTemp !== null) {
      const range = (stats.maxDownstairsTemp - stats.minDownstairsTemp) || 1;
      const pct = Math.max(0, Math.min(100, ((currentData.downstairsTemp - stats.minDownstairsTemp) / range) * 100));
      const marker = document.getElementById('spectrumDownstairsTempMarker');
      if (marker) marker.style.left = `${pct}%`;
    }

    if (currentData && currentData.downstairsHumidity !== null && stats.minDownstairsHumidity !== null && stats.maxDownstairsHumidity !== null) {
      const range = (stats.maxDownstairsHumidity - stats.minDownstairsHumidity) || 1;
      const pct = Math.max(0, Math.min(100, ((currentData.downstairsHumidity - stats.minDownstairsHumidity) / range) * 100));
      const marker = document.getElementById('spectrumDownstairsHumMarker');
      if (marker) marker.style.left = `${pct}%`;
    }
  }

  function updateAstronomyUI(forecast) {
    const moon = Astronomy.getMoonPhase();
    const solar = Astronomy.getSolarTimes();

    setText('moonPhaseName', moon.phaseName);
    setText('moonIllumination', `${moon.illumination}%`);
    setText('moonAge', `${moon.ageDays} days`);

    setText('valSunrise', solar.sunrise);
    setText('valSunset', solar.sunset);
    setText('valDaylight', solar.dayLength);
    setText('valLocation', solar.locationCoords || '52.69°N, 2.03°W');
    setText('valAltitude', solar.altitudeStr || '140m (459 ft)');

    const celestialTag = document.getElementById('celestialTag');
    if (celestialTag) {
      if (forecast && forecast.title) {
        const iconPrefix = solar.isDaytime ? '☀️ ' : '🌙 ';
        celestialTag.textContent = iconPrefix + forecast.title;
        celestialTag.style.color = forecast.color || '#38bdf8';
        celestialTag.style.background = (forecast.color || '#38bdf8') + '22';
      } else {
        celestialTag.textContent = solar.isDaytime ? '☀️ DAYTIME' : '🌙 NIGHTTIME';
        celestialTag.style.color = solar.isDaytime ? '#f59e0b' : '#38bdf8';
        celestialTag.style.background = solar.isDaytime ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)';
      }
    }

    Astronomy.renderCelestialGraphic('celestialGraphicBox', solar.isDaytime, moon, forecast);
  }

  function calculateComfortIndex(tempC, humidity) {
    if (tempC === null || humidity === null) return { status: 'UNKNOWN', color: '#94a3b8', desc: 'No indoor data' };
    if (tempC >= 18 && tempC <= 24 && humidity >= 40 && humidity <= 60) {
      return { status: 'IDEAL COMFORT', color: '#34d399', desc: 'Optimal indoor temperature and moisture' };
    } else if (humidity > 65) {
      return { status: 'HUMID / STUFFY', color: '#38bdf8', desc: 'High indoor humidity level' };
    } else if (humidity < 35) {
      return { status: 'DRY AIR', color: '#f59e0b', desc: 'Low indoor moisture' };
    } else if (tempC > 25) {
      return { status: 'WARM / HOT', color: '#f43f5e', desc: 'Elevated room temperature' };
    } else {
      return { status: 'COOL', color: '#38bdf8', desc: 'Brisk room temperature' };
    }
  }

  function calculateMoldRisk(humidity) {
    if (humidity === null) return { risk: 'UNKNOWN', color: '#94a3b8', desc: 'No indoor data' };
    if (humidity >= 70) {
      return { risk: 'HIGH MOLD RISK', color: '#ef4444', desc: 'Humidity above 70% promotes mold growth!' };
    } else if (humidity >= 60) {
      return { risk: 'MODERATE RISK', color: '#f59e0b', desc: 'Elevated moisture level' };
    } else {
      return { risk: 'SAFE / LOW RISK', color: '#34d399', desc: 'Air moisture in safe range' };
    }
  }

  // --- HISTORICAL TELEMETRY LOGS TABLE RENDERER ---
  function renderHistoryTable() {
    fetch('/api/weather/history?limit=100')
      .then(res => res.json())
      .then(data => {
        historyData = data || [];
        const tbody = document.getElementById('tableHistoryBody');
        if (!tbody) return;

        if (historyData.length === 0) {
          tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:1.5rem; color:#94a3b8;">No historical telemetry records logged yet. Server logs entries every 30 seconds.</td></tr>';
          return;
        }

        tbody.innerHTML = historyData.slice().reverse().map(r => `
          <tr>
            <td>${new Date(r.timestamp).toLocaleTimeString()}</td>
            <td style="color:#f43f5e; font-weight:600;">${WeatherUnits.formatTemp(r.outdoorTemp)}</td>
            <td style="color:#06b6d4;">${r.outdoorHumidity !== null && r.outdoorHumidity !== undefined ? r.outdoorHumidity + '%' : '--'}</td>
            <td style="color:#34d399; font-weight:600;">${WeatherUnits.formatTemp(r.garageTemp)}</td>
            <td style="color:#38bdf8;">${r.garageHumidity !== null && r.garageHumidity !== undefined ? r.garageHumidity + '%' : '--'}</td>
            <td style="color:#10b981; font-weight:600;">${WeatherUnits.formatTemp(r.downstairsTemp)}</td>
            <td style="color:#0ea5e9;">${r.downstairsHumidity !== null && r.downstairsHumidity !== undefined ? r.downstairsHumidity + '%' : '--'}</td>
            <td style="color:#a855f7;">${WeatherUnits.formatPressure(r.relPressure)}</td>
            <td style="color:#10b981;">${WeatherUnits.formatWind(r.windSpeed)}</td>
            <td>${r.windDirection || '--'}</td>
            <td>${WeatherUnits.formatTemp(r.indoorTemp)}</td>
            <td>${r.indoorHumidity !== null && r.indoorHumidity !== undefined ? r.indoorHumidity + '%' : '--'}</td>
          </tr>
        `).join('');
      })
      .catch(e => console.error('[History Fetch Error]', e));
  }

  // --- CHART.JS TREND ANALYTICS RENDERER ---
  function renderCharts() {
    fetch('/api/weather/history?limit=100')
      .then(res => res.json())
      .then(data => {
        historyData = data || [];
        if (historyData.length === 0 && currentData) {
          historyData = [currentData];
        }

        if (historyData.length === 0) return;

        setText('titleChartTemp', `Outdoor & Indoor Temperature Trend (${WeatherUnits.getTempLabel()})`);
        setText('titleChartPressure', `Barometric Pressure Trend (${WeatherUnits.getPressureLabel()})`);
        setText('titleChartWind', `Wind Speed & Gust Trend (${WeatherUnits.getWindLabel()})`);

        const labels = historyData.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        // 1. Temp Chart
        createChart('chartTemp', labels, [
          { label: 'Outdoor Temp', data: historyData.map(r => WeatherUnits.getTempVal(r.outdoorTemp)), color: '#f43f5e' },
          { label: 'Indoor Temp', data: historyData.map(r => WeatherUnits.getTempVal(r.indoorTemp)), color: '#fb7185' }
        ], '°' + WeatherUnits.tempUnit);

        // 2. Pressure Chart
        createChart('chartPressure', labels, [
          { label: 'Rel Pressure', data: historyData.map(r => WeatherUnits.getPressureVal(r.relPressure)), color: '#a855f7' }
        ], WeatherUnits.pressureUnit);

        // 3. Wind Chart
        createChart('chartWind', labels, [
          { label: 'Wind Speed', data: historyData.map(r => WeatherUnits.getWindVal(r.windSpeed)), color: '#10b981' },
          { label: 'Wind Gust', data: historyData.map(r => WeatherUnits.getWindVal(r.windGust)), color: '#f59e0b' }
        ], WeatherUnits.getWindLabel());

        // 4. Humidity Chart
        createChart('chartHumidity', labels, [
          { label: 'Outdoor Hum', data: historyData.map(r => r.outdoorHumidity), color: '#06b6d4' },
          { label: 'Indoor Hum', data: historyData.map(r => r.indoorHumidity), color: '#38bdf8' },
          { label: 'Garage Hum', data: historyData.map(r => r.garageHumidity), color: '#a7f3d0' },
          { label: 'Downstairs Hum', data: historyData.map(r => r.downstairsHumidity), color: '#818cf8' }
        ], '%');

        // 5. Garage & Downstairs Climate Chart
        setText('titleChartGarage', `Garage & Downstairs Climate Trend (${WeatherUnits.getTempLabel()} & %)`);
        createChart('chartGarage', labels, [
          { label: 'Garage Temp', data: historyData.map(r => WeatherUnits.getTempVal(r.garageTemp)), color: '#34d399' },
          { label: 'Downstairs Temp', data: historyData.map(r => WeatherUnits.getTempVal(r.downstairsTemp)), color: '#818cf8' },
          { label: 'Garage Humidity', data: historyData.map(r => r.garageHumidity), color: '#38bdf8' },
          { label: 'Downstairs Humidity', data: historyData.map(r => r.downstairsHumidity), color: '#a78bfa' }
        ], '°' + WeatherUnits.tempUnit);
      })
      .catch(e => console.error('[Charts Fetch Error]', e));
  }

  function createChart(canvasId, labels, datasets, unitLabel) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }

    const ctx = canvas.getContext('2d');
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map(d => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: d.color + '22',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: labels.length > 30 ? 0 : 3
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : '--'} ${unitLabel}`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  // --- INTEGRATION SETTINGS CONTROLLER ---
  function updateStationDriverUI(deviceType) {
    const panelEcowitt = document.getElementById('panelEcowittSetup');
    const panelFineOffset = document.getElementById('panelFineOffsetSetup');
    const badge = document.getElementById('stationTypeBadge');

    if (panelEcowitt) panelEcowitt.style.display = deviceType === 'ecowitt_wittboy' ? 'block' : 'none';
    if (panelFineOffset) panelFineOffset.style.display = deviceType === 'fineoffset_usb' ? 'block' : 'none';
    if (badge) {
      if (deviceType === 'ecowitt_wittboy') {
        badge.textContent = 'EcoWitt Wittboy (WS90) Wi-Fi Hub';
        badge.style.background = 'rgba(56, 189, 248, 0.2)';
        badge.style.color = '#38bdf8';
      } else if (deviceType === 'simulation') {
        badge.textContent = 'Simulation Stream';
        badge.style.background = 'rgba(245, 158, 11, 0.2)';
        badge.style.color = '#f59e0b';
      } else {
        badge.textContent = 'Fine Offset Direct USB';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = '#10b981';
      }
    }
  }

  function fetchEcowittStatus() {
    fetch('/api/weather/ecowitt/status')
      .then(res => res.json())
      .then(st => {
        const ipEl = document.getElementById('ecowittServerIp');
        if (ipEl) ipEl.textContent = window.location.hostname || '127.0.0.1';

        if (st && st.stationInfo) {
          setText('infoEcowittModel', st.stationInfo.stationType || 'Wittboy WS90');
          setText('infoEcowittCapVolt', st.stationInfo.ws90CapacitorVolt ? `${st.stationInfo.ws90CapacitorVolt}V` : 'Normal');
          setText('infoEcowittBattery', st.stationInfo.ws90BatteryStatus || 'Normal');
          setText('infoEcowittLastSeen', st.lastSeen ? `${st.ageSeconds}s ago` : 'Never');
        }
      })
      .catch(() => {});
  }

  function loadIntegrationSettings() {
    fetch('/api/integrations/settings')
      .then(res => res.json())
      .then(config => {
        if (!config) return;

        if (config.station) {
          const selectDeviceType = document.getElementById('selectDeviceType');
          if (selectDeviceType) {
            selectDeviceType.value = config.station.deviceType || 'fineoffset_usb';
            updateStationDriverUI(config.station.deviceType || 'fineoffset_usb');
          }
        }
        fetchEcowittStatus();

        if (config.wunderground) {
          const wuEnabled = document.getElementById('wuEnabled');
          const wuStationId = document.getElementById('wuStationId');
          const wuStationKey = document.getElementById('wuStationKey');
          const wuInterval = document.getElementById('wuInterval');

          if (wuEnabled) wuEnabled.checked = !!config.wunderground.enabled;
          if (wuStationId) wuStationId.value = config.wunderground.stationId || '';
          if (wuStationKey) wuStationKey.value = config.wunderground.stationKey || '';
          if (wuInterval) wuInterval.value = String(config.wunderground.uploadIntervalMinutes || 5);
        }

        if (config.homeassistant) {
          const haEnabled = document.getElementById('haEnabled');
          const haBrokerUrl = document.getElementById('haBrokerUrl');
          const haUsername = document.getElementById('haUsername');
          const haPassword = document.getElementById('haPassword');

          if (haEnabled) haEnabled.checked = !!config.homeassistant.enabled;
          if (haBrokerUrl) haBrokerUrl.value = config.homeassistant.brokerUrl || 'mqtt://localhost:1883';
          if (haUsername) haUsername.value = config.homeassistant.username || '';
          if (haPassword) haPassword.value = config.homeassistant.password || '';
        }

        loadLocationSettings();
      })
      .catch(err => console.error('[Load Integration Settings Error]', err));
  }

  function loadLocationSettings() {
    fetch('/api/location/settings')
      .then(res => res.json())
      .then(loc => {
        if (!loc) return;
        const locCity = document.getElementById('locCityName');
        const locLat = document.getElementById('locLatitude');
        const locLon = document.getElementById('locLongitude');
        const locAlt = document.getElementById('locAltitude');

        if (locCity) locCity.value = loc.cityName || '';
        if (locLat) locLat.value = loc.latitude !== null && loc.latitude !== undefined ? loc.latitude : '';
        if (locLon) locLon.value = loc.longitude !== null && loc.longitude !== undefined ? loc.longitude : '';
        if (locAlt) locAlt.value = loc.altitudeMeters !== null && loc.altitudeMeters !== undefined ? loc.altitudeMeters : '';

        if (typeof Astronomy !== 'undefined') {
          Astronomy.setLocation(loc.latitude, loc.longitude, loc.altitudeMeters, loc.cityName);
          if (currentData) updateUI(currentData);
        }
      })
      .catch(err => console.error('[Load Location Settings Error]', err));
  }

  // Station Driver Selection & EcoWitt Form Submission Listener
  const selectDeviceType = document.getElementById('selectDeviceType');
  if (selectDeviceType) {
    selectDeviceType.addEventListener('change', (e) => {
      updateStationDriverUI(e.target.value);
    });
  }

  const formStationDriver = document.getElementById('formStationDriver');
  if (formStationDriver) {
    formStationDriver.addEventListener('submit', async (e) => {
      e.preventDefault();
      const deviceType = selectDeviceType ? selectDeviceType.value : 'fineoffset_usb';
      try {
        const res = await fetch('/api/integrations/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ station: { deviceType } })
        });
        const json = await res.json();
        if (json.success) {
          updateStationDriverUI(deviceType);
          fetchEcowittStatus();
          alert('✅ Weather Station hardware settings saved successfully!');
        } else {
          alert('⚠️ Failed to save station settings: ' + (json.error || 'Unknown error'));
        }
      } catch (err) {
        alert('⚠️ Error saving station settings: ' + err.message);
      }
    });
  }

  // Location Settings Form Submission Listener
  const formLocation = document.getElementById('formLocation');
  if (formLocation) {
    formLocation.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cityName = document.getElementById('locCityName').value.trim();
      const latitude = document.getElementById('locLatitude').value.trim();
      const longitude = document.getElementById('locLongitude').value.trim();
      const altitudeMeters = document.getElementById('locAltitude').value.trim();

      try {
        const res = await fetch('/api/location/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cityName, latitude, longitude, altitudeMeters })
        });
        const json = await res.json();
        if (json.success) {
          loadLocationSettings();
          alert('✅ Station location & elevation settings saved successfully!');
        } else {
          alert('⚠️ Failed to save location settings: ' + (json.error || 'Unknown error'));
        }
      } catch (err) {
        alert('⚠️ Error saving location settings: ' + err.message);
      }
    });
  }

  // Auto Detect Location Button Listener
  const btnAutoDetectLoc = document.getElementById('btnAutoDetectLoc');
  if (btnAutoDetectLoc) {
    btnAutoDetectLoc.addEventListener('click', async () => {
      btnAutoDetectLoc.textContent = '⏳ Detecting...';
      btnAutoDetectLoc.disabled = true;

      const runBackendGeoIP = async () => {
        try {
          const res = await fetch('/api/location/settings?auto=true');
          const loc = await res.json();
          if (loc && loc.latitude) {
            if (loc.cityName) document.getElementById('locCityName').value = loc.cityName;
            document.getElementById('locLatitude').value = loc.latitude;
            document.getElementById('locLongitude').value = loc.longitude;
            document.getElementById('locAltitude').value = loc.altitudeMeters || 140;

            if (typeof Astronomy !== 'undefined') {
              Astronomy.setLocation(loc.latitude, loc.longitude, loc.altitudeMeters, loc.cityName);
              if (currentData) updateUI(currentData);
            }
            alert(`✅ Auto-detected location via IP & Terrain: ${loc.latitude}°, ${loc.longitude}° (${loc.detectedLocation || 'UK'})`);
          } else {
            alert('⚠️ Auto-detection failed. Please enter coordinates manually.');
          }
        } catch (err) {
          alert('⚠️ Error auto-detecting location: ' + err.message);
        } finally {
          btnAutoDetectLoc.textContent = '📡 Auto Detect Location';
          btnAutoDetectLoc.disabled = false;
        }
      };

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lon = Number(pos.coords.longitude.toFixed(6));
            const alt = pos.coords.altitude ? Math.round(pos.coords.altitude) : null;

            document.getElementById('locLatitude').value = lat;
            document.getElementById('locLongitude').value = lon;
            if (alt) document.getElementById('locAltitude').value = alt;

            const currentCity = document.getElementById('locCityName').value.trim();

            if (typeof Astronomy !== 'undefined') {
              Astronomy.setLocation(lat, lon, alt, currentCity);
              if (currentData) updateUI(currentData);
            }

            btnAutoDetectLoc.textContent = '📡 Auto Detect Location';
            btnAutoDetectLoc.disabled = false;
            alert(`✅ Detected location via GPS: ${lat}°, ${lon}°`);
          },
          () => {
            runBackendGeoIP();
          },
          { timeout: 5000 }
        );
      } else {
        runBackendGeoIP();
      }
    });
  }

  // Weather Underground Form Submission Listener
  const formWU = document.getElementById('formWU');
  if (formWU) {
    formWU.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enabled = document.getElementById('wuEnabled').checked;
      const stationId = document.getElementById('wuStationId').value.trim();
      const stationKey = document.getElementById('wuStationKey').value.trim();
      const uploadIntervalMinutes = Number(document.getElementById('wuInterval').value) || 5;

      try {
        const res = await fetch('/api/integrations/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wunderground: { enabled, stationId, stationKey, uploadIntervalMinutes }
          })
        });
        const json = await res.json();
        if (json.success) {
          loadIntegrationSettings();
          alert('✅ Weather Underground settings saved successfully!');
        } else {
          alert('⚠️ Failed to save settings: ' + json.error);
        }
      } catch (err) {
        alert('⚠️ Error saving Weather Underground settings: ' + err.message);
      }
    });
  }

  // Home Assistant MQTT Form Submission Listener
  const formHA = document.getElementById('formHA');
  if (formHA) {
    formHA.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enabled = document.getElementById('haEnabled').checked;
      const brokerUrl = document.getElementById('haBrokerUrl').value.trim();
      const username = document.getElementById('haUsername').value.trim();
      const password = document.getElementById('haPassword').value.trim();

      try {
        const res = await fetch('/api/integrations/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homeassistant: { enabled, brokerUrl, username, password }
          })
        });
        const json = await res.json();
        if (json.success) {
          loadIntegrationSettings();
          alert('✅ Home Assistant MQTT settings saved successfully!');
        } else {
          alert('⚠️ Failed to save settings: ' + json.error);
        }
      } catch (err) {
        alert('⚠️ Error saving Home Assistant settings: ' + err.message);
      }
    });
  }

  // Server Shutdown Control Listener
  const btnShutdownServer = document.getElementById('btnShutdownServer');
  if (btnShutdownServer) {
    btnShutdownServer.addEventListener('click', async () => {
      if (confirm('Are you sure you want to stop and exit the Weather Station Hub server?')) {
        btnShutdownServer.disabled = true;
        btnShutdownServer.textContent = '⏳ Shutting down...';
        try {
          await fetch('/api/system/shutdown', { method: 'POST' });
          alert('🛑 Server has shut down. You can now close this browser tab.');
        } catch (err) {
          alert('Server process has stopped.');
        }
      }
    });
  }

  // --- INITIAL DATA FETCH ---
  fetch('/api/weather/current')
    .then(res => res.json())
    .then(res => {
      if (res.data) {
        currentData = res.data;
        currentStats = res.stats;
        updateStatusIndicator(res.mode, res.data.source, res.usbState);
        updateUI(res.data, res.rainStats, res.pressureTrend3h);
        if (res.stats) updateStatsUI(res.stats);
      }
    })
    .catch(err => console.error('[API Fetch Error]', err));

  fetch('/api/weather/history?range=24h')
    .then(res => res.json())
    .then(data => {
      historyData = data || [];
      if (currentData) updateUI(currentData);
    })
    .catch(err => console.warn('[Initial History Fetch Warning]', err));

  loadIntegrationSettings();
  initWebSocket();

  // --- POP-OUT TELEMETRY GRAPH MODAL CONTROLLER ---
  const graphModal = document.getElementById('graphModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const rangePills = document.querySelectorAll('.range-pill');

  let currentModalMetric = 'outdoorTemp';
  let currentModalRange = '24h';
  let modalChartInstance = null;

  // Bind click listener to all clickable tile cards
  const clickableCards = document.querySelectorAll('.card-clickable');
  clickableCards.forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      const metric = card.getAttribute('data-metric');
      if (metric) openMetricModal(metric);
    });
  });

  // Time Range Pill Listeners (1h, 24h, 7d, 30d, all)
  rangePills.forEach(pill => {
    pill.addEventListener('click', () => {
      rangePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentModalRange = pill.getAttribute('data-range') || '24h';
      loadModalData(currentModalMetric, currentModalRange);
    });
  });

  // Close modal event listeners
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeMetricModal);
  }

  if (graphModal) {
    graphModal.addEventListener('click', (e) => {
      if (e.target === graphModal) closeMetricModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && graphModal && graphModal.classList.contains('active')) {
      closeMetricModal();
    }
  });

  function openMetricModal(metricType) {
    currentModalMetric = metricType;
    if (graphModal) {
      graphModal.classList.add('active');
      graphModal.setAttribute('aria-hidden', 'false');
    }
    loadModalData(currentModalMetric, currentModalRange);
  }

  function closeMetricModal() {
    if (graphModal) {
      graphModal.classList.remove('active');
      graphModal.setAttribute('aria-hidden', 'true');
    }
  }

  function loadModalData(metricType, range) {
    fetch(`/api/weather/history?range=${range}`)
      .then(res => res.json())
      .then(records => {
        renderModalChart(records || [], metricType, range);
      })
      .catch(err => console.error('[Modal Data Error]', err));
  }

  function renderModalChart(records, metricType, range) {
    const canvas = document.getElementById('modalChartCanvas');
    const titleEl = document.getElementById('modalMetricTitle');
    const valEl = document.getElementById('modalCurrentVal');
    const statMin = document.getElementById('modalStatMin');
    const statAvg = document.getElementById('modalStatAvg');
    const statMax = document.getElementById('modalStatMax');

    if (!canvas) return;

    if (modalChartInstance) {
      modalChartInstance.destroy();
    }

    if (!records || records.length === 0) {
      if (currentData) records = [currentData];
      else records = [];
    }

    // Format timestamps for chart X-axis
    const labels = records.map(r => {
      const d = new Date(r.timestamp);
      if (range === '1h' || range === '24h') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
    });

    let titleText = 'Telemetry History';
    let currentValText = '--';
    let unitStr = '';
    let datasets = [];
    let primaryValues = [];

    if (metricType === 'outdoorTemp') {
      titleText = 'Outdoor Temperature History';
      unitStr = '°' + WeatherUnits.tempUnit;
      currentValText = currentData ? WeatherUnits.formatTemp(currentData.outdoorTemp) : '--';

      primaryValues = records.map(r => WeatherUnits.getTempVal(r.outdoorTemp)).filter(v => v !== null);
      datasets = [
        { label: 'Outdoor Temp', data: records.map(r => WeatherUnits.getTempVal(r.outdoorTemp)), color: '#f43f5e' },
        { label: 'Dew Point', data: records.map(r => WeatherUnits.getTempVal(r.dewPoint)), color: '#38bdf8' }
      ];
    } else if (metricType === 'outdoorHumidity') {
      titleText = 'Outdoor Humidity History';
      unitStr = '%';
      currentValText = currentData && currentData.outdoorHumidity !== null ? `${currentData.outdoorHumidity}%` : '--';

      primaryValues = records.map(r => r.outdoorHumidity).filter(v => v !== null);
      datasets = [
        { label: 'Outdoor Humidity', data: records.map(r => r.outdoorHumidity), color: '#06b6d4' },
        { label: 'Heat Index', data: records.map(r => WeatherUnits.getTempVal(r.heatIndex)), color: '#f59e0b' }
      ];
    } else if (metricType === 'solarRadiation') {
      titleText = 'Solar Radiation History';
      unitStr = 'W/m²';
      currentValText = (currentData && currentData.solarRadiation !== null && currentData.solarRadiation !== undefined) ? `${currentData.solarRadiation} W/m²` : '--';

      primaryValues = records.map(r => r.solarRadiation).filter(v => v !== null && v !== undefined);
      datasets = [
        { label: 'Solar Radiation', data: records.map(r => r.solarRadiation), color: '#f59e0b' }
      ];
    } else if (metricType === 'uvIndex') {
      titleText = 'UV Index History';
      unitStr = '';
      currentValText = (currentData && currentData.uvIndex !== null && currentData.uvIndex !== undefined) ? `${currentData.uvIndex}` : '--';

      primaryValues = records.map(r => r.uvIndex).filter(v => v !== null && v !== undefined);
      datasets = [
        { label: 'UV Index', data: records.map(r => r.uvIndex), color: '#e11d48' }
      ];
    } else if (metricType === 'piezoRain') {
      titleText = 'WS90 Piezoelectric Rain Rate History';
      unitStr = WeatherUnits.rainUnit === 'in' ? 'in/h' : 'mm/h';
      currentValText = (currentData && currentData.piezoRainRateMm !== null && currentData.piezoRainRateMm !== undefined) ? WeatherUnits.formatRain(currentData.piezoRainRateMm) + '/h' : '0.0 mm/h';

      primaryValues = records.map(r => WeatherUnits.getRainVal(r.piezoRainRateMm)).filter(v => v !== null && v !== undefined);
      datasets = [
        { label: 'Piezo Rain Rate', data: records.map(r => WeatherUnits.getRainVal(r.piezoRainRateMm)), color: '#06b6d4' }
      ];
    } else if (metricType === 'windDir') {
      titleText = 'Wind Direction History';
      unitStr = '°';
      currentValText = currentData ? `${currentData.windDirection} (${currentData.windDirectionDeg || 0}°)` : '--';

      primaryValues = records.map(r => r.windDirectionDeg).filter(v => v !== null && v !== undefined);
      datasets = [
        { label: 'Wind Direction', data: records.map(r => r.windDirectionDeg), color: '#f59e0b' }
      ];
    } else if (metricType === 'pressure') {
      titleText = 'Barometric Pressure History';
      unitStr = WeatherUnits.pressureUnit;
      currentValText = currentData ? WeatherUnits.formatPressure(currentData.relPressure) : '--';

      primaryValues = records.map(r => WeatherUnits.getPressureVal(r.relPressure)).filter(v => v !== null);
      datasets = [
        { label: 'Relative Pressure', data: records.map(r => WeatherUnits.getPressureVal(r.relPressure)), color: '#a855f7' },
        { label: 'Absolute Pressure', data: records.map(r => WeatherUnits.getPressureVal(r.absPressure)), color: '#c084fc' }
      ];
    } else if (metricType === 'rain') {
      titleText = 'Rainfall History';
      unitStr = WeatherUnits.rainUnit === 'in' ? 'in' : 'mm';
      currentValText = currentData ? WeatherUnits.formatRain(currentData.totalRainMm) : '--';

      primaryValues = records.map(r => WeatherUnits.getRainVal(r.totalRainMm)).filter(v => v !== null);
      datasets = [
        { label: 'Cumulative Rain', data: records.map(r => WeatherUnits.getRainVal(r.totalRainMm)), color: '#3b82f6' }
      ];
    } else if (metricType === 'indoorTemp') {
      titleText = 'Indoor Temperature History';
      unitStr = '°' + WeatherUnits.tempUnit;
      currentValText = currentData ? WeatherUnits.formatTemp(currentData.indoorTemp) : '--';

      primaryValues = records.map(r => WeatherUnits.getTempVal(r.indoorTemp)).filter(v => v !== null);
      datasets = [
        { label: 'Indoor Temp', data: records.map(r => WeatherUnits.getTempVal(r.indoorTemp)), color: '#fb7185' }
      ];
    } else if (metricType === 'indoorHumidity') {
      titleText = 'Indoor Humidity History';
      unitStr = '%';
      currentValText = currentData && currentData.indoorHumidity !== null ? `${currentData.indoorHumidity}%` : '--';

      primaryValues = records.map(r => r.indoorHumidity).filter(v => v !== null);
      datasets = [
        { label: 'Indoor Humidity', data: records.map(r => r.indoorHumidity), color: '#38bdf8' }
      ];
    } else if (metricType === 'garageTemp') {
      titleText = 'Garage Temperature History';
      unitStr = '°' + WeatherUnits.tempUnit;
      currentValText = currentData ? WeatherUnits.formatTemp(currentData.garageTemp) : '--';

      primaryValues = records.map(r => WeatherUnits.getTempVal(r.garageTemp)).filter(v => v !== null && v !== undefined);
      datasets = [
        { label: 'Garage Temp', data: records.map(r => WeatherUnits.getTempVal(r.garageTemp)), color: '#34d399' },
        { label: 'Garage Dew Point', data: records.map(r => WeatherUnits.getTempVal(r.garageDewPoint)), color: '#38bdf8' }
      ];
    } else if (metricType === 'garageHumidity') {
      titleText = 'Garage Humidity History';
      unitStr = '%';
      currentValText = currentData && currentData.garageHumidity !== null && currentData.garageHumidity !== undefined ? `${currentData.garageHumidity}%` : '--';

      primaryValues = records.map(r => r.garageHumidity).filter(v => v !== null && v !== undefined);
      datasets = [
        { label: 'Garage Humidity', data: records.map(r => r.garageHumidity), color: '#38bdf8' }
      ];
    } else if (metricType === 'wind') {
      titleText = 'Wind Speed & Gust History';
      unitStr = WeatherUnits.getWindLabel();
      currentValText = currentData ? WeatherUnits.formatWind(currentData.windSpeed) : '--';

      primaryValues = records.map(r => WeatherUnits.getWindVal(r.windSpeed)).filter(v => v !== null);
      datasets = [
        { label: 'Wind Speed', data: records.map(r => WeatherUnits.getWindVal(r.windSpeed)), color: '#10b981' },
        { label: 'Wind Gust', data: records.map(r => WeatherUnits.getWindVal(r.windGust)), color: '#f59e0b' }
      ];
    }

    if (titleEl) titleEl.textContent = titleText;
    if (valEl) valEl.textContent = currentValText;

    // Calculate Summary Stats for selected time range
    if (primaryValues.length > 0) {
      const minVal = Math.min(...primaryValues);
      let maxVal = Math.max(...primaryValues);
      const avgVal = primaryValues.reduce((a, b) => a + b, 0) / primaryValues.length;

      if (metricType === 'wind') {
        const gustValues = records.map(r => WeatherUnits.getWindVal(r.windGust)).filter(v => v !== null);
        if (gustValues.length > 0) {
          maxVal = Math.max(...gustValues);
        }
      }

      if (statMin) statMin.textContent = `${minVal.toFixed(1)} ${unitStr}`;
      if (statAvg) statAvg.textContent = `${avgVal.toFixed(1)} ${unitStr}`;
      if (statMax) statMax.textContent = `${maxVal.toFixed(1)} ${unitStr}`;
    } else {
      if (statMin) statMin.textContent = '--';
      if (statAvg) statAvg.textContent = '--';
      if (statMax) statMax.textContent = '--';
    }

    // Render Chart.js
    const ctx = canvas.getContext('2d');
    modalChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map(d => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: metricType === 'windDir' ? d.color : d.color + '1a',
          fill: metricType !== 'windDir',
          showLine: metricType !== 'windDir',
          tension: 0.35,
          borderWidth: metricType === 'windDir' ? 0 : 2.5,
          pointRadius: metricType === 'windDir' ? 3 : (labels.length > 40 ? 0 : 3),
          pointHoverRadius: 6
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#cbd5e1', font: { family: 'Outfit', size: 12, weight: '600' } }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            borderColor: 'rgba(56, 189, 248, 0.4)',
            borderWidth: 1,
            titleFont: { family: 'Outfit', size: 13, weight: '700' },
            bodyFont: { family: 'JetBrains Mono', size: 12 },
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : '--'} ${unitStr}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#64748b', font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            min: metricType === 'windDir' ? 0 : undefined,
            max: metricType === 'windDir' ? 360 : undefined,
            ticks: { 
              stepSize: metricType === 'windDir' ? 90 : undefined,
              color: '#94a3b8', 
              font: { size: 11 },
              callback: function(value) {
                if (metricType === 'windDir') {
                  if (value === 0 || value === 360) return 'N';
                  if (value === 90) return 'E';
                  if (value === 180) return 'S';
                  if (value === 270) return 'W';
                  return '';
                }
                return value;
              }
            },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }
});
