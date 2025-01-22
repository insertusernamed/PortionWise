var express = require("express");
var router = express.Router();
const yahooFinance = require("yahoo-finance2").default;

/**
 * In-memory portfolio storage
 * TODO: Replace with database in production
 */
let portfolio = [];

/**
 * Route handlers
 */
// Home page - displays portfolio and rebalancing
router.get("/", async function (req, res, next) {
    try {
        if (portfolio.length > 0) {
            // Update current prices and total values
            for (let position of portfolio) {
                const quote = await yahooFinance.quote(position.symbol);
                position.price = Number(quote.regularMarketPrice).toFixed(2);
                position.totalValue = (
                    Number(position.price) * Math.floor(position.shares)
                ).toFixed(2);
            }

            // Calculate total value first
            const totalValue = portfolio.reduce(
                (sum, pos) => sum + Number(pos.totalValue),
                0
            );

            // Then calculate percentages based on total
            portfolio.forEach((pos) => {
                pos.currentPercentage = (
                    (Number(pos.totalValue) / totalValue) *
                    100
                ).toFixed(2);
            });

            // Rest of the route handler...
            const rebalancing = generateRebalancingSuggestions(
                portfolio,
                totalValue
            );
            res.render("index", {
                portfolio: portfolio,
                totalPortfolioValue: totalValue.toFixed(2),
                rebalancing:
                    Object.keys(rebalancing).length > 0 ? rebalancing : null,
            });
        } else {
            res.render("index");
        }
    } catch (err) {
        next(err);
    }
});

// Search for stocks/ETFs
router.get("/search", async function (req, res, next) {
    try {
        const query = req.query.symbol;
        const results = await yahooFinance.search(query);
        const filteredResults = results.quotes.filter(
            (quote) => quote.quoteType === "EQUITY" || quote.quoteType === "ETF"
        );
        res.json(filteredResults);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get stock details
router.get("/stock/:symbol", async function (req, res, next) {
    try {
        const symbol = req.params.symbol;
        const stockInfo = await yahooFinance.quote(symbol);
        res.render("index", {
            title: "Stock Searcher",
            stockInfo: stockInfo,
        });
    } catch (err) {
        next(err);
    }
});

// Add position to portfolio
router.post("/portfolio/add", async function (req, res, next) {
    try {
        const { symbol, shares } = req.body;
        const normalizedSymbol = symbol.toUpperCase();
        const quote = await yahooFinance.quote(normalizedSymbol);

        // Check if position already exists
        const existingPosition = portfolio.find(
            (p) => p.symbol.toUpperCase() === normalizedSymbol
        );
        if (existingPosition) {
            existingPosition.shares =
                Number(existingPosition.shares) + Number(shares);
        } else {
            portfolio.push({
                symbol: normalizedSymbol,
                shares: Number(shares),
                price: quote.regularMarketPrice,
                targetPercentage: 0,
            });
        }

        res.redirect("/");
    } catch (err) {
        next(err);
    }
});

// Update target percentage
router.post("/portfolio/target", function (req, res, next) {
    const { symbol, target } = req.body;
    const position = portfolio.find((p) => p.symbol === symbol);
    if (position) {
        position.targetPercentage = Number(target);
    }
    res.json({ success: true });
});

// Remove position from portfolio
router.delete("/portfolio/:symbol", function (req, res, next) {
    const { symbol } = req.params;
    portfolio = portfolio.filter(
        (p) => p.symbol.toUpperCase() !== symbol.toUpperCase()
    );
    res.json({ success: true });
});

// Generate demo portfolio
router.post("/portfolio/demo", async function (req, res, next) {
    try {
        // Popular tech stocks and ETFs
        const demoStocks = [
            "AAPL",
            "GOOGL",
            "MSFT",
            "AMZN",
            "META",
            "VOO",
            "VTI",
            "QQQ",
            "SPY",
            "NVDA",
        ];

        // Clear existing portfolio
        portfolio = [];

        // Pick 3 random stocks
        const selectedStocks = [];
        while (selectedStocks.length < 3) {
            const stock =
                demoStocks[Math.floor(Math.random() * demoStocks.length)];
            if (!selectedStocks.includes(stock)) {
                selectedStocks.push(stock);
            }
        }

        // Add each stock with random shares (between 1 and 100)
        for (const symbol of selectedStocks) {
            const quote = await yahooFinance.quote(symbol);
            const shares = Math.floor(Math.random() * 100) + 1;

            portfolio.push({
                symbol: symbol,
                shares: shares,
                price: quote.regularMarketPrice,
                targetPercentage: 0,
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Portfolio rebalancing logic
 */
function generateRebalancingSuggestions(portfolio, totalValue) {
    const totalTargetPercentage = portfolio.reduce(
        (sum, pos) => sum + (pos.targetPercentage || 0),
        0
    );

    if (Math.abs(totalTargetPercentage - 100) > 0.01) {
        return {};
    }

    const steps = [];
    let currentPortfolio = portfolio.map((pos) => ({
        ...pos,
        currentPercentage: (
            (Number(pos.totalValue) / totalValue) *
            100
        ).toFixed(2),
    }));
    let currentValue = totalValue;
    let previousValue = totalValue;
    let totalCashNeeded = 0;

    // Calculate adjustments based on current state
    const adjustments = currentPortfolio.map((position) => {
        const targetValue = (position.targetPercentage / 100) * totalValue;
        const currentValue = Number(position.totalValue);
        const diff = targetValue - currentValue;
        const shareDiff = Math.round(diff / Number(position.price));

        return {
            symbol: position.symbol,
            currentPercentage: position.currentPercentage,
            targetPercentage: position.targetPercentage,
            sharesDiff: shareDiff,
            valueDiff: shareDiff * Number(position.price),
            price: Number(position.price),
            priority: Math.abs(diff),
        };
    });

    // Process sells first
    const sells = adjustments.filter((adj) => adj.sharesDiff < 0);
    for (const sell of sells) {
        // Capture state before transaction
        const beforeHoldings = currentPortfolio.map((pos) => ({
            symbol: pos.symbol,
            shares: Math.floor(pos.shares),
            percentage: pos.currentPercentage,
            value: pos.totalValue,
            direction: pos.symbol === sell.symbol ? "decrease" : "neutral",
        }));

        const step = {
            type: "SELL",
            action: `Sell ${Math.abs(sell.sharesDiff)} shares of ${
                sell.symbol
            }`,
            value: Math.abs(sell.valueDiff).toFixed(2),
            holdings: [],
        };

        // Update portfolio state
        currentPortfolio = currentPortfolio.map((pos) => {
            if (pos.symbol === sell.symbol) {
                const newShares = Number(pos.shares) + sell.sharesDiff;
                const newValue = (newShares * Number(pos.price)).toFixed(2);
                return {
                    ...pos,
                    shares: newShares,
                    totalValue: newValue,
                };
            }
            return pos;
        });

        // Recalculate total value and percentages
        currentValue = currentPortfolio.reduce(
            (sum, pos) => sum + Number(pos.totalValue),
            0
        );
        currentPortfolio.forEach((pos) => {
            pos.currentPercentage = (
                (Number(pos.totalValue) / currentValue) *
                100
            ).toFixed(2);
        });

        // Add value change info
        const valueChangePercent = (
            ((currentValue - previousValue) / previousValue) *
            100
        ).toFixed(2);
        step.valueChange = {
            amount: (currentValue - previousValue).toFixed(2),
            percentage: valueChangePercent,
            direction: valueChangePercent < 0 ? "decrease" : "increase",
        };

        // Add holdings state to step
        step.beforeHoldings = beforeHoldings;
        step.holdings = currentPortfolio.map((pos) => ({
            symbol: pos.symbol,
            shares: Math.floor(pos.shares),
            percentage: pos.currentPercentage,
            value: pos.totalValue,
            direction: pos.symbol === sell.symbol ? "decrease" : "neutral",
        }));

        step.totalValue = currentValue.toFixed(2);
        previousValue = currentValue;
        steps.push(step);
    }

    // Process buys with similar updates
    const buys = adjustments.filter((adj) => adj.sharesDiff > 0);
    for (const buy of buys) {
        // Capture state before transaction
        const beforeHoldings = currentPortfolio.map((pos) => ({
            symbol: pos.symbol,
            shares: Math.floor(pos.shares),
            percentage: pos.currentPercentage,
            value: pos.totalValue,
            direction: pos.symbol === buy.symbol ? "increase" : "neutral",
        }));

        const step = {
            type: "BUY",
            action: `Buy ${buy.sharesDiff} shares of ${buy.symbol}`,
            value: buy.valueDiff.toFixed(2),
            holdings: [],
        };

        // Update portfolio state
        currentPortfolio = currentPortfolio.map((pos) => {
            if (pos.symbol === buy.symbol) {
                const newShares = Number(pos.shares) + buy.sharesDiff;
                const newValue = (newShares * Number(pos.price)).toFixed(2);
                return {
                    ...pos,
                    shares: newShares,
                    totalValue: newValue,
                };
            }
            return pos;
        });

        // Recalculate total value and percentages
        currentValue = currentPortfolio.reduce(
            (sum, pos) => sum + Number(pos.totalValue),
            0
        );
        currentPortfolio.forEach((pos) => {
            pos.currentPercentage = (
                (Number(pos.totalValue) / currentValue) *
                100
            ).toFixed(2);
        });

        // Add value change info
        const valueChangePercent = (
            ((currentValue - previousValue) / previousValue) *
            100
        ).toFixed(2);
        step.valueChange = {
            amount: (currentValue - previousValue).toFixed(2),
            percentage: valueChangePercent,
            direction: valueChangePercent < 0 ? "decrease" : "increase",
        };

        // Add holdings state to step
        step.beforeHoldings = beforeHoldings;
        step.holdings = currentPortfolio.map((pos) => ({
            symbol: pos.symbol,
            shares: Math.floor(pos.shares),
            percentage: pos.currentPercentage,
            value: pos.totalValue,
            direction: pos.symbol === buy.symbol ? "increase" : "neutral",
        }));

        step.totalValue = currentValue.toFixed(2);
        previousValue = currentValue;
        steps.push(step);
        totalCashNeeded += buy.valueDiff;
    }

    return {
        steps,
        finalValue: currentValue.toFixed(2),
        cashRequired: totalCashNeeded.toFixed(2),
        totalTrades: steps.length,
    };
}

/**
 * Helper function to calculate rebalancing progress
 */
function calculateProgress(currentState, targetState) {
    const totalDiff = targetState.reduce((sum, target) => {
        const current = currentState.find((p) => p.symbol === target.symbol);
        return (
            sum +
            Math.abs(
                Number(current.currentPercentage) - target.targetPercentage
            )
        );
    }, 0);

    return 100 - totalDiff / 2; // Division by 2 because differences are counted twice
}

module.exports = router;
