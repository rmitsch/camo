// https://groups.google.com/forum/#!topic/dc-js-user-group/yI6_cbvgfbU

// Initiates loading of charts.
queue()
    .defer(d3.json, "/entries")
    .await(makeGraphs);

// Used for accumulating values in an existing grouping/measure.
// Source: https://stackoverflow.com/questions/40619760/dc-js-crossfilter-add-running-cumulative-sum
function accumulate_group(source_group) {
    return {
        all:function () {
            var cumulate = 0;
            return source_group.all().map(function(d) {
                cumulate += d.value;
                return {key:d.key, value:cumulate};
            });
        }
    };
}

// Groups all values together in one single bin. Used for monthly balance boxplot.
// Source: https://stackoverflow.com/questions/45118451/dc-js-boxplot-with-nested-grouping
function one_bin(group, key) {
  return {
    all: function() {
      return [{
        key: key,
        value: group.all().map(kv => kv.value)
      }];
    }
  };
}

// Creates graphs for dashboard.
function makeGraphs(error, projectsJson, statesJson) {

    // Prepare and extend projectsJson data.
	var entries = projectsJson;
	entries.forEach(function(d) {
    	// Add entry for exact date.
        d["ExactDate"] = new Date(d["Date"]);

	    // Adjust date for beginning of month.
		d["Date"] = new Date(d["Date"]);
		d["Date"].setDate(1);
		d["Amount"] = +d["Amount"];

		// Add entry for boxplot by month and income/expenses:
	});

	// Create a Crossfilter instance.
	var ndx = crossfilter(entries);


	// Define Dimensions.
	var amountDim               = ndx.dimension(function(d) { return d["Amount"]; });
	var dateDim                 = ndx.dimension(function(d) { return d3.time.month(d["ExactDate"]); });
    var monthDateDim            = ndx.dimension(function(d) { return d3.time.month(d["ExactDate"]); });
	var categoryDim             = ndx.dimension(function(d) { return d["Category"]; });
	var weekDateDim             = ndx.dimension(function(d) { return d3.time.week(d["ExactDate"]); });
	var dayDateDim              = ndx.dimension(function(d) { return d["ExactDate"]; });
	// For transactions charts.
    var scatterchartDim         = ndx.dimension(function (d) {
                                    return [+d["ExactDate"], d["Amount"], d["Amount"] > 0 ? "Income" : "Expenses"];
                               });
    // For user charts:
    var actorDim                = ndx.dimension(function(d) { return d["Payer"]; });
    var actorIncomeExpenseDim   = ndx.dimension(function (d) {
                                    return [d["Amount"] > 0 ? "Income" : "Expenses", d["Payer"]];
                                });
    // For various stuff: Derive dimension from value of amount.
    var incomeExpenseDim        = ndx.dimension(function(d) { return d["Amount"] < 0 ? "Expenses" : "Income"; });

    // --------------------------------------------------
    // Create groups (~ metrics) to use in charts
    // --------------------------------------------------

	// For time chart.
	// Sum of all entries.
	var sumByDate           = dateDim.group().reduceSum(function(d) {return d["Amount"];});
	// Cumulative balance up to this point.
    var balanceByDate       = accumulate_group(sumByDate);
	// Sum of all expenses.
	var expenseSumByDate    = dateDim.group().reduceSum(function(d) {return d["Amount"] < 0 ? -d["Amount"] : 0;});
	// Sum of all revenue.
	var revenueSumByDate    = dateDim.group().reduceSum(function(d) {return d["Amount"] > 0 ? d["Amount"] : 0;});

	// For category charts.
	var sumByCategory       = categoryDim.group().reduceSum(function(d) {return d["Amount"];});

    // For measures.
    // Get group for all entries, regardless of feature values.
    // Apparent outcome: Number of projects.
	var all                 = ndx.groupAll();
	// Get group for total amount of money spent.
    // Apparent outcome: Sum of money spent.
	var totalAmount         = ndx.groupAll().reduceSum(function(d) {return d["Amount"];});

    // For transactions charts.
    // Auxiliary variable.
    var binWidth                = 100;
    var numTransactionsByDate   = weekDateDim.group();
    var transactionsByAmount    = amountDim.group().reduceCount(function(d) {return binWidth * Math.floor(d["Amount"] / binWidth);});
    var scatterchartGroup       = scatterchartDim.group();

    // For user chart.
    var paidByUser              = actorDim.group().reduceSum(function(d) {return d["Amount"] < 0 ? d["Amount"] : 0;});
    var receivedByUser          = actorDim.group().reduceSum(function(d) {return d["Amount"] > 0 ? d["Amount"] : 0;});
    var amountByUserAndTType    = actorIncomeExpenseDim.group().reduceSum(function(d) {return d["Amount"];});
    var amountByUser            = actorDim.group().reduceSum(function(d) {return d["Amount"];});

    // For monthly balance boxplot.
    var monthlyBalance          = monthDateDim.group().reduceSum(d => d["Amount"]);

	// Determine extrema.
	// For dates.
	var minDate     = dateDim.bottom(1)[0]["ExactDate"];
	var maxDate     = dateDim.top(1)[0]["ExactDate"];
	// Add buffer for start and end date.
    minDate.setDate(minDate.getDate() - 5);
    maxDate.setDate(maxDate.getDate() + 5);
    // For amounts.
    var minAmount   = amountDim.bottom(1)[0]["Amount"];
    var maxAmount   = amountDim.top(1)[0]["Amount"];
    // For sum by user and transaction type.
    // Reason for loop: Bottom method not existent.
    var maxAmountByUserandTType = 0;
    var minAmountByUserandTType = 0;
    amountByUserAndTType.all().forEach(function(entry) {
        if (minAmountByUserandTType > entry["value"])
            minAmountByUserandTType = entry["value"];
        if (maxAmountByUserandTType < entry["value"])
            maxAmountByUserandTType = entry["value"];
    });
    // For monthly boxplot.
    var maxExpensesByMonth  = expenseSumByDate.top(1)[0]["value"];
    var maxIncomeByMonth    = revenueSumByDate.top(1)[0]["value"];

    // --------------------------------------------------
    // Plot charts
    // --------------------------------------------------

    // Create charts.
	var timeChart                       = dc.compositeChart("#time-chart");
	var byCategoryChart                 = dc.rowChart("#category-chart");
	// Singular measures.
	var balanceND                       = dc.numberDisplay("#balance-nd");
	var transactionsND                  = dc.numberDisplay("#transactions-nd");
    // Transaction charts.
    var transactionAmountChart          = dc.barChart("#transactions-amount-chart");
    var transactionFrequencyChart       = dc.barChart("#transactions-frequency-chart");
    var transactionsChart               = dc.scatterPlot("#transactions-chart");
    // Monthly balances.
    var monthlyBalanceChart             = dc.boxPlot("#monthly-balance-chart");
    // User charts.
    var balanceByUserChart              = dc.barChart("#user-balance-chart");

    // Configure time chart.
    var expenseSumByDateChart   = dc.lineChart(timeChart)
                                    .group(expenseSumByDate, 'Expenses')
                                    .colors("red")
                                    .interpolate("step")
                                    .renderArea(false);
    var revenueSumByDateChart   = dc.lineChart(timeChart)
                                    .group(revenueSumByDate, 'Revenue')
                                    .colors("green")
                                    .interpolate("step")
                                    .renderArea(false);
    var balanceByDateChart      = dc.lineChart(timeChart)
                                    .group(balanceByDate, 'Balance')
                                    .renderDataPoints(true)
                                    .interpolate("step")
                                    .renderArea(false);

    // Table for entries.
    var entriesTable           = dc.dataTable("#entries-table");

    timeChart
		.height(190)
        .margins({top: 10, right: 50, bottom: 40, left: 50})
        .transitionDuration(500)
        .elasticY(true)
        .renderLabel(true)
        .mouseZoomable(false)
        .dimension(dateDim)
        .yAxisLabel("€")
        .xAxisLabel("Month")
        .renderHorizontalGridLines(true)
        .x(d3.time.scale().domain([minDate, maxDate]))
        .legend(dc.legend().x(80).y(20).itemHeight(13).gap(5))
        .compose([
            expenseSumByDateChart,
            revenueSumByDateChart,
            balanceByDateChart
        ])
        .brushOn(true);
    // Set ticks.
    timeChart.yAxis().ticks(6);


    // Configure category charts.
	byCategoryChart
        .height(275)
        .dimension(categoryDim)
        .group(sumByCategory)
        .ordinalColors(['#377eb8'])
        .margins({top: 10, right: 20, bottom: 50, left: 15});
    byCategoryChart.xAxis().ticks(4);

    // Configure measure for total balance.
	balanceND
		.valueAccessor(function(d){return d; })
		.transitionDuration(0)
		.group(totalAmount)
		.formatNumber(d3.format(".3s"));

    // Configure measure for total number of transactions.
	transactionsND
		.formatNumber(d3.format("d"))
		.transitionDuration(0)
		.valueAccessor(function(d){return d; })
		.group(all);

    // Configure transactions frequency plot.
    transactionAmountChart
        .dimension(amountDim)
        .group(transactionsByAmount, 'Transaction amount')
        .x(d3.scale.linear().domain([minAmount, maxAmount + 100]))
        .ordinalColors(['#377eb8'])
        .yAxisLabel("n")
        .renderHorizontalGridLines(true)
        .xAxisLabel("Amount")
        .margins({top: 10, right: 20, bottom: 50, left: 65})
        .height(100);
    transactionAmountChart.yAxis().ticks(2)
    transactionAmountChart.xAxis().ticks(5);
    // Set bar width.
    transactionAmountChart.xUnits(dc.units.fp.precision(binWidth * 1.1));

    // Configure transactions frequency plot.
    transactionFrequencyChart
        .dimension(weekDateDim)
        .group(numTransactionsByDate, 'Transaction frequency')
        .x(d3.time.scale().domain([minDate, maxDate]))
        .ordinalColors(['#377eb8'])
        .renderHorizontalGridLines(true)
        .yAxisLabel("ƒ")
        .xAxisLabel("Week")
        .margins({top: 10, right: 20, bottom: 50, left: 65})
        .height(100);
    transactionFrequencyChart.yAxis().ticks(2);
    transactionFrequencyChart.xAxis().ticks(5);
    // Set bar width. Last factor should be 7 (number of days in bin, but doesn't seem dense enough.
    transactionFrequencyChart.xUnits(dc.units.fp.precision(1000 * 60 * 60 * 24 * 10));

    // Configure transactions scatterplot.
    var scatterplotColors   = d3.scale.ordinal()
                                .domain(["Income", "Expenses"])
                                .range(["green", "red"]);
    transactionsChart
        .height(150)
        .x(d3.time.scale().domain([minDate, maxDate]))
        .y(d3.scale.linear().domain([minAmount, maxAmount]))
        .yAxisLabel("€")
        .xAxisLabel("Days")
        .clipPadding(10)
        .renderHorizontalGridLines(true)
        .dimension(scatterchartDim)
        .group(scatterchartGroup)
        .existenceAccessor(function(d) {
            return d.value > 0;
        })
        .colorAccessor(function(d) {
            return d.key[2];
        })
        .keyAccessor(function(d) {
            return d.key[0];
         })
        .colors(scatterplotColors)
        .excludedOpacity(0.75)
        .mouseZoomable(true)
        .margins({top: 5, right: 20, bottom: 50, left: 65})
        .yAxis().ticks(4);
    transactionsChart.xAxis().ticks(5);

    // Configure monthly balance chart.
    monthlyBalanceChart
        .height(365)
//        .y(d3.scale.linear().domain([-maxExpensesByMonth * 1.1, maxIncomeByMonth * 1.1]))
        .elasticY(true)
        .dimension(monthDateDim) // this is actually wrong but can't brush anyway
        .group(one_bin(monthlyBalance, 'All months'))
        .margins({top: 5, right: 20, bottom: 50, left: 65})
        .yAxis().ticks(6);

    // Configure user charts.
    balanceByUserChart
        .height(200)
        .y(d3.scale.linear().domain([minAmountByUserandTType, maxAmountByUserandTType]))
        .x(d3.scale.ordinal())
        .xUnits(dc.units.ordinal)
        .brushOn(false)
        .xAxisLabel('User')
        .yAxisLabel('€')
        .dimension(actorDim)
        .group(amountByUser)
        .barPadding(0.1)
        .renderHorizontalGridLines(true)
        .margins({top: 5, right: 20, bottom: 50, left: 55})
        .yAxis().ticks(4);

     // Data table for individual entries.
    entriesTable
        .height(800)
        .dimension(dayDateDim)
        .group(function(d) {
            return "";
         })
        .size(10000)
        .columns([
          function(d) { return d["ID"]; },
          function(d) { return d["Subject"]; },
          function(d) { return d["Category"]; },
          function(d) { return d["Comment"]; },
          function(d) { return d["Partner"]; },
          function(d) { return d["Date"]; },
          function(d) { return d["Payer"]; },
          function(d) { return d["Beneficiaries"]; },
          function(d) { return d["Amount"]; }
        ])
        .sortBy(function(d){ return d["ID"]; })
        .order(d3.ascending);

    // Render charts.
    dc.renderAll();

    // Jump to top of page.
    $('html,body').scrollTop(0);

    // Add accordion.
    createAccordionForEntryTable();

};


// Create accordion for entry table.
function createAccordionForEntryTable()
{
    var acc = document.getElementsByClassName("accordion");
    var i;

    for (i = 0; i < acc.length; i++) {
        acc[i].onclick = function(){
            /* Toggle between adding and removing the "active" class,
            to highlight the button that controls the panel */
            this.classList.toggle("active");

            /* Toggle between hiding and showing the active panel */
            var panel = this.nextElementSibling;
            if (panel.style.display === "block") {
                panel.style.display = "none";
            } else {
                panel.style.display = "block";
            }
        }
    }
}