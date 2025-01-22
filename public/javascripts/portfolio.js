document.addEventListener("DOMContentLoaded", function () {
    const symbolInput = document.querySelector('input[name="symbol"]');
    const sharesContainer = document.querySelector(".shares-input");
    const sharesInput = document.querySelector('input[name="shares"]');
    const searchButton = document.querySelector(".search-symbol");
    const symbolResults = document.querySelector(".symbol-results");
    const form = document.querySelector(".portfolio-entry form");

    // Handle search button click
    searchButton.addEventListener("click", async () => {
        const symbol = symbolInput.value.toUpperCase();
        if (!symbol) return;

        // Hide shares input when starting new search
        sharesContainer.style.display = "none";

        try {
            const response = await fetch(
                `/search?symbol=${encodeURIComponent(symbol)}`
            );
            const data = await response.json();

            // Display results
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

            // Handle symbol selection
            symbolResults
                .querySelectorAll(".select-symbol")
                .forEach((button) => {
                    button.addEventListener("click", () => {
                        symbolInput.value = button.dataset.symbol;
                        symbolResults.innerHTML = "";
                        // Show shares input after selection
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

    // Add enter key handling for search
    symbolInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            searchButton.click();
        }
    });

    // Reset form when symbol input is cleared
    symbolInput.addEventListener("input", () => {
        if (!symbolInput.value) {
            sharesContainer.style.display = "none";
            symbolResults.innerHTML = "";
        }
    });

    // Handle form submission
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

            // Clear form
            symbolInput.value = "";
            sharesInput.value = "";
            symbolResults.innerHTML = "";
            sharesContainer.style.display = "none";

            // Refresh page to show updated portfolio
            window.location.reload();
        } catch (error) {
            console.error("Failed to add position:", error);
        }
    });

    // Handle target percentage changes
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

    // Handle rebalancing calculation
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

            // Ensure all target percentages are saved before reloading
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

                // Add this after the page reloads
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

    // Chart initialization
    function initializeCharts() {
        const portfolio = Array.from(document.querySelectorAll("tbody tr")).map(
            (row) => ({
                symbol: row.cells[0].textContent,
                currentPercentage: parseFloat(row.cells[4].textContent),
                targetPercentage: parseFloat(
                    row.querySelector(".target-percentage").value || 0
                ),
            })
        );

        if (portfolio.length === 0) return;

        const colors = [
            "#20B15A", // Green
            "#FF9800", // Orange
            "#2196F3", // Blue
            "#E91E63", // Pink
            "#9C27B0", // Purple
            "#FFC107", // Amber
            "#00BCD4", // Cyan
            "#F44336", // Red
        ];

        // Shared chart options
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        fontColor: "white", // Add explicit fontColor
                        font: {
                            size: 12,
                            family: "Inter",
                        },
                        color: "white", // Keep both for compatibility
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
                            return `${context.label}: ${context.parsed}%`;
                        },
                    },
                },
            },
        };

        const currentChart = new Chart(
            document.getElementById("currentAllocation"),
            {
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
                options: chartOptions,
            }
        );

        // Check if any target percentages are set
        const hasTargets = portfolio.some((p) => p.targetPercentage > 0);
        const emptyMessage = document.querySelector(".empty-target-message");
        const targetCanvas = document.getElementById("targetAllocation");

        if (!hasTargets) {
            if (emptyMessage) emptyMessage.style.display = "block";
            if (targetCanvas) targetCanvas.style.display = "none";
        } else {
            if (emptyMessage) emptyMessage.style.display = "none";
            if (targetCanvas) targetCanvas.style.display = "block";

            // Create target allocation chart only if there are targets
            const targetChart = new Chart(targetCanvas, {
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
                options: chartOptions,
            });
        }
    }

    // Initialize charts if portfolio exists
    if (document.querySelector(".current-portfolio")) {
        initializeCharts();
    }

    // Update charts when target percentages change
    document.querySelectorAll(".target-percentage").forEach((input) => {
        input.addEventListener("change", () => {
            // Wait for the target update to complete
            setTimeout(initializeCharts, 100);
        });
    });

    // Handle remove position buttons
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
});
