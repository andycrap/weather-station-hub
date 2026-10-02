const hid = require('node-hid');
const FineOffsetDecoder = require('./lib/fineoffset_decoder');

try {
  const devices = hid.devices();
  const target = devices.find(d => d.vendorId === 0x1941 && d.productId === 0x8021);

  if (!target) {
    console.log('Target device 0x1941:0x8021 not found!');
    process.exit(1);
  }

  console.log('Opening device:', target.path);
  const device = new hid.HID(target.path);

  device.on('data', (data) => {
    console.log(`[EVENT] Received ${data.length} bytes from weather station:`);
    const hex = Buffer.from(data).toString('hex');
    console.log(hex);

    if (data.length >= 16) {
      try {
        const decoded = FineOffsetDecoder.decodeRecord(Uint8Array.from(data));
        console.log('--- DECODED LIVE WEATHER DATA ---');
        console.log(JSON.stringify(decoded, null, 2));
      } catch (e) {
        console.error('Decoder error:', e.message);
      }
    }
  });

  device.on('error', (err) => {
    console.error('[EVENT Error]', err);
  });

  // Fine Offset read command formats:
  // Command 1: Read memory block 0x0000
  // Command 2: Read memory block current pointer
  const cmd = [0x00, 0xA1, 0x00, 0x00, 0x20, 0xA1, 0x00, 0x00, 0x20];
  console.log('Sending write command...');
  device.write(cmd);

  setTimeout(() => {
    console.log('Closing device.');
    device.close();
  }, 3000);

} catch (err) {
  console.error('Error during HID test:', err.message);
}
