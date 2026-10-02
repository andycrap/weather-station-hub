/**
 * Local Data Logger and History Storage
 * Persists weather telemetry to JSON file and provides CSV export capabilities
 */

const fs = require('fs');
const path = require('path');
const WeatherDataFilter = require('./data_filter');

class WeatherDatabase {
  constructor(dataFilePath) {
    const appDataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'WeatherStationHub') : path.join(__dirname, '..');
    if (!fs.existsSync(appDataDir)) {
      try { fs.mkdirSync(appDataDir, { recursive: true }); } catch (e) {}
    }

    this.appDataFile = path.join(appDataDir, 'weather_history.json');
    this.localFile = path.join(__dirname, '..', 'weather_history.json');
    this.filePath = dataFilePath || this.appDataFile;

    this.dataFilter = new WeatherDataFilter();
    this.history = [];
    this.maxRecords = 10000;
    this.logIntervalMs = 30000; // Log distinct historical record every 30 seconds
    this.lastSavedTime = 0;
    this.loadFromFile();
  }

  loadFromFile() {
    const recordsMap = new Map();

    const loadPath = (p) => {
      try {
        if (p && fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          const data = JSON.parse(raw);
          if (Array.isArray(data)) {
            data.forEach(r => {
              if (r && r.timestamp) {
                recordsMap.set(r.timestamp, r);
              }
            });
          }
        }
      } catch (err) {
        console.warn(`[Database] Error reading history from ${p}:`, err.message);
      }
    };

    if (this.filePath && this.filePath !== this.appDataFile && this.filePath !== this.localFile) {
      loadPath(this.filePath);
    }
    loadPath(this.appDataFile);
    loadPath(this.localFile);

    this.history = Array.from(recordsMap.values()).sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // Sanitize historical data to filter out any pre-existing out-of-bounds spikes
    this.history = this.dataFilter.sanitizeHistory(this.history);

    if (this.history.length > this.maxRecords) {
      this.history = this.history.slice(this.history.length - this.maxRecords);
    }

    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      this.lastSavedTime = new Date(last.timestamp).getTime();
    }

    console.log(`[Database] Loaded & sanitized ${this.history.length} historical weather records across AppData & local storage.`);
    this.saveToFile();
  }

  saveToFile() {
    const dataStr = JSON.stringify(this.history, null, 2);

    const writePath = (p) => {
      try {
        if (!p) return;
        const dir = path.dirname(p);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(p, dataStr, 'utf8');
      } catch (err) {
        console.error(`[Database] Failed writing history to ${p}:`, err.message);
      }
    };

    writePath(this.appDataFile);
    if (this.localFile !== this.appDataFile) {
      writePath(this.localFile);
    }
    if (this.filePath && this.filePath !== this.appDataFile && this.filePath !== this.localFile) {
      writePath(this.filePath);
    }
  }

  addRecord(record) {
    if (!record || !record.timestamp) return;

    const filteredRecord = this.dataFilter.filterRecord(record);
    const now = new Date(filteredRecord.timestamp).getTime();

    if (this.history.length === 0) {
      this.history.push(filteredRecord);
      this.lastSavedTime = now;
      this.saveToFile();
      return;
    }

    const timeDiff = now - this.lastSavedTime;

    // Append new historical entry every 30 seconds
    if (timeDiff >= this.logIntervalMs) {
      this.history.push(filteredRecord);
      this.lastSavedTime = now;

      if (this.history.length > this.maxRecords) {
        this.history = this.history.slice(this.history.length - this.maxRecords);
      }

      this.saveToFile();
    } else {
      // Update active live entry in place
      this.history[this.history.length - 1] = filteredRecord;
    }
  }

  getRecentHistory(limit = 288) {
    return this.history.slice(-limit);
  }

  getHistoryByRange(range = '24h') {
    if (this.history.length === 0) return [];

    const now = Date.now();
    let cutoff = 0;

    if (range === '1h') {
      cutoff = now - (60 * 60 * 1000);
    } else if (range === '24h') {
      cutoff = now - (24 * 60 * 60 * 1000);
    } else if (range === '7d') {
      cutoff = now - (7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      cutoff = now - (30 * 24 * 60 * 60 * 1000);
    } else if (range === 'all') {
      return this.history;
    } else {
      const limit = parseInt(range) || 288;
      return this.history.slice(-limit);
    }

    return this.history.filter(r => new Date(r.timestamp).getTime() >= cutoff);
  }

  getRainStats(currentRecord) {
    if (!currentRecord) {
      return { dailyRain: 0, rain1h: 0, rain24h: 0, rainRate: 0, lifetimeRain: 0 };
    }

    const currentTotal = currentRecord.totalRainMm ?? currentRecord.piezoDailyRainMm ?? 0;
    const now = new Date(currentRecord.timestamp || Date.now());

    // Midnight today in local time
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const tenMinutesAgo = now.getTime() - (10 * 60 * 1000);
    const oneHourAgo = now.getTime() - (60 * 60 * 1000);
    const twentyFourHoursAgo = now.getTime() - (24 * 60 * 60 * 1000);

    let midnightTotal = currentTotal;
    let tenMinutesAgoTotal = currentTotal;
    let oneHourAgoTotal = currentTotal;
    let twentyFourHoursAgoTotal = currentTotal;

    for (let i = 0; i < this.history.length; i++) {
      const r = this.history[i];
      const rTotal = r.totalRainMm ?? r.piezoDailyRainMm;
      if (rTotal === undefined || rTotal === null) continue;
      const t = new Date(r.timestamp).getTime();

      if (t >= midnight && midnightTotal === currentTotal) {
        midnightTotal = rTotal;
      }
      if (t >= tenMinutesAgo && tenMinutesAgoTotal === currentTotal) {
        tenMinutesAgoTotal = rTotal;
      }
      if (t >= oneHourAgo && oneHourAgoTotal === currentTotal) {
        oneHourAgoTotal = rTotal;
      }
      if (t >= twentyFourHoursAgo && twentyFourHoursAgoTotal === currentTotal) {
        twentyFourHoursAgoTotal = rTotal;
      }
    }

    let dailyRain = Math.max(0, Math.round((currentTotal - midnightTotal) * 10) / 10);
    const rain10m = Math.max(0, Math.round((currentTotal - tenMinutesAgoTotal) * 10) / 10);
    const rain1h = Math.max(0, Math.round((currentTotal - oneHourAgoTotal) * 10) / 10);
    const rain24h = Math.max(0, Math.round((currentTotal - twentyFourHoursAgoTotal) * 10) / 10);
    
    let rainRate = 0.0;
    if (currentRecord.piezoRainRateMm !== undefined && currentRecord.piezoRainRateMm !== null) {
      rainRate = currentRecord.piezoRainRateMm;
    } else {
      rainRate = Math.round((rain10m * 6) * 10) / 10;
    }

    if (currentRecord.piezoDailyRainMm !== undefined && currentRecord.piezoDailyRainMm !== null) {
      dailyRain = currentRecord.piezoDailyRainMm;
    } else if (currentRecord.source === 'ecowitt_wittboy' && currentRecord.totalRainMm !== undefined && currentRecord.totalRainMm !== null) {
      dailyRain = currentRecord.totalRainMm;
    }

    return {
      dailyRain,
      rain1h,
      rain24h,
      rainRate,
      lifetimeRain: currentTotal
    };
  }

  get3HourPressureTrend(currentRecord) {
    if (!currentRecord || !currentRecord.relPressure) return 0;
    const now = new Date(currentRecord.timestamp || Date.now()).getTime();
    const threeHoursAgo = now - (3 * 60 * 60 * 1000);

    for (let i = 0; i < this.history.length; i++) {
      const r = this.history[i];
      if (r.relPressure) {
        const t = new Date(r.timestamp).getTime();
        if (t >= threeHoursAgo) {
          const diff = currentRecord.relPressure - r.relPressure;
          return Math.round(diff * 10) / 10;
        }
      }
    }
    return 0;
  }

  getMinMaxStats() {
    if (this.history.length === 0) {
      return null;
    }

    let minTemp = Infinity, maxTemp = -Infinity;
    let minHum = Infinity, maxHum = -Infinity;
    let minGarageTemp = Infinity, maxGarageTemp = -Infinity;
    let minGarageHum = Infinity, maxGarageHum = -Infinity;
    let minDownstairsTemp = Infinity, maxDownstairsTemp = -Infinity;
    let minDownstairsHum = Infinity, maxDownstairsHum = -Infinity;
    let minPress = Infinity, maxPress = -Infinity;
    let maxWindSpeed = 0, maxWindGust = 0;
    let maxSolarRadiation = null, maxUvIndex = null;

    this.history.forEach(r => {
      if (r.outdoorTemp !== null && r.outdoorTemp !== undefined && r.outdoorTemp >= -40 && r.outdoorTemp <= 70) {
        if (r.outdoorTemp < minTemp) minTemp = r.outdoorTemp;
        if (r.outdoorTemp > maxTemp) maxTemp = r.outdoorTemp;
      }
      if (r.outdoorHumidity !== null && r.outdoorHumidity !== undefined && r.outdoorHumidity >= 0 && r.outdoorHumidity <= 100) {
        if (r.outdoorHumidity < minHum) minHum = r.outdoorHumidity;
        if (r.outdoorHumidity > maxHum) maxHum = r.outdoorHumidity;
      }
      if (r.garageTemp !== null && r.garageTemp !== undefined && r.garageTemp >= -40 && r.garageTemp <= 70) {
        if (r.garageTemp < minGarageTemp) minGarageTemp = r.garageTemp;
        if (r.garageTemp > maxGarageTemp) maxGarageTemp = r.garageTemp;
      }
      if (r.garageHumidity !== null && r.garageHumidity !== undefined && r.garageHumidity >= 0 && r.garageHumidity <= 100) {
        if (r.garageHumidity < minGarageHum) minGarageHum = r.garageHumidity;
        if (r.garageHumidity > maxGarageHum) maxGarageHum = r.garageHumidity;
      }
      if (r.downstairsTemp !== null && r.downstairsTemp !== undefined && r.downstairsTemp >= -40 && r.downstairsTemp <= 70) {
        if (r.downstairsTemp < minDownstairsTemp) minDownstairsTemp = r.downstairsTemp;
        if (r.downstairsTemp > maxDownstairsTemp) maxDownstairsTemp = r.downstairsTemp;
      }
      if (r.downstairsHumidity !== null && r.downstairsHumidity !== undefined && r.downstairsHumidity >= 0 && r.downstairsHumidity <= 100) {
        if (r.downstairsHumidity < minDownstairsHum) minDownstairsHum = r.downstairsHumidity;
        if (r.downstairsHumidity > maxDownstairsHum) maxDownstairsHum = r.downstairsHumidity;
      }
      if (r.relPressure !== null && r.relPressure !== undefined && r.relPressure >= 700 && r.relPressure <= 1100) {
        if (r.relPressure < minPress) minPress = r.relPressure;
        if (r.relPressure > maxPress) maxPress = r.relPressure;
      }
      if (r.windSpeed !== null && r.windSpeed !== undefined && r.windSpeed >= 0 && r.windSpeed <= 100) {
        if (r.windSpeed > maxWindSpeed) maxWindSpeed = r.windSpeed;
      }
      if (r.windGust !== null && r.windGust !== undefined && r.windGust >= 0 && r.windGust <= 100) {
        if (r.windGust > maxWindGust) maxWindGust = r.windGust;
      }
      if (r.solarRadiation !== null && r.solarRadiation !== undefined && !isNaN(r.solarRadiation) && r.solarRadiation >= 0) {
        if (maxSolarRadiation === null || r.solarRadiation > maxSolarRadiation) maxSolarRadiation = r.solarRadiation;
      }
      if (r.uvIndex !== null && r.uvIndex !== undefined && !isNaN(r.uvIndex) && r.uvIndex >= 0) {
        if (maxUvIndex === null || r.uvIndex > maxUvIndex) maxUvIndex = r.uvIndex;
      }
    });

    return {
      minOutdoorTemp: minTemp !== Infinity ? minTemp : null,
      maxOutdoorTemp: maxTemp !== -Infinity ? maxTemp : null,
      minOutdoorHumidity: minHum !== Infinity ? minHum : null,
      maxOutdoorHumidity: maxHum !== -Infinity ? maxHum : null,
      minGarageTemp: minGarageTemp !== Infinity ? minGarageTemp : null,
      maxGarageTemp: maxGarageTemp !== -Infinity ? maxGarageTemp : null,
      minGarageHumidity: minGarageHum !== Infinity ? minGarageHum : null,
      maxGarageHumidity: maxGarageHum !== -Infinity ? maxGarageHum : null,
      minDownstairsTemp: minDownstairsTemp !== Infinity ? minDownstairsTemp : null,
      maxDownstairsTemp: maxDownstairsTemp !== -Infinity ? maxDownstairsTemp : null,
      minDownstairsHumidity: minDownstairsHum !== Infinity ? minDownstairsHum : null,
      maxDownstairsHumidity: maxDownstairsHum !== -Infinity ? maxDownstairsHum : null,
      minRelPressure: minPress !== Infinity ? minPress : null,
      maxRelPressure: maxPress !== -Infinity ? maxPress : null,
      maxWindSpeed,
      maxWindGust,
      maxSolarRadiation,
      maxUvIndex
    };
  }

  exportToCSV() {
    const headers = [
      'Timestamp',
      'Indoor_Temp_C',
      'Indoor_Humidity_%',
      'Outdoor_Temp_C',
      'Outdoor_Humidity_%',
      'Garage_Temp_C',
      'Garage_Humidity_%',
      'Downstairs_Temp_C',
      'Downstairs_Humidity_%',
      'Abs_Pressure_hPa',
      'Rel_Pressure_hPa',
      'Wind_Speed_ms',
      'Wind_Gust_ms',
      'Wind_Dir',
      'Wind_Dir_Deg',
      'Total_Rain_mm',
      'Dew_Point_C',
      'Wind_Chill_C',
      'Heat_Index_C',
      'Source'
    ];

    const rows = this.history.map(r => [
      r.timestamp,
      r.indoorTemp ?? '',
      r.indoorHumidity ?? '',
      r.outdoorTemp ?? '',
      r.outdoorHumidity ?? '',
      r.garageTemp ?? '',
      r.garageHumidity ?? '',
      r.downstairsTemp ?? '',
      r.downstairsHumidity ?? '',
      r.absPressure ?? '',
      r.relPressure ?? '',
      r.windSpeed ?? '',
      r.windGust ?? '',
      r.windDirection ?? '',
      r.windDirectionDeg ?? '',
      r.totalRainMm ?? '',
      r.dewPoint ?? '',
      r.windChill ?? '',
      r.heatIndex ?? '',
      r.source ?? 'usb_hardware'
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}

module.exports = WeatherDatabase;
