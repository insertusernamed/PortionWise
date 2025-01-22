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
                position.price = quote.regularMarketPrice;
                position.totalValue = position.price * position.shares;
            }

            // Calculate total portfolio value and percentages
            const totalValue = portfolio.reduce(
                (sum, pos) => sum + pos.totalValue,
                0
            );
            portfolio.forEach((pos) => {
                pos.currentPercentage = (
                    (pos.totalValue / totalValue) *
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
                rebalancing: rebalancing,
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
        const quote = await yahooFinance.quote(symbol);

        // Check if position already exists
        const existingPosition = portfolio.find((p) => p.symbol === symbol);
        if (existingPosition) {
            existingPosition.shares =
                Number(existingPosition.shares) + Number(shares);
        } else {
            portfolio.push({
                symbol: symbol,
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
    portfolio = portfolio.filter((p) => p.symbol !== symbol);
    res.json({ success: true });
});

function generateRebalancingSuggestions(portfolio, totalValue) {
    const suggestions = [];

    portfolio.forEach((position) => {
        if (position.targetPercentage) {
            const targetValue = (position.targetPercentage / 100) * totalValue;
            const diff = targetValue - position.totalValue;
            const shareDiff = Math.abs(diff / position.price);

            if (diff > 0) {
                suggestions.push(
                    `Buy ${shareDiff.toFixed(2)} shares of ${
                        position.symbol
                    } to reach ${position.targetPercentage}% target`
                );
            } else if (diff < 0) {
                suggestions.push(
                    `Sell ${shareDiff.toFixed(2)} shares of ${
                        position.symbol
                    } to reach ${position.targetPercentage}% target`
                );
            }
        }
    });

    return suggestions;
}

module.exports = router;
