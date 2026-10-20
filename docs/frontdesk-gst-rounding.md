# Front Desk GST rounding

Front Desk treats menu prices and order totals as GST-inclusive amounts. Every
checkout calculation is performed in integer cents.

For an order total `G` cents and a GST rate `R` expressed in basis points
(`10.00% = 1000`), the rule is:

```
GST cents      = round(G × R / (10000 + R))
Subtotal cents = G - GST cents
```

The rounding happens once for the whole order, never separately for each line.
This guarantees that subtotal plus GST always equals the displayed order total.
For example, a GST-inclusive total of `$12.00` at 10% GST is `$1.09` GST and
`$10.91` subtotal. The same helpers are used by the Front Desk checkout and
the printed bill/receipt.
