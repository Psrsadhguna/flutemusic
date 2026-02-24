const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 4000;

// Serve static files from the website directory
app.use(express.static(path.join(__dirname, 'website')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

app.listen(port, () => {
  console.log(`Website server listening on port ${port}`);
});
