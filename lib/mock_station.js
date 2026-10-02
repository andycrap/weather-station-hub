/**
 * High-Fidelity Mock Weather Station Stream Generator
 * Produces realistic physics-based weather data stream for Fine Offset station testing
 */

const FineOffsetDecoder = require('./fineoffset_decoder');

class MockWeatherStation {
  constructor() {
    this.baseTemp = 21.5;        // °C
    this.baseHumidity = 62;      // %
    this.basePressure = 1013.2;  // hPa
    this.baseWindSpeed = 3.5;    // m/s
    this.baseWindDirIdx = 4;     // East
    this.totalRainMm = 14.7;     // mm accum
    this.step = 0;
  }

  /**
   * Generate next realistic weather data packet
   */
  generateNextPacket() {
    this.step++;
    const now = new Date();
    const hour = now.getHours() + (now.getMinutes() / 60);

    // Diurnal outdoor temp variation (cooler at 5am, warmest at 3pm)
    const diurnalTemp = Math.sin(((hour - 9) / 24) * 2 * Math.PI) * 5.0;
    const noiseTemp = (Math.random() - 0.5) * 0.4;
    const outdoorTemp = Math.round((this.baseTemp + diurnalTemp + noiseTemp) * 10) / 10;

    // Indoor temp stays relatively stable around 21°C
    const indoorTemp = Math.round((21.0 + (Math.random() - 0.5) * 0.3) * 10) / 10;
    const indoorHumidity = Math.round(48 + (Math.random() - 0.5) * 2);

    // Garage temp sits between indoor and outdoor (unheated building)
    const garageTemp = Math.round((16.5 + (diurnalTemp * 0.4) + ((Math.random() - 0.5) * 0.3)) * 10) / 10;
    const garageHumidity = Math.min(95, Math.max(30, Math.round(55 - (diurnalTemp * 1.2) + ((Math.random() - 0.5) * 2))));
    const garageDewPoint = FineOffsetDecoder.calculateDewPoint(garageTemp, garageHumidity);

    // Downstairs temp sits around 19.5°C to 20.5°C
    const downstairsTemp = Math.round((19.5 + (diurnalTemp * 0.2) + ((Math.random() - 0.5) * 0.3)) * 10) / 10;
    const downstairsHumidity = Math.min(95, Math.max(30, Math.round(50 - (diurnalTemp * 0.8) + ((Math.random() - 0.5) * 2))));
    const downstairsDewPoint = FineOffsetDecoder.calculateDewPoint(downstairsTemp, downstairsHumidity);

    // Inverse humidity curve for outdoor
    const outdoorHumidity = Math.min(99, Math.max(25, Math.round(this.baseHumidity - (diurnalTemp * 2.5) + ((Math.random() - 0.5) * 3))));

    // Barometric pressure gradual trend
    const pressTrend = Math.cos(this.step / 30) * 4.5;
    const absPressure = Math.round((this.basePressure + pressTrend + (Math.random() - 0.5) * 0.2) * 10) / 10;
    const relPressure = Math.round((absPressure + 14.5) * 10) / 10;

    // Wind dynamics
    const windSpeed = Math.max(0, Math.round((this.baseWindSpeed + (Math.sin(this.step / 10) * 2.0) + (Math.random() - 0.5) * 1.5) * 10) / 10);
    const windGust = Math.max(windSpeed, Math.round((windSpeed + Math.random() * 3.5) * 10) / 10);

    // Wind direction gradual wander with occasional shift
    if (Math.random() < 0.2) {
      this.baseWindDirIdx = (this.baseWindDirIdx + (Math.random() > 0.5 ? 1 : -1) + 16) % 16;
    }
    const windDirObj = FineOffsetDecoder.getWindDirection(this.baseWindDirIdx);

    // Occasional rain event
    if (Math.random() < 0.08) {
      this.totalRainMm = Math.round((this.totalRainMm + 0.3) * 10) / 10;
    }

    if (this.lightningCount === undefined) {
      this.lightningCount = 2;
      this.lastLightningDist = 14;
      this.lastLightningTime = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    }
    if (Math.random() < 0.05) {
      this.lightningCount++;
      const distances = [3, 6, 9, 12, 16, 20, 25];
      this.lastLightningDist = distances[Math.floor(Math.random() * distances.length)];
      this.lastLightningTime = now.toISOString();
    }

    const dewPoint = FineOffsetDecoder.calculateDewPoint(outdoorTemp, outdoorHumidity);
    const windChill = FineOffsetDecoder.calculateWindChill(outdoorTemp, windSpeed);
    const heatIndex = FineOffsetDecoder.calculateHeatIndex(outdoorTemp, outdoorHumidity);

    return {
      timestamp: now.toISOString(),
      source: 'simulated',
      delayMinutes: 1,
      indoorTemp,
      indoorHumidity,
      outdoorTemp,
      outdoorHumidity,
      garageTemp,
      garageHumidity,
      garageDewPoint,
      downstairsTemp,
      downstairsHumidity,
      downstairsDewPoint,
      absPressure,
      relPressure,
      windSpeed,
      windGust,
      windDirection: windDirObj.code,
      windDirectionDeg: windDirObj.deg,
      windDirectionName: windDirObj.name,
      totalRainMm: this.totalRainMm,
      lightningDistanceKm: this.lastLightningDist,
      lightningCountDay: this.lightningCount,
      lightningLastTime: this.lastLightningTime,
      wh57BatteryStatus: 'Normal',
      dewPoint,
      windChill,
      heatIndex,
      status: {
        outdoorSensorLost: false,
        outdoorBatteryLow: false,
        rawStatusByte: 0x00
      }
    };
  }
}

module.exports = MockWeatherStation;
