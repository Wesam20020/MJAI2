const fs = require('fs');
const lines = fs.readFileSync('src/styles/global.css', 'utf8').split('\n');
const original = lines.slice(0, 5049);
fs.writeFileSync('src/styles/global.css', original.join('\n') + '\n');
console.log('Truncated to', original.length, 'lines');
