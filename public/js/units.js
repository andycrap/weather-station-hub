/**
 * Weather Unit Conversions & Formatting Module
 */

const WeatherUnits = {
  // Current Preference State
  tempUnit: 'C',       // 'C' or 'F'
  pressureUnit: 'hPa', // 'hPa', 'inHg', 'mmHg'
  windUnit: 'mph',     // Default to 'mph'
  rainUnit: 'mm',      // 'mm', 'in'

  /**
   * Convert & Format Temperature
   */
  formatTemp(tempC, decimals = 1) {
    if (tempC === null || tempC === undefined || isNaN(tempC)) return '--';
    if (this.tempUnit === 'F') {
      const val = (tempC * 9 / 5) + 32;
      return `${val.toFixed(decimals)}°F`;
    }
    return `${Number(tempC).toFixed(decimals)}°C`;
  },

  getTempVal(tempC) {
    if (tempC === null || tempC === undefined || isNaN(tempC)) return null;
    if (this.tempUnit === 'F') return (tempC * 9 / 5) + 32;
    return tempC;
  },

  getTempLabel() {
    return `°${this.tempUnit}`;
  },

  /**
   * Convert & Format Pressure
   */
  formatPressure(hPa, decimals = 1) {
    if (hPa === null || hPa === undefined || isNaN(hPa)) return '--';
    if (this.pressureUnit === 'inHg') {
      const val = hPa * 0.02953;
      return `${val.toFixed(2)} inHg`;
    }
    if (this.pressureUnit === 'mmHg') {
      const val = hPa * 0.750062;
      return `${val.toFixed(1)} mmHg`;
    }
    return `${Number(hPa).toFixed(decimals)} hPa`;
  },

  getPressureVal(hPa) {
    if (hPa === null || hPa === undefined || isNaN(hPa)) return null;
    if (this.pressureUnit === 'inHg') return hPa * 0.02953;
    if (this.pressureUnit === 'mmHg') return hPa * 0.750062;
    return hPa;
  },

  getPressureLabel() {
    return this.pressureUnit;
  },

  /**
   * Convert & Format Wind Speed
   */
  formatWind(speedMs, decimals = 1) {
    if (speedMs === null || speedMs === undefined || isNaN(speedMs)) return '--';
    const val = this.getWindVal(speedMs);
    return `${val.toFixed(decimals)} ${this.getWindLabel()}`;
  },

  getWindVal(speedMs) {
    if (speedMs === null || speedMs === undefined || isNaN(speedMs)) return null;
    if (this.windUnit === 'mph') return speedMs * 2.23694;
    if (this.windUnit === 'kmh') return speedMs * 3.6;
    if (this.windUnit === 'knots') return speedMs * 1.94384;
    return speedMs;
  },

  getWindLabel() {
    if (this.windUnit === 'ms') return 'm/s';
    if (this.windUnit === 'kmh') return 'km/h';
    return this.windUnit;
  },

  /**
   * Convert & Format Rain
   */
  formatRain(rainMm, decimals = 1) {
    if (rainMm === null || rainMm === undefined || isNaN(rainMm)) return '--';
    if (this.rainUnit === 'in') {
      const val = rainMm * 0.0393701;
      return `${val.toFixed(2)} in`;
    }
    return `${Number(rainMm).toFixed(decimals)} mm`;
  },

  getRainVal(rainMm) {
    if (rainMm === null || rainMm === undefined || isNaN(rainMm)) return null;
    if (this.rainUnit === 'in') return rainMm * 0.0393701;
    return rainMm;
  },

  getRainLabel() {
    return this.rainUnit;
  },

  /**
   * Convert & Format Distance (Lightning)
   */
  distanceUnit: 'km', // 'km' or 'mi'

  formatDistance(distKm, decimals = 1) {
    if (distKm === null || distKm === undefined || isNaN(distKm)) return '--';
    const val = this.getDistanceVal(distKm);
    return `${val.toFixed(decimals)} ${this.getDistanceLabel()}`;
  },

  getDistanceVal(distKm) {
    if (distKm === null || distKm === undefined || isNaN(distKm)) return null;
    if (this.distanceUnit === 'mi') return distKm * 0.621371;
    return distKm;
  },

  getDistanceLabel() {
    return this.distanceUnit === 'mi' ? 'mi' : 'km';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherUnits;
}
