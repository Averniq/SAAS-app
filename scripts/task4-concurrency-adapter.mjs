const expectedRejection = /PAYMENT_EXCEEDS_REMAINING_BALANCE/;

export function classifyIndependentConcurrency({ attempts, operationCount, amountCents, orderStatus, paidAtIsNull }) {
  const succeeded = attempts.filter(({ exitCode }) => exitCode === 0).length;
  const rejected = attempts.filter(({ exitCode, stderr = '' }) => exitCode !== 0 && expectedRejection.test(stderr)).length;
  return {
    pass: succeeded === 1
      && rejected === 1
      && operationCount === 1
      && amountCents === 600
      && orderStatus === 'new'
      && paidAtIsNull === true,
    expectedRejections: rejected,
  };
}
