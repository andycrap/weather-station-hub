/**
 * Weather Data Spike & Quality Filter
 * Filters out corrupted USB packets, electrical interference spikes, and out-of-bounds metrics.
 */

class WeatherDataFilter {
  constructor() {
    this.lastValid = null;
    this.consecutiveSpikeCounts = {};
    this.maxSpikeThreshold = 4; // Allow baseline shift if reading persists 4+ consecutive samples
  }

  /**
   * Validate absolute physical boundaries of weather variables
   */
  isValidBounds(packet) {
    if (!packet) return false;

    // Outdoor Temp Bounds (-40.0°C to +60.0°C)
    if (packet.outdoorTemp !== null && packet.outdoorTemp !== undefined) {
      if (packet.outdoorTemp < -40.0 || packet.outdoorTemp > 60.0) return false;
    }

    // Indoor Temp Bounds (-10.0°C to +50.0°C)
    if (packet.indoorTemp !== null && packet.indoorTemp !== undefined) {
      if (packet.indoorTemp < -10.0 || packet.indoorTemp > 50.0) return false;
    }

    // Garage Temp Bounds (-30.0°C to +60.0°C)
    if (packet.garageTemp !== null && packet.garageTemp !== undefined) {
      if (packet.garageTemp < -30.0 || packet.garageTemp > 60.0) return false;
    }

    // Downstairs Temp Bounds (-10.0°C to +50.0°C)
    if (packet.downstairsTemp !== null && packet.downstairsTemp !== undefined) {
      if (packet.downstairsTemp < -10.0 || packet.downstairsTemp > 50.0) return false;
    }

    // Humidity Bounds (1% to 100%)
    if (packet.outdoorHumidity !== null && packet.outdoorHumidity !== undefined) {
      if (packet.outdoorHumidity < 1 || packet.outdoorHumidity > 100) return false;
    }
    if (packet.indoorHumidity !== null && packet.indoorHumidity !== undefined) {
      if (packet.indoorHumidity < 1 || packet.indoorHumidity > 100) return false;
    }
    if (packet.garageHumidity !== null && packet.garageHumidity !== undefined) {
      if (packet.garageHumidity < 1 || packet.garageHumidity > 100) return false;
    }
    if (packet.downstairsHumidity !== null && packet.downstairsHumidity !== undefined) {
      if (packet.downstairsHumidity < 1 || packet.downstairsHumidity > 100) return false;
    }

    // Barometric Pressure Bounds (800 hPa to 1100 hPa)
    if (packet.relPressure !== null && packet.relPressure !== undefined) {
      if (packet.relPressure < 800.0 || packet.relPressure > 1100.0) return false;
    }
    if (packet.absPressure !== null && packet.absPressure !== undefined) {
      if (packet.absPressure < 800.0 || packet.absPressure > 1100.0) return false;
    }

    // Wind Bounds (0 to 60 m/s)
    if (packet.windSpeed !== null && packet.windSpeed !== undefined) {
      if (packet.windSpeed < 0 || packet.windSpeed > 60.0) return false;
    }
    if (packet.windGust !== null && packet.windGust !== undefined) {
      if (packet.windGust < 0 || packet.windGust > 75.0) return false;
    }

    // Lightning Bounds
    if (packet.lightningDistanceKm !== null && packet.lightningDistanceKm !== undefined) {
      if (packet.lightningDistanceKm < 0 || packet.lightningDistanceKm > 100.0) return false;
    }
    if (packet.lightningCountDay !== null && packet.lightningCountDay !== undefined) {
      if (packet.lightningCountDay < 0 || packet.lightningCountDay > 100000) return false;
    }

    return true;
  }

  /**
   * Filter single telemetry record against last valid reading to remove transient spikes
   */
  filterRecord(record) {
    if (!record) return record;

    const cleaned = { ...record };

    // 1. Check absolute bounds first
    if (!this.isValidBounds(cleaned)) {
      if (this.lastValid) {
        if (cleaned.outdoorTemp < -40 || cleaned.outdoorTemp > 60) cleaned.outdoorTemp = this.lastValid.outdoorTemp;
        if (cleaned.indoorTemp < -10 || cleaned.indoorTemp > 50) cleaned.indoorTemp = this.lastValid.indoorTemp;
        if (cleaned.outdoorHumidity < 1 || cleaned.outdoorHumidity > 100) cleaned.outdoorHumidity = this.lastValid.outdoorHumidity;
        if (cleaned.indoorHumidity < 1 || cleaned.indoorHumidity > 100) cleaned.indoorHumidity = this.lastValid.indoorHumidity;
        if (cleaned.relPressure < 800 || cleaned.relPressure > 1100) cleaned.relPressure = this.lastValid.relPressure;
        if (cleaned.absPressure < 800 || cleaned.absPressure > 1100) cleaned.absPressure = this.lastValid.absPressure;
        if (cleaned.windSpeed < 0 || cleaned.windSpeed > 60) cleaned.windSpeed = this.lastValid.windSpeed;
        if (cleaned.windGust < 0 || cleaned.windGust > 75) cleaned.windGust = this.lastValid.windGust;
      }
    }

    if (!this.lastValid) {
      this.lastValid = { ...cleaned };
      return cleaned;
    }

    // 2. Check transient delta spikes against last valid sample
    const checkFieldSpike = (field, maxAllowedDelta) => {
      const currentVal = cleaned[field];
      const prevVal = this.lastValid[field];

      if (currentVal !== null && currentVal !== undefined && prevVal !== null && prevVal !== undefined) {
        const delta = Math.abs(currentVal - prevVal);
        if (delta > maxAllowedDelta) {
          this.consecutiveSpikeCounts[field] = (this.consecutiveSpikeCounts[field] || 0) + 1;
          if (this.consecutiveSpikeCounts[field] < this.maxSpikeThreshold) {
            // Transient spike detected: replace with last valid value
            cleaned[field] = prevVal;
          } else {
            // Shift baseline if reading persists across multiple samples
            this.consecutiveSpikeCounts[field] = 0;
          }
        } else {
          this.consecutiveSpikeCounts[field] = 0;
        }
      }
    };

    checkFieldSpike('outdoorTemp', 5.0);    // Max 5.0 °C jump per sample
    checkFieldSpike('indoorTemp', 4.0);     // Max 4.0 °C jump per sample
    checkFieldSpike('garageTemp', 5.0);     // Max 5.0 °C jump per sample
    checkFieldSpike('downstairsTemp', 4.0); // Max 4.0 °C jump per sample
    checkFieldSpike('outdoorHumidity', 25); // Max 25% RH jump per sample
    checkFieldSpike('indoorHumidity', 25);  // Max 25% RH jump per sample
    checkFieldSpike('garageHumidity', 25);  // Max 25% RH jump per sample
    checkFieldSpike('downstairsHumidity', 25); // Max 25% RH jump per sample
    checkFieldSpike('relPressure', 10.0);   // Max 10.0 hPa jump per sample
    checkFieldSpike('absPressure', 10.0);   // Max 10.0 hPa jump per sample
    checkFieldSpike('windSpeed', 25.0);     // Max 25.0 m/s jump per sample

    // Cumulative Rain: prevent negative jumps or single-sample massive jumps > 50mm
    if (cleaned.totalRainMm !== undefined && cleaned.totalRainMm !== null && this.lastValid.totalRainMm !== undefined) {
      const rainDelta = cleaned.totalRainMm - this.lastValid.totalRainMm;
      if (rainDelta < 0) {
        // Rain counter reset on console, allow reset
        this.lastValid.totalRainMm = cleaned.totalRainMm;
      } else if (rainDelta > 50.0) {
        // Unrealistic rain jump in 3s
        cleaned.totalRainMm = this.lastValid.totalRainMm;
      }
    }

    this.lastValid = { ...cleaned };
    return cleaned;
  }

  /**
   * Sanitize an array of historical records
   */
  sanitizeHistory(records) {
    if (!Array.isArray(records) || records.length === 0) return records;

    const tempFilter = new WeatherDataFilter();
    return records.map(r => tempFilter.filterRecord(r));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WeatherDataFilter;
}
