document.addEventListener("DOMContentLoaded", function () {
    // DOM element references
    const symbolInput = document.querySelector('input[name="symbol"]');
    const sharesContainer = document.querySelector(".shares-input");
    const sharesInput = document.querySelector('input[name="shares"]');
    const searchButton = document.querySelector(".search-symbol");
    const symbolResults = document.querySelector(".symbol-results");
    const form = document.querySelector(".portfolio-entry form");

    // Chart instances
    let currentChart = null;
    let targetChart = null;

    /**
     * Search functionality
     */
    searchButton.addEventListener("click", async () => {
        const symbol = symbolInput.value.toUpperCase();
        if (!symbol) return;

        sharesContainer.style.display = "none";

        try {
            const response = await fetch(
                `/search?symbol=${encodeURIComponent(symbol)}`
            );
            const data = await response.json();

            symbolResults.innerHTML = `
                <ul class="search-results">
                    ${data
                        .map(
                            (result) => `
                        <li>
                            <button type="button" class="select-symbol" 
                                    data-symbol="${result.symbol}"
                                    data-name="${result.shortname || ""}">
                                ${result.symbol} - ${
                                result.shortname || "N/A"
                            } (${result.exchange})
                            </button>
                        </li>
                    `
                        )
                        .join("")}
                </ul>
            `;

            symbolResults
                .querySelectorAll(".select-symbol")
                .forEach((button) => {
                    button.addEventListener("click", () => {
                        symbolInput.value = button.dataset.symbol;
                        symbolResults.innerHTML = "";
                        sharesContainer.style.display = "block";
                        sharesInput.value = "";
                        sharesInput.focus();
                    });
                });
        } catch (error) {
            console.error("Search failed:", error);
            symbolResults.innerHTML =
                '<p class="error">Search failed. Please try again.</p>';
        }
    });

    symbolInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            searchButton.click();
        }
    });

    symbolInput.addEventListener("input", () => {
        if (!symbolInput.value) {
            sharesContainer.style.display = "none";
            symbolResults.innerHTML = "";
        }
    });

    /**
     * Form handling
     */
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        try {
            const formData = new FormData(form);
            await fetch("/portfolio/add", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    symbol: formData.get("symbol"),
                    shares: formData.get("shares"),
                }),
            });

            symbolInput.value = "";
            sharesInput.value = "";
            symbolResults.innerHTML = "";
            sharesContainer.style.display = "none";

            window.location.reload();
        } catch (error) {
            console.error("Failed to add position:", error);
        }
    });

    document.querySelectorAll(".target-percentage").forEach((input) => {
        input.addEventListener("change", async function () {
            const symbol = this.dataset.symbol;
            const target = this.value;

            try {
                await fetch("/portfolio/target", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ symbol, target }),
                });
            } catch (error) {
                console.error("Failed to update target:", error);
            }
        });
    });

    const calculateButton = document.getElementById("calculate-rebalance");
    if (calculateButton) {
        calculateButton.addEventListener("click", async () => {
            const targetInputs =
                document.querySelectorAll(".target-percentage");
            const totalTarget = Array.from(targetInputs).reduce(
                (sum, input) => sum + Number(input.value || 0),
                0
            );

            if (Math.abs(totalTarget - 100) > 0.01) {
                alert(
                    "Target percentages must sum to 100%. Current sum: " +
                        totalTarget.toFixed(2) +
                        "%"
                );
                return;
            }

            const savePromises = Array.from(targetInputs).map((input) =>
                fetch("/portfolio/target", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        symbol: input.dataset.symbol,
                        target: input.value,
                    }),
                })
            );

            try {
                await Promise.all(savePromises);
                window.location.reload();

                window.addEventListener("load", () => {
                    const rebalancingSection = document.querySelector(
                        ".rebalancing-suggestions"
                    );
                    if (rebalancingSection) {
                        rebalancingSection.scrollIntoView({
                            behavior: "smooth",
                        });
                    }
                });
            } catch (error) {
                console.error("Failed to save target percentages:", error);
            }
        });
    }

    /**
     * Chart initialization and updates
     * Handles rendering of portfolio allocation charts
     */
    function initializeCharts() {
        const portfolio = Array.from(document.querySelectorAll("tbody tr")).map(
            (row) => {
                return {
                    symbol: row.cells[0].textContent,
                    currentPercentage: parseFloat(row.cells[4].textContent),
                    targetPercentage: parseFloat(
                        row.querySelector(".target-percentage").value || 0
                    ),
                };
            }
        );

        if (portfolio.length === 0) return;

        const colors = [
            "#20B15A",
            "#FF9800",
            "#2196F3",
            "#E91E63",
            "#9C27B0",
            "#FFC107",
            "#00BCD4",
            "#F44336",
        ];

        if (currentChart) {
            currentChart.destroy();
        }
        if (targetChart) {
            targetChart.destroy();
        }

        const chartConfig = {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "white",
                        font: {
                            size: 12,
                            family: "Inter",
                        },
                        padding: 10,
                        usePointStyle: true,
                        boxWidth: 8,
                        boxHeight: 8,
                    },
                },
                tooltip: {
                    backgroundColor: "var(--color-surface)",
                    titleFont: {
                        size: 14,
                        family: "Inter",
                        weight: "500",
                    },
                    bodyFont: {
                        size: 13,
                        family: "Inter",
                    },
                    titleColor: "white",
                    bodyColor: "white",
                    titleAlign: "center",
                    padding: 12,
                    displayColors: true,
                    borderColor: "var(--color-border)",
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            const number = new Intl.NumberFormat(
                                "en-US"
                            ).format(context.parsed);
                            return `${context.label}: ${number}%`;
                        },
                    },
                },
            },
        };

        const currentCtx = document.getElementById("currentAllocation");
        currentChart = new Chart(currentCtx, {
            type: "doughnut",
            data: {
                labels: portfolio.map((p) => p.symbol),
                datasets: [
                    {
                        data: portfolio.map((p) => p.currentPercentage),
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: "var(--color-surface)",
                    },
                ],
            },
            options: chartConfig,
        });

        const hasTargets = portfolio.some((p) => p.targetPercentage > 0);
        const emptyMessage = document.querySelector(".empty-target-message");
        const targetCanvas = document.getElementById("targetAllocation");

        if (!hasTargets) {
            if (emptyMessage) emptyMessage.style.display = "block";
            if (targetCanvas) targetCanvas.style.display = "none";
        } else {
            if (emptyMessage) emptyMessage.style.display = "none";
            if (targetCanvas) {
                targetCanvas.style.display = "block";
                targetChart = new Chart(targetCanvas, {
                    type: "doughnut",
                    data: {
                        labels: portfolio.map((p) => p.symbol),
                        datasets: [
                            {
                                data: portfolio.map((p) => p.targetPercentage),
                                backgroundColor: colors,
                                borderWidth: 2,
                                borderColor: "var(--color-surface)",
                            },
                        ],
                    },
                    options: chartConfig,
                });
            }
        }
    }

    /**
     * Event listeners setup
     */
    if (document.querySelector(".current-portfolio")) {
        initializeCharts();
    }

    document.querySelectorAll(".target-percentage").forEach((input) => {
        input.addEventListener("change", async function () {
            const symbol = this.dataset.symbol;
            const target = this.value;

            try {
                await fetch("/portfolio/target", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ symbol, target }),
                });
                initializeCharts();
            } catch (error) {
                console.error("Failed to update target:", error);
            }
        });
    });

    document.querySelectorAll(".remove-position").forEach((button) => {
        button.addEventListener("click", async function () {
            const symbol = this.dataset.symbol;
            if (
                !confirm(
                    `Are you sure you want to remove ${symbol} from your portfolio?`
                )
            ) {
                return;
            }

            try {
                const response = await fetch(
                    `/portfolio/${encodeURIComponent(symbol)}`,
                    {
                        method: "DELETE",
                    }
                );

                if (response.ok) {
                    window.location.reload();
                } else {
                    throw new Error("Failed to remove position");
                }
            } catch (error) {
                console.error("Failed to remove position:", error);
                alert("Failed to remove position. Please try again.");
            }
        });
    });

    const demoButton = document.getElementById("demo-portfolio");
    if (demoButton) {
        demoButton.addEventListener("click", async () => {
            try {
                const response = await fetch("/portfolio/demo", {
                    method: "POST",
                });

                if (response.ok) {
                    window.location.reload();
                } else {
                    throw new Error("Failed to generate demo portfolio");
                }
            } catch (error) {
                console.error("Demo portfolio generation failed:", error);
                alert("Failed to generate demo portfolio. Please try again.");
            }
        });
    }
});
