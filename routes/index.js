var express = require("express");
var router = express.Router();
const yahooFinance = require("yahoo-finance2").default;

// In-memory portfolio storage (replace with database in production)
let portfolio = [];

/* GET home page. */
router.get("/", async function (req, res, next) {
    try {
        if (portfolio.length > 0) {
            // Update current prices
            for (let position of portfolio) {
                const quote = await yahooFinance.quote(position.symbol);
                position.price = Number(quote.regularMarketPrice).toFixed(2);
                position.totalValue = (
                    Number(position.price) * position.shares
                ).toFixed(2);
            }

            // Calculate total portfolio value and percentages
            const totalValue = portfolio.reduce(
                (sum, pos) => sum + Number(pos.totalValue),
                0
            );

            portfolio.forEach((pos) => {
                pos.currentPercentage = (
                    (Number(pos.totalValue) / totalValue) *
                    100
                ).toFixed(2);
            });

            // Generate rebalancing suggestions if targets exist
            const rebalancing = generateRebalancingSuggestions(
                portfolio,
                totalValue
            );

            res.render("index", {
                portfolio: portfolio,
                totalPortfolioValue: totalValue.toFixed(2),
                rebalancing: rebalancing.length > 0 ? rebalancing : null,
            });
        } else {
            res.render("index");
        }
    } catch (err) {
        next(err);
    }
});

/* GET search results */
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

/* GET stock details */
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

router.post("/portfolio/target", function (req, res, next) {
    const { symbol, target } = req.body;
    const position = portfolio.find((p) => p.symbol === symbol);
    if (position) {
        position.targetPercentage = Number(target);
    }
    res.json({ success: true });
});

router.delete("/portfolio/:symbol", function (req, res, next) {
    const { symbol } = req.params;
    portfolio = portfolio.filter(
        (p) => p.symbol.toUpperCase() !== symbol.toUpperCase()
    );
    res.json({ success: true });
});

function generateRebalancingSuggestions(portfolio, totalValue) {
    const suggestions = [];
    const totalTargetPercentage = portfolio.reduce(
        (sum, pos) => sum + (pos.targetPercentage || 0),
        0
    );

    // Only generate suggestions if targets sum to 100%
    if (Math.abs(totalTargetPercentage - 100) > 0.01) {
        return [];
    }

    portfolio.forEach((position) => {
        if (position.targetPercentage) {
            const targetValue = (position.targetPercentage / 100) * totalValue;
            const diff = targetValue - position.totalValue;
            const shareDiff = Math.abs(diff / position.price);

            if (diff > 0) {
                suggestions.push(
                    `Buy ${shareDiff.toFixed(2)} shares of ${
                        position.symbol
                    } to reach ${position.targetPercentage}% target (current: ${
                        position.currentPercentage
                    }%)`
                );
            } else if (diff < 0) {
                suggestions.push(
                    `Sell ${shareDiff.toFixed(2)} shares of ${
                        position.symbol
                    } to reach ${position.targetPercentage}% target (current: ${
                        position.currentPercentage
                    }%)`
                );
            }
        }
    });

    return suggestions;
}

module.exports = router;
