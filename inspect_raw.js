const hid = require('node-hid');

try {
  const devices = hid.devices();
  const target = devices.find(d => d.vendorId === 0x1941 && d.productId === 0x8021);

  if (!target) {
    console.log('Target device 0x1941:0x8021 not found!');
    process.exit(1);
  }

  console.log('Opening device:', target.path);
  const device = new hid.HID(target.path);

  let rawBlocks = [];

  device.on('data', (chunk) => {
    const bytes = Array.from(chunk);
    rawBlocks.push(bytes);
    console.log(`[RAW HID ${bytes.length} BYTES]:`, bytes.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log(`[DECIMAL BYTES]:`, bytes.join(', '));
  });

  // Request fixed block (0x0000)
  console.log('--- REQUESTING FIXED BLOCK (0x0000) ---');
  device.write([0x00, 0xA1, 0x00, 0x00, 0x20, 0xA1, 0x00, 0x00, 0x20]);

  setTimeout(() => {
    console.log('--- REQUESTING ADDRESS (0x0020) ---');
    device.write([0x00, 0xA1, 0x00, 0x20, 0x20, 0xA1, 0x00, 0x20, 0x20]);
  }, 1000);

  setTimeout(() => {
    console.log('--- REQUESTING ADDRESS (0x0100) ---');
    device.write([0x00, 0xA1, 0x01, 0x00, 0x20, 0xA1, 0x01, 0x00, 0x20]);
  }, 2000);

  setTimeout(() => {
    device.close();
    process.exit(0);
  }, 3500);

} catch (err) {
  console.error('Inspect error:', err.message);
}
