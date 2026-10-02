/**
 * EcoWitt Wittboy & WS90 HTTP Custom Upload Payload Decoder
 * Decodes Ecowitt and Ambient Weather protocol HTTP GET/POST key-value telemetry packets.
 */

const FineOffsetDecoder = require('./fineoffset_decoder');

class EcowittDecoder {
  /**
   * Parse numeric helper with optional default fallback
   */
  static parseNum(val, fallback = null) {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  }

  /**
   * Convert Fahrenheit to Celsius
   */
  static fToC(tempF) {
    if (tempF === null) return null;
    return Math.round(((tempF - 32) * 5 / 9) * 10) / 10;
  }

  /**
   * Convert inHg to hPa
   */
  static inHgToHpa(inHg) {
    if (inHg === null) return null;
    return Math.round((inHg * 33.8638866) * 10) / 10;
  }

  /**
   * Convert mph to m/s
   */
  static mphToMs(mph) {
    if (mph === null) return null;
    return Math.round((mph * 0.44704) * 10) / 10;
  }

  /**
   * Convert inches to mm
   */
  static inchesToMm(inches) {
    if (inches === null) return null;
    return Math.round((inches * 25.4) * 10) / 10;
  }

  /**
   * Decode an Ecowitt HTTP POST / GET body or query object
   */
  static decodeRecord(data = {}, options = {}) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid EcoWitt payload data');
    }

    const passkey = data.PASSKEY || data.passkey || data.mac || 'ECOWITT_HUB';
    const stationType = data.stationtype || data.model || 'Wittboy WS90';

    // Outdoor Temperature (°C)
    let outdoorTemp = null;
    if (data.tempc !== undefined) {
      outdoorTemp = this.parseNum(data.tempc);
    } else if (data.tempf !== undefined) {
      outdoorTemp = this.fToC(this.parseNum(data.tempf));
    }

    // Outdoor Humidity (%)
    const outdoorHumidity = this.parseNum(data.humidity);

    // Indoor Temperature (°C)
    let indoorTemp = null;
    if (data.tempinc !== undefined) {
      indoorTemp = this.parseNum(data.tempinc);
    } else if (data.tempinf !== undefined) {
      indoorTemp = this.fToC(this.parseNum(data.tempinf));
    }

    // Indoor Humidity (%)
    const indoorHumidity = this.parseNum(data.humidityin);

    // Absolute Barometric Pressure (hPa)
    let absPressure = null;
    if (data.baromabshpa !== undefined) {
      absPressure = this.parseNum(data.baromabshpa);
    } else if (data.baromabsin !== undefined) {
      absPressure = this.inHgToHpa(this.parseNum(data.baromabsin));
    }

    // Relative Barometric Pressure (hPa)
    let relPressure = null;
    if (data.baromrelhpa !== undefined) {
      relPressure = this.parseNum(data.baromrelhpa);
    } else if (data.baromrelin !== undefined) {
      relPressure = this.inHgToHpa(this.parseNum(data.baromrelin));
    }

    // Always compute sea-level Relative Pressure using configured station altitude if altitudeMeters is provided
    if (options.altitudeMeters && absPressure) {
      const p0 = absPressure * Math.pow(1 - 0.0000225577 * options.altitudeMeters, -5.25588);
      relPressure = Math.round(p0 * 10) / 10;
    } else if (!relPressure && absPressure) {
      relPressure = absPressure;
    }

    // Wind Speed (m/s)
    let windSpeed = 0;
    if (data.windspeedms !== undefined) {
      windSpeed = this.parseNum(data.windspeedms, 0);
    } else if (data.windspeedmph !== undefined) {
      windSpeed = this.mphToMs(this.parseNum(data.windspeedmph, 0));
    }

    // Wind Gust (m/s)
    let windGust = windSpeed;
    if (data.windgustms !== undefined) {
      windGust = this.parseNum(data.windgustms, windSpeed);
    } else if (data.windgustmph !== undefined) {
      windGust = this.mphToMs(this.parseNum(data.windgustmph, 0)) || windSpeed;
    }

    // Wind Direction (0-360°)
    const windDirectionDeg = this.parseNum(data.winddir, 0);
    const dirIdx = Math.round(windDirectionDeg / 22.5) % 16;
    const windDirObj = FineOffsetDecoder.getWindDirection(dirIdx);

    // Rain Totals (mm)
    let totalRainMm = 0;
    if (data.totalrainmm !== undefined) {
      totalRainMm = this.parseNum(data.totalrainmm, 0);
    } else if (data.totalrainin !== undefined) {
      totalRainMm = this.inchesToMm(this.parseNum(data.totalrainin, 0));
    } else if (data.dailyrainmm !== undefined) {
      totalRainMm = this.parseNum(data.dailyrainmm, 0);
    } else if (data.dailyrainin !== undefined) {
      totalRainMm = this.inchesToMm(this.parseNum(data.dailyrainin, 0));
    } else if (data.drain_piezomm !== undefined) {
      totalRainMm = this.parseNum(data.drain_piezomm, 0);
    } else if (data.drain_piezo !== undefined) {
      totalRainMm = this.inchesToMm(this.parseNum(data.drain_piezo, 0));
    } else if (data.eventrainin !== undefined) {
      totalRainMm = this.inchesToMm(this.parseNum(data.eventrainin, 0));
    }

    // WS90 Piezoelectric Haptic Rain metrics (mm / mm/h)
    let piezoRainRateMm = 0.0;
    if (data.piezo_rainratemm !== undefined) {
      piezoRainRateMm = this.parseNum(data.piezo_rainratemm, 0.0);
    } else if (data.rrain_piezomm !== undefined) {
      piezoRainRateMm = this.parseNum(data.rrain_piezomm, 0.0);
    } else if (data.rainratemm !== undefined) {
      piezoRainRateMm = this.parseNum(data.rainratemm, 0.0);
    } else {
      const piezoRainRateIn = this.parseNum(data.piezo_rainratein || data.rrain_piezo || data.rainratein);
      piezoRainRateMm = piezoRainRateIn !== null ? this.inchesToMm(piezoRainRateIn) : 0.0;
    }

    let piezoDailyRainMm = null;
    if (data.piezo_dailyrainmm !== undefined) {
      piezoDailyRainMm = this.parseNum(data.piezo_dailyrainmm);
    } else if (data.drain_piezomm !== undefined) {
      piezoDailyRainMm = this.parseNum(data.drain_piezomm);
    } else if (data.dailyrainmm !== undefined) {
      piezoDailyRainMm = this.parseNum(data.dailyrainmm);
    } else {
      const piezoDailyRainIn = this.parseNum(data.piezo_dailyrainin || data.drain_piezo || data.dailyrainin);
      piezoDailyRainMm = piezoDailyRainIn !== null ? this.inchesToMm(piezoDailyRainIn) : totalRainMm;
    }

    if (totalRainMm === 0 && piezoDailyRainMm > 0) {
      totalRainMm = piezoDailyRainMm;
    }

    // Solar & UV Sensors
    const solarRadiation = this.parseNum(data.solarradiation); // W/m²
    const uvIndex = this.parseNum(data.uv); // UV index integer / float

    // Diagnostic & WS90 Supercapacitor / Battery Status
    const ws90CapacitorVolt = this.parseNum(data.ws90cap_volt); // e.g. 4.8 V
    const wh90battRaw = data.wh90batt || data.ws90_batt;
    const ws90BatteryStatus = wh90battRaw === '0' || wh90battRaw === 0 ? 'Normal' : (wh90battRaw === '1' || wh90battRaw === 1 ? 'Low' : 'OK');

    // WH57 / WH31L Lightning Detector Sensor
    let lightningDistanceKm = this.parseNum(data.lightning !== undefined ? data.lightning : (data.lightning_km !== undefined ? data.lightning_km : data.lightning_distance));
    // If distance is invalid (-1 or 255), set to null
    if (lightningDistanceKm !== null && (lightningDistanceKm < 0 || lightningDistanceKm > 200)) {
      lightningDistanceKm = null;
    }

    const lightningCountDay = this.parseNum(data.lightning_num !== undefined ? data.lightning_num : (data.lightning_day !== undefined ? data.lightning_day : data.lightning_count));

    let lightningLastTime = null;
    if (data.lightning_time !== undefined && data.lightning_time !== null && data.lightning_time !== '') {
      const ltRaw = data.lightning_time;
      if (!isNaN(Number(ltRaw))) {
        const epochSec = Number(ltRaw);
        // Epoch seconds or milliseconds
        const dateObj = new Date(epochSec > 1e11 ? epochSec : epochSec * 1000);
        if (!isNaN(dateObj.getTime())) {
          lightningLastTime = dateObj.toISOString();
        }
      } else {
        const dateObj = new Date(ltRaw);
        if (!isNaN(dateObj.getTime())) {
          lightningLastTime = dateObj.toISOString();
        }
      }
    }

    const wh57battRaw = data.wh57batt !== undefined ? data.wh57batt : (data.wh57_batt !== undefined ? data.wh57_batt : data.wh31l_batt);
    let wh57BatteryStatus = null;
    if (wh57battRaw !== undefined && wh57battRaw !== null) {
      wh57BatteryStatus = (wh57battRaw === '0' || wh57battRaw === 0) ? 'Normal' : ((wh57battRaw === '1' || wh57battRaw === 1) ? 'Low' : 'OK');
    }

    // Garage Temperature (°C) & Humidity (%) - Channel 1 / Garage sensor
    let garageTemp = null;
    if (data.garagetempc !== undefined) {
      garageTemp = this.parseNum(data.garagetempc);
    } else if (data.garagetempf !== undefined) {
      garageTemp = this.fToC(this.parseNum(data.garagetempf));
    } else if (data.garagetemp !== undefined) {
      const gt = this.parseNum(data.garagetemp);
      garageTemp = gt > 50 ? this.fToC(gt) : gt;
    } else if (data.temp1c !== undefined) {
      garageTemp = this.parseNum(data.temp1c);
    } else if (data.temp1f !== undefined) {
      garageTemp = this.fToC(this.parseNum(data.temp1f));
    } else if (data.temp1 !== undefined) {
      const t1 = this.parseNum(data.temp1);
      garageTemp = t1 > 50 ? this.fToC(t1) : t1;
    }

    let garageHumidity = null;
    if (data.garagehumidity !== undefined) {
      garageHumidity = this.parseNum(data.garagehumidity);
    } else if (data.humidity1 !== undefined) {
      garageHumidity = this.parseNum(data.humidity1);
    }

    const garageDewPoint = (garageTemp !== null && garageHumidity !== null) ? FineOffsetDecoder.calculateDewPoint(garageTemp, garageHumidity) : null;

    // Downstairs Temperature (°C) & Humidity (%) - Channel 2 / Downstairs sensor
    let downstairsTemp = null;
    if (data.downstairstempc !== undefined) {
      downstairsTemp = this.parseNum(data.downstairstempc);
    } else if (data.downstairstempf !== undefined) {
      downstairsTemp = this.fToC(this.parseNum(data.downstairstempf));
    } else if (data.downstairstemp !== undefined) {
      const dt = this.parseNum(data.downstairstemp);
      downstairsTemp = dt > 50 ? this.fToC(dt) : dt;
    } else if (data.temp2c !== undefined) {
      downstairsTemp = this.parseNum(data.temp2c);
    } else if (data.temp2f !== undefined) {
      downstairsTemp = this.fToC(this.parseNum(data.temp2f));
    } else if (data.temp2 !== undefined) {
      const t2 = this.parseNum(data.temp2);
      downstairsTemp = t2 > 50 ? this.fToC(t2) : t2;
    }

    let downstairsHumidity = null;
    if (data.downstairshumidity !== undefined) {
      downstairsHumidity = this.parseNum(data.downstairshumidity);
    } else if (data.humidity2 !== undefined) {
      downstairsHumidity = this.parseNum(data.humidity2);
    }

    const downstairsDewPoint = (downstairsTemp !== null && downstairsHumidity !== null) ? FineOffsetDecoder.calculateDewPoint(downstairsTemp, downstairsHumidity) : null;

    const dewPoint = FineOffsetDecoder.calculateDewPoint(outdoorTemp, outdoorHumidity);
    const windChill = FineOffsetDecoder.calculateWindChill(outdoorTemp, windSpeed);
    const heatIndex = FineOffsetDecoder.calculateHeatIndex(outdoorTemp, outdoorHumidity);

    const timestamp = data.dateutc ? new Date(data.dateutc.replace('+', ' ') + ' UTC').toISOString() : new Date().toISOString();

    return {
      timestamp: isNaN(new Date(timestamp).getTime()) ? new Date().toISOString() : timestamp,
      source: 'ecowitt_wittboy',
      passkey,
      stationType,
      indoorTemp: indoorTemp !== null ? Math.round(indoorTemp * 10) / 10 : null,
      indoorHumidity,
      outdoorTemp: outdoorTemp !== null ? Math.round(outdoorTemp * 10) / 10 : null,
      outdoorHumidity,
      garageTemp: garageTemp !== null ? Math.round(garageTemp * 10) / 10 : null,
      garageHumidity,
      garageDewPoint,
      downstairsTemp: downstairsTemp !== null ? Math.round(downstairsTemp * 10) / 10 : null,
      downstairsHumidity,
      downstairsDewPoint,
      absPressure,
      relPressure,
      windSpeed,
      windGust,
      windDirection: windDirObj.code,
      windDirectionDeg,
      windDirectionName: windDirObj.name,
      totalRainMm,
      piezoRainRateMm,
      piezoDailyRainMm,
      solarRadiation,
      uvIndex,
      ws90CapacitorVolt,
      ws90BatteryStatus,
      lightningDistanceKm,
      lightningCountDay,
      lightningLastTime,
      wh57BatteryStatus,
      dewPoint,
      windChill,
      heatIndex,
      status: {
        outdoorSensorLost: false,
        outdoorBatteryLow: ws90BatteryStatus === 'Low',
        rawStatusByte: 0x00
      }
    };
  }
}

module.exports = EcowittDecoder;
