//         next steps:
//            - use bubble chart instead of scatterplot
//            - use log scale for histogram of amount (?)
//            - refactor
//            - add todos to github
//            - dockerize


// https://groups.google.com/forum/#!topic/dc-js-user-group/yI6_cbvgfbU
// Initiates loading of charts.
queue()
    .defer(d3.json, "/entries")
    .await(makeGraphs);

// Creates graphs for dashboard.
function makeGraphs(error, projectsJson, statesJson) {

    // Original entries as delivered by the backend.
	var entries         = projectsJson;
	// Auxiliary variable.
    var binWidth        = 100;

    // --------------------------------------------------
    // Prepare and extend projectsJson data.
    // --------------------------------------------------
    prepareRecords(entries, binWidth);

    // --------------------------------------------------
    // Initialize charts.
    // --------------------------------------------------

	// Create a Crossfilter instance.
	var ndx = crossfilter(entries);
    // Get chart data.
    var charts = generateGraphObjects(ndx, dc);

    // --------------------------------------------------
    // Configure and plot charts.
    // --------------------------------------------------

    plotCharts(charts, dc, binWidth);

    // --------------------------------------------------
    // Final modifications.
    // --------------------------------------------------

    // Jump to top of page.
    $('html,body').scrollTop(0);

    // Add accordion.
    createAccordionForEntryTable();
};