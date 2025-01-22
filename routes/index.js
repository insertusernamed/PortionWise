var express = require("express");
var router = express.Router();
const yahooFinance = require("yahoo-finance2").default;
const axios = require("axios");

// Remove the in-memory portfolio storage
// let portfolio = [];
let currentCurrency = "USD";
let exchangeRate = 1;

// Add this helper function to parse portfolio from request
function getPortfolioFromRequest(req) {
    const portfolioData = req.cookies.portfolio;
    return portfolioData ? JSON.parse(portfolioData) : [];
}

/**
 * Route handlers
 */
// Home page - displays portfolio and rebalancing
router.get("/", async function (req, res, next) {
    try {
        const portfolio = getPortfolioFromRequest(req);
        if (portfolio.length > 0) {
            const currency = req.query.currency || "USD";
            const strategy = req.query.strategy || "both";
            let exchangeRate = 1;

            try {
                if (currency === "CAD") {
                    const response = await axios.get(
                        "https://api.exchangerate-api.com/v4/latest/USD"
                    );
                    exchangeRate = response.data.rates.CAD;
                }
            } catch (error) {
                console.error("Exchange rate fetch failed:", error);
            }

            // Update current prices and total values
            for (let position of portfolio) {
                const quote = await yahooFinance.quote(position.symbol);
                const usdPrice = Number(quote.regularMarketPrice);
                position.price = Number(usdPrice * exchangeRate).toFixed(2);
                position.originalPrice = Number(usdPrice).toFixed(2);
                position.totalValue = Number(
                    position.price * position.shares
                ).toFixed(2);
                position.originalValue = Number(
                    usdPrice * position.shares
                ).toFixed(2);
            }

            const totalValue = portfolio.reduce(
                (sum, pos) => sum + Number(pos.totalValue),
                0
            );
            const originalTotalValue = portfolio.reduce(
                (sum, pos) => sum + Number(pos.originalValue),
                0
            );

            // Calculate percentages
            portfolio.forEach((pos) => {
                pos.currentPercentage = (
                    (Number(pos.totalValue) / totalValue) *
                    100
                ).toFixed(2);
            });

            const rebalancing = generateRebalancingSuggestions(
                portfolio,
                totalValue,
                strategy
            );

            // Store original USD values before conversion
            if (rebalancing.steps) {
                rebalancing.steps.forEach((step) => {
                    step.originalValue = step.value;
                    step.value = (Number(step.value) * exchangeRate).toFixed(2);
                    step.originalTotalValue = step.totalValue;
                    step.totalValue = (
                        Number(step.totalValue) * exchangeRate
                    ).toFixed(2);
                    if (step.valueChange) {
                        step.valueChange.amount = (
                            Number(step.valueChange.amount) * exchangeRate
                        ).toFixed(2);
                    }
                    // Update holdings values
                    step.holdings.forEach((holding) => {
                        holding.value = (
                            Number(holding.value) * exchangeRate
                        ).toFixed(2);
                    });
                    step.beforeHoldings.forEach((holding) => {
                        holding.value = (
                            Number(holding.value) * exchangeRate
                        ).toFixed(2);
                    });
                });
                rebalancing.originalFinalValue = rebalancing.finalValue;
                rebalancing.originalCashRequired = rebalancing.cashRequired;
                rebalancing.finalValue = (
                    Number(rebalancing.finalValue) * exchangeRate
                ).toFixed(2);
                rebalancing.cashRequired = (
                    Number(rebalancing.cashRequired) * exchangeRate
                ).toFixed(2);
            }

            res.render("index", {
                title: portfolio.length > 0 ? "Your Portfolio" : "Welcome",
                portfolio: portfolio,
                totalPortfolioValue: totalValue.toFixed(2),
                originalPortfolioValue: originalTotalValue.toFixed(2),
                currentCurrency: currency === "CAD" ? "C$" : "$",
                rebalancing:
                    Object.keys(rebalancing).length > 0 ? rebalancing : null,
            });
        } else {
            res.render("index", { currentCurrency: "$" });
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

        const portfolio = getPortfolioFromRequest(req);

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

        // Save updated portfolio in cookie
        res.cookie("portfolio", JSON.stringify(portfolio), {
            maxAge: 31536000000, // 1 year
            httpOnly: true,
        });

        res.redirect("/");
    } catch (err) {
        next(err);
    }
});

// Update target percentage
router.post("/portfolio/target", function (req, res, next) {
    const { symbol, target } = req.body;
    const portfolio = getPortfolioFromRequest(req);

    const position = portfolio.find((p) => p.symbol === symbol);
    if (position) {
        position.targetPercentage = Number(target);
        res.cookie("portfolio", JSON.stringify(portfolio), {
            maxAge: 31536000000,
            httpOnly: true,
        });
    }
    res.json({ success: true });
});

// Remove position from portfolio
router.delete("/portfolio/:symbol", function (req, res, next) {
    const { symbol } = req.params;
    let portfolio = getPortfolioFromRequest(req);

    portfolio = portfolio.filter(
        (p) => p.symbol.toUpperCase() !== symbol.toUpperCase()
    );

    res.cookie("portfolio", JSON.stringify(portfolio), {
        maxAge: 31536000000,
        httpOnly: true,
    });

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
        let portfolio = [];

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

        // Save demo portfolio in cookie
        res.cookie("portfolio", JSON.stringify(portfolio), {
            maxAge: 31536000000, // 1 year
            httpOnly: true,
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Portfolio rebalancing logic
 */
function generateRebalancingSuggestions(
    portfolio,
    totalValue,
    strategy = "both"
) {
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

    // Calculate all adjustments
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

    // Filter adjustments based on strategy
    let sells = [];
    let buys = [];

    if (strategy === "both" || strategy === "sell") {
        sells = adjustments.filter((adj) => adj.sharesDiff < 0);
    }

    if (strategy === "both" || strategy === "buy") {
        buys = adjustments.filter((adj) => adj.sharesDiff > 0);
    }

    // Process sells first
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

async function getExchangeRate(from, to) {
    try {
        const response = await axios.get(
            `https://api.exchangerate-api.com/v4/latest/${from}`
        );
        return response.data.rates[to];
    } catch (error) {
        console.error("Exchange rate fetch failed:", error);
        return 1;
    }
}

router.get("/convert", async function (req, res) {
    const { to } = req.query;
    try {
        const rate = await getExchangeRate("USD", to);
        res.json({ rate });
    } catch (error) {
        res.status(500).json({ error: "Failed to get exchange rate" });
    }
});

module.exports = router;
