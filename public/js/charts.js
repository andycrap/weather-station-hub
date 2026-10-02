/**
 * Weather History Charts Manager (Chart.js wrapper)
 */

class WeatherCharts {
  constructor() {
    this.tempChart = null;
    this.pressureChart = null;
    this.windChart = null;
    this.rainChart = null;
  }

  /**
   * Initialize all trend charts
   */
  initCharts() {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(56, 189, 248, 0.3)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;

    this.initTempChart();
    this.initPressureChart();
    this.initWindChart();
    this.initRainChart();
  }

  initTempChart() {
    const ctx = document.getElementById('chartTemp');
    if (!ctx) return;

    this.tempChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Outdoor Temp (°C)',
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            data: []
          },
          {
            label: 'Indoor Temp (°C)',
            borderColor: '#fb7185',
            backgroundColor: 'rgba(251, 113, 133, 0.05)',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            data: []
          },
          {
            label: 'Dew Point (°C)',
            borderColor: '#06b6d4',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [3, 3],
            tension: 0.4,
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  initPressureChart() {
    const ctx = document.getElementById('chartPressure');
    if (!ctx) return;

    this.pressureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Rel Pressure (hPa)',
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.12)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  initWindChart() {
    const ctx = document.getElementById('chartWind');
    if (!ctx) return;

    this.windChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Wind Gust (m/s)',
            borderColor: '#f59e0b',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            tension: 0.3,
            data: []
          },
          {
            label: 'Avg Speed (m/s)',
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, min: 0 }
        }
      }
    });
  }

  initRainChart() {
    const ctx = document.getElementById('chartRain');
    if (!ctx) return;

    this.rainChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Cumulative Rain (mm)',
            backgroundColor: '#3b82f6',
            borderRadius: 4,
            data: []
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, min: 0 }
        }
      }
    });
  }

  /**
   * Update all charts with historical history array
   */
  updateHistoryData(historyRecords) {
    if (!historyRecords || !Array.isArray(historyRecords)) return;

    const labels = historyRecords.map(r => {
      const d = new Date(r.timestamp);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    });

    if (this.tempChart) {
      this.tempChart.data.labels = labels;
      this.tempChart.data.datasets[0].data = historyRecords.map(r => WeatherUnits.getTempVal(r.outdoorTemp));
      this.tempChart.data.datasets[0].label = `Outdoor Temp (${WeatherUnits.getTempLabel()})`;

      this.tempChart.data.datasets[1].data = historyRecords.map(r => WeatherUnits.getTempVal(r.indoorTemp));
      this.tempChart.data.datasets[1].label = `Indoor Temp (${WeatherUnits.getTempLabel()})`;

      this.tempChart.data.datasets[2].data = historyRecords.map(r => WeatherUnits.getTempVal(r.dewPoint));
      this.tempChart.data.datasets[2].label = `Dew Point (${WeatherUnits.getTempLabel()})`;
      this.tempChart.update('none');
    }

    if (this.pressureChart) {
      this.pressureChart.data.labels = labels;
      this.pressureChart.data.datasets[0].data = historyRecords.map(r => WeatherUnits.getPressureVal(r.relPressure));
      this.pressureChart.data.datasets[0].label = `Rel Pressure (${WeatherUnits.getPressureLabel()})`;
      this.pressureChart.update('none');
    }

    if (this.windChart) {
      this.windChart.data.labels = labels;
      this.windChart.data.datasets[0].data = historyRecords.map(r => WeatherUnits.getWindVal(r.windGust));
      this.windChart.data.datasets[0].label = `Wind Gust (${WeatherUnits.getWindLabel()})`;
      this.windChart.data.datasets[1].data = historyRecords.map(r => WeatherUnits.getWindVal(r.windSpeed));
      this.windChart.data.datasets[1].label = `Avg Speed (${WeatherUnits.getWindLabel()})`;
      this.windChart.update('none');
    }

    if (this.rainChart) {
      this.rainChart.data.labels = labels;
      this.rainChart.data.datasets[0].data = historyRecords.map(r => WeatherUnits.getRainVal(r.totalRainMm));
      this.rainChart.data.datasets[0].label = `Total Rain (${WeatherUnits.getRainLabel()})`;
      this.rainChart.update('none');
    }
  }
}
