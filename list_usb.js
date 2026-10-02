const hid = require('node-hid');
const devices = hid.devices();

console.log('--- ALL CONNECTED USB HID DEVICES ---');
devices.forEach((d, idx) => {
  const vidHex = '0x' + d.vendorId.toString(16).padStart(4, '0');
  const pidHex = '0x' + d.productId.toString(16).padStart(4, '0');
  console.log(`[${idx}] VID: ${vidHex} | PID: ${pidHex} | Mfr: ${d.manufacturer || 'N/A'} | Prod: ${d.product || 'N/A'} | Path: ${d.path}`);
});
console.log('------------------------------------');
