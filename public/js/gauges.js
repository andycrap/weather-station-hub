/**
 * Weather Gauges & Wind Compass SVG Component
 */

class WeatherGauges {
  /**
   * Render SVG Radial Gauge (2-Up 2-Down Layout)
   */
  static renderRadialGauge(elementId, value, min, max, unitLabel, colorGradient) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const numVal = (value !== null && value !== undefined && !isNaN(value)) ? Number(value) : null;
    const normalizedVal = Math.min(Math.max(numVal !== null ? numVal : min, min), max);
    const percent = (normalizedVal - min) / (max - min);

    const strokeDasharray = 339.29; // 2 * PI * r (r = 54)
    const strokeDashoffset = strokeDasharray * (1 - (percent * 0.666));

    const html = `
      <div style="position: relative; width: 115px; height: 115px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 120 120" style="width: 115px; height: 115px; display: block;">
          <defs>
            <linearGradient id="grad-${elementId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${colorGradient[0]}" />
              <stop offset="100%" stop-color="${colorGradient[1]}" />
            </linearGradient>
          </defs>

          <!-- Track Background -->
          <circle cx="60" cy="60" r="54" 
                  fill="none" 
                  stroke="rgba(255,255,255,0.08)" 
                  stroke-width="10" 
                  stroke-linecap="round"
                  stroke-dasharray="339.29"
                  stroke-dashoffset="113.1"
                  transform="rotate(135 60 60)" />

          <!-- Value Arc -->
          <circle cx="60" cy="60" r="54" 
                  fill="none" 
                  stroke="url(#grad-${elementId})" 
                  stroke-width="10" 
                  stroke-linecap="round"
                  stroke-dasharray="339.29"
                  stroke-dashoffset="${strokeDashoffset}"
                  transform="rotate(135 60 60)"
                  style="transition: stroke-dashoffset 0.8s ease;" />
        </svg>

        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; pointer-events: none;">
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.15rem; font-weight: 800; color: #ffffff; line-height: 1; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
            ${numVal !== null ? numVal.toFixed(1) : '--'}
          </div>
          <div style="font-size: 0.65rem; font-weight: 700; color: #38bdf8; margin-top: 3px; letter-spacing: 0.03em;">
            ${unitLabel}
          </div>
        </div>
      </div>
    `;
    el.innerHTML = html;
  }

  static renderTempGauge(elementId, tempC) {
    const val = (typeof WeatherUnits !== 'undefined') ? WeatherUnits.getTempVal(tempC) : tempC;
    const label = (typeof WeatherUnits !== 'undefined') ? WeatherUnits.getTempLabel() : '°C';
    this.renderRadialGauge(elementId, val, -10, 45, `TEMP (${label})`, ['#f43f5e', '#fb7185']);
  }

  static renderHumidityGauge(elementId, hum) {
    this.renderRadialGauge(elementId, hum, 0, 100, 'HUMIDITY (%)', ['#06b6d4', '#38bdf8']);
  }

  static renderPressureGauge(elementId, hPa) {
    const val = (typeof WeatherUnits !== 'undefined') ? WeatherUnits.getPressureVal(hPa) : hPa;
    const label = (typeof WeatherUnits !== 'undefined') ? WeatherUnits.getPressureLabel() : 'hPa';
    this.renderRadialGauge(elementId, val, 950, 1050, label, ['#a855f7', '#c084fc']);
  }

  static renderWindGauge(elementId, speedMs) {
    const val = (typeof WeatherUnits !== 'undefined') ? WeatherUnits.getWindVal(speedMs) : speedMs;
    const label = (typeof WeatherUnits !== 'undefined') ? WeatherUnits.getWindLabel() : 'mph';
    this.renderRadialGauge(elementId, val, 0, 40, `WIND (${label})`, ['#10b981', '#34d399']);
  }

  static renderCompassRose(elementId, degrees, speed) {
    this.renderWindCompass(elementId, degrees);
  }

  /**
   * Render 16-Point Cumulative Multi-Speed Stacked Wind Rose Polar Radar Diagram
   */
  /**
   * Render 16-Point Cumulative Multi-Speed Stacked Wind Rose Polar Radar Diagram
   */
  static renderWindRoseDiagram(containerId, historyRecords = [], currentData = null) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const sectorNames = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ];

    // Speed unit helpers from WeatherUnits (fallback to m/s if undefined)
    const hasUnits = typeof WeatherUnits !== 'undefined';
    const unitLabel = hasUnits ? WeatherUnits.getWindLabel() : 'm/s';

    // Base m/s thresholds (2.0 m/s and 5.0 m/s) converted to selected unit
    const speedVal1 = hasUnits ? WeatherUnits.getWindVal(2.0) : 2.0;
    const speedVal2 = hasUnits ? WeatherUnits.getWindVal(5.0) : 5.0;
    const fmtSpeed = (val) => Number(val.toFixed(1)).toString();
    const strSpeed1 = fmtSpeed(speedVal1);
    const strSpeed2 = fmtSpeed(speedVal2);

    // Counts matrix: 16 sectors x 3 speed bands [light (<2m/s), moderate (2-5m/s), strong (>=5m/s)]
    const counts = Array.from({ length: 16 }, () => [0, 0, 0]);
    let totalSamples = 0;

    let sampleData = (historyRecords && historyRecords.length > 0) ? historyRecords : (currentData ? [currentData] : []);

    sampleData.forEach(r => {
      let dirCode = r.windDirection;
      if (!dirCode && r.windDirectionDeg !== undefined && r.windDirectionDeg !== null) {
        const idx = Math.round((r.windDirectionDeg % 360) / 22.5) % 16;
        dirCode = sectorNames[idx];
      }

      if (dirCode) {
        const sIdx = sectorNames.indexOf(dirCode.toUpperCase());
        if (sIdx >= 0) {
          const speed = (r.windSpeed !== undefined && r.windSpeed !== null) ? Number(r.windSpeed) : 0;
          let speedBand = 0; // Light < 2.0 m/s
          if (speed >= 5.0) speedBand = 2; // Strong >= 5.0 m/s
          else if (speed >= 2.0) speedBand = 1; // Moderate 2.0-5.0 m/s

          counts[sIdx][speedBand]++;
          totalSamples++;
        }
      }
    });

    if (totalSamples === 0) {
      // Default fallback distribution if no samples logged yet
      counts[0] = [3, 2, 0]; counts[2] = [4, 3, 1]; counts[4] = [2, 2, 0];
      counts[8] = [3, 3, 0]; counts[10] = [5, 5, 2]; counts[12] = [4, 4, 1]; counts[14] = [3, 3, 1];
      totalSamples = 51;
    }

    // Cumulative percentages for each sector
    let maxCumulativePct = 0;
    let dominantIdx = 0;

    const sectorStats = counts.map((b, i) => {
      const cLight = b[0], cMod = b[1], cStrong = b[2];
      const cTotal = cLight + cMod + cStrong;
      const pctTotal = (cTotal / totalSamples) * 100;
      const pctLight = (cLight / totalSamples) * 100;
      const pctMod = (cMod / totalSamples) * 100;
      const pctStrong = (cStrong / totalSamples) * 100;

      if (pctTotal > maxCumulativePct) {
        maxCumulativePct = pctTotal;
        dominantIdx = i;
      }

      return { cTotal, pctTotal, pctLight, pctMod, pctStrong };
    });

    const dominantTag = document.getElementById('valDominantWind');
    if (dominantTag) {
      dominantTag.textContent = `${sectorNames[dominantIdx]} (${Math.round(maxCumulativePct)}% Cumulative)`;
    }

    // SVG Center & Radius geometry
    const cx = 100, cy = 100;
    const maxRadius = 76; // Outer ring radius
    const minRadius = 12; // Center hub radius

    // Scale factor: maxCumulativePct maps to maxRadius
    const maxScalePct = Math.max(20, Math.ceil(maxCumulativePct / 5) * 5); // 15%, 20%, 25%, 30%
    const scale = (maxRadius - minRadius) / maxScalePct;

    // Generate concentric grid rings (e.g. 5%, 10%, 15%, 20%, 25%)
    let gridRingsHtml = '';
    const stepPct = maxScalePct > 30 ? 10 : 5;
    for (let p = stepPct; p <= maxScalePct; p += stepPct) {
      const r = minRadius + (p * scale);
      gridRingsHtml += `
        <circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="rgba(56, 189, 248, 0.15)" stroke-width="1" stroke-dasharray="2 3" />
        <text x="${cx + 3}" y="${(cy - r + 3).toFixed(1)}" fill="rgba(148, 163, 184, 0.6)" font-size="7" font-weight="600">${p}%</text>
      `;
    }

    // Colors for speed bands (Light, Moderate, Strong)
    const bandColors = [
      { fill: 'rgba(52, 211, 153, 0.85)', stroke: '#34d399' }, // Light (#34d399 Emerald)
      { fill: 'rgba(6, 182, 212, 0.85)', stroke: '#06b6d4' },  // Moderate (#06b6d4 Cyan)
      { fill: 'rgba(245, 158, 11, 0.9)', stroke: '#f59e0b' }   // Strong (#f59e0b Amber)
    ];

    // Helper to build SVG wedge path between innerRadius and outerRadius
    function buildWedgePath(centerAngleDeg, rIn, rOut) {
      const startAngleDeg = centerAngleDeg - 10.5; // 21 degree wedge width
      const endAngleDeg = centerAngleDeg + 10.5;

      const startRad = (startAngleDeg * Math.PI) / 180;
      const endRad = (endAngleDeg * Math.PI) / 180;

      const x1 = cx + rIn * Math.cos(startRad);
      const y1 = cy + rIn * Math.sin(startRad);
      const x2 = cx + rOut * Math.cos(startRad);
      const y2 = cy + rOut * Math.sin(startRad);

      const x3 = cx + rOut * Math.cos(endRad);
      const y3 = cy + rOut * Math.sin(endRad);
      const x4 = cx + rIn * Math.cos(endRad);
      const y4 = cy + rIn * Math.sin(endRad);

      return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} A ${rOut.toFixed(1)} ${rOut.toFixed(1)} 0 0 1 ${x3.toFixed(1)} ${y3.toFixed(1)} L ${x4.toFixed(1)} ${y4.toFixed(1)} A ${rIn.toFixed(1)} ${rIn.toFixed(1)} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`;
    }

    // Generate 16 Sector Cumulative Multi-Speed Stacked Petals
    let petalsHtml = '';
    for (let i = 0; i < 16; i++) {
      const st = sectorStats[i];
      if (st.pctTotal <= 0) continue;

      const centerAngleDeg = i * 22.5 - 90;

      // Band 1: Light Wind
      const r0 = minRadius;
      const r1 = r0 + (st.pctLight * scale);

      // Band 2: Moderate Wind
      const r2 = r1 + (st.pctMod * scale);

      // Band 3: Strong Wind
      const r3 = r2 + (st.pctStrong * scale);

      const titleTooltip = `${sectorNames[i]}: ${st.pctTotal.toFixed(1)}% cumulative (${st.cTotal} samples)\n• Light (<${strSpeed1} ${unitLabel}): ${st.pctLight.toFixed(1)}%\n• Moderate (${strSpeed1}-${strSpeed2} ${unitLabel}): ${st.pctMod.toFixed(1)}%\n• Strong (>=${strSpeed2} ${unitLabel}): ${st.pctStrong.toFixed(1)}%`;

      if (st.pctLight > 0) {
        petalsHtml += `<path d="${buildWedgePath(centerAngleDeg, r0, r1)}" fill="${bandColors[0].fill}" stroke="${bandColors[0].stroke}" stroke-width="0.8"><title>${titleTooltip}</title></path>`;
      }
      if (st.pctMod > 0) {
        petalsHtml += `<path d="${buildWedgePath(centerAngleDeg, r1, r2)}" fill="${bandColors[1].fill}" stroke="${bandColors[1].stroke}" stroke-width="0.8"><title>${titleTooltip}</title></path>`;
      }
      if (st.pctStrong > 0) {
        petalsHtml += `<path d="${buildWedgePath(centerAngleDeg, r2, r3)}" fill="${bandColors[2].fill}" stroke="${bandColors[2].stroke}" stroke-width="0.8"><title>${titleTooltip}</title></path>`;
      }
    }

    const html = `
      <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
        <svg viewBox="0 0 200 200" style="width: 100%; height: 100%; max-width: 255px; max-height: 255px; display: block; overflow: visible;">
          <defs>
            <radialGradient id="roseBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(18, 26, 44, 0.95)" />
              <stop offset="100%" stop-color="rgba(11, 15, 25, 0.98)" />
            </radialGradient>
          </defs>

          <!-- Outer Background Ring -->
          <circle cx="${cx}" cy="${cy}" r="${maxRadius + 2}" fill="url(#roseBg)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1.5" />

          <!-- Concentric Percentage Grid Rings -->
          ${gridRingsHtml}

          <!-- 16 Direction Spokes Ticks -->
          ${sectorNames.map((name, i) => {
            const rad = ((i * 22.5 - 90) * Math.PI) / 180;
            const x1 = cx + minRadius * Math.cos(rad);
            const y1 = cy + minRadius * Math.sin(rad);
            const x2 = cx + maxRadius * Math.cos(rad);
            const y2 = cy + maxRadius * Math.sin(rad);
            return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1" />`;
          }).join('')}

          <!-- 16 Sector Cumulative Multi-Speed Stacked Petals -->
          ${petalsHtml}

          <!-- Center Hub Circle -->
          <circle cx="${cx}" cy="${cy}" r="${minRadius}" fill="#0b0f19" stroke="#38bdf8" stroke-width="1.5" />
          <circle cx="${cx}" cy="${cy}" r="3" fill="#10b981" />

          <!-- Cardinal Labels -->
          <text x="100" y="14" text-anchor="middle" fill="#f43f5e" font-size="12" font-weight="800">N</text>
          <text x="190" y="104" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="700">E</text>
          <text x="100" y="195" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="700">S</text>
          <text x="10" y="104" text-anchor="middle" fill="#94a3b8" font-size="11" font-weight="700">W</text>
        </svg>

        <!-- Cumulative Speed Bands Legend -->
        <div style="display: flex; gap: 0.6rem; font-size: 0.65rem; font-weight: 600; color: var(--text-muted); margin-top: -0.15rem;">
          <div style="display: flex; align-items: center; gap: 0.2rem;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #34d399; display: inline-block;"></span> &lt;${strSpeed1} ${unitLabel}</div>
          <div style="display: flex; align-items: center; gap: 0.2rem;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #06b6d4; display: inline-block;"></span> ${strSpeed1}-${strSpeed2} ${unitLabel}</div>
          <div style="display: flex; align-items: center; gap: 0.2rem;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; display: inline-block;"></span> &gt;${strSpeed2} ${unitLabel}</div>
        </div>
      </div>
    `;

    el.innerHTML = html;
  }

  /**
   * Render Enlarged 16-point SVG Wind Compass Rose (Auto-Scaling)
   */
  static renderWindCompass(elementId, degrees) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const angle = degrees || 0;

    const html = `
      <div class="compass-container" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
        <svg class="compass-svg" viewBox="0 0 200 200" style="width: 100%; height: 100%; max-width: 255px; max-height: 255px; display: block;">
          <defs>
            <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(18, 26, 44, 0.95)" />
              <stop offset="100%" stop-color="rgba(11, 15, 25, 0.98)" />
            </radialGradient>

            <filter id="needleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <!-- Outer Ring -->
          <circle cx="100" cy="100" r="92" fill="url(#compassBg)" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2" />
          <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1" stroke-dasharray="3 4" />

          <!-- Major Cardinals -->
          <text x="100" y="26" text-anchor="middle" fill="#f43f5e" font-size="15" font-weight="700">N</text>
          <text x="180" y="105" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">E</text>
          <text x="100" y="184" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">S</text>
          <text x="20" y="105" text-anchor="middle" fill="#94a3b8" font-size="14" font-weight="600">W</text>

          <!-- Intercardinals -->
          <text x="154" y="50" text-anchor="middle" fill="#64748b" font-size="11">NE</text>
          <text x="154" y="160" text-anchor="middle" fill="#64748b" font-size="11">SE</text>
          <text x="46" y="160" text-anchor="middle" fill="#64748b" font-size="11">SW</text>
          <text x="46" y="50" text-anchor="middle" fill="#64748b" font-size="11">NW</text>

          <!-- Rotating Compass Arrow -->
          <g class="compass-needle" style="transform: rotate(${angle}deg); transform-origin: 100px 100px; transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);">
            <polygon points="100,22 110,95 100,100" fill="#10b981" filter="url(#needleGlow)" />
            <polygon points="100,22 90,95 100,100" fill="#34d399" filter="url(#needleGlow)" />
            <polygon points="100,178 110,105 100,100" fill="#64748b" />
            <polygon points="100,178 90,105 100,100" fill="#475569" />
            <circle cx="100" cy="100" r="8" fill="#10b981" stroke="#ffffff" stroke-width="2" />
          </g>
        </svg>
      </div>
    `;
    el.innerHTML = html;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherGauges;
}
