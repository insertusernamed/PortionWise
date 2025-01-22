var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");

var app = express();

var hbs = require("hbs");

// Register helpers
hbs.registerHelper("add", function (value, addition) {
    return value + addition;
});

hbs.registerHelper("percentageChange", function (direction) {
    switch (direction) {
        case "increase":
            return "increase";
        case "decrease":
            return "decrease";
        default:
            return "neutral";
    }
});

// Update the formatNumber helper to handle null/undefined values
hbs.registerHelper("formatNumber", function (number) {
    if (number == null) return "0.00";
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(parseFloat(number) || 0);
});

// Add a new helper for currency formatting
hbs.registerHelper("formatCurrency", function (number, currency) {
    if (number == null) return "$0.00";
    const symbol = currency === "CAD" ? "C$" : "$";
    return (
        symbol +
        new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(parseFloat(number) || 0)
    );
});

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render("error");
});

module.exports = app;
