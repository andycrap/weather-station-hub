const hid = require('node-hid');
const FineOffsetDecoder = require('./lib/fineoffset_decoder');

class PersistentUsbReader {
  constructor() {
    this.device = null;
    this.rxBuffer = [];
    this.waitingForRecord = false;
    this.currentPointer = 0x0100;
  }

  connect() {
    const devices = hid.devices();
    const target = devices.find(d => d.vendorId === 0x1941 && d.productId === 0x8021);
    if (!target) return false;

    console.log('[Persistent HID] Opening device handle once:', target.path);
    this.device = new hid.HID(target.path);

    this.device.on('data', (chunk) => {
      this.rxBuffer.push(...Array.from(chunk));

      while (this.rxBuffer.length >= 32) {
        const block = Uint8Array.from(this.rxBuffer.slice(0, 32));
        this.rxBuffer = this.rxBuffer.slice(32);

        if (block[0] === 0x55 && block[1] === 0xaa) {
          const ptr = (block[31] << 8) | block[30];
          if (ptr && ptr >= 0x0100) this.currentPointer = ptr;
          this.waitingForRecord = true;
          // Request live record
          const hi = (this.currentPointer >> 8) & 0xFF;
          const lo = this.currentPointer & 0xFF;
          this.device.write([0x00, 0xA1, hi, lo, 0x20, 0xA1, hi, lo, 0x20]);
        } else if (this.waitingForRecord) {
          this.waitingForRecord = false;
          const rec = block.slice(0, 16);
          try {
            const decoded = FineOffsetDecoder.decodeRecord(rec, { pressureOffset: 0.0 });
            console.log(`[STABLE READ] Outdoor: ${decoded.outdoorTemp}°C, ${decoded.outdoorHumidity}%, Press: ${decoded.relPressure}hPa, Wind: ${decoded.windSpeed}m/s`);
          } catch (e) {}
        }
      }
    });

    this.device.on('error', (err) => {
      console.error('[Persistent HID Error]:', err.message);
    });

    return true;
  }

  poll() {
    if (!this.device) return;
    this.waitingForRecord = false;
    this.rxBuffer = []; // Flush buffer on each poll
    try {
      this.device.write([0x00, 0xA1, 0x00, 0x00, 0x20, 0xA1, 0x00, 0x00, 0x20]);
    } catch (e) {
      console.error('Write error:', e.message);
    }
  }
}

const reader = new PersistentUsbReader();
if (reader.connect()) {
  let count = 0;
  const interval = setInterval(() => {
    count++;
    console.log(`--- POLL CYCLE #${count} ---`);
    reader.poll();

    if (count >= 10) {
      clearInterval(interval);
      console.log('--- COMPLETED 10 POLL CYCLES STABLY ---');
      process.exit(0);
    }
  }, 2000);
}
