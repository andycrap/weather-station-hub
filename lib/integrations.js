/**
 * Weather Underground & Home Assistant MQTT Integration Module
 */

const http = require('http');
const https = require('https');
const mqtt = require('mqtt');

class WeatherUndergroundUploader {
  constructor(config = {}) {
    this.enabled = config.enabled || false;
    this.stationId = config.stationId || '';
    this.stationKey = config.stationKey || '';
    this.uploadIntervalMinutes = Number(config.uploadIntervalMinutes) || 5;
    this.lastUploadTime = 0;
  }

  updateConfig(config) {
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.stationId !== undefined) this.stationId = config.stationId;
    if (config.stationKey !== undefined) this.stationKey = config.stationKey;
    if (config.uploadIntervalMinutes !== undefined) this.uploadIntervalMinutes = Number(config.uploadIntervalMinutes) || 5;
    this.lastUploadTime = 0; // Trigger immediate upload after saving new settings
  }

  shouldUpload() {
    if (!this.enabled || !this.stationId || !this.stationKey) return false;
    const now = Date.now();
    return (now - this.lastUploadTime) >= (this.uploadIntervalMinutes * 60 * 1000);
  }

  upload(record) {
    if (!this.shouldUpload() || !record) return;

    this.lastUploadTime = Date.now();

    const tempF = record.outdoorTemp !== null ? ((record.outdoorTemp * 9 / 5) + 32).toFixed(1) : '';
    const dewF = record.dewPoint !== null ? ((record.dewPoint * 9 / 5) + 32).toFixed(1) : '';
    const inTempF = record.indoorTemp !== null ? ((record.indoorTemp * 9 / 5) + 32).toFixed(1) : '';
    const baroIn = record.absPressure !== null ? (record.absPressure * 0.02953).toFixed(2) : '';
    const windMph = record.windSpeed !== null ? (record.windSpeed * 2.23694).toFixed(1) : '0';
    const gustMph = record.windGust !== null ? (record.windGust * 2.23694).toFixed(1) : '0';
    const rainIn = record.totalRainMm !== null ? (record.totalRainMm * 0.0393701).toFixed(2) : '0';

    const now = new Date();
    const dateUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}%20${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;

    const queryParams = [
      `ID=${encodeURIComponent(this.stationId)}`,
      `PASSWORD=${encodeURIComponent(this.stationKey)}`,
      `dateutc=${dateUtc}`,
      `winddir=${record.windDirectionDeg || 0}`,
      `windspeedmph=${windMph}`,
      `windgustmph=${gustMph}`,
      `humidity=${record.outdoorHumidity || 0}`,
      `tempf=${tempF}`,
      `dewptf=${dewF}`,
      `baromin=${baroIn}`,
      `dailyrainin=${rainIn}`,
      `indoortempf=${inTempF}`,
      `indoorhumidity=${record.indoorHumidity || 0}`,
      ...(record.solarRadiation !== null && record.solarRadiation !== undefined ? [`solarradiation=${record.solarRadiation}`] : []),
      ...(record.uvIndex !== null && record.uvIndex !== undefined ? [`UV=${record.uvIndex}`] : []),
      `action=updateraw`
    ].join('&');

    const url = `http://weatherstation.wunderground.com/weatherstation/updateweatherstation.php?${queryParams}`;

    console.log(`[Wunderground] Uploading live weather to station ${this.stationId}...`);

    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[Wunderground Response]: ${body.trim()}`);
      });
    }).on('error', (err) => {
      console.error('[Wunderground Error]:', err.message);
    });
  }
}

class HomeAssistantMqttPublisher {
  constructor(config = {}) {
    this.enabled = config.enabled || false;
    this.brokerUrl = config.brokerUrl || 'mqtt://localhost:1883';
    this.username = config.username || '';
    this.password = config.password || '';
    this.topicPrefix = config.topicPrefix || 'homeassistant';
    this.client = null;
    this.isDiscoverySent = false;
  }

  updateConfig(config) {
    const wasEnabled = this.enabled;
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.brokerUrl !== undefined) this.brokerUrl = config.brokerUrl;
    if (config.username !== undefined) this.username = config.username;
    if (config.password !== undefined) this.password = config.password;

    if (this.enabled && (!this.client || !this.client.connected)) {
      this.connect();
    } else if (!this.enabled && this.client) {
      this.client.end();
      this.client = null;
    }
  }

  connect() {
    if (!this.enabled) return;

    try {
      console.log(`[Home Assistant MQTT] Connecting to broker ${this.brokerUrl}...`);
      const opts = {};
      if (this.username) opts.username = this.username;
      if (this.password) opts.password = this.password;

      this.client = mqtt.connect(this.brokerUrl, opts);

      this.client.on('connect', () => {
        console.log('[Home Assistant MQTT] Connected successfully to MQTT broker.');
        this.publishAutoDiscovery();
      });

      this.client.on('error', (err) => {
        console.error('[Home Assistant MQTT Error]:', err.message);
      });
    } catch (err) {
      console.error('[Home Assistant MQTT Connect Error]:', err.message);
    }
  }

  publishAutoDiscovery() {
    if (!this.client || !this.client.connected) return;

    const device = {
      identifiers: ['fineoffset_weather_station'],
      name: 'Weather Station Hub',
      model: 'Fine Offset USB Console',
      manufacturer: 'Fine Offset'
    };

    const stateTopic = `${this.topicPrefix}/sensor/weather_station/state`;

    const sensors = [
      { id: 'outdoor_temperature', name: 'Outdoor Temperature', class: 'temperature', unit: '°C', val: '{{ value_json.outdoorTemp }}' },
      { id: 'outdoor_humidity', name: 'Outdoor Humidity', class: 'humidity', unit: '%', val: '{{ value_json.outdoorHumidity }}' },
      { id: 'indoor_temperature', name: 'Indoor Temperature', class: 'temperature', unit: '°C', val: '{{ value_json.indoorTemp }}' },
      { id: 'indoor_humidity', name: 'Indoor Humidity', class: 'humidity', unit: '%', val: '{{ value_json.indoorHumidity }}' },
      { id: 'garage_temperature', name: 'Garage Temperature', class: 'temperature', unit: '°C', val: '{{ value_json.garageTemp }}' },
      { id: 'garage_humidity', name: 'Garage Humidity', class: 'humidity', unit: '%', val: '{{ value_json.garageHumidity }}' },
      { id: 'downstairs_temperature', name: 'Downstairs Temperature', class: 'temperature', unit: '°C', val: '{{ value_json.downstairsTemp }}' },
      { id: 'downstairs_humidity', name: 'Downstairs Humidity', class: 'humidity', unit: '%', val: '{{ value_json.downstairsHumidity }}' },
      { id: 'downstairs_dew_point', name: 'Downstairs Dew Point', class: 'temperature', unit: '°C', val: '{{ value_json.downstairsDewPoint }}' },
      { id: 'barometric_pressure', name: 'Barometric Pressure', class: 'pressure', unit: 'hPa', val: '{{ value_json.absPressure }}' },
      { id: 'wind_speed', name: 'Wind Speed', class: 'wind_speed', unit: 'm/s', val: '{{ value_json.windSpeed }}' },
      { id: 'wind_gust', name: 'Wind Gust', class: 'wind_speed', unit: 'm/s', val: '{{ value_json.windGust }}' },
      { id: 'wind_direction', name: 'Wind Direction', icon: 'mdi:compass', unit: '°', val: '{{ value_json.windDirectionDeg }}' },
      { id: 'rain_total', name: 'Total Rainfall', icon: 'mdi:weather-rainy', unit: 'mm', val: '{{ value_json.totalRainMm }}' },
      { id: 'dew_point', name: 'Dew Point', class: 'temperature', unit: '°C', val: '{{ value_json.dewPoint }}' },
      { id: 'solar_radiation', name: 'Solar Radiation', icon: 'mdi:white-balance-sunny', unit: 'W/m²', val: '{{ value_json.solarRadiation }}' },
      { id: 'uv_index', name: 'UV Index', icon: 'mdi:sun-wireless', val: '{{ value_json.uvIndex }}' },
      { id: 'piezo_rain_rate', name: 'Piezo Rain Rate', icon: 'mdi:weather-pouring', unit: 'mm/h', val: '{{ value_json.piezoRainRateMm }}' },
      { id: 'ws90_capacitor_voltage', name: 'WS90 Supercapacitor Voltage', class: 'voltage', unit: 'V', val: '{{ value_json.ws90CapacitorVolt }}' },
      { id: 'lightning_distance', name: 'Lightning Strike Distance', icon: 'mdi:map-marker-distance', unit: 'km', val: '{{ value_json.lightningDistanceKm }}' },
      { id: 'lightning_count', name: 'Lightning Daily Strikes', icon: 'mdi:flash-alert', unit: 'strikes', val: '{{ value_json.lightningCountDay }}' },
      { id: 'lightning_last_time', name: 'Lightning Last Strike Time', icon: 'mdi:clock-outline', val: '{{ value_json.lightningLastTime }}' },
      { id: 'wh57_battery_status', name: 'WH57 Lightning Sensor Battery', icon: 'mdi:battery', val: '{{ value_json.wh57BatteryStatus }}' }
    ];

    sensors.forEach(s => {
      const configTopic = `${this.topicPrefix}/sensor/weather_station_${s.id}/config`;
      const configPayload = {
        name: s.name,
        unique_id: `weather_station_${s.id}`,
        state_topic: stateTopic,
        value_template: s.val,
        device: device
      };
      if (s.class) configPayload.device_class = s.class;
      if (s.unit) configPayload.unit_of_measurement = s.unit;
      if (s.icon) configPayload.icon = s.icon;

      this.client.publish(configTopic, JSON.stringify(configPayload), { retain: true });
    });

    console.log('[Home Assistant MQTT] Auto-Discovery configurations published to Home Assistant!');
    this.isDiscoverySent = true;
  }

  publishState(record) {
    if (!this.enabled || !this.client || !this.client.connected || !record) return;

    const stateTopic = `${this.topicPrefix}/sensor/weather_station/state`;
    this.client.publish(stateTopic, JSON.stringify(record));
  }
}

module.exports = {
  WeatherUndergroundUploader,
  HomeAssistantMqttPublisher
};
