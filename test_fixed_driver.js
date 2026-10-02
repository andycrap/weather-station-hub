const hid = require('node-hid');
const FineOffsetDecoder = require('./lib/fineoffset_decoder');

try {
  const devices = hid.devices();
  const target = devices.find(d => d.vendorId === 0x1941 && d.productId === 0x8021);

  if (!target) {
    console.log('Target device 0x1941:0x8021 not found!');
    process.exit(1);
  }

  const device = new hid.HID(target.path);
  let rxBuffer = [];

  device.on('data', (chunk) => {
    rxBuffer.push(...Array.from(chunk));

    while (rxBuffer.length >= 32) {
      const block = Uint8Array.from(rxBuffer.slice(0, 32));
      rxBuffer = rxBuffer.slice(32);

      // Check if Fixed Block (0x55 0xAA)
      if (block[0] === 0x55 && block[1] === 0xaa) {
        const ptr = (block[31] << 8) | block[30];
        console.log(`[Fixed Block Verified] Circular Buffer Pointer: 0x${ptr.toString(16).padStart(4, '0')} (${ptr})`);
        
        // Request the live record at ptr
        setTimeout(() => {
          const hi = (ptr >> 8) & 0xFF;
          const lo = ptr & 0xFF;
          device.write([0x00, 0xA1, hi, lo, 0x20, 0xA1, hi, lo, 0x20]);
        }, 100);
      } else {
        // Record block received!
        // Record 1 is bytes 0..15
        const rec1 = block.slice(0, 16);
        console.log('--- RAW RECORD 16 BYTES ---');
        console.log(Buffer.from(rec1).toString('hex'));

        const decoded = FineOffsetDecoder.decodeRecord(rec1);
        console.log('====================================================');
        console.log('  SUCCESSFULLY PARSED LIVE WEATHER FROM CONSOLE:');
        console.log(`  Outdoor Temp : ${decoded.outdoorTemp} °C`);
        console.log(`  Outdoor Hum  : ${decoded.outdoorHumidity} %`);
        console.log(`  Indoor Temp  : ${decoded.indoorTemp} °C`);
        console.log(`  Indoor Hum   : ${decoded.indoorHumidity} %`);
        console.log(`  Rel Pressure : ${decoded.relPressure} hPa`);
        console.log(`  Wind Speed   : ${decoded.windSpeed} m/s`);
        console.log(`  Wind Gust    : ${decoded.windGust} m/s`);
        console.log(`  Wind Dir     : ${decoded.windDirection} (${decoded.windDirectionDeg}°)`);
        console.log(`  Total Rain   : ${decoded.totalRainMm} mm`);
        console.log('====================================================');

        device.close();
        process.exit(0);
      }
    }
  });

  // Request fixed block
  console.log('Requesting Fixed Block 0x0000...');
  device.write([0x00, 0xA1, 0x00, 0x00, 0x20, 0xA1, 0x00, 0x00, 0x20]);

} catch (err) {
  console.error('Error:', err.message);
}
