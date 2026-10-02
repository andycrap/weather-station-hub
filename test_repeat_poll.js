const hid = require('node-hid');
const FineOffsetDecoder = require('./lib/fineoffset_decoder');

function readConsoleOnce() {
  return new Promise((resolve, reject) => {
    try {
      const devices = hid.devices();
      const target = devices.find(d => d.vendorId === 0x1941 && d.productId === 0x8021);
      if (!target) return reject(new Error('Device 0x1941:0x8021 not found'));

      const device = new hid.HID(target.path);
      let rxBuffer = [];
      let waitingForRecord = false;
      let currentPointer = 0x0100;
      let timer = null;

      timer = setTimeout(() => {
        try { device.close(); } catch(e) {}
        reject(new Error('Poll timeout'));
      }, 2500);

      device.on('data', (chunk) => {
        rxBuffer.push(...Array.from(chunk));

        while (rxBuffer.length >= 32) {
          const block = Uint8Array.from(rxBuffer.slice(0, 32));
          rxBuffer = rxBuffer.slice(32);

          if (block[0] === 0x55 && block[1] === 0xaa) {
            const ptr = (block[31] << 8) | block[30];
            if (ptr && ptr >= 0x0100) currentPointer = ptr;
            waitingForRecord = true;
            const hi = (currentPointer >> 8) & 0xFF;
            const lo = currentPointer & 0xFF;
            device.write([0x00, 0xA1, hi, lo, 0x20, 0xA1, hi, lo, 0x20]);
          } else if (waitingForRecord) {
            clearTimeout(timer);
            try { device.close(); } catch(e) {}
            const rec = block.slice(0, 16);
            const decoded = FineOffsetDecoder.decodeRecord(rec, { pressureOffset: 0.0 });
            resolve(decoded);
          }
        }
      });

      device.on('error', (err) => {
        clearTimeout(timer);
        try { device.close(); } catch(e) {}
        reject(err);
      });

      // Request fixed block
      device.write([0x00, 0xA1, 0x00, 0x00, 0x20, 0xA1, 0x00, 0x00, 0x20]);

    } catch (err) {
      reject(err);
    }
  });
}

async function runLoop() {
  console.log('--- TESTING REPEAT HID READ LOOPS ---');
  for (let i = 1; i <= 5; i++) {
    try {
      const res = await readConsoleOnce();
      console.log(`[POLL #${i} SUCCESS] Outdoor: ${res.outdoorTemp}°C, ${res.outdoorHumidity}%, Press: ${res.relPressure}hPa, Wind: ${res.windSpeed}m/s`);
    } catch (err) {
      console.error(`[POLL #${i} FAILED]:`, err.message);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

runLoop();
