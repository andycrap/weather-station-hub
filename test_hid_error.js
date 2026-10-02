const FineOffsetUsbDriver = require('./lib/fineoffset_usb');

const driver = new FineOffsetUsbDriver((record) => {
  console.log('[POLL SUCCESS]', record.outdoorTemp, record.relPressure);
});

// Print any error
driver.readConsoleOnce()
  .then(r => console.log('FIRST READ OK:', r.outdoorTemp))
  .catch(e => console.error('FIRST READ ERROR:', e.message));

setTimeout(() => {
  driver.readConsoleOnce()
    .then(r => console.log('SECOND READ OK:', r.outdoorTemp))
    .catch(e => console.error('SECOND READ ERROR:', e.message));
}, 3000);
