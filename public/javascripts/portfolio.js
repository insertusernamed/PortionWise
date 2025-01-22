document.addEventListener("DOMContentLoaded", function () {
    const symbolInput = document.querySelector('input[name="symbol"]');
    const sharesContainer = document.querySelector(".shares-input");
    const sharesInput = document.querySelector('input[name="shares"]');
    const searchButton = document.querySelector(".search-symbol");
    const symbolResults = document.querySelector(".symbol-results");
    const form = document.querySelector(".portfolio-entry form");

    // Handle search button click
    searchButton.addEventListener("click", async () => {
        const symbol = symbolInput.value;
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
            // Validate total percentage is 100%
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

            // Refresh page to show rebalancing suggestions
            window.location.reload();
        });
    }
});
