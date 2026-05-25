const fs = require('fs');
const fastcsv = require('fast-csv');
const Transaction = require('../models/Transaction');

const mapType = (type) => {
  if (!type) return null;
  const t = type.trim().toUpperCase();
  // Map equivalents
  if (t === 'TRANSFER IN' || t === 'DEPOSIT') return 'DEPOSIT';
  if (t === 'TRANSFER OUT' || t === 'WITHDRAWAL' || t === 'WITHDRAW') return 'WITHDRAWAL';
  if (t === 'BUY') return 'BUY';
  if (t === 'SELL') return 'SELL';
  return t; // fallback
};

const mapAsset = (asset) => {
  if (!asset) return null;
  const a = asset.trim().toUpperCase();
  if (a === 'BITCOIN') return 'BTC';
  if (a === 'ETHEREUM') return 'ETH';
  return a;
};

const parseAndStoreCSV = (filePath, source, runId) => {
  return new Promise((resolve, reject) => {
    const transactions = [];
    fs.createReadStream(filePath)
      .pipe(fastcsv.parse({ headers: true, ignoreEmpty: true, trim: true }))
      .on('data', (row) => {
        let status = 'valid';
        let reason = null;

        // Try to find the keys dynamically if exact case doesn't match
        const getVal = (keys) => {
            for (const key of keys) {
                const foundKey = Object.keys(row).find(k => k.toLowerCase().includes(key.toLowerCase()));
                if (foundKey) return row[foundKey];
            }
            return null;
        };

        const rawTimestamp = getVal(['date', 'time', 'timestamp']);
        const rawQuantity = getVal(['amount', 'quantity', 'qty']);
        const rawType = getVal(['type', 'action']);
        const rawAsset = getVal(['asset', 'coin', 'currency']);
        const rawId = getVal(['id', 'txid', 'transactionid']);

        let normalizedTimestamp = Date.parse(rawTimestamp);
        let normalizedQuantity = parseFloat(rawQuantity);

        if (isNaN(normalizedTimestamp)) {
          status = 'invalid';
          reason = 'Invalid or missing timestamp';
        }
        if (isNaN(normalizedQuantity)) {
          status = 'invalid';
          reason = 'Invalid or missing quantity';
        }

        transactions.push({
          runId,
          source,
          originalRow: row,
          status,
          reason,
          normalizedTimestamp: !isNaN(normalizedTimestamp) ? new Date(normalizedTimestamp) : null,
          normalizedQuantity: !isNaN(normalizedQuantity) ? normalizedQuantity : null,
          normalizedType: mapType(rawType),
          normalizedAsset: mapAsset(rawAsset),
          transactionId: rawId
        });
      })
      .on('error', (error) => reject(error))
      .on('end', async () => {
        try {
          if (transactions.length > 0) {
            await Transaction.insertMany(transactions);
          }
          resolve(transactions.length);
        } catch (err) {
          reject(err);
        }
      });
  });
};

module.exports = {
  parseAndStoreCSV
};
