const Transaction = require('../models/Transaction');
const ReportEntry = require('../models/ReportEntry');
const ReconciliationRun = require('../models/ReconciliationRun');

const isTypeMatch = (type1, type2) => {
  if (!type1 || !type2) return false;
  const t1 = type1.toUpperCase().trim();
  const t2 = type2.toUpperCase().trim();
  if (t1 === t2) return true;
  
  // Handle opposites
  const opposites = {
    'TRANSFER IN': ['TRANSFER OUT', 'WITHDRAWAL', 'WITHDRAW', 'TRANSFER_OUT'],
    'TRANSFER_IN': ['TRANSFER OUT', 'WITHDRAWAL', 'WITHDRAW', 'TRANSFER_OUT'],
    'DEPOSIT': ['TRANSFER OUT', 'WITHDRAWAL', 'WITHDRAW', 'TRANSFER_OUT'],
    'TRANSFER OUT': ['TRANSFER IN', 'DEPOSIT', 'TRANSFER_IN'],
    'TRANSFER_OUT': ['TRANSFER IN', 'DEPOSIT', 'TRANSFER_IN'],
    'WITHDRAWAL': ['TRANSFER IN', 'DEPOSIT', 'TRANSFER_IN'],
    'WITHDRAW': ['TRANSFER IN', 'DEPOSIT', 'TRANSFER_IN']
  };

  if (opposites[t1] && opposites[t1].includes(t2)) return true;
  if (opposites[t2] && opposites[t2].includes(t1)) return true;

  return false;
};

const isWithinTolerance = (val1, val2, tolerance) => {
  return Math.abs(val1 - val2) <= tolerance;
};

const matchTransactions = async (runId) => {
  const run = await ReconciliationRun.findById(runId);
  if (!run) throw new Error('Run not found');

  const { timestampToleranceSeconds, quantityTolerancePct } = run.config;
  const timeToleranceMs = timestampToleranceSeconds * 1000;

  const users = await Transaction.find({ runId, source: 'user', status: 'valid' });
  const exchanges = await Transaction.find({ runId, source: 'exchange', status: 'valid' });

  // Add invalid rows as Unmatched with reasons
  const invalidUsers = await Transaction.find({ runId, source: 'user', status: 'invalid' });
  const invalidExchanges = await Transaction.find({ runId, source: 'exchange', status: 'invalid' });

  let reports = [];
  let summary = {
    totalMatched: 0,
    totalConflicting: 0,
    totalUnmatchedUser: invalidUsers.length,
    totalUnmatchedExchange: invalidExchanges.length
  };

  for (const inv of invalidUsers) {
    reports.push({
      runId, category: 'Unmatched (User only)', userRow: inv.originalRow, reason: inv.reason || 'Invalid data'
    });
  }
  for (const inv of invalidExchanges) {
    reports.push({
      runId, category: 'Unmatched (Exchange only)', exchangeRow: inv.originalRow, reason: inv.reason || 'Invalid data'
    });
  }

  let exchangePool = [...exchanges];

  for (const userTx of users) {
    let bestMatch = null;
    let matchType = null; // 'perfect' or 'conflict'
    let bestMatchIdx = -1;
    let conflictReason = [];

    // Find matches
    for (let i = 0; i < exchangePool.length; i++) {
      const exTx = exchangePool[i];
      let reasons = [];

      // Check ID match first if available
      let isIdMatch = false;
      if (userTx.transactionId && exTx.transactionId && userTx.transactionId === exTx.transactionId) {
        isIdMatch = true;
      }

      // Check criteria
      const timeDiff = Math.abs(userTx.normalizedTimestamp - exTx.normalizedTimestamp);
      const isTimeMatch = timeDiff <= timeToleranceMs;
      
      const qtyTolerance = Math.max(Math.abs(userTx.normalizedQuantity), Math.abs(exTx.normalizedQuantity)) * quantityTolerancePct;
      const isQtyMatch = isWithinTolerance(userTx.normalizedQuantity, exTx.normalizedQuantity, qtyTolerance);
      
      const isAssetMatch = userTx.normalizedAsset === exTx.normalizedAsset;
      const typeMatch = isTypeMatch(userTx.normalizedType, exTx.normalizedType);

      if (isAssetMatch && typeMatch) {
         if (isIdMatch) {
             if (!isTimeMatch) reasons.push('Timestamp difference exceeds tolerance');
             if (!isQtyMatch) reasons.push('Quantity difference exceeds tolerance');
             if (reasons.length === 0) {
                 bestMatch = exTx; matchType = 'perfect'; bestMatchIdx = i; break;
             } else {
                 if (!bestMatch || matchType !== 'perfect') {
                     bestMatch = exTx; matchType = 'conflict'; bestMatchIdx = i; conflictReason = reasons;
                 }
             }
         } else {
             // Match by proximity
             if (isTimeMatch && isQtyMatch) {
                 bestMatch = exTx; matchType = 'perfect'; bestMatchIdx = i; break; // Perfect match
             } else if (isTimeMatch || isQtyMatch) {
                 // partial match - conflicting
                 if (!isTimeMatch) reasons.push('Timestamp difference exceeds tolerance');
                 if (!isQtyMatch) reasons.push('Quantity difference exceeds tolerance');
                 if (!bestMatch || matchType !== 'perfect') {
                    bestMatch = exTx; matchType = 'conflict'; bestMatchIdx = i; conflictReason = reasons;
                 }
             }
         }
      }
    }

    if (matchType === 'perfect') {
        reports.push({
            runId, category: 'Matched', userRow: userTx.originalRow, exchangeRow: bestMatch.originalRow
        });
        summary.totalMatched++;
        exchangePool.splice(bestMatchIdx, 1);
    } else if (matchType === 'conflict') {
        reports.push({
            runId, category: 'Conflicting', userRow: userTx.originalRow, exchangeRow: bestMatch.originalRow, reason: conflictReason.join(', ')
        });
        summary.totalConflicting++;
        exchangePool.splice(bestMatchIdx, 1);
    } else {
        reports.push({
            runId, category: 'Unmatched (User only)', userRow: userTx.originalRow, reason: 'No matching record found in exchange data'
        });
        summary.totalUnmatchedUser++;
    }
  }

  // Remaining exchanges
  for (const exTx of exchangePool) {
      reports.push({
          runId, category: 'Unmatched (Exchange only)', exchangeRow: exTx.originalRow, reason: 'No matching record found in user data'
      });
      summary.totalUnmatchedExchange++;
  }

  await ReportEntry.insertMany(reports);
  run.summary = summary;
  run.status = 'completed';
  await run.save();
};

module.exports = {
  matchTransactions
};
