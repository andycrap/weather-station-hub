/**
 * WebHID Browser Driver for Fine Offset USB Weather Station
 * Allows direct in-browser pairing with zero backend drivers!
 */

class WebHIDWeatherDriver {
  constructor(onDataCallback) {
    this.device = null;
    this.onDataCallback = onDataCallback;
    this.isConnected = false;
  }

  isSupported() {
    return 'hid' in navigator;
  }

  /**
   * Prompt user to pair USB HID Weather Station console
   */
  async requestDevice() {
    if (!this.isSupported()) {
      alert('WebHID API is not supported in this browser. Please use Chrome, Edge, or Brave.');
      return false;
    }

    try {
      // Fine Offset VIDs: 0x1941 (6465), 0x016c (364)
      const devices = await navigator.hid.requestDevice({
        filters: [
          { vendorId: 0x1941 },
          { vendorId: 0x016c },
          { vendorId: 0x0e8f }
        ]
      });

      if (devices && devices.length > 0) {
        this.device = devices[0];
        await this.connectDevice();
        return true;
      }
    } catch (err) {
      console.error('[WebHID] User cancelled or error selecting device:', err);
    }
    return false;
  }

  async connectDevice() {
    if (!this.device) return;

    try {
      if (!this.device.opened) {
        await this.device.open();
      }

      console.log(`[WebHID] Connected to: ${this.device.productName} (VID: 0x${this.device.vendorId.toString(16)})`);
      this.isConnected = true;

      // Listen for HID report data
      this.device.addEventListener('inputreport', (event) => {
        const { data } = event;
        const bytes = Array.from(new Uint8Array(data.buffer));
        console.log('[WebHID] Received HID payload:', bytes);

        if (this.onDataCallback && bytes.length >= 16) {
          this.onDataCallback(bytes);
        }

        // Post to backend database so history is preserved
        fetch('/api/weather/webhid-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bytes })
        }).catch(() => {});
      });

    } catch (err) {
      console.error('[WebHID] Failed to open device:', err);
      this.isConnected = false;
    }
  }

  async disconnect() {
    if (this.device && this.device.opened) {
      await this.device.close();
      this.isConnected = false;
      console.log('[WebHID] Disconnected device.');
    }
  }
}
