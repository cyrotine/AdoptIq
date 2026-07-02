require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

// Uniform error shape for anything a controller passes to next().
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`AdaptIQ backend listening on :${port}`));
