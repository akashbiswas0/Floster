const express = require('express');

const app = express();
const PORT = 3002;

const MIN = 0.000001;
const MAX = 0.009999;

app.get('/random', (req, res) => {
  const value = Math.random() * (MAX - MIN) + MIN;
  res.json({ number: Number(value.toFixed(6)) });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
