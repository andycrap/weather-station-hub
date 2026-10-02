const hid = require('node-hid');
const FineOffsetDecoder = require('./lib/fineoffset_decoder');

class FineOffsetUsbReader {
  constructor(vendorId = 0x1941, productId = 0x8021) {
    this.vendorId = vendorId;
    this.productId = productId;
    this.device = null;
    this.buffer = [];
    this.currentRecordPointer = 0x0100;
  }

  connect() {
    const devices = hid.devices();
    const target = devices.find(d => d.vendorId === this.vendorId && d.productId === this.productId);
    if (!target) return false;

    console.log('[USB Reader] Found physical console:', target.path);
    this.device = new hid.HID(target.path);

    this.device.on('data', (chunk) => {
      const bytes = Array.from(chunk);
      this.buffer.push(...bytes);

      if (this.buffer.length >= 32) {
        const fullBlock = Uint8Array.from(this.buffer.slice(0, 32));
        this.buffer = this.buffer.slice(32);
        this.parseBlock(fullBlock);
      }
    });

    this.device.on('error', (err) => {
      console.error('[USB Reader Error]', err.message);
    });

    return true;
  }

  requestAddress(address) {
    if (!this.device) return;
    const hi = (address >> 8) & 0xFF;
    const lo = address & 0xFF;
    // Command format: [0x00, 0xA1, hi, lo, 0x20, 0xA1, hi, lo, 0x20]
    const cmd = [0x00, 0xA1, hi, lo, 0x20, 0xA1, hi, lo, 0x20];
    this.device.write(cmd);
  }

  parseBlock(block) {
    const hex = Buffer.from(block).toString('hex');
    console.log('[USB Block 32 Bytes]', hex);

    // If this is fixed block (address 0x0000 starts with 0x55 0xaa)
    if (block[0] === 0x55 && block[1] === 0xaa) {
      // Bytes 30-31 contain current circular buffer pointer (uint16_le)
      const ptr = (block[31] << 8) | block[30];
      console.log(`[Fixed Block] Magic 0x55AA verified! Current Circular Buffer Pointer: 0x${ptr.toString(16).padStart(4, '0')} (${ptr})`);
      this.currentRecordPointer = ptr;

      // Now request the record at ptr
      setTimeout(() => {
        console.log(`[USB Reader] Requesting live record block at address 0x${ptr.toString(16).padStart(4, '0')}...`);
        this.requestAddress(ptr);
      }, 500);
    } else {
      // Decode 16-byte record
      try {
        const record = FineOffsetDecoder.decodeRecord(block.slice(0, 16));
        console.log('====================================================');
        console.log('  LIVE HARDWARE WEATHER DATA READ FROM CONSOLE:');
        console.log(`  Outdoor Temp : ${record.outdoorTemp} °C`);
        console.log(`  Outdoor Hum  : ${record.outdoorHumidity} %`);
        console.log(`  Indoor Temp  : ${record.indoorTemp} °C`);
        console.log(`  Indoor Hum   : ${record.indoorHumidity} %`);
        console.log(`  Rel Pressure : ${record.relPressure} hPa`);
        console.log(`  Wind Speed   : ${record.windSpeed} m/s`);
        console.log(`  Wind Gust    : ${record.windGust} m/s`);
        console.log(`  Wind Dir     : ${record.windDirection} (${record.windDirectionDeg}°)`);
        console.log(`  Total Rain   : ${record.totalRainMm} mm`);
        console.log('====================================================');
      } catch (err) {
        console.error('Record parse error:', err.message);
      }
    }
  }

  pollCurrentData() {
    console.log('[USB Reader] Requesting Fixed Block (0x0000)...');
    this.requestAddress(0x0000);
  }

  close() {
    if (this.device) this.device.close();
  }
}

const reader = new FineOffsetUsbReader();
if (reader.connect()) {
  reader.pollCurrentData();
  setTimeout(() => {
    reader.close();
    process.exit(0);
  }, 4000);
}
