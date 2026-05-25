const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fastcsv = require('fast-csv');
const ReconciliationRun = require('../models/ReconciliationRun');
const ReportEntry = require('../models/ReportEntry');
const { parseAndStoreCSV } = require('../services/ingestionService');
const { matchTransactions } = require('../services/matchingService');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/reconcile', upload.fields([
  { name: 'user_transactions', maxCount: 1 },
  { name: 'exchange_transactions', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files['user_transactions'] || !req.files['exchange_transactions']) {
      return res.status(400).json({ error: 'Both user_transactions and exchange_transactions files are required' });
    }

    const timestampToleranceSeconds = req.body.timestampToleranceSeconds ? parseInt(req.body.timestampToleranceSeconds) : (process.env.TIMESTAMP_TOLERANCE_SECONDS || 300);
    const quantityTolerancePct = req.body.quantityTolerancePct ? parseFloat(req.body.quantityTolerancePct) : (process.env.QUANTITY_TOLERANCE_PCT || 0.01);

    const run = new ReconciliationRun({
      config: { timestampToleranceSeconds, quantityTolerancePct }
    });
    await run.save();

    res.status(202).json({ message: 'Reconciliation started', runId: run._id });

    // Background processing
    (async () => {
      try {
        run.status = 'processing';
        await run.save();

        await parseAndStoreCSV(req.files['user_transactions'][0].path, 'user', run._id);
        await parseAndStoreCSV(req.files['exchange_transactions'][0].path, 'exchange', run._id);

        await matchTransactions(run._id);

      } catch (err) {
        console.error('Reconciliation error:', err);
        run.status = 'failed';
        run.error = err.message;
        await run.save();
      } finally {
        fs.unlinkSync(req.files['user_transactions'][0].path);
        fs.unlinkSync(req.files['exchange_transactions'][0].path);
      }
    })();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/report/:runId', async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'completed') return res.status(400).json({ status: run.status });

    const entries = await ReportEntry.find({ runId: run._id });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="reconciliation_report_${run._id}.csv"`);

    const csvStream = fastcsv.format({ headers: true });
    csvStream.pipe(res);

    entries.forEach(entry => {
      // Flatten the objects for CSV
      const row = {
        Category: entry.category,
        Reason: entry.reason || ''
      };
      
      // Prefix user keys
      if (entry.userRow) {
        for (const [k, v] of Object.entries(entry.userRow)) {
          row[`User_${k}`] = v;
        }
      }
      
      // Prefix exchange keys
      if (entry.exchangeRow) {
        for (const [k, v] of Object.entries(entry.exchangeRow)) {
          row[`Exchange_${k}`] = v;
        }
      }

      csvStream.write(row);
    });

    csvStream.end();

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/report/:runId/summary', async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    
    res.json({
        status: run.status,
        summary: run.summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/report/:runId/unmatched', async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'completed') return res.status(400).json({ status: run.status });

    const entries = await ReportEntry.find({ 
        runId: run._id, 
        category: { $in: ['Unmatched (User only)', 'Unmatched (Exchange only)'] } 
    });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
