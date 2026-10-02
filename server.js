/**
 * EasyWeather Replacement Server
 * Express REST API & WebSocket server with USB Heartbeat Monitor & Integrations
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const FineOffsetDecoder = require('./lib/fineoffset_decoder');
const EcowittDecoder = require('./lib/ecowitt_decoder');
const FineOffsetUsbDriver = require('./lib/fineoffset_usb');
const MockWeatherStation = require('./lib/mock_station');
const WeatherDatabase = require('./lib/database');
const { WeatherUndergroundUploader, HomeAssistantMqttPublisher } = require('./lib/integrations');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Persistent Config Storage (AppData directory so zip updates never overwrite user settings)
const appDataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'WeatherStationHub') : __dirname;
if (!fs.existsSync(appDataDir)) {
  try { fs.mkdirSync(appDataDir, { recursive: true }); } catch (e) {}
}

const https = require('https');

const APPDATA_CONFIG_FILE = path.join(appDataDir, 'integrations_config.json');
const LOCAL_CONFIG_FILE = path.join(__dirname, 'integrations_config.json');

const defaultConfig = {
  station: { deviceType: 'fineoffset_usb' },
  wunderground: { enabled: false, stationId: '', stationKey: '', uploadIntervalMinutes: 5 },
  homeassistant: { enabled: false, brokerUrl: 'mqtt://localhost:1883', username: '', password: '', topicPrefix: 'homeassistant' },
  location: { latitude: 52.685732, longitude: -2.033592, altitudeMeters: 140, cityName: '', autoGeoIP: false }
};

let cachedGeoLocation = null;

function lookupGeoIPLocation() {
  if (cachedGeoLocation) return Promise.resolve(cachedGeoLocation);

  return new Promise((resolve) => {
    http.get('http://ip-api.com/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.status === 'success') {
            const lat = json.lat;
            const lon = json.lon;
            const city = json.city || 'Unknown';
            const country = json.countryCode || 'UK';

            https.get(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, (elRes) => {
              let elData = '';
              elRes.on('data', c => elData += c);
              elRes.on('end', () => {
                let alt = 140;
                try {
                  const elJson = JSON.parse(elData);
                  if (elJson && elJson.elevation && elJson.elevation.length > 0) {
                    alt = Math.round(elJson.elevation[0]);
                  }
                } catch (e) {}

                cachedGeoLocation = {
                  latitude: lat,
                  longitude: lon,
                  altitudeMeters: alt,
                  city: city,
                  country: country
                };
                resolve(cachedGeoLocation);
              });
            }).on('error', () => {
              cachedGeoLocation = { latitude: lat, longitude: lon, altitudeMeters: 140, city, country };
              resolve(cachedGeoLocation);
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

function loadMergedIntegrationConfig() {
  let appDataCfg = {};
  let localCfg = {};

  try {
    if (fs.existsSync(APPDATA_CONFIG_FILE)) {
      appDataCfg = JSON.parse(fs.readFileSync(APPDATA_CONFIG_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.warn('[Server] Error reading AppData integration config:', e.message);
  }

  try {
    if (fs.existsSync(LOCAL_CONFIG_FILE)) {
      localCfg = JSON.parse(fs.readFileSync(LOCAL_CONFIG_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.warn('[Server] Error reading local integration config:', e.message);
  }

  const merged = {
    station: {
      ...defaultConfig.station,
      ...(localCfg.station || {}),
      ...(appDataCfg.station || {})
    },
    wunderground: {
      ...defaultConfig.wunderground,
      ...(localCfg.wunderground || {}),
      ...(appDataCfg.wunderground || {})
    },
    homeassistant: {
      ...defaultConfig.homeassistant,
      ...(localCfg.homeassistant || {}),
      ...(appDataCfg.homeassistant || {})
    },
    location: {
      ...defaultConfig.location,
      ...(localCfg.location || {}),
      ...(appDataCfg.location || {})
    }
  };

  if (localCfg.wunderground && (localCfg.wunderground.stationId || localCfg.wunderground.enabled)) {
    if (!merged.wunderground.stationId) merged.wunderground.stationId = localCfg.wunderground.stationId;
    if (!merged.wunderground.stationKey) merged.wunderground.stationKey = localCfg.wunderground.stationKey;
    if (localCfg.wunderground.enabled) merged.wunderground.enabled = true;
  }

  if (localCfg.homeassistant && (localCfg.homeassistant.username || localCfg.homeassistant.enabled)) {
    if (!merged.homeassistant.brokerUrl || merged.homeassistant.brokerUrl === 'mqtt://localhost:1883') {
      merged.homeassistant.brokerUrl = localCfg.homeassistant.brokerUrl || merged.homeassistant.brokerUrl;
    }
    if (!merged.homeassistant.username) merged.homeassistant.username = localCfg.homeassistant.username;
    if (!merged.homeassistant.password) merged.homeassistant.password = localCfg.homeassistant.password;
    if (localCfg.homeassistant.enabled) merged.homeassistant.enabled = true;
  }

  return merged;
}

function saveIntegrationConfig(config) {
  const dataStr = JSON.stringify(config, null, 2);
  try {
    fs.writeFileSync(APPDATA_CONFIG_FILE, dataStr, 'utf8');
  } catch (e) {
    console.error('[Server] Failed to write config to AppData:', e.message);
  }
  try {
    fs.writeFileSync(LOCAL_CONFIG_FILE, dataStr, 'utf8');
  } catch (e) {
    console.error('[Server] Failed to write config to local directory:', e.message);
  }
}

const db = new WeatherDatabase();
const mockStation = new MockWeatherStation();

let integrationConfig = loadMergedIntegrationConfig();
saveIntegrationConfig(integrationConfig);

const wuUploader = new WeatherUndergroundUploader(integrationConfig.wunderground);
const haMqtt = new HomeAssistantMqttPublisher(integrationConfig.homeassistant);

if (integrationConfig.homeassistant.enabled) {
  haMqtt.connect();
}

let useSimulation = false;
let currentPacket = db.history.length > 0 ? db.history[db.history.length - 1] : null;
let usbDriver = null;
let lastEcowittTelemetry = null;
let lastEcowittTime = 0;

function handleTelemetryUpdate(packet, modeName) {
  const configuredMode = (integrationConfig.station && integrationConfig.station.deviceType) || 'fineoffset_usb';

  // Strict driver mode filtering: ignore background packets from unselected input drivers
  if (configuredMode === 'ecowitt_wittboy' && modeName === 'usb_hardware') {
    return;
  }
  if (configuredMode === 'fineoffset_usb' && modeName === 'ecowitt_wittboy') {
    return;
  }
  if (configuredMode === 'simulation' && (modeName === 'usb_hardware' || modeName === 'ecowitt_wittboy')) {
    return;
  }

  useSimulation = (modeName === 'simulation');
  currentPacket = packet;
  db.addRecord(packet);

  broadcastPacket(packet, modeName || configuredMode);

  if (wuUploader.enabled) wuUploader.upload(packet);
  if (haMqtt.enabled) haMqtt.publishState(packet);
}

// Initialize Physical USB Driver
usbDriver = new FineOffsetUsbDriver((packet) => {
  handleTelemetryUpdate(packet, 'usb_hardware');
}, () => ({ altitudeMeters: integrationConfig.location.altitudeMeters }));

const usbConnected = usbDriver.start();
if (usbConnected) {
  console.log('[Server] Physical USB Weather Station Console connected!');
} else {
  console.log('[Server] USB Weather Station not found at startup. Scanning USB ports...');
}

// Helper to get EcoWitt state
function getEcowittState() {
  const ageSeconds = lastEcowittTime > 0 ? Math.round((Date.now() - lastEcowittTime) / 1000) : 9999;
  return {
    active: ageSeconds < 120,
    ageSeconds,
    lastSeen: lastEcowittTime > 0 ? new Date(lastEcowittTime).toISOString() : null,
    stationInfo: lastEcowittTelemetry ? {
      stationType: lastEcowittTelemetry.stationType,
      passkey: lastEcowittTelemetry.passkey,
      ws90CapacitorVolt: lastEcowittTelemetry.ws90CapacitorVolt,
      ws90BatteryStatus: lastEcowittTelemetry.ws90BatteryStatus,
      solarRadiation: lastEcowittTelemetry.solarRadiation,
      uvIndex: lastEcowittTelemetry.uvIndex,
      piezoRainRateMm: lastEcowittTelemetry.piezoRainRateMm
    } : null
  };
}

// Periodic Status Broadcast Heartbeat (Every 5s)
setInterval(() => {
  if (currentPacket) {
    const effectiveMode = (integrationConfig.station && integrationConfig.station.deviceType) || (useSimulation ? 'simulation' : 'usb_hardware');
    broadcastPacket(currentPacket, effectiveMode);
  }
}, 5000);

// Broadcast payload to WebSockets
function broadcastPacket(packet, modeName) {
  const usbState = usbDriver ? usbDriver.getConnectionState() : { connected: false, ageSeconds: 999 };
  const ecowittState = getEcowittState();
  const rainStats = db.getRainStats(packet);
  const pressureTrend3h = db.get3HourPressureTrend(packet);

  const payload = JSON.stringify({
    type: 'weather_update',
    data: packet,
    mode: modeName || (integrationConfig.station && integrationConfig.station.deviceType) || (useSimulation ? 'simulation' : 'usb_hardware'),
    stationConfig: integrationConfig.station || { deviceType: 'fineoffset_usb' },
    usbState: usbState,
    ecowittState: ecowittState,
    stats: db.getMinMaxStats(),
    rainStats: rainStats,
    pressureTrend3h: pressureTrend3h
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Express Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// EcoWitt HTTP Upload Listener Route
const handleEcowittRequest = (req, res) => {
  try {
    const payload = (req.body && Object.keys(req.body).length > 0) ? req.body : req.query;
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).send('ERROR: Empty EcoWitt payload');
    }
    const decoded = EcowittDecoder.decodeRecord(payload, { altitudeMeters: integrationConfig.location ? integrationConfig.location.altitudeMeters : 140 });
    lastEcowittTelemetry = decoded;
    lastEcowittTime = Date.now();

    handleTelemetryUpdate(decoded, 'ecowitt_wittboy');

    // Ecowitt hubs expect HTTP 200 OK response with text content "SUCCESS"
    res.status(200).send('SUCCESS');
  } catch (err) {
    console.error('[Ecowitt Listener Error]:', err.message);
    res.status(400).send(`ERROR: ${err.message}`);
  }
};

app.post('/api/weather/ecowitt', handleEcowittRequest);
app.get('/api/weather/ecowitt', handleEcowittRequest);
app.post('/ecowitt', handleEcowittRequest);
app.get('/ecowitt', handleEcowittRequest);

app.get('/api/weather/ecowitt/status', (req, res) => {
  res.json(getEcowittState());
});

// REST API Endpoints
app.get('/api/weather/current', (req, res) => {
  const usbState = usbDriver ? usbDriver.getConnectionState() : { connected: false, ageSeconds: 999 };
  const ecowittState = getEcowittState();
  const rainStats = db.getRainStats(currentPacket);
  const pressureTrend3h = db.get3HourPressureTrend(currentPacket);

  res.json({
    data: currentPacket,
    mode: (integrationConfig.station && integrationConfig.station.deviceType) || (useSimulation ? 'simulation' : 'usb_hardware'),
    stationConfig: integrationConfig.station || { deviceType: 'fineoffset_usb' },
    usbState: usbState,
    ecowittState: ecowittState,
    stats: db.getMinMaxStats(),
    rainStats: rainStats,
    pressureTrend3h: pressureTrend3h
  });
});

app.get('/api/weather/history', (req, res) => {
  const range = req.query.range || req.query.limit || '24h';
  res.json(db.getHistoryByRange(range));
});

app.get('/api/weather/stats', (req, res) => {
  res.json(db.getMinMaxStats());
});

app.get('/api/weather/export/csv', (req, res) => {
  const csvData = db.exportToCSV();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="weather_history.csv"');
  res.status(200).send(csvData);
});

// Integrations Settings API
app.get('/api/integrations/settings', (req, res) => {
  res.json(integrationConfig);
});

app.post('/api/integrations/settings', (req, res) => {
  try {
    const { station, wunderground, homeassistant, location } = req.body;
    if (station) {
      integrationConfig.station = { ...integrationConfig.station, ...station };
    }
    if (wunderground) {
      integrationConfig.wunderground = { ...integrationConfig.wunderground, ...wunderground };
      wuUploader.updateConfig(integrationConfig.wunderground);
    }
    if (homeassistant) {
      integrationConfig.homeassistant = { ...integrationConfig.homeassistant, ...homeassistant };
      haMqtt.updateConfig(integrationConfig.homeassistant);
    }
    if (location) {
      integrationConfig.location = { ...integrationConfig.location, ...location };
    }

    saveIntegrationConfig(integrationConfig);
    res.json({ success: true, message: 'Integration settings saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Station Location & Elevation API
app.get('/api/location/settings', async (req, res) => {
  const locCfg = integrationConfig.location || defaultConfig.location;
  const forceAuto = req.query.auto === 'true';

  if (forceAuto || locCfg.latitude === null || locCfg.longitude === null || locCfg.autoGeoIP) {
    const geo = await lookupGeoIPLocation();
    if (geo) {
      return res.json({
        latitude: forceAuto ? geo.latitude : (locCfg.latitude !== null ? locCfg.latitude : geo.latitude),
        longitude: forceAuto ? geo.longitude : (locCfg.longitude !== null ? locCfg.longitude : geo.longitude),
        altitudeMeters: forceAuto ? geo.altitudeMeters : (locCfg.altitudeMeters !== null ? locCfg.altitudeMeters : geo.altitudeMeters),
        cityName: forceAuto ? `${geo.city}, ${geo.country}` : (locCfg.cityName || `${geo.city}, ${geo.country}`),
        autoGeoIP: !!locCfg.autoGeoIP,
        detectedLocation: `${geo.city}, ${geo.country}`,
        source: 'geoip'
      });
    }
  }

  res.json({
    latitude: locCfg.latitude,
    longitude: locCfg.longitude,
    altitudeMeters: locCfg.altitudeMeters,
    cityName: locCfg.cityName || '',
    autoGeoIP: !!locCfg.autoGeoIP,
    source: 'manual'
  });
});

app.post('/api/location/settings', (req, res) => {
  try {
    const { latitude, longitude, altitudeMeters, cityName, autoGeoIP } = req.body;
    integrationConfig.location = {
      latitude: (latitude !== undefined && latitude !== '' && latitude !== null) ? Number(latitude) : null,
      longitude: (longitude !== undefined && longitude !== '' && longitude !== null) ? Number(longitude) : null,
      altitudeMeters: (altitudeMeters !== undefined && altitudeMeters !== '' && altitudeMeters !== null) ? Number(altitudeMeters) : null,
      cityName: cityName ? String(cityName).trim() : '',
      autoGeoIP: !!autoGeoIP
    };
    saveIntegrationConfig(integrationConfig);
    cachedGeoLocation = null;
    res.json({ success: true, message: 'Station location settings saved successfully!', location: integrationConfig.location });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/shutdown', (req, res) => {
  res.json({ success: true, message: 'Weather Station Hub server is shutting down...' });
  setTimeout(() => {
    console.log('[Server] Shutdown request received. Exiting process tree.');
    process.exit(0);
  }, 1000);
});

app.post('/api/weather/mode', (req, res) => {
  if (!usbDriver) usbDriver = new FineOffsetUsbDriver(packet => handleTelemetryUpdate(packet, 'usb_hardware'), () => ({ altitudeMeters: integrationConfig.location.altitudeMeters }));
  const connected = usbDriver.start();
  if (connected) {
    res.json({ success: true, mode: 'usb_hardware', message: 'Connected to USB Weather Station!' });
  } else {
    res.json({ success: false, mode: 'usb_hardware', message: 'USB Weather Station not detected. Scanning USB ports...' });
  }
});

app.post('/api/weather/usb/reset', (req, res) => {
  const { mode = 'soft' } = req.body || {};
  if (usbDriver) {
    usbDriver.resetConnection(mode);
    res.json({
      success: true,
      mode: mode,
      message: `USB Connection reset requested (${mode.toUpperCase()} reset). Reconnecting to station...`
    });
  } else {
    res.status(400).json({ success: false, message: 'USB Driver not initialized.' });
  }
});

app.post('/api/weather/webhid-report', (req, res) => {
  try {
    const { bytes } = req.body;
    if (bytes && Array.isArray(bytes)) {
      const buffer = Uint8Array.from(bytes);
      const decoded = FineOffsetDecoder.decodeRecord(buffer, { altitudeMeters: integrationConfig.location.altitudeMeters });
      handleTelemetryUpdate(decoded, 'webhid_browser');
      return res.json({ success: true, decoded });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.status(400).json({ error: 'Invalid bytes' });
});

// WebSocket Handler
wss.on('connection', (ws) => {
  const usbState = usbDriver ? usbDriver.getConnectionState() : { connected: false, ageSeconds: 999 };
  const rainStats = db.getRainStats(currentPacket);
  const pressureTrend3h = db.get3HourPressureTrend(currentPacket);

  ws.send(JSON.stringify({
    type: 'weather_update',
    data: currentPacket,
    mode: useSimulation ? 'simulation' : 'usb_hardware',
    usbState: usbState,
    stats: db.getMinMaxStats(),
    rainStats: rainStats,
    pressureTrend3h: pressureTrend3h
  }));
});

const os = require('os');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`=======================================================`);
  console.log(`  EasyWeather Replacement Station Server Running!`);
  console.log(`  Local Dashboard:   http://localhost:${PORT}`);
  console.log(`  Network (LAN) URL: http://${lanIp}:${PORT}`);
  console.log(`  USB Hardware Mode: ${usbConnected ? 'Active USB Hardware' : 'Scanning USB...'}`);
  console.log(`=======================================================`);
});
