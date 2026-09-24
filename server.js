const express = require('express');
const cors = require('cors');
const path = require('path');

const submitRoutes = require('./routes/submit');
const verifyRoutes = require('./routes/verify');
const printRoutes = require('./routes/print');
const reconcileRoutes = require('./routes/reconcile');
const balanceRoutes = require('./routes/balance');
const { verifyChain } = require('./services/security');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', submitRoutes);
app.use('/api', verifyRoutes);
app.use('/api', printRoutes);
app.use('/api', reconcileRoutes);
app.use('/api', balanceRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/security/verify-chain', (req, res) => {
  const result = verifyChain();
  if (result.broken > 0) {
    res.json({ secure: false, total: result.total, broken: result.broken, brokenList: result.brokenList });
  } else {
    res.json({ secure: true, total: result.total, msg: 'All records verified' });
  }
});

app.listen(PORT, () => {
  console.log(`Withdrawal system running on port ${PORT}`);
});
