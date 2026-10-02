/**
 * Fine Offset USB HID Record & Packet Decoder
 * Supports WH1080, WH1081, WH2080, WH3080 and compatible consoles (EasyWeather)
 */

class FineOffsetDecoder {
  /**
   * Convert 16-point wind direction index (0-15) to degrees and cardinal text
   */
  static getWindDirection(dirIndex) {
    const directions = [
      { code: 'N', name: 'North', deg: 0 },
      { code: 'NNE', name: 'North-Northeast', deg: 22.5 },
      { code: 'NE', name: 'Northeast', deg: 45 },
      { code: 'ENE', name: 'East-Northeast', deg: 67.5 },
      { code: 'E', name: 'East', deg: 90 },
      { code: 'ESE', name: 'East-Southeast', deg: 112.5 },
      { code: 'SE', name: 'Southeast', deg: 135 },
      { code: 'SSE', name: 'South-Southeast', deg: 157.5 },
      { code: 'S', name: 'South', deg: 180 },
      { code: 'SSW', name: 'South-Southwest', deg: 202.5 },
      { code: 'SW', name: 'Southwest', deg: 225 },
      { code: 'WSW', name: 'West-Southwest', deg: 247.5 },
      { code: 'W', name: 'West', deg: 270 },
      { code: 'WNW', name: 'West-Northwest', deg: 292.5 },
      { code: 'NW', name: 'Northwest', deg: 315 },
      { code: 'NNW', name: 'North-Northwest', deg: 337.5 }
    ];
    const idx = Math.min(Math.max(0, dirIndex & 0x0F), 15);
    return directions[idx];
  }

  /**
   * Calculate Dew Point using Magnus-Tetens formula (°C)
   */
  static calculateDewPoint(tempC, humidity) {
    if (tempC === null || humidity === null || humidity <= 0) return null;
    const a = 17.625;
    const b = 243.04;
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100.0);
    const dp = (b * alpha) / (a - alpha);
    return Math.round(dp * 10) / 10;
  }

  /**
   * Calculate Wind Chill (°C)
   */
  static calculateWindChill(tempC, windSpeedMs) {
    if (tempC === null || windSpeedMs === null) return null;
    const windSpeedKmh = windSpeedMs * 3.6;
    if (tempC > 10.0 || windSpeedKmh < 4.8) {
      return tempC;
    }
    const wc = 13.12 + (0.6215 * tempC) - (11.37 * Math.pow(windSpeedKmh, 0.16)) + (0.3965 * tempC * Math.pow(windSpeedKmh, 0.16));
    return Math.round(wc * 10) / 10;
  }

  /**
   * Calculate Heat Index (°C)
   */
  static calculateHeatIndex(tempC, humidity) {
    if (tempC === null || humidity === null || tempC < 27.0 || humidity < 40) {
      return tempC;
    }
    const tempF = (tempC * 9 / 5) + 32;
    const rh = humidity;
    let hiF = -42.379 +
      2.04901523 * tempF +
      10.14333127 * rh -
      0.22475541 * tempF * rh -
      0.00683783 * tempF * tempF -
      0.05481717 * rh * rh +
      0.00122874 * tempF * tempF * rh +
      0.00085282 * tempF * rh * rh -
      0.00000199 * tempF * tempF * rh * rh;
    const hiC = (hiF - 32) * 5 / 9;
    return Math.round(hiC * 10) / 10;
  }

  /**
   * Decode a 16-byte Fine Offset memory/USB record
   */
  static decodeRecord(buffer, options = {}) {
    if (!buffer || buffer.length < 16) {
      throw new Error('Invalid buffer length: expected at least 16 bytes');
    }

    const bytes = Array.from(buffer);

    const delayMinutes = bytes[0];

    // Indoor Humidity (%)
    const indoorHumidity = bytes[1] <= 100 ? bytes[1] : null;

    // Indoor Temp (int16, 0.1 °C)
    let indoorTemp = null;
    const rawIndoorTemp = (bytes[3] << 8) | bytes[2];
    if (rawIndoorTemp !== 0x7FFF && rawIndoorTemp !== 0xFFFF) {
      const isSigned = (bytes[3] & 0x80) !== 0;
      let val = rawIndoorTemp;
      if (isSigned) val = rawIndoorTemp - 0x10000;
      const calcTemp = val / 10.0;
      if (calcTemp >= -40.0 && calcTemp <= 70.0) {
        indoorTemp = calcTemp;
      }
    }

    // Outdoor Humidity (%)
    const outdoorHumidity = bytes[4] <= 100 ? bytes[4] : null;

    // Outdoor Temp (int16, 0.1 °C)
    let outdoorTemp = null;
    const rawOutdoorTemp = (bytes[6] << 8) | bytes[5];
    if (rawOutdoorTemp !== 0x7FFF && rawOutdoorTemp !== 0xFFFF) {
      const isSigned = (bytes[6] & 0x80) !== 0;
      let val = rawOutdoorTemp;
      if (isSigned) val = rawOutdoorTemp - 0x10000;
      const calcTemp = val / 10.0;
      if (calcTemp >= -40.0 && calcTemp <= 70.0) {
        outdoorTemp = calcTemp;
      }
    }

    // Absolute Barometric Pressure (uint16, 0.1 hPa) - Valid range 700 to 1100 hPa
    let absPressure = null;
    const rawPressure = (bytes[8] << 8) | bytes[7];
    if (rawPressure !== 0xFFFF && rawPressure > 0) {
      const pressVal = Math.round((rawPressure / 10.0) * 10) / 10;
      if (pressVal >= 700.0 && pressVal <= 1100.0) {
        absPressure = pressVal;
      }
    }

    // Relative Pressure adjustment
    let relOffset = options.pressureOffset !== undefined ? options.pressureOffset : 0.0;
    if (options.altitudeMeters && absPressure) {
        // Standard barometric formula offset
        const p0 = absPressure * Math.pow(1 - 0.0000225577 * options.altitudeMeters, -5.25588);
        relOffset = p0 - absPressure;
    }
    const relPressure = absPressure ? Math.round((absPressure + relOffset) * 10) / 10 : null;

    // Wind Speed (0.1 m/s)
    const rawWindSpeed = bytes[9];
    const windSpeed = rawWindSpeed < 255 ? Math.round((rawWindSpeed * 0.1) * 10) / 10 : 0;

    // Wind Gust (0.1 m/s)
    const rawWindGust = bytes[10];
    const windGust = rawWindGust < 255 ? Math.round((rawWindGust * 0.1) * 10) / 10 : windSpeed;

    // Wind Direction (0-15)
    const windDirObj = this.getWindDirection(bytes[12]);

    // Cumulative Rain (uint16, 0.3mm bucket tip)
    let rawRain = (bytes[14] << 8) | bytes[13];
    if (rawRain === 0xFFFF) rawRain = 0;
    const totalRainMm = Math.round((rawRain * 0.3) * 10) / 10;

    // Status flags
    const statusByte = bytes[15];
    const outdoorSensorLost = (statusByte & 0x40) !== 0;
    const outdoorBatteryLow = (statusByte & 0x01) !== 0;

    const dewPoint = this.calculateDewPoint(outdoorTemp, outdoorHumidity);
    const windChill = this.calculateWindChill(outdoorTemp, windSpeed);
    const heatIndex = this.calculateHeatIndex(outdoorTemp, outdoorHumidity);

    return {
      timestamp: new Date().toISOString(),
      delayMinutes,
      indoorTemp: indoorTemp !== null ? Math.round(indoorTemp * 10) / 10 : null,
      indoorHumidity,
      outdoorTemp: outdoorTemp !== null ? Math.round(outdoorTemp * 10) / 10 : null,
      outdoorHumidity,
      absPressure,
      relPressure,
      windSpeed,
      windGust,
      windDirection: windDirObj.code,
      windDirectionDeg: windDirObj.deg,
      windDirectionName: windDirObj.name,
      totalRainMm,
      dewPoint,
      windChill,
      heatIndex,
      status: {
        outdoorSensorLost,
        outdoorBatteryLow,
        rawStatusByte: statusByte
      }
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FineOffsetDecoder;
}
