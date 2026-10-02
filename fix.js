const fs = require('fs');
let lines = fs.readFileSync('public/js/app.js', 'utf8').split('\n');
lines[1016] = '      currentValText = currentData ? \\ (\°)\ : \'--\';';
fs.writeFileSync('public/js/app.js', lines.join('\n'), 'utf8');
console.log('Fixed');
