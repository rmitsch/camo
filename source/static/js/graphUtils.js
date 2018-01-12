// todo Move global variables and functions into a class.
// Initialize associative collection of all charts.
var charts = {};

/**
 * Accept search string and filter events by it.
 * Source: https://stackoverflow.com/questions/25083383/custom-text-filter-for-dc-js-datatable
 * @param searchString
 */
function filterEventsBySearchString(searchString)
{
    // Create regex for search.
    var re = new RegExp(searchString, "i");

    // Check on searchString validity.
    if (searchString != '') {
        // Filter on categories.
        charts.shared.recordDim.filter(function(d) {
            return true == String(d).toLowerCase().includes(searchString.toLowerCase());
        });
    }
    // Otherwise: "Reset" by filtering over all entries.
    else {
        // Reset filter.
        charts.shared.recordDim.filterAll();
    }

    dc.renderAll();
    dc.redrawAll();
}

// Used for accumulating values in an existing grouping/measure.
// Source: https://stackoverflow.com/questions/40619760/dc-js-crossfilter-add-running-cumulative-sum
function accumulate_group(source_group)
{
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
function one_bin(group, key)
{
  return {
    all: function() {
      return [{
        key: key,
        value: group.all().map(kv => kv.value)
      }];
    }
  };
}

// Remove empty bins. Extended by functionality to add top() and bottom().
// https://github.com/dc-js/dc.js/wiki/FAQ#remove-empty-bins
function remove_empty_bins(group)
{
    return {
        all: function () {
            return group.all().filter(function(d) {
                return d.value.count !== 0;
            });
        },

        top: function(N) {
            return group.top(N).filter(function(d) {
                return d.value.count !== 0;
            });
        },

        bottom: function(N) {
            return group.top(Infinity).slice(-N).reverse().filter(function(d) {
                return d.value.count !== 0;
            });
        }
    };
}

/**
 * Round all values to x decimals.
 * @param group
 * @param decimalCount
 * @returns
 */
function roundGroup(group, decimalCount)
{
    return {
        all:function () {
            return group.all().map(function(d) {
                return {key: d.key, value: round(d.value, decimalCount)};
            });
        }
    };
}

/**
 * Prepares records for usage in frontend. Specifically: Adds some new columns used
 * in various grouping measures, unfolds entries having multiple beneficiaries.
 * Operatores directly on provided dataset.
 * @param entries Set of entries as returned by the backend.
 * @param binWidth Width of bins used for histgram of record amounts.
 */
function prepareRecords(entries, binWidth)
{
	// Collection of entries multiplied because of multiple beneficiaries.
	var unfoldedEntries = [];

	// Prepare and extend projectsJson data.
	entries.forEach(function(d) {
        // Add entry for exact date.
        d["ExactDate"] = new Date(d["Date"]);

        // Adjust date for beginning of month.
        d["Date"] = new Date(d["Date"]);
        d["Date"].setDate(1);
        d["Amount"] = +d["Amount"];
        d["roundedAmount"] = Math.floor(+d["Amount"] / binWidth) * binWidth;



        // From here: Split up lines with multiple beneficiaries.
        // Goal: One record per beneficiary so that crossfilter.js' framework
        // can operate on the dataset.
        // All related measures (count, sums etc.) have to take care only to consider
        // strictly relevant/original records.
        d["originalAmount"] = d["Amount"];
        var beneficiaries   = d["Beneficiaries"].split(", ");


        // Modify current record in order to provide correct unfolding:
        // If beneficiaries other than the agent are involved, the correct amount
        // for the agent has to be calculated.
        // todo Possible bug: Agent is mentioned as beneficiary multiple times. Should be checked in backend.
        // todo Rename column "Payer" to "Agent".

        if (!contains.call(beneficiaries, d["Payer"]) || beneficiaries.length > 1) {
            // Calculate split amount.
            // If this is an amortization: Amount has to be treated differently, since agent
            // has to bear full effect of transaction.
            if (d["Category"] === "Amortization") {
                d["Amount"] = -d["Amount"];
            }

            else {
                // If agent is a beneficary: Amount is 1/n of original amount. Otherwise: 0.
                d["Amount"] = contains.call(beneficiaries, d["Payer"]) ? d["originalAmount"] / beneficiaries.length : 0;
            }
        }
        // Append beneficiary. In this case: Agent. If agent is not involved - no effects, since amount is
        // 0 and count of records doesn't change.
        d["Beneficiary"] = d["Payer"];


        // Loop over beneficiaries in this record.
        beneficiaries.forEach(function(beneficiary) {
            // If beneficiary is not payer/active agent: Append new record to entries.
            // Ignore if beneficiary is agent, since that has been handled before the loop already.
            // Note that all these records have ID -1 and amount = 0.
            if (beneficiary !== d["Payer"]) {
                // For starters: Copy existing record.
                var newRecord = {};
                Object.keys(d).forEach(function(key) {
                     newRecord[key] = d[key];
                });

                newRecord["ID"]             = -1;
                newRecord["Amount"]         = d["originalAmount"] / beneficiaries.length;
                newRecord["originalAmount"] = 0;
                // Append new column for beneficiary of new shadow record.
                newRecord["Beneficiary"] = beneficiary;

                // Append new record to set of entries.
                unfoldedEntries.push(newRecord);
            }
        });
    });

    // Add unfolded entries to regular ones.
    entries = entries.concat(unfoldedEntries);

    return entries;
}

/**
 * Aggregates all data needed for graphs, so that each chart can be easily plotted
 * accessing the predefined fields.
 * Operatores directly on provided dataset.
 *	All charts have:
 *	    - Target div ID
 *      - isComposite: Flag indicating whether this is a composite chart
 *	    - Dimension
 *	    - Measure (grouping)
 *      - Chart object
 * If a chart is a composite chart, it's structured as an dictionary of chart objects and
 * has null as value for the measure.
 * @param ndx Crossfilter instance.
 * @param dc dc.js instance.
 */
function generateGraphObjects(entries, dc)
{
	// --------------------------------------------------
	// 0. Create objects and auxiliary variables.
	// --------------------------------------------------

	charts.shared                       = {};
	charts.timeLinechart                = {};
	charts.categoryRowchart             = {};
	charts.monthlyBalanceBoxplot        = {};
	charts.balanceLabel                 = {};
	charts.numberOfTransactionsLabel    = {};
	charts.amountHistogram              = {};
	charts.transactionFequencyHistogram = {};
	charts.transactionScatterplot       = {};
	charts.balanceByAgentBarchart       = {};
	charts.balanceByBeneficiaryBarchart = {};
	charts.communityBalanceBarchart     = {};
	charts.entriesTable                 = {};
    // Subcharts for timeLinechart.
    charts.timeLinechart.balanceByDateBarchart             = {};
    charts.timeLinechart.cumulativeBalanceByDateLinechart   = {};

    // Create a crossfilter instance.
    charts.shared.crossfilter           = crossfilter(entries);
    // Create shorthand for crossfilter.
    var ndx                             = charts.shared.crossfilter;

    // Add dc instance to shared.
    charts.shared.dc                    = dc;

    // Calculate log of 10.
    var log10                           = Math.log(10);

	// --------------------------------------------------
	// 1. Set target divs.
	// --------------------------------------------------

	charts.timeLinechart.targetDiv                  = "#time-chart";
	charts.categoryRowchart.targetDiv               = "#category-chart";
	charts.monthlyBalanceBoxplot.targetDiv          = "#monthly-balance-chart";
	charts.balanceLabel.targetDiv                   = "#balance-nd";
	charts.numberOfTransactionsLabel.targetDiv      = "#transactions-nd";
	charts.amountHistogram.targetDiv                = "#transactions-amount-chart";
	charts.transactionFequencyHistogram.targetDiv   = "#transactions-frequency-chart";
	charts.transactionScatterplot.targetDiv         = "#transactions-chart";
	charts.balanceByAgentBarchart.targetDiv         = "#agent-balance-chart";
	charts.balanceByBeneficiaryBarchart.targetDiv   = "#beneficiary-balance-chart";
	charts.communityBalanceBarchart.targetDiv       = "#community-balance-chart";
	charts.entriesTable.targetDiv                   = "#entries-table";

	// --------------------------------------------------
	// 2. Define dimensions.
	// --------------------------------------------------

    // Define dimensions
	var amountDim               = ndx.dimension(function(d) { return d["Amount"]; });
	var roundedAmountDim        = ndx.dimension(function(d) { return d["roundedAmount"]; });
	var dateDim                 = ndx.dimension(function(d) { return d3.time.month(d["ExactDate"]); });
    var monthDateDim            = ndx.dimension(function(d) { return d3.time.month(d["ExactDate"]); });
	var categoryDim             = ndx.dimension(function(d) { return d["Category"]; });
	var weekDateDim             = ndx.dimension(function(d) { return d3.time.week(d["ExactDate"]); });
	var idDim                   = ndx.dimension(function(d) { return d["ID"]; });
	// For transactions charts.
    var scatterchartDim         = ndx.dimension(function (d) {
                                    return [+d["ExactDate"], d["originalAmount"], d["originalAmount"] > 0 ? "Income" : "Expenses"];
                               });
    // For user charts:
    var actorDim                = ndx.dimension(function(d) { return d["Payer"]; });
    var actorIncomeExpenseDim   = ndx.dimension(function (d) {
                                    return [d["Amount"] > 0 ? "Income" : "Expenses", d["Payer"]];
                                });
    var beneficiaryDim          = ndx.dimension(function(d) { return d["Beneficiary"]; });
    // For various stuff: Derive dimension from value of amount.
    var incomeExpenseDim        = ndx.dimension(function(d) { return d["Amount"] < 0 ? "Expenses" : "Income"; });
    // Dimension containing stringified record. Used for search.
    charts.shared.recordDim     = ndx.dimension(function(d) { return JSON.stringify(d); });


	// --------------------------------------------------
	// 3. Define groups/calculate measures.
	// --------------------------------------------------

	// For time chart.
	// Sum of all entries.
	var sumByDate               = dateDim.group().reduceSum(function(d) {return d["Amount"];});
	// Cumulative balance up to this point.
    var cumulativeBalanceByDate = accumulate_group(sumByDate);
	// Sum of all expenses.
	var expenseSumByDate        = dateDim.group().reduceSum(function(d) {return d["Amount"] < 0 ? -d["Amount"] : 0;});
	// Sum of all revenue.
	var revenueSumByDate        = dateDim.group().reduceSum(function(d) {return d["Amount"] > 0 ? d["Amount"] : 0;});

	// For category charts.
	var sumByCategory           = categoryDim.group().reduceSum(function(d) {return d["Amount"];});

    // For entry table.
    var tableGroup              = idDim.group().reduce(
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.push(item);
                elements.count++;
            }

            return elements;
        },
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.splice(elements.transactions.indexOf(item), 1);
                elements.count--;
            }

            return elements;
        },
        function() {
            return {transactions: [], count: 0, id: 0};
        }
    );

    // For measures.
    // Get group for all entries, regardless of feature values.
    // Apparent outcome: Number of projects.
	var all                     = ndx.groupAll().reduce(
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.push(item);
                elements.count++;
            }

            return elements;
        },
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.splice(elements.transactions.indexOf(item), 1);
                elements.count--;
            }

            return elements;
        },
        function() {
            return {transactions: [], count: 0};
        }
    );
	// Get group for total amount of money spent.
    // Apparent outcome: Sum of money spent.
	var totalAmount             = ndx.groupAll().reduceSum(function(d) {return d["Amount"];});

    // For transactions charts.
    var numTransactionsByDate   = weekDateDim.group().reduce(
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.push(item);
                elements.count++;
            }

            return elements;
        },
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.splice(elements.transactions.indexOf(item), 1);
                elements.count--;
            }

            return elements;
        },
        function() {
            return {transactions: [], count: 0};
        }
    );
    var transactionsByAmount        = roundedAmountDim.group().reduce(
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.push(item);
                elements.count++;
                // Calculate log count, assuming only positive values.
                elements.logarithmicCount = elements.count > 0 ? Math.log(elements.count) / log10 : 0;
            }

            return elements;
        },
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.splice(elements.transactions.indexOf(item), 1);
                elements.count--;
                // Calculate log count, assuming only positive values.
                elements.logarithmicCount = elements.count > 0 ? Math.log(elements.count) / log10 : 0;
            }

            return elements;
        },
        function() {
            return {transactions: [], count: 0, logarithmicCount: 0};
        }
    );
    var scatterchartGroup           = scatterchartDim.group().reduce(
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.push(item);
                elements.count++;
            }

            return elements;
        },
        function(elements, item) {
            if (item["ID"] !== -1) {
                elements.transactions.splice(elements.transactions.indexOf(item), 1);
                elements.count--;
            }

            return elements;
        },
        function() {
            return {transactions: [], count: 0};
        }
    );

    // For user chart.
    var paidByUser                  = actorDim.group().reduceSum(function(d) {return d["Amount"] < 0 ? d["Amount"] : 0;});
    var receivedByUser              = actorDim.group().reduceSum(function(d) {return d["Amount"] > 0 ? d["Amount"] : 0;});
    var amountByUserAndTType        = actorIncomeExpenseDim.group().reduceSum(function(d) {return d["Amount"];});
    var amountByUser                = actorDim.group().reduceSum(function(d) {return d["Amount"];});
    var amountByBeneficiary         = beneficiaryDim.group().reduceSum(function(d) {return d["Amount"];});
    var balanceForCommunity         = beneficiaryDim.group().reduceSum(function(d) {
                                        // If record is original and multiple beneficiaries involved: Make sure
                                        // agents contribution is considered correctly.
                                        if (d["ID"] !== -1 && d["Payer"] === d["Beneficiary"]) {
                                            // Deduct agent's amount. If agent is no benficiary, this amount is 0.
                                            // Otherwise: Contributed by agent -> amount for all others - total amount.
                                            //
                                            // If this is an amortization: Has to be treated differently in order to
                                            // achieve parity with non-relevant measures. Therefore: Modify equation
                                            // to calculate contribution to community balance.
                                            // Return rounded amount.
                                            res = 	d["Category"] !== "Amortization" ?
                                            		(d["Amount"] - d["originalAmount"]) : d["Amount"];

											return res;
                                        }

                                        // If record is an unfolded one: Return amount for this user and record.
                                        if (d["ID"] === -1 && d["Payer"] !== d["Beneficiary"]) {
                                            // Since someone else handled this transaction, the amount for the passive
                                            // user is equal to what should contribute to the community balance.
                                            return d["Amount"];
                                        }

                                        // Ignore all other cases - i. e., entries where agent is the sole beneficiary
                                        //  - not relevant for community balance.
                                        return 0;
                                    });

    // For monthly balance boxplot.
    var monthlyBalance = monthDateDim.group().reduceSum(d => d["originalAmount"]);

	// Determine extrema.
	charts.extrema = {};
	// For dates.
	charts.extrema.minDate     = dateDim.bottom(1)[0]["ExactDate"];
	charts.extrema.maxDate     = dateDim.top(1)[0]["ExactDate"];
	// Add buffer for start and end date.
    charts.extrema.minDate.setDate(charts.extrema.minDate.getDate() - 5);
    charts.extrema.maxDate.setDate(charts.extrema.maxDate.getDate() + 5);
    // For amounts.
    charts.extrema.minAmount   = amountDim.bottom(1)[0]["originalAmount"];
    charts.extrema.maxAmount   = amountDim.top(1)[0]["originalAmount"];
    // For sum by user and transaction type.
    // Reason for loop: Bottom method not existent.
    charts.extrema.maxAmountByUserandTType = 0;
    charts.extrema.minAmountByUserandTType = 0;
    amountByUserAndTType.all().forEach(function(entry) {
        if (charts.extrema.minAmountByUserandTType > entry["value"])
            charts.extrema.minAmountByUserandTType = entry["value"];
        if (charts.extrema.maxAmountByUserandTType < entry["value"])
            charts.extrema.maxAmountByUserandTType = entry["value"];
    });
    // For monthly boxplot.
    charts.extrema.maxExpensesByMonth  = expenseSumByDate.top(1)[0]["value"];
    charts.extrema.maxIncomeByMonth    = revenueSumByDate.top(1)[0]["value"];

	// --------------------------------------------------
	// 4. Assign dimension values to objects.
	// --------------------------------------------------

	charts.timeLinechart.dimension                  = dateDim;
	charts.categoryRowchart.dimension               = categoryDim;
	charts.monthlyBalanceBoxplot.dimension          = monthDateDim;
	charts.balanceLabel.dimension                   = null;
	charts.numberOfTransactionsLabel.dimension      = null;
	charts.amountHistogram.dimension                = roundedAmountDim;
	charts.transactionFequencyHistogram.dimension   = weekDateDim;
	charts.transactionScatterplot.dimension         = scatterchartDim;
	charts.balanceByAgentBarchart.dimension         = actorDim;
	charts.balanceByBeneficiaryBarchart.dimension   = beneficiaryDim;
	charts.communityBalanceBarchart.dimension       = beneficiaryDim;
    // Special case for table: Group is used as dimension.
    charts.entriesTable.dimension                   = (remove_empty_bins(tableGroup));

	// --------------------------------------------------
	// 5. Assign group values to objects.
	// --------------------------------------------------

    // todo Check in backend if users for amortization records are set correctly (x -> {y, z}).
	charts.timeLinechart.group                  = null;
	charts.categoryRowchart.group               = roundGroup(sumByCategory, 2);
	charts.monthlyBalanceBoxplot.group          = one_bin(monthlyBalance, 'All months');
	charts.balanceLabel.group                   = totalAmount;
	charts.numberOfTransactionsLabel.group      = all;
	charts.amountHistogram.group                = transactionsByAmount;
	charts.transactionFequencyHistogram.group   = numTransactionsByDate;
	charts.transactionScatterplot.group         = scatterchartGroup;
	charts.balanceByAgentBarchart.group         = roundGroup(amountByUser, 2);
	charts.balanceByBeneficiaryBarchart.group   = roundGroup(amountByBeneficiary, 2);
	charts.communityBalanceBarchart.group       = roundGroup(balanceForCommunity, 2);
    charts.entriesTable.group                   = null;
    // Subcharts for timeLinechart.
    charts.timeLinechart.balanceByDateBarchart.group           = roundGroup(sumByDate, 2);
    charts.timeLinechart.cumulativeBalanceByDateLinechart.group = roundGroup(cumulativeBalanceByDate, 2);

	// --------------------------------------------------
	// 6. Create charts.
	// --------------------------------------------------

	charts.timeLinechart.chart                  = dc.compositeChart(charts.timeLinechart.targetDiv);
	charts.categoryRowchart.chart               = dc.rowChart(charts.categoryRowchart.targetDiv);
	charts.monthlyBalanceBoxplot.chart          = dc.boxPlot(charts.monthlyBalanceBoxplot.targetDiv);
	charts.balanceLabel.chart                   = dc.numberDisplay(charts.balanceLabel.targetDiv);
	charts.numberOfTransactionsLabel.chart      = dc.numberDisplay(charts.numberOfTransactionsLabel.targetDiv);
	charts.amountHistogram.chart                = dc.barChart(charts.amountHistogram.targetDiv);
	charts.transactionFequencyHistogram.chart   = dc.barChart(charts.transactionFequencyHistogram.targetDiv);
	charts.transactionScatterplot.chart         = dc.scatterPlot(charts.transactionScatterplot.targetDiv);
	charts.balanceByAgentBarchart.chart         = dc.barChart(charts.balanceByAgentBarchart.targetDiv);
	charts.balanceByBeneficiaryBarchart.chart   = dc.barChart(charts.balanceByBeneficiaryBarchart.targetDiv);
	charts.communityBalanceBarchart.chart       = dc.barChart(charts.communityBalanceBarchart.targetDiv);
    charts.entriesTable.chart                   = dc.dataTable(charts.entriesTable.targetDiv);
    // Subcharts for timeLinechart.
    charts.timeLinechart.balanceByDateBarchart.chart            = dc.barChart(charts.timeLinechart.chart);
    charts.timeLinechart.cumulativeBalanceByDateLinechart.chart = dc.lineChart(charts.timeLinechart.chart);

    // Return charts object.
    return charts;
}

/**
 * Plots prepared chart data.
 * @param charts Charts object.
 * @param dc dc.js instance.
 * @param binWidth Width of bins used for histogram of transaction amounts.
 */
function plotCharts(charts, dc, binWidth)
{
    // Auxiliary variable for logarithmic scales.
    var log10 = Math.log(10);

    // Configure time chart.
    var balanceByDateChart              = charts.timeLinechart.balanceByDateBarchart.chart
                                            .group(charts.timeLinechart.balanceByDateBarchart.group, 'Balance');

    var cumulativeBalanceByDateChart    = charts.timeLinechart.cumulativeBalanceByDateLinechart.chart
                                            .group(charts.timeLinechart.cumulativeBalanceByDateLinechart.group, 'Cumulative balance')
                                            .dashStyle([5, 5])
                                            .renderDataPoints(true)
                                            .interpolate("step")
                                            .renderArea(false);


    charts.timeLinechart.chart
		.height(145)
        .margins({top: 10, right: 50, bottom: 40, left: 50})
        .transitionDuration(500)
        .elasticY(true)
        .renderLabel(true)
        .mouseZoomable(false)
        .dimension(charts.timeLinechart.dimension)
        .yAxisLabel("€")
        .xAxisLabel("Month")
        .renderHorizontalGridLines(true)
        .x(d3.time.scale().domain([charts.extrema.minDate, charts.extrema.maxDate]))
        .legend(dc.legend().x(80).y(10).itemHeight(13).gap(5))
        .compose([
            balanceByDateChart,
            cumulativeBalanceByDateChart
        ])
        .brushOn(true);
    // Set ticks.
    charts.timeLinechart.chart.yAxis().ticks(4);
    charts.timeLinechart.chart.xAxis().ticks(6);
    // todo Calculate xUnits. How?
    var numberOfMonths = charts.timeLinechart.balanceByDateBarchart.group.all().length;
    charts.timeLinechart.chart.xUnits(function(){ return numberOfMonths / 5.6; });
    // Format numbers: From 10000 to 10k.
    charts.timeLinechart.chart.yAxis().tickFormat(d3.format('.2s'))

    // Configure category charts.
	charts.categoryRowchart.chart
        .height(295)
        .dimension(charts.categoryRowchart.dimension)
        .group(charts.categoryRowchart.group)
        .ordinalColors(['#377eb8'])
        .elasticX(true)
        .margins({top: 10, right: 20, bottom: 50, left: 15});
    charts.categoryRowchart.chart.xAxis().ticks(4);
    // Format numbers: From 10000 to 10k.
    charts.categoryRowchart.chart.xAxis().tickFormat(d3.format('.2s'))

    // Configure measure for total balance.
	charts.balanceLabel.chart
		.valueAccessor(function(d){return d; })
		.transitionDuration(0)
		.group(charts.balanceLabel.group)
		.formatNumber(d3.format(".3s"));

    // Configure measure for total number of transactions.
    // todo Use d3's logScale instead of manual calculation for log values (didn't work so far).
	charts.numberOfTransactionsLabel.chart
		.formatNumber(d3.format("d"))
		.transitionDuration(0)
		.valueAccessor(function(d){return d; })
		.group(charts.numberOfTransactionsLabel.group)
		.valueAccessor( function(d) { return d.count; } );

    // Configure transactions frequency plot.
    charts.amountHistogram.chart
        .dimension(charts.amountHistogram.dimension)
        .group(charts.amountHistogram.group, 'Transaction amount')
        .valueAccessor( function(d) { return  d.value.logarithmicCount; } )
        .x(d3.scale.linear().domain([charts.extrema.minAmount - binWidth, charts.extrema.maxAmount + binWidth]))
//        .y(d3.scale.log().domain([0, 4])base(10))
        .ordinalColors(['#377eb8'])
        .yAxisLabel("log(n)")
        .renderHorizontalGridLines(true)
        .xAxisLabel("Amount")
        .margins({top: 10, right: 20, bottom: 50, left: 65})
        .height(100);
    charts.amountHistogram.chart.yAxis().ticks(2)
    charts.amountHistogram.chart.xAxis().ticks(5);
    // Set bar width.
    charts.amountHistogram.chart.xUnits(dc.units.fp.precision(binWidth * 1.1));
    // Format numbers: From 10000 to 10k.
    charts.amountHistogram.chart.xAxis().tickFormat(d3.format('.2s'))
    charts.amountHistogram.chart.yAxis().tickFormat(d3.format('.2s'))

    // Configure transactions frequency plot.
    charts.transactionFequencyHistogram.chart
        .dimension(charts.transactionFequencyHistogram.dimension)
        .group(charts.transactionFequencyHistogram.group, 'Transaction frequency')
        .valueAccessor( function(d) { return d.value.count; } )
        .x(d3.time.scale().domain([charts.extrema.minDate, charts.extrema.maxDate]))
        .ordinalColors(['#377eb8'])
        .renderHorizontalGridLines(true)
        .yAxisLabel("ƒ")
        .xAxisLabel("Week")
        .margins({top: 10, right: 20, bottom: 50, left: 65})
        .height(100);
    charts.transactionFequencyHistogram.chart.yAxis().ticks(2);
    charts.transactionFequencyHistogram.chart.xAxis().ticks(5);
    // Set bar width. Last factor should be 7 (number of days in bin, but doesn't seem dense enough.
    // todo Replace 10 with actual number of months.
    charts.transactionFequencyHistogram.chart.xUnits(dc.units.fp.precision(1000 * 60 * 60 * 24 * 10));

    // Configure transactions scatterplot.
    var scatterplotColors   = d3.scale.ordinal()
                                .domain(["Income", "Expenses"])
                                .range(["green", "red"]);
    charts.transactionScatterplot.chart
        .height(137)
        .x(d3.time.scale().domain([charts.extrema.minDate, charts.extrema.maxDate]))
        .y(d3.scale.linear().domain([charts.extrema.minAmount, charts.extrema.maxAmount]))
        .yAxisLabel("€")
        .xAxisLabel("Days")
        .clipPadding(0)
        .renderHorizontalGridLines(true)
        .dimension(charts.transactionScatterplot.dimension)
        .group(charts.transactionScatterplot.group)
        .existenceAccessor(function(d) {
            return d.value.transactions.length > 0 && d.value.transactions[0]["Amount"] != 0;
        })
        .symbolSize(3.5)
//        .colorAccessor(function(d) {
//            return d.key[2];
//        })
        .keyAccessor(function(d) {
            return d.key[0];
         })
//        .colors(scatterplotColors)
        .excludedOpacity(0.75)
        .mouseZoomable(true)
        .margins({top: 5, right: 20, bottom: 50, left: 65})
        .yAxis().ticks(4);
    charts.transactionScatterplot.chart.xAxis().ticks(5);
    // Format numbers: From 10000 to 10k.
    charts.transactionScatterplot.chart.yAxis().tickFormat(d3.format('.2s'))
    charts.transactionScatterplot.chart.on('pretransition', function(chart) {
        charts.transactionScatterplot.chart.selectAll('g.row')
            .on('mouseover', console.log("over"))
        console.log("in here")
    });

    // Configure monthly balance chart.
    charts.monthlyBalanceBoxplot.chart
        .height(295)
//        .y(d3.scale.linear().domain([-maxExpensesByMonth * 1.1, maxIncomeByMonth * 1.1]))
        .elasticY(true)
        .yAxisLabel('€')
        .dimension(charts.monthlyBalanceBoxplot.dimension) // this is actually wrong but can't brush anyway
        .group(charts.monthlyBalanceBoxplot.group)
        .margins({top: 5, right: 20, bottom: 50, left: 65})
        .renderHorizontalGridLines(true)
        .yAxis().ticks(6);
    // Format numbers: From 10000 to 10k.
    charts.monthlyBalanceBoxplot.chart.yAxis().tickFormat(d3.format('.2s'))

    // Configure agent balance chart.
    charts.balanceByAgentBarchart.chart
        .height(150)
//        .y(d3.scale.linear().domain([charts.extrema.minAmountByUserandTType, charts.extrema.maxAmountByUserandTType]))
        .elasticY(true)
        .x(d3.scale.ordinal())
        .xUnits(dc.units.ordinal)
        .brushOn(false)
        .xAxisLabel('User')
        .yAxisLabel('€')
        .dimension(charts.balanceByAgentBarchart.dimension)
        .group(charts.balanceByAgentBarchart.group)
        .barPadding(0.1)
        .renderHorizontalGridLines(true)
        .margins({top: 5, right: 20, bottom: 50, left: 55})
        .yAxis().ticks(4);
    // Format numbers: From 10000 to 10k.
    charts.balanceByAgentBarchart.chart.yAxis().tickFormat(d3.format('.2s'))

    // Configure beneficary balance charts.
    charts.balanceByBeneficiaryBarchart.chart
        .height(150)
        .width(175)
//        .y(d3.scale.linear().domain([charts.extrema.minAmountByUserandTType, charts.extrema.maxAmountByUserandTType]))
        .elasticY(true)
        .x(d3.scale.ordinal())
        .xUnits(dc.units.ordinal)
        .brushOn(false)
        .xAxisLabel('User')
        .yAxisLabel('€')
        .dimension(charts.balanceByBeneficiaryBarchart.dimension)
        .group(charts.balanceByBeneficiaryBarchart.group)
        .barPadding(0.1)
        .renderHorizontalGridLines(true)
        .margins({top: 5, right: 20, bottom: 50, left: 55})
        .yAxis().ticks(4);
    // Format numbers: From 10000 to 10k.
    charts.balanceByBeneficiaryBarchart.chart.yAxis().tickFormat(d3.format('.2s'))

    // todo In backend: Make sure agent is not included in list of beneficiaries for amortizations.
    // Configure community balance charts.
    charts.communityBalanceBarchart.chart
        .height(150)
        .width(175)
//        .y(d3.scale.linear().domain([charts.extrema.minAmountByUserandTType, charts.extrema.maxAmountByUserandTType]))
        .elasticY(true)
        .x(d3.scale.ordinal())
        .xUnits(dc.units.ordinal)
        .brushOn(false)
        .xAxisLabel('User')
        .yAxisLabel('€')
        .dimension(charts.communityBalanceBarchart.dimension)
        .group(charts.communityBalanceBarchart.group)
        .valueAccessor(function(d) { return d.value; })
        .barPadding(0.1)
        .renderHorizontalGridLines(true)
        .margins({top: 5, right: 20, bottom: 50, left: 55})
        .yAxis().ticks(3);
    // Format numbers: From 10000 to 10k.
    //charts.communityBalanceBarchart.chart.yAxis().tickFormat(d3.format('.2s'))

     // Data table for individual entries.
    charts.entriesTable.chart
        .height(800)
        .dimension(charts.entriesTable.dimension)
        .group(function(d) {
            return "";
         })
        .size(10000)
        .columns([
          function(d) { return d.value.transactions[0]["ID"]; },
          function(d) { return d.value.transactions[0]["Subject"]; },
          function(d) { return d.value.transactions[0]["Category"]; },
          function(d) { return d.value.transactions[0]["Comment"]; },
          function(d) { return d.value.transactions[0]["Partner"]; },
          function(d) { return d.value.transactions[0]["Date"]; },
          function(d) { return d.value.transactions[0]["Payer"]; },
          function(d) { return d.value.transactions[0]["Beneficiaries"]; },
          // Re-calculate original amount
          function(d) { return d.value.transactions[0]["originalAmount"]; }
        ])
        .sortBy(function(d){ return d.value.transactions[0]["ID"]; })
        .order(d3.ascending);

    // Render charts.
    dc.renderAll();
}
