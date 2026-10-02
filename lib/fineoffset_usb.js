/**
 * Fine Offset USB Hardware Polling Driver
 * Uses a single persistent C++ HID handle to avoid V8 isolate GC crashes.
 * Includes automatic stale-data watchdog and soft/hard USB reset support.
 */

const hid = require('node-hid');
const { exec } = require('child_process');
const FineOffsetDecoder = require('./fineoffset_decoder');

class FineOffsetUsbDriver {
  constructor(onDataCallback, getOptions = () => ({})) {
    this.onDataCallback = onDataCallback;
    this.getOptions = getOptions;
    this.device = null;
    this.rxBuffer = [];
    this.currentPointer = 0x0100;
    this.pollTimer = null;
    this.watchdogTimer = null;
    this.waitingForRecord = false;
    this.lastRxTime = Date.now();
    this.isHardwareConnected = false;
    this.isResetting = false;
    this.staleCount = 0;
  }

  start() {
    const success = this.connect();
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => {
        this.poll();
      }, 3000);
    }
    this.startWatchdog();
    return success;
  }

  startWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      this.checkWatchdog();
    }, 10000); // Check data freshness every 10 seconds
  }

  checkWatchdog() {
    if (this.isResetting) return;

    const ageMs = Date.now() - this.lastRxTime;

    // If hardware was connected but no valid data block received for > 25s
    if (this.isHardwareConnected && ageMs > 25000) {
      this.staleCount++;
      console.warn(`[USB Watchdog] No USB data received for ${Math.round(ageMs / 1000)}s (Stale Check #${this.staleCount})`);
      this.isHardwareConnected = false;

      if (this.staleCount >= 4) {
        console.warn('[USB Watchdog] Stale data limit reached. Initiating HARD Windows PnP USB reset...');
        this.resetConnection('hard');
      } else {
        console.warn('[USB Watchdog] Initiating SOFT HID handle reset...');
        this.resetConnection('soft');
      }
    } else if (this.isHardwareConnected) {
      this.staleCount = 0;
    } else if (!this.device) {
      // If disconnected, continuously attempt reconnection
      this.connect();
    }
  }

  closeDevice() {
    if (this.device) {
      try {
        this.device.close();
      } catch (e) {}
      this.device = null;
    }
    this.isHardwareConnected = false;
  }

  connect() {
    if (this.isResetting) return false;
    if (this.device && this.isHardwareConnected) return true;

    this.closeDevice();

    let devices = [];
    try {
      devices = hid.devices() || [];
    } catch (e) {
      console.warn('[USB Driver] Failed scanning HID devices:', e.message);
      return false;
    }

    const target = devices.find(d => 
      d.vendorId === 0x1941 || 
      d.vendorId === 0x016c || 
      (d.product && (
        d.product.toLowerCase().includes('weather') || 
        d.product.toLowerCase().includes('station')
      ))
    );

    if (!target) {
      this.isHardwareConnected = false;
      return false;
    }

    try {
      console.log(`[USB Driver] Opening persistent HID Handle: ${target.path}`);
      this.device = new hid.HID(target.path);
      this.rxBuffer = [];

      this.device.on('data', (chunk) => {
        this.rxBuffer.push(...Array.from(chunk));

        while (this.rxBuffer.length >= 32) {
          const block = Uint8Array.from(this.rxBuffer.slice(0, 32));
          this.rxBuffer = this.rxBuffer.slice(32);
          this.handle32ByteBlock(block);
        }
      });

      this.device.on('error', (err) => {
        console.error('[USB Driver Error]', err.message);
        this.isHardwareConnected = false;
        this.reconnect();
      });

      return true;
    } catch (err) {
      console.error('[USB Driver] Failed to open persistent HID handle:', err.message);
      this.device = null;
      this.isHardwareConnected = false;
      return false;
    }
  }

  resetConnection(mode = 'soft') {
    if (this.isResetting) return;
    this.isResetting = true;

    console.log(`[USB Driver] Resetting USB Connection (Mode: ${mode.toUpperCase()})...`);
    this.closeDevice();

    if (mode === 'hard') {
      const psCommand = `powershell -Command "Get-PnpDevice | Where-Object { $_.InstanceId -like '*VID_1941*' -or $_.InstanceId -like '*VID_016C*' -or $_.InstanceId -like '*PID_8021*' -or $_.FriendlyName -like '*Weather*' } | Disable-PnpDevice -Confirm:$false -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Get-PnpDevice | Where-Object { $_.InstanceId -like '*VID_1941*' -or $_.InstanceId -like '*VID_016C*' -or $_.InstanceId -like '*PID_8021*' -or $_.FriendlyName -like '*Weather*' } | Enable-PnpDevice -Confirm:$false -ErrorAction SilentlyContinue"`;

      exec(psCommand, (err, stdout, stderr) => {
        if (err) {
          console.warn('[USB Hard Reset Warning] PnP script output:', err.message);
        } else {
          console.log('[USB Hard Reset] Windows PnP USB device disable/enable executed successfully.');
        }

        setTimeout(() => {
          this.isResetting = false;
          this.connect();
        }, 4000);
      });
    } else {
      setTimeout(() => {
        this.isResetting = false;
        this.connect();
      }, 2000);
    }
  }

  reconnect() {
    this.closeDevice();
    setTimeout(() => {
      this.connect();
    }, 4000);
  }

  poll() {
    if (this.isResetting) return;
    if (!this.device || !this.isHardwareConnected) {
      this.connect();
    }
    if (!this.device) return;

    this.waitingForRecord = false;
    this.rxBuffer = []; // Flush buffer on each poll cycle to prevent misalignment

    try {
      // Request fixed block (0x0000)
      this.device.write([0x00, 0xA1, 0x00, 0x00, 0x20, 0xA1, 0x00, 0x00, 0x20]);
    } catch (err) {
      console.error('[USB Driver Write Error]:', err.message);
      this.isHardwareConnected = false;
      this.reconnect();
    }
  }

  handle32ByteBlock(block) {
    // 1. Check if Fixed Block (Header 0x55 0xAA)
    if (block[0] === 0x55 && block[1] === 0xaa) {
      const ptr = (block[31] << 8) | block[30];
      if (ptr && ptr >= 0x0100) {
        this.currentPointer = ptr;
      }
      this.waitingForRecord = true;

      // Request live record block at current pointer
      const hi = (this.currentPointer >> 8) & 0xFF;
      const lo = this.currentPointer & 0xFF;
      try {
        this.device.write([0x00, 0xA1, hi, lo, 0x20, 0xA1, hi, lo, 0x20]);
      } catch (e) {}
      return;
    }

    // 2. Parse live observation record
    try {
      const rec = block.slice(0, 16);
      const decoded = FineOffsetDecoder.decodeRecord(rec, this.getOptions());

      if (decoded && (decoded.absPressure || decoded.indoorTemp !== null || decoded.outdoorTemp !== null)) {
        this.lastRxTime = Date.now();
        this.isHardwareConnected = true;
        this.staleCount = 0;

        decoded.source = 'usb_hardware';
        decoded.lastRxTimestamp = this.lastRxTime;
        decoded.hardwareStatus = 'connected';

        if (this.onDataCallback) {
          this.onDataCallback(decoded);
        }
      }
    } catch (err) {
      // Ignore non-record blocks
    }
  }

  getConnectionState() {
    const ageMs = Date.now() - this.lastRxTime;
    const isOk = this.isHardwareConnected && ageMs < 20000;
    return {
      connected: isOk,
      isResetting: this.isResetting,
      lastRxTime: this.lastRxTime,
      ageSeconds: Math.round(ageMs / 1000),
      staleCount: this.staleCount
    };
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.closeDevice();
  }
}

module.exports = FineOffsetUsbDriver;
